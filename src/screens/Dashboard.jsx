// LootLedger — Dashboard screen.
// Mechanically extracted from src/App.tsx during Phase 2 step 9a
// (briefing §7.3). No semantic changes; markup preserved verbatim.
//
// The first screen the user sees. Shows: business name + date,
// gold + silver spot prices, optional live scale reading, four
// stat cards (txn 24h / in hold / for sale / police hold), the
// quick-reference price list (top six active catalog items), the
// AUSTRAC TTR pending banner if applicable, primary actions
// (New Transaction, EOD), and the duress / suppliers / staff /
// backup / police-report buttons.
//
// All state and callbacks flow in via props from App.tsx — the
// component is pure render.
//
// TODO comment for briefing §9 Gap 7 (TTR day-7/9 escalation
// banner) carried over verbatim above the AUSTRAC banner.

import React from "react";
import {T,c} from "../theme.js";
import {TROY_OZ} from "../lib/constants.js";
import {fmtAUD,fmtDate,hoursLeft,fmtScaleWeight} from "../lib/utils.js";
import {calcUnitPrice,businessDaysSince,policeHoldState} from "../lib/compliance/index.js";

// TFS Commit 4 — staleness threshold for the DFAT list. The list
// is updated by DFAT roughly fortnightly; 35 days gives a clear
// "you're behind" signal without nagging during normal cadence.
const TFS_STALE_DAYS=35;

