// LootLedger — one-time client-records migration.
// Phase 2.7.12. Walks txList, finds transactions without
// tx.clientId but with tx.client.idNumber, dedupes by idNumber,
// creates client records (isTest=true) or links to existing ones,
// and persists tx.clientId via setTxList + sb.saveTx so the
// linkage survives a page reload.
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
// - within one run, an in-memory map (idNumberToClientId) prevents
//   duplicate client creates when multiple txs share an idNumber
//   and the second lookup hasn't seen the just-created row yet.
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
//
// === Defensive rewrite (2026-04-29) ===
//
// The earlier shape built a local `updated` array, mutated entries
// in place, called `setTxList(updated)` once at the end, and per-tx
// `sb.saveTx(updatedTx)` inline. A user-reported bug surfaced 0 of
// 8 transactions actually carrying tx.clientId in localStorage
// after a successful-looking run. The likely contributors were:
//   - positional setTxList(updated) replaces React state with the
//     closure-captured snapshot, which can clobber concurrent
//     updates from other code paths;
//   - per-tx Supabase saveTx during the loop hits the known
//     ?on_conflict=id 400 issue, so a later page reload that
//     re-pulls from Supabase reverts the local state;
//   - clientId resolution didn't validate non-empty truthy strings,
//     so a malformed Supabase response could silently set
//     `clientId: undefined` and still bump `result.linked`.
//
// This rewrite (a) builds a tx.id → clientId map without mutating
// anything during the loop, (b) validates each clientId is a
// non-empty string, (c) applies the linkage via functional
// setState so the merge happens against current React state at
// apply time, (d) mirrors to Supabase AFTER the local merge so a
// reload picks up the linked state, (e) returns counters that
// reflect what was actually written.

import {clients,findOrCreateByIdNumber,pickClientRecordFields} from "./clients.js";
import {sb} from "./storage.js";

export function analyzeMigrationTargets(txList,existingClients){
  const pending=(txList||[]).filter(tx=>!tx.clientId&&tx.client&&tx.client.idNumber);
  const idNumbers=[...new Set(pending.map(tx=>tx.client.idNumber))];
  const existingIds=new Set((existingClients||[]).map(c=>c.idNumber).filter(Boolean));
  const newClientsToCreate=idNumbers.filter(id=>!existingIds.has(id));
  // Legacy un-IDed transactions — pre-policy records with no
  // idNumber. Cannot be migrated (no dedupe key); the badge in
  // History / Clients / ClientDetail surfaces them. The status
  // line uses this count to distinguish "nothing left to do" from
  // "everything migrate-able is done; these will never link".
  const legacyNoId=(txList||[]).filter(tx=>!tx.clientId&&!(tx.client&&tx.client.idNumber)).length;
  return{
    pending:pending.length,
    uniqueIdNumbers:idNumbers.length,
    newClientsToCreate:newClientsToCreate.length,
    legacyNoId,
  };
}

// Defensive: only treat strings of meaningful length as a real id.
// Guards against `undefined` / `null` / `""` slipping through from a
// malformed Supabase response into `clientId: …` writes.
function isUsableId(v){
  return typeof v==="string"&&v.trim().length>0;
}

export async function runTestDataMigration({txList,setTxList}){
  const result={linked:0,created:0,alreadyLinked:0,skipped:0,errors:[]};
  const list=Array.isArray(txList)?txList:[];

  // idNumber → clientId, populated as we resolve. Dedupes within
  // the run so two txs sharing an idNumber don't both create.
  const idNumberToClientId=new Map();
  // tx.id → clientId, the planned linkages. Built in this loop;
  // applied as a single React state update below.
  const txIdToClientId=new Map();

  // Phase 2.7 follow-up — txs that pre-date the require-ID-on-
  // every-transaction policy and have no idNumber get a visible
  // tx.legacyNoId flag so History / Clients / ClientDetail can
  // render a "⚠ Legacy un-IDed" badge. Tracked alongside the
  // skipped counter; the count itself is unchanged.
  const legacyNoIdTxIds=new Set();

  for(const tx of list){
    if(!tx)continue;
    if(tx.clientId){result.alreadyLinked++;continue;}
    if(!tx.client||!tx.client.idNumber){
      result.skipped++;
      if(!tx.legacyNoId)legacyNoIdTxIds.add(tx.id);
      continue;
    }
    const idNum=tx.client.idNumber;

    try{
      let clientId=idNumberToClientId.get(idNum);
      if(!clientId){
        const existing=await clients.getByIdNumber(idNum);
        if(existing&&isUsableId(existing.id)){
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
          if(!created||!isUsableId(created.id)){
            result.errors.push({tx:tx.id,msg:"client create failed (no id returned)"});
            continue;
          }
          clientId=created.id;
          result.created++;
        }
        idNumberToClientId.set(idNum,clientId);
      }
      if(!isUsableId(clientId)){
        result.errors.push({tx:tx.id,msg:"clientId resolution returned empty"});
        continue;
      }
      txIdToClientId.set(tx.id,clientId);
      result.linked++;
    }catch(e){
      result.errors.push({tx:tx.id,msg:e&&e.message||"unknown"});
    }
  }

  // Apply linkages + legacyNoId flags. Functional setTxList so the
  // merge runs against whatever React's current txList is at apply
  // time, not a snapshot we captured at function entry. The
  // matching is by tx.id, which is stable across the lifetime of a
  // transaction. Untouched txs (already linked, no work to do)
  // pass through by reference.
  const hasMergeWork=txIdToClientId.size>0||legacyNoIdTxIds.size>0;
  let mergedList=null;
  if(hasMergeWork){
    const applyMerge=prev=>{
      const out=(prev||[]).map(t=>{
        if(!t)return t;
        const cid=t.clientId?null:txIdToClientId.get(t.id);
        const flagLegacy=legacyNoIdTxIds.has(t.id)&&!t.legacyNoId;
        if(!cid&&!flagLegacy)return t;
        const next={...t};
        if(isUsableId(cid))next.clientId=cid;
        if(flagLegacy)next.legacyNoId=true;
        return next;
      });
      return out;
    };
    setTxList(prev=>{
      const out=applyMerge(prev);
      mergedList=out;
      return out;
    });
    // Belt-and-braces: if React happens to defer the updater
    // (extremely unlikely for useState, but the merge logic is the
    // same against `list`), have a copy ready for the Supabase
    // mirror + backfill.
    if(!mergedList)mergedList=applyMerge(list);
  }

  // Mirror linked txs to Supabase. Done AFTER the local merge so a
  // page reload that re-pulls loadTxList() picks up the linkage.
  // Failures don't change the counters — local state is the
  // primary write; Supabase is the durable echo. The known 400 on
  // ?on_conflict=id upserts is logged in errors so the toast can
  // surface it without blocking the success path.
  if(mergedList){
    for(const tx of mergedList){
      if(!txIdToClientId.has(tx.id)&&!legacyNoIdTxIds.has(tx.id))continue;
      try{
        const r=await sb.saveTx(tx);
        if(r==null)result.errors.push({tx:tx.id,msg:"Supabase saveTx returned null (likely on_conflict 400)"});
      }catch(e){
        result.errors.push({tx:tx.id,msg:"Supabase saveTx threw: "+(e&&e.message||"unknown")});
      }
    }
  }

  // Backfill txCount + most-recent lastTxAt per touched client.
  // Walk the merged result so already-linked txs from earlier runs
  // also count correctly toward each client's totals.
  const linkCounts=new Map();
  const linkLastTxAt=new Map();
  for(const tx of (mergedList||list)){
    if(!tx||!tx.clientId)continue;
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

  return result;
}
