// LootLedger — StockCard.
// Mechanically extracted from src/App.tsx during Phase 2 step 8a
// (briefing §7.3). No semantic changes.
//
// Renders a single stock-list row: title, contract / date, paid +
// weight + purity + storage location, melt value + P/L, hold state
// (via HoldTimer), and the action buttons (police hold toggle,
// edit, mark-sold, delete). All callbacks come from the parent.

import React from "react";
import {T,c} from "../theme.js";
import {HoldTimer} from "./ui";
import {sN,sS,fmtAUD,fmtDate,hoursLeft,nowISO} from "../lib/utils.js";
import {calcMeltFn} from "../lib/compliance/index.js";

export default function StockCard({s,frozenSnap,gSpot,sSpot,togglePoliceHold,setPinModal,setPinVal,setStock,setEditStockId,setEditStockVal}){
  const mv=calcMeltFn(s,frozenSnap,gSpot,sSpot),pl=mv!=null?mv-sN(s.price):null;
  return <div style={{...c.card({padding:14}),marginBottom:10,borderLeft:"4px solid "+(s.policeHold?T.red:s.sold?T.muted:hoursLeft(s.holdUntil)>0?T.orange:T.readyGreen)}}>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:"bold",color:T.white,fontSize:13,marginBottom:3}}>{sS(s.description||(s.product&&s.product.label)||"—")}{s.sold&&<span style={{...c.badge(T.muted),marginLeft:6,fontSize:9}}>SOLD</span>}</div>
        <div style={{fontSize:11,color:T.muted,marginBottom:2}}>Contract: <span style={{color:T.gold}}>{sS(s.txId)}</span> · {fmtDate(s.date)}</div>
        <div style={{fontSize:11,color:T.muted,marginBottom:2}}>Paid: <span style={{color:T.green,fontWeight:"bold"}}>{fmtAUD(s.price)}</span>{s.weight_g&&s.purity?" · "+s.weight_g+"g "+s.purity:""}{s.storageLocation?" · 📍 "+s.storageLocation:""}</div>
        {mv!=null&&<div style={{fontSize:11,marginBottom:2}}>Melt: <span style={{color:T.gold}}>{fmtAUD(mv)}</span>{pl!=null&&<span style={{marginLeft:8,fontSize:10,color:pl>=0?T.green:T.red}}>{pl>=0?"▲ +":"▼ "}{fmtAUD(Math.abs(pl))}</span>}{frozenSnap&&<span style={{marginLeft:4,fontSize:9,color:T.muted}}>❄</span>}</div>}
        <div style={{display:"flex",gap:6,marginTop:4}}><HoldTimer holdUntil={s.holdUntil} policeHold={s.policeHold}/>{s.suspicious&&<span style={c.badge(T.orange)}>SUSPICIOUS</span>}</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        <button style={{...c.bsm(s.policeHold?T.redBg:T.border,s.policeHold?T.red:T.muted),padding:"6px 10px",fontSize:11}} onClick={()=>{if(s.policeHold){setPinModal({reason:"Remove police hold — manager PIN required.",cb:()=>togglePoliceHold(s.id,false)});setPinVal("");}else togglePoliceHold(s.id,true);}}>{s.policeHold?"🚔 Held":"🚔 Hold"}</button>
        <button style={{...c.bsm(T.border,T.muted),padding:"6px 10px",fontSize:11}} onClick={()=>{setEditStockId(s.id);setEditStockVal({description:s.description||"",weight_g:sS(s.weight_g),purity:s.purity||"",storageLocation:s.storageLocation||"",price:sS(s.price)});}}>✎ Edit</button>
        {!s.sold&&hoursLeft(s.holdUntil)<=0&&!s.policeHold&&<button style={{...c.bsm(T.readyGreenBg,T.readyGreen),padding:"6px 10px",fontSize:11}} onClick={()=>setStock(p=>p.map(x=>x.id===s.id?{...x,sold:true,soldDate:nowISO()}:x))}>💰</button>}
        <button style={{...c.bsm(T.border,T.muted),padding:"6px 10px",fontSize:11}} onClick={()=>setStock(p=>p.filter(x=>x.id!==s.id))}>🗑</button>
      </div>
    </div>
  </div>;
}
