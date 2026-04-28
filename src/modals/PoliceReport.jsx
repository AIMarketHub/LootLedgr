// LootLedger — PoliceReport modal.
// Mechanically extracted from src/App.tsx during Phase 2 step 10c
// (briefing §7.3). No semantic changes; markup preserved verbatim.
//
// Generates the per-state Secondhand Dealer transaction register
// CSV (or the SMR-only variant). The state code comes from
// settings.state (defaults VIC); state metadata (act, hold period,
// submission note) is read from STATE_INFO in the active regional
// compliance module.
//
// Two actions: Download CSV, Email to station (mailto: handoff).
//
// Local React state (dateFrom / dateTo / suspicious) lives inside
// the IIFE — preserved verbatim from the original.

import React from "react";
import {T,c} from "../theme.js";
import {sS,todayStr} from "../lib/utils.js";
import {STATE_INFO,genPoliceReport} from "../lib/compliance/index.js";
import {Modal,F} from "../components/ui";

export default function PoliceReport({settings,txList,dlFile,pop,setShowPolice}){
  return <Modal title="🚔 Police Report Generator" onClose={()=>setShowPolice(false)} wide>
    {(()=>{
      const[dateFrom,setDateFrom]=React.useState(new Date(Date.now()-7*86400000).toISOString().slice(0,10));
      const[dateTo,setDateTo]=React.useState(new Date().toISOString().slice(0,10));
      const[suspicious,setSuspicious]=React.useState(false);
      const sc=settings.state||"VIC";const st=STATE_INFO[sc]||STATE_INFO.VIC;
      return <div>
        <div style={{...c.card({padding:12}),marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:8}}>State: {st.name}</div>
          <div style={{fontSize:11,color:T.muted,marginBottom:4}}>Governing Act: {st.act}</div>
          <div style={{fontSize:11,color:T.muted,marginBottom:4}}>Hold Period: {st.hold}</div>
          <div style={{fontSize:11,color:T.muted}}>{st.note}</div>
        </div>
        <div style={c.g2(10)}>
          <F label="From" type="date" value={dateFrom} onChange={setDateFrom}/>
          <F label="To" type="date" value={dateTo} onChange={setDateTo}/>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,marginBottom:14}}><input type="checkbox" checked={suspicious} onChange={e=>setSuspicious(e.target.checked)}/>Only include SMR-flagged transactions</label>
        <div style={{display:"flex",gap:10}}>
          <button style={c.btn(T.gold,T.bg)} onClick={()=>{const csv=genPoliceReport(new Date(dateFrom),new Date(dateTo),suspicious,sc,txList,settings);dlFile(csv,"police-report-"+todayStr()+".csv","text/csv");pop("Police report downloaded.","ok");}}>⬇ Download Report CSV</button>
          <button style={c.bsm()} onClick={()=>{const csv=genPoliceReport(new Date(dateFrom),new Date(dateTo),suspicious,sc,txList,settings);const subject="Secondhand Dealer Transaction Report — "+sS(settings.businessName);window.location.href="mailto:"+(settings.policeEmail||st.defaultEmail)+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent("Please find attached the transaction register.\n\nBusiness: "+sS(settings.businessName)+"\nABN: "+sS(settings.abn)+"\nLicence: "+sS(settings.dealerLicenceNo));pop("Email client opened.","ok");}}>✉ Email to Station</button>
        </div>
      </div>;
    })()}
  </Modal>;
}
