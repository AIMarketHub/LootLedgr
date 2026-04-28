// LootLedger — one-time client-records migration.
// Phase 2.7.12. Walks txList, finds transactions without
// tx.clientId but with tx.client.idNumber, dedupes by idNumber,
// creates client records (isTest=true) or links to existing ones,
// and persists tx.clientId back through sb.saveTx so the linkage
// survives a page reload.
//
// Surfaces as a button in Settings → Danger Zone:
//   "Migrate test transactions to client records (one-time)"
// with a status line above showing how many tx + clients are
// awaiting migration.
//
// IDEMPOTENT
//
// - txs that already carry tx.clientId are skipped (counted in
//   alreadyLinked).
// - txs with no tx.client.idNumber are skipped (no dedupe key
//   available — would create unidentifiable orphan clients).
// - within one run, an in-memory map (seenIds) prevents duplicate
//   client creates when multiple txs share an idNumber and the
//   second lookup hasn't seen the just-created row yet.
// - re-running after a successful migration just reports "0
//   transactions awaiting migration"; no records change.
//
// AUTO-CREATED CLIENTS GET isTest=true
//
// Per the user's spec note (2026-04-28): isTest goes on the
// CLIENTS that this migration creates, NOT on the existing 8 test
// transactions. Transactions stay as-is — they just get clientId
// set.
//
// PER-CLIENT TXCOUNT + LASTTXAT
//
// After processing all txs, the migration walks the linked set
// once more and writes the final txCount + most-recent-lastTxAt
// per touched client. This overrides whatever counts were in
// place — treats the migration as authoritative for test-data
// derived counts.

import {clients,findOrCreateByIdNumber,pickClientRecordFields} from "./clients.js";
import {sb} from "./storage.js";

export function analyzeMigrationTargets(txList,existingClients){
  const pending=(txList||[]).filter(tx=>!tx.clientId&&tx.client&&tx.client.idNumber);
  const idNumbers=[...new Set(pending.map(tx=>tx.client.idNumber))];
  const existingIds=new Set((existingClients||[]).map(c=>c.idNumber).filter(Boolean));
  const newClientsToCreate=idNumbers.filter(id=>!existingIds.has(id));
  return{
    pending:pending.length,
    uniqueIdNumbers:idNumbers.length,
    newClientsToCreate:newClientsToCreate.length,
  };
}

export async function runTestDataMigration({txList,setTxList}){
  const result={linked:0,created:0,alreadyLinked:0,skipped:0,errors:[]};
  const updated=[...(txList||[])];
  // idNumber → resolved clientId, populated as we go to dedupe
  // within the run when multiple txs share an idNumber.
  const seenIds=new Map();

  for(let i=0;i<updated.length;i++){
    const tx=updated[i];
    if(tx.clientId){result.alreadyLinked++;continue;}
    if(!tx.client||!tx.client.idNumber){result.skipped++;continue;}
    const idNum=tx.client.idNumber;

    try{
      let clientId=seenIds.get(idNum);
      if(!clientId){
        const existing=await clients.getByIdNumber(idNum);
        if(existing){
          clientId=existing.id;
        }else{
          const recordFields=pickClientRecordFields({
            ...tx.client,
            idPhoto:tx.photo||null,
            isTest:true,
            createdAt:tx.date||new Date().toISOString(),
            lastTxAt:tx.date||new Date().toISOString(),
            txCount:0,
          });
          const created=await clients.create(recordFields);
          if(!created){
            result.errors.push({tx:tx.id,msg:"create failed"});
            continue;
          }
          clientId=created.id;
          result.created++;
        }
        seenIds.set(idNum,clientId);
      }

      const updatedTx={...tx,clientId};
      updated[i]=updatedTx;
      try{await sb.saveTx(updatedTx);}catch(e){
        result.errors.push({tx:tx.id,msg:"tx save failed: "+(e&&e.message||"unknown")});
      }
      result.linked++;
    }catch(e){
      result.errors.push({tx:tx.id,msg:e&&e.message||"unknown"});
    }
  }

  // Backfill txCount + most-recent lastTxAt per touched client.
  const linkCounts=new Map();
  const linkLastTxAt=new Map();
  for(const tx of updated){
    if(!tx.clientId)continue;
    linkCounts.set(tx.clientId,(linkCounts.get(tx.clientId)||0)+1);
    const t=tx.date?new Date(tx.date).getTime():0;
    if(t>(linkLastTxAt.get(tx.clientId)||0))linkLastTxAt.set(tx.clientId,t);
  }
  for(const[clientId,count]of linkCounts){
    const last=linkLastTxAt.get(clientId);
    try{
      await clients.update(clientId,{
        txCount:count,
        lastTxAt:last?new Date(last).toISOString():undefined,
      });
    }catch(_){/* swallow — orphan-clientId acceptable */}
  }

  if(result.linked>0)setTxList(updated);
  return result;
}
