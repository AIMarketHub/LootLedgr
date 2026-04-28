// LootLedger — History screen.
// Mechanically extracted from src/App.tsx during Phase 2 step 9d
// (briefing §7.3). No semantic changes; markup preserved verbatim.
//
// Renders the transaction history list with three filter buttons
// (all / SMR-flagged / TTR pending), per-row badges (TTR pending /
// filed, SMR, voided), and three actions per row (View, receipt,
// Void). Voiding stamps voided=true + voidedAt=nowISO() on the
// transaction without deleting it.

import React from "react";
import {T,c} from "../theme.js";
import {sN,sS,fmtAUD,fmtDate,nowISO} from "../lib/utils.js";

export default function History({
  txList,histFilter,setHistFilter,
  setSelTx,setReceiptTx,setTxList,
}){
  return <div>
    <div style={{fontSize:17,fontWeight:"bold",color:T.white,marginBottom:14}}>Transaction History</div>
    <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
      {[["all","All ("+((txList||[]).length)+")"],["smr","🚩 SMR ("+((txList||[]).filter(t=>t.smrFlagged).length)+")"],["ttr","🔴 TTR ("+((txList||[]).filter(t=>t.ttrStatus==="PENDING").length)+")"]].map(([k,l])=><button key={k} style={c.bsm(histFilter===k?T.gold:T.border,histFilter===k?T.bg:T.text)} onClick={()=>setHistFilter(k)}>{l}</button>)}
    </div>
    {(txList||[]).filter(tx=>histFilter==="smr"?tx.smrFlagged:histFilter==="ttr"?tx.ttrStatus==="PENDING":true).map(tx=>(
      <div key={tx.id} style={c.card({padding:14,marginBottom:8})}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:4,alignItems:"center"}}>
              <span style={{fontWeight:"bold",color:T.gold,fontSize:13}}>{sS(tx.id)}</span>
              <span style={{fontSize:11,color:T.muted}}>{fmtDate(tx.date)}</span>
              {tx.ttrRequired&&<span style={c.badge(T.red)}>TTR{tx.ttrStatus==="FILED"?" FILED":" PENDING"}</span>}
              {tx.smrFlagged&&<span style={c.badge(T.orange)}>SMR</span>}
              {tx.voided&&<span style={c.badge(T.muted)}>VOIDED</span>}
            </div>
            <div style={{fontSize:13,color:T.white,fontWeight:500,marginBottom:3}}>{sS(tx.client&&tx.client.fullName||"—")}</div>
            <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:12,color:T.muted}}>
              {tx.buyTotal>0&&<span>Buy: <strong style={{color:T.green}}>{fmtAUD(tx.buyTotal)}</strong></span>}
              {tx.sellTotal>0&&<span>Sell: <strong style={{color:T.gold}}>{fmtAUD(tx.sellTotal)}</strong></span>}
              <span>Net: <strong style={{color:sN(tx.net)>=0?T.gold:T.green}}>{fmtAUD(Math.abs(tx.net||0))}</strong></span>
            </div>
          </div>
          <div style={{display:"flex",gap:4,flexDirection:"column"}}>
            <button style={c.bsm()} onClick={()=>setSelTx(tx)}>View</button>
            <button style={c.bsm(T.goldBg,T.gold)} onClick={()=>setReceiptTx(tx)}>🧾</button>
            {!tx.voided&&<button style={c.bsm(T.redBg,T.red)} onClick={()=>setTxList(p=>p.map(x=>x.id===tx.id?{...x,voided:true,voidedAt:nowISO()}:x))}>Void</button>}
          </div>
        </div>
      </div>
    ))}
  </div>;
}
