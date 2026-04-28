// LootLedger — Clients screen.
// Mechanically extracted from src/App.tsx during Phase 2 step 9f
// (briefing §7.3). No semantic changes; markup preserved verbatim.
//
// Briefing §10 marks this screen for a substantial expansion in
// Phase 2.7 (persistent client records + photo archive); for
// Phase 2 the existing functionality is preserved as-is.
//
// Renders the client-files list:
//   - Batch download by date range.
//   - Search box (matches name / ID / phone).
//   - Per-client card with badges (📷 has photos, ⛔ blacklisted,
//     SMR, TTR), totals, last transaction, three actions
//     (download, note, blacklist toggle).
//   - "Export All as CSV" button at the bottom.
//
// All state and callbacks flow in via props.

import React from "react";
import {T,c} from "../theme.js";
import {sN,sS,fmtAUD,fmtDate,todayStr,nowISO} from "../lib/utils.js";
import {F} from "../components/ui";

export default function Clients({
  txList,
  cliFrom,setCliFrom,cliTo,setCliTo,cliSearch,setCliSearch,
  dlBatch,dlTx,dlFile,
  isBlacklistedName,setBlacklist,
  setCliNoteId,setCliNoteVal,
  pop,
}){
  return <div>
    <div style={{fontSize:17,fontWeight:"bold",color:T.white,marginBottom:14}}>Client Files</div>
    <div style={c.card({padding:16,marginBottom:14})}>
      <div style={{fontSize:12,fontWeight:"bold",color:T.white,marginBottom:10}}>Batch Download</div>
      <div style={c.g2(10)}><F label="From" type="date" value={cliFrom} onChange={setCliFrom}/><F label="To" type="date" value={cliTo} onChange={setCliTo}/></div>
      <div style={{display:"flex",gap:10}}><button style={c.btn(T.gold,T.bg)} onClick={dlBatch}>⬇ Download Range</button><span style={{fontSize:11,color:T.muted}}>{(txList||[]).filter(t=>{if(!cliFrom&&!cliTo)return true;const d=new Date(t.date),fr=cliFrom?new Date(cliFrom):new Date(0),to=cliTo?new Date(cliTo):new Date();to.setHours(23,59,59);return d>=fr&&d<=to;}).length} tx in range</span></div>
    </div>
    <input style={c.inp({marginBottom:12})} type="text" placeholder="Search by name, ID, phone…" value={cliSearch} onChange={e=>setCliSearch(e.target.value)}/>
    {(txList||[]).filter(tx=>{if(!cliSearch)return true;const q=cliSearch.toLowerCase();return(sS(tx.client&&tx.client.fullName)+sS(tx.client&&tx.client.idNumber)+sS(tx.client&&tx.client.phone)).toLowerCase().includes(q);}).map(tx=>(
      <div key={tx.id} style={{...c.card({padding:14}),marginBottom:8,borderLeft:"3px solid "+(tx.smrFlagged?T.orange:tx.ttrRequired?T.red:T.border)}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
              <span style={{fontWeight:"bold",color:T.gold,fontSize:13}}>{sS(tx.client&&tx.client.fullName||"—")}</span>
              {tx.hasPhotos&&<span style={c.badge(T.green,T.greenBg)}>📷</span>}
              {isBlacklistedName(tx.client&&tx.client.fullName)&&<span style={c.badge(T.red)}>⛔ BLACKLISTED</span>}
              {tx.smrFlagged&&<span style={c.badge(T.orange)}>SMR</span>}
              {tx.ttrRequired&&<span style={c.badge(T.red)}>TTR</span>}
            </div>
            <div style={{fontSize:12,color:T.white}}>{fmtAUD(tx.buyTotal)} buy · {fmtAUD(tx.sellTotal)} sell</div>
            <div style={{fontSize:11,color:T.muted,marginTop:2}}>{fmtDate(tx.date)} · {sS(tx.payment).toUpperCase()}</div>
            {tx.clientNote&&<div style={{fontSize:11,color:T.gold,marginTop:4,fontStyle:"italic"}}>{tx.clientNote}</div>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <button style={c.bsm(T.goldBg,T.gold)} onClick={()=>dlTx(tx)}>⬇</button>
            <button style={c.bsm(T.border,T.muted)} onClick={()=>{setCliNoteId(tx.id);setCliNoteVal(sS(tx.clientNote));}}>📝</button>
            <button style={c.bsm(isBlacklistedName(sS(tx.client&&tx.client.fullName))?T.redBg:T.border,isBlacklistedName(sS(tx.client&&tx.client.fullName))?T.red:T.muted)} onClick={()=>{const nm=sS(tx.client&&tx.client.fullName);if(!nm)return;if(isBlacklistedName(nm))setBlacklist(p=>p.filter(b=>b.name.toLowerCase()!==nm.toLowerCase()));else{setBlacklist(p=>[...p,{name:nm,addedAt:nowISO()}]);pop(nm+" added to blacklist.","warn");}}}>⛔</button>
          </div>
        </div>
      </div>
    ))}
    <button style={{...c.bsm(T.border,T.muted),marginTop:10,fontSize:11,width:"100%"}} onClick={()=>{const rows=[["Invoice","Date","Client","DOB","Buy","Sell","Net","Payment","KYC","TTR","SMR"]];(txList||[]).forEach(t=>rows.push([sS(t.id),sS(t.date&&t.date.slice(0,10)),sS(t.client&&t.client.fullName),sS(t.client&&t.client.dob),sS(t.buyTotal),sS(t.sellTotal),sS(t.net),sS(t.payment),t.kycDone?"YES":"",t.ttrRequired?"YES":"",t.smrFlagged?"YES":""]));const Q='"';const esc=v=>Q+sS(v).replace(/"/g,Q+Q)+Q;dlFile(rows.map(r=>r.map(esc).join(",")).join("\n"),"lootledgr-export-"+todayStr()+".csv","text/csv");pop("CSV exported.","ok");}}>⬇ Export All as CSV</button>
  </div>;
}
