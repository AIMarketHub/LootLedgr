// LootLedger — EOD (End of Day Report) modal.
// Mechanically extracted from src/App.tsx during Phase 2 step 10d
// (briefing §7.3). No semantic changes; markup preserved verbatim.
//
// Day-end summary card: transaction count, buy total, sell total,
// net, plus a TTR-pending banner when applicable. The "Download
// Accounting" button hands off to dlAccounting (the per-day CSV
// export) and closes the modal.
//
// `todayTxData` is computed at the App.tsx level (a useMemo over
// txList filtered to today's date) and passed in as a prop.

import React from "react";
import {T,c} from "../theme.js";
import {sN,fmtAUD} from "../lib/utils.js";
import Modal from "../components/ui/Modal.jsx";

export default function EOD({todayTxData,dlAccounting,setShowEOD}){
  return <Modal title="📋 End of Day Report" onClose={()=>setShowEOD(false)}>
    {(()=>{
      const txs=todayTxData;
      const tot={buy:txs.reduce((s,t)=>s+sN(t.buyTotal),0),sell:txs.reduce((s,t)=>s+sN(t.sellTotal),0)};
      return <div>
        <div style={{fontSize:13,fontWeight:"bold",color:T.white,marginBottom:4}}>{new Date().toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"})}</div>
        <div style={c.g2(10)}>
          <div style={c.card({padding:12})}><div style={c.lbl}>Transactions</div><div style={{fontSize:24,fontWeight:"bold",color:T.white}}>{txs.length}</div></div>
          <div style={c.card({padding:12})}><div style={c.lbl}>Buy Total</div><div style={{fontSize:20,fontWeight:"bold",color:T.green}}>{fmtAUD(tot.buy)}</div></div>
          <div style={c.card({padding:12})}><div style={c.lbl}>Sell Total</div><div style={{fontSize:20,fontWeight:"bold",color:T.gold}}>{fmtAUD(tot.sell)}</div></div>
          <div style={c.card({padding:12})}><div style={c.lbl}>Net</div><div style={{fontSize:20,fontWeight:"bold",color:T.white}}>{fmtAUD(tot.sell-tot.buy)}</div></div>
        </div>
        {txs.filter(t=>t.ttrStatus==="PENDING").length>0&&<div style={{...c.bnr("block"),marginTop:10}}>🔴 {txs.filter(t=>t.ttrStatus==="PENDING").length} TTR(s) pending — file with AUSTRAC Online today.</div>}
        <div style={{display:"flex",gap:10,marginTop:14}}>
          <button style={c.btn(T.gold,T.bg)} onClick={()=>{dlAccounting();setShowEOD(false);}}>📊 Download Accounting</button>
          <button style={c.bsm()} onClick={()=>setShowEOD(false)}>Close</button>
        </div>
      </div>;
    })()}
  </Modal>;
}