export default function Dashboard({
  settings,gSpot,sSpot,
  scaleStatus,scaleDevice,scaleLive,
  txList,stock,catalog,
  duressActive,
  resetTx,setScreen,
  setShowEOD,setShowVendors,setShowStaff,setShowBackup,setShowPolice,
  triggerDuress,
  // TFS Commit 4 — App boots syncTfsCache and stores the metadata
  // (last_updated_at, record_count, source_filename). When the
  // cache age exceeds TFS_STALE_DAYS, surface a yellow banner so
  // the dealer knows to re-upload via /admin/tfs.
  tfsCacheMeta,
}){
  const fmtSW=r=>fmtScaleWeight(r,settings.scaleUnit||"g");
  return <div>
    <div style={{fontSize:17,fontWeight:"bold",color:T.white,marginBottom:18}}>{settings.businessName||"Loot Ledger"} — {new Date().toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"})}</div>
    <div style={c.g2(10)}>
      {[[T.gold,T.goldLight,"⬡ Gold (AUD/oz)",gSpot],[T.silver,T.silver,"◈ Silver (AUD/oz)",sSpot]].map(([col,sub,lbl,spot])=>(
        <div key={lbl} style={{...c.card({padding:"clamp(10px,2vw,20px)"}),minWidth:0}}>
          <div style={c.lbl}>{lbl}</div>
          <div style={{fontSize:"clamp(18px,3vw,32px)",fontWeight:"bold",color:col,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{fmtAUD(spot)}</div>
          <div style={{fontSize:12,color:T.muted,marginTop:4}}>/ g <span style={{color:sub,fontWeight:"bold"}}>{fmtAUD(spot/TROY_OZ)}</span></div>
        </div>
      ))}
    </div>
    {scaleStatus==="connected"&&(
      <div style={{...c.card({padding:"10px 16px"}),marginBottom:4,display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:20}}>⚖</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:9,color:T.muted,letterSpacing:"0.12em",textTransform:"uppercase"}}>Scale — {scaleDevice&&scaleDevice.name||"Connected"}</div>
          <div style={{fontSize:"clamp(18px,3vw,28px)",fontWeight:"bold",color:T.gold}}>{scaleLive?fmtSW(scaleLive):"Place item on scale…"}</div>
        </div>
        <div style={{fontSize:9,color:scaleLive?T.gold:T.muted}}>{scaleLive?"● LIVE":"○ waiting"}</div>
      </div>
    )}
    <div style={c.g4(10)}>
      {[{l:"Txn 24h",v:(()=>{const mn=new Date();mn.setHours(0,0,0,0);return(txList||[]).filter(t=>t.date&&new Date(t.date)>=mn).length;})()},{l:"In Hold",v:(stock||[]).filter(s=>!s.policeHold&&hoursLeft(s.holdUntil)>0).length,col:T.orange},{l:"For Sale",v:(stock||[]).filter(s=>!s.policeHold&&hoursLeft(s.holdUntil)<=0&&!s.sold).length,col:T.gold},{l:"🚔 Hold",v:(stock||[]).filter(s=>s.policeHold).length,col:T.red}].map(st=>(
        <div key={st.l} style={{...c.card({padding:15}),minWidth:0,overflow:"hidden"}}>
          <div style={{fontSize:10,color:T.muted,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{st.l}</div>
          <div style={{fontSize:23,fontWeight:"bold",color:st.col||T.text}}>{st.v}</div>
        </div>
      ))}
    </div>
    {(catalog||[]).filter(p=>p.active).length>0&&(
      <div style={c.card({padding:0,overflow:"hidden",marginBottom:14})}>
        <div style={c.shead(true)}>⬡ Quick Reference Prices</div>
        <div style={{padding:"10px 14px"}}>
          {(catalog||[]).filter(p=>p.active).slice(0,6).map(p=>(
            <div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid "+T.border+"22"}}>
              <span style={{fontSize:12}}>{p.label}</span>
              <span style={{fontSize:12,fontWeight:"bold",color:T.green}}>{fmtAUD(calcUnitPrice(p,gSpot,sSpot,"buy"))}/g</span>
            </div>
          ))}
        </div>
      </div>
    )}
    {/* Section 9 Gap 7 (2026-05-07) — severity-tiered TTR
        escalation banners. The TTR filing deadline is 10 business
        days from the tx date (AML/CTF Act s.43). Single-banner
        rendering would fail to differentiate a 1-day-old PENDING
        from a 9-day-old PENDING; staff need the urgency cue. The
        click target here is the History screen (setScreen('history'))
        — no built-in PENDING filter beyond the existing All / SMR /
        TTR tabs, but the TTR tab pre-filters to PENDING. */}
    {(()=>{
      const pending=(txList||[]).filter(t=>t&&t.ttrRequired&&t.ttrStatus==="PENDING");
      if(!pending.length)return null;
      const buckets={overdue:0,urgent:0,warn:0,soon:0};
      pending.forEach(t=>{
        const d=businessDaysSince(t.date);
        if(d>=10)buckets.overdue++;
        else if(d>=9)buckets.urgent++;
        else if(d>=7)buckets.warn++;
        else buckets.soon++;
      });
      const goHistory=()=>typeof setScreen==="function"?setScreen("history"):null;
      return <>
        {buckets.overdue>0&&<div style={{...c.bnr("block"),cursor:"pointer"}} onClick={goHistory}>🔴 OVERDUE TTRs — {buckets.overdue} transaction{buckets.overdue===1?"":"s"} past the 10-business-day deadline. File at austrac.gov.au/online IMMEDIATELY.</div>}
        {buckets.urgent>0&&<div style={{...c.bnr("warn"),cursor:"pointer",borderLeft:"4px solid "+T.orange,background:T.orangeBg||"#2a1a00",color:T.orange}} onClick={goHistory}>🟠 URGENT TTRs — {buckets.urgent} transaction{buckets.urgent===1?"":"s"} at day 9. File today or tomorrow.</div>}
        {buckets.warn>0&&<div style={{...c.bnr("warn"),cursor:"pointer"}} onClick={goHistory}>⚠️ TTR DUE SOON — {buckets.warn} transaction{buckets.warn===1?"":"s"} at day 7-8. File within 3 business days.</div>}
        {buckets.soon>0&&<div style={{...c.bnr("info"),cursor:"pointer"}} onClick={goHistory}>🔵 TTR PENDING — {buckets.soon} transaction{buckets.soon===1?"":"s"} to file (more than 3 business days remaining).</div>}
      </>;
    })()}
    {/* Section 9 Gap 8 (2026-05-07) — police-hold summary. Two
        tiers: items expiring within 3 days (yellow), and items
        whose hold has expired without reissue or release (red).
        Click → Stock screen. */}
    {(()=>{
      const held=(stock||[]).filter(s=>s&&s.policeHold).map(s=>({s,ph:policeHoldState(s)}));
      if(!held.length)return null;
      const expiring=held.filter(x=>x.ph.daysRemaining!=null&&x.ph.daysRemaining>=0&&x.ph.daysRemaining<=3);
      const expired=held.filter(x=>x.ph.status==="expired-first"||x.ph.status==="expired-final");
      const goStock=()=>typeof setScreen==="function"?setScreen("stock"):null;
      return <>
        {expired.length>0&&<div style={{...c.bnr("block"),cursor:"pointer"}} onClick={goStock}>🚓 POLICE HOLD EXPIRED — {expired.length} item{expired.length===1?"":"s"} pending action. Confirm reissue, release, or court order.</div>}
        {expiring.length>0&&<div style={{...c.bnr("warn"),cursor:"pointer"}} onClick={goStock}>🚓 Police hold expiring soon — {expiring.length} item{expiring.length===1?"":"s"} (≤3 days remaining). Ask police if a reissue is forthcoming.</div>}
      </>;
    })()}
    {(()=>{
      // TFS list freshness reminder. Renders only when we have a
      // metadata last_updated_at AND it's older than TFS_STALE_DAYS.
      // No render if metadata is missing entirely (don't pester a
      // brand-new shop that hasn't uploaded yet — the /admin/tfs
      // surface itself shows the empty state).
      const lastIso=tfsCacheMeta&&tfsCacheMeta.last_updated_at;
      if(!lastIso)return null;
      const ageDays=Math.floor((Date.now()-new Date(lastIso).getTime())/86400000);
      if(!isFinite(ageDays)||ageDays<=TFS_STALE_DAYS)return null;
      return <div style={c.bnr("warn")}>⚠ TFS list update due — {ageDays} days since last refresh ({fmtDate(lastIso)}). Re-upload the latest DFAT Consolidated List via /admin/tfs.</div>;
    })()}
    <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap"}}>
      <button style={c.btn(T.gold,T.bg,{flex:2,minWidth:160,padding:"13px 0",fontSize:12})} onClick={()=>{resetTx();setScreen("newTx");}}>＋ New Transaction</button>
      <button style={c.btn(T.border,T.text,{flex:1,minWidth:100,padding:"13px 0",fontSize:12})} onClick={()=>setShowEOD(true)}>📋 EOD</button>
    </div>
    <div style={{display:"flex",justifyContent:"center",gap:10,marginTop:8,flexWrap:"wrap"}}>
      <button style={c.bsm(T.border,T.muted)} onClick={()=>setShowVendors(true)}>🏪 Suppliers</button>
      <button style={c.bsm(T.border,T.muted)} onClick={()=>setShowStaff(true)}>👥 Staff</button>
      <button style={c.bsm(T.border,T.muted)} onClick={()=>setShowBackup(true)}>💾 Backup</button>
    </div>
    <div style={{display:"flex",justifyContent:"center",marginTop:8}}>
      <button style={c.bsm(T.border,T.muted)} onClick={()=>setShowPolice(true)}>🚔 Police Report</button>
    </div>
    <div style={{display:"flex",justifyContent:"center",marginTop:10}}>
      <button style={{padding:"10px 18px",minWidth:200,maxWidth:280,background:duressActive?"#cc0000":"#111",color:"#fff",border:duressActive?"2px solid #ff4444":"2px solid #333",borderRadius:8,fontSize:13,fontWeight:"bold",letterSpacing:"0.08em",cursor:"pointer",textTransform:"uppercase",whiteSpace:"nowrap",boxShadow:duressActive?"0 0 20px rgba(255,0,0,0.6),4px 4px 14px rgba(0,0,0,0.5)":"4px 4px 14px rgba(0,0,0,0.5)"}} onClick={()=>{if(!duressActive)triggerDuress();}}>
        {duressActive?"🚨 DURESS ACTIVE":"🆘 POLICE HELP"}
      </button>
    </div>
  </div>;
}
