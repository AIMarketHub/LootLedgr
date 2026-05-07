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
import {calcMeltFn,policeHoldState} from "../lib/compliance/index.js";

export default function StockCard({s,frozenSnap,gSpot,sSpot,togglePoliceHold,setPinModal,setPinVal,setStock,setEditStockId,setEditStockVal,setPoliceHoldModal}){
  const mv=calcMeltFn(s,frozenSnap,gSpot,sSpot),pl=mv!=null?mv-sN(s.price):null;
  // Section 9 Gap 8 — derive lifecycle state for the hold display.
  // Status drives both the days-remaining chip below the row and
  // the colour-escalation of the left border accent.
  const ph=policeHoldState(s);
  const holdAccent=s.policeHold
    ?(ph.status==="expired-first"||ph.status==="expired-final")?T.red
      :(ph.daysRemaining!=null&&ph.daysRemaining<=3)?T.orange
      :T.red
    :s.sold?T.muted
    :hoursLeft(s.holdUntil)>0?T.orange
    :T.readyGreen;
  // Click handler: not-on-hold → "set" modal (free); on-hold →
  // PIN-gated → "manage" modal. Falls back to the legacy binary
  // toggle when the modal opener prop isn't wired (defensive —
  // older call sites still work).
  const onHoldClick=()=>{
    if(typeof setPoliceHoldModal!=="function"){
      // Legacy fallback path (kept for parity with the
      // pre-Gap-8 toggle behaviour).
      if(s.policeHold){setPinModal({reason:"Remove police hold — Admin PIN required.",cb:()=>togglePoliceHold(s.id,false)});setPinVal("");}
      else togglePoliceHold(s.id,true);
      return;
    }
    if(s.policeHold){
      setPinModal({reason:"Manage police hold — Admin PIN required.",cb:()=>setPoliceHoldModal({stockId:s.id,mode:"manage"})});
      setPinVal("");
    }else{
      setPoliceHoldModal({stockId:s.id,mode:"set"});
    }
  };
  // Section 9 Gap 4 polish — flag missing storage location with an
  // inline yellow chip so the dealer notices on the row instead of
  // having to remember to look. Police-locate-on-demand fails if
  // staff didn't capture a location at buy-time.
  const missingLoc=!sS(s.storageLocation).trim();
  return <div style={{...c.card({padding:14}),marginBottom:10,borderLeft:"4px solid "+holdAccent}}>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:"bold",color:T.white,fontSize:13,marginBottom:3}}>{sS(s.description||(s.product&&s.product.label)||"—")}{s.sold&&<span style={{...c.badge(T.muted),marginLeft:6,fontSize:9}}>SOLD</span>}</div>
        <div style={{fontSize:11,color:T.muted,marginBottom:2}}>Contract: <span style={{color:T.gold}}>{sS(s.txId)}</span> · {fmtDate(s.date)}</div>
        <div style={{fontSize:11,color:T.muted,marginBottom:2}}>
          Paid: <span style={{color:T.green,fontWeight:"bold"}}>{fmtAUD(s.price)}</span>
          {s.weight_g&&s.purity?" · "+s.weight_g+"g "+s.purity:""}
          {s.storageLocation?" · 📍 "+s.storageLocation:""}
          {missingLoc&&<span style={{...c.badge(T.orange,T.orangeBg||"#2a1a00"),marginLeft:6,fontSize:9}}>📍 NO LOCATION SET</span>}
        </div>
        {mv!=null&&<div style={{fontSize:11,marginBottom:2}}>Melt: <span style={{color:T.gold}}>{fmtAUD(mv)}</span>{pl!=null&&<span style={{marginLeft:8,fontSize:10,color:pl>=0?T.green:T.red}}>{pl>=0?"▲ +":"▼ "}{fmtAUD(Math.abs(pl))}</span>}{frozenSnap&&<span style={{marginLeft:4,fontSize:9,color:T.muted}}>❄</span>}</div>}
        <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap",alignItems:"center"}}>
          <HoldTimer holdUntil={s.holdUntil} policeHold={s.policeHold}/>
          {s.suspicious&&<span style={c.badge(T.orange)}>SUSPICIOUS</span>}
          {/* Section 9 Gap 8 — police-hold lifecycle chip. Only
              renders when the item is currently held; surfaces
              days-remaining and escalates colour as expiry nears
              or passes. Status text is duplicated below for
              expired states because "−2 days" alone reads
              ambiguously. */}
          {s.policeHold&&ph.daysRemaining!=null&&<span style={c.badge(
            ph.daysRemaining<0?T.red
              :ph.daysRemaining<=3?T.orange
              :T.muted,
            ph.daysRemaining<0?T.redBg:undefined
          )}>🚓 {ph.daysRemaining>=0?ph.daysRemaining+"d left":Math.abs(ph.daysRemaining)+"d EXPIRED"}{ph.expiryDate?" · "+fmtDate(ph.expiryDate):""}</span>}
          {s.policeHold&&ph.status==="active-legacy"&&<span style={c.badge(T.muted)}>🚓 Hold (no notice details)</span>}
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        <button style={{...c.bsm(s.policeHold?T.redBg:T.border,s.policeHold?T.red:T.muted),padding:"6px 10px",fontSize:11}} onClick={onHoldClick}>{s.policeHold?"🚔 Manage":"🚔 Hold"}</button>
        <button style={{...c.bsm(T.border,T.muted),padding:"6px 10px",fontSize:11}} onClick={()=>{setEditStockId(s.id);setEditStockVal({description:s.description||"",weight_g:sS(s.weight_g),purity:s.purity||"",storageLocation:s.storageLocation||"",price:sS(s.price)});}}>✎ Edit</button>
        {!s.sold&&hoursLeft(s.holdUntil)<=0&&!s.policeHold&&<button style={{...c.bsm(T.readyGreenBg,T.readyGreen),padding:"6px 10px",fontSize:11}} onClick={()=>setStock(p=>p.map(x=>x.id===s.id?{...x,sold:true,soldDate:nowISO()}:x))}>💰</button>}
        <button style={{...c.bsm(T.border,T.muted),padding:"6px 10px",fontSize:11}} onClick={()=>setStock(p=>p.filter(x=>x.id!==s.id))}>🗑</button>
      </div>
    </div>
  </div>;
}
