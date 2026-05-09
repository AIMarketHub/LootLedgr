// LootLedger — Police Hold modal.
// Section 9 Gap 8 (2026-05-07). Replaces the binary policeHold
// toggle with a state-aware capture / management surface.
//
// Vic Second-Hand Dealers and Pawnbrokers Act s.21 timing:
//   • Police notice has a 21-calendar-day default life.
//   • Police may issue a single 21-day reissue (total 42 days).
//   • After the second window expires, the dealer can sell the
//     item unless a court order has been served.
// (Other states differ on hold period — see STATE_INFO in
// src/lib/compliance/au.js. The 21+21 default applies regardless;
// states with shorter statutory holds just give the dealer a
// shorter window before they can challenge a stale notice.)
//
// Two modes:
//   • "set"     — item not currently on hold. Captures notice
//                 received date (defaults to today) and notice
//                 reference number, computes the +21d expiry,
//                 flips policeHold=true.
//   • "manage"  — item currently on hold. Shows current state +
//                 metadata + days-remaining; offers Reissue and
//                 Release actions per the lifecycle. Both
//                 destructive paths (Reissue extends the gate;
//                 Release lifts the hold) are reached only after
//                 the parent has already passed the Admin-PIN
//                 gate via setPinModal.
//
// On confirm, the modal calls setStock with the appropriate
// patch and then closes. setStock here is the App-level
// stock setter (already wired through StockCard / Stock).

import React,{useMemo,useState} from "react";
import {T,c} from "../theme.js";
import {Modal,F} from "../components/ui";
import {sS,nowISO,formatDateAU} from "../lib/utils.js";
import {policeHoldState,calendarDaysBetween} from "../lib/compliance/index.js";

const HOLD_DAYS=21;

function todayISO(){
  const d=new Date();
  d.setHours(0,0,0,0);
  return d.toISOString().slice(0,10);
}

function plusDaysISO(baseISO,days){
  if(!baseISO)return null;
  const d=new Date(baseISO);
  if(isNaN(d.getTime()))return null;
  d.setDate(d.getDate()+days);
  return d.toISOString();
}

// Police-hold notice fields are date-only (stored via type=date
// inputs); render as DD-MM-YYYY without a clock.
function fmtIso(v){return v?formatDateAU(v):"—";}

export default function PoliceHoldModal({stockItem,mode,setStock,onClose,pop}){
  const item=stockItem||null;
  const [receivedDate,setReceivedDate]=useState(todayISO());
  const [noticeRef,setNoticeRef]=useState("");
  const [reissueDate,setReissueDate]=useState(todayISO());
  const [reissueRef,setReissueRef]=useState("");
  const [releaseReason,setReleaseReason]=useState("");
  const [releaseModalOpen,setReleaseModalOpen]=useState(false);
  const [reissueModalOpen,setReissueModalOpen]=useState(false);
  const [busy,setBusy]=useState(false);

  const ph=useMemo(()=>policeHoldState(item),[item]);

  if(!item)return null;

  const itemLabel=sS(item.description||(item.product&&item.product.label)||"(unlabelled)");

  // === SET MODE — capture the notice that just arrived ===
  if(mode==="set"){
    const expectedExpiry=plusDaysISO(receivedDate+"T00:00:00",HOLD_DAYS);
    const submit=()=>{
      const ref=String(noticeRef||"").trim();
      if(!receivedDate){pop&&pop("Notice received date is required.","warn");return;}
      if(ref.length<2){pop&&pop("Notice reference required (police case / file number).","warn");return;}
      setBusy(true);
      const receivedISO=new Date(receivedDate+"T00:00:00").toISOString();
      const expiryISO=plusDaysISO(receivedDate+"T00:00:00",HOLD_DAYS);
      setStock(prev=>prev.map(s=>s.id===item.id?{
        ...s,
        policeHold:true,
        policeNoticeReceivedDate:receivedISO,
        policeNoticeRef:ref,
        policeNoticeExpiryDate:expiryISO,
        // Clear any stale lifecycle fields from a prior cycle so
        // re-applying a fresh notice resets the clock cleanly.
        policeReissueDate:null,
        policeReissueExpiryDate:null,
        policeReleasedAt:null,
        policeReleaseReason:null,
      }:s));
      pop&&pop("Police hold recorded — expires "+fmtIso(expiryISO)+".","ok");
      onClose&&onClose();
    };
    return <Modal title="🚓 Apply police hold" onClose={busy?undefined:onClose}>
      <div style={{...c.bnr("warn"),marginBottom:14}}>Capture the notice details now so the 21-day expiry clock starts from the correct date. Police may extend with a single 21-day reissue (total 42 days). After expiry without reissue or court order, the item is releasable.</div>
      <div style={{fontSize:11,color:T.muted,marginBottom:8}}>Item: <strong style={{color:T.text}}>{itemLabel}</strong>{item.txId?" · Tx "+sS(item.txId):""}</div>
      <div style={c.g2(10)}>
        <F label="Notice received (date)" type="date" required value={receivedDate} onChange={setReceivedDate}/>
        <F label="Police reference / file number" required value={noticeRef} onChange={setNoticeRef} placeholder="e.g. VPL-12345"/>
      </div>
      <div style={{...c.bnr("info"),marginTop:10,marginBottom:14}}>Auto-calculated expiry: <strong>{fmtIso(expectedExpiry)}</strong> (+{HOLD_DAYS} calendar days from received date).</div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button style={c.btn(T.red,T.bg)} onClick={submit} disabled={busy}>{busy?"Saving…":"Apply hold"}</button>
        <button style={c.bsm()} onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </Modal>;
  }

  // === MANAGE MODE — current state + reissue / release actions ===
  const expiryDays=ph.daysRemaining;
  const expDateLabel=ph.expiryDate?fmtIso(ph.expiryDate):"—";
  const statusLabel=({
    "active":"Active (first window)",
    "reissue-active":"Active (reissue window)",
    "expired-first":"Expired — first window",
    "expired-final":"Expired — final window (after reissue)",
    "active-legacy":"Active (legacy — no notice details on file)",
  })[ph.status]||sS(ph.status).toUpperCase();

  // Reissue is only valid before the FINAL expiry. Once
  // policeReissueExpiryDate is set the hold is in its second
  // and final window — no further extensions.
  const canReissue=!item.policeReissueExpiryDate;
  const submitReissue=()=>{
    const ref=String(reissueRef||"").trim();
    if(!reissueDate){pop&&pop("Reissue date is required.","warn");return;}
    if(ref.length<2){pop&&pop("Reissue reference required (police case / file number).","warn");return;}
    setBusy(true);
    const reissueISO=new Date(reissueDate+"T00:00:00").toISOString();
    const newExpiryISO=plusDaysISO(reissueDate+"T00:00:00",HOLD_DAYS);
    setStock(prev=>prev.map(s=>s.id===item.id?{
      ...s,
      policeHold:true,
      policeReissueDate:reissueISO,
      policeReissueExpiryDate:newExpiryISO,
      policeReissueRef:ref,
    }:s));
    pop&&pop("Reissue recorded — expires "+fmtIso(newExpiryISO)+".","ok");
    onClose&&onClose();
  };
  const submitRelease=()=>{
    const reason=String(releaseReason||"").trim();
    if(reason.length<5){pop&&pop("Release reason required (≥5 chars). E.g. 'Hold expired, no reissue', 'Released by police email 2026-05-12'.","warn");return;}
    setBusy(true);
    setStock(prev=>prev.map(s=>s.id===item.id?{
      ...s,
      policeHold:false,
      policeReleasedAt:nowISO(),
      policeReleaseReason:reason,
    }:s));
    pop&&pop("Police hold released.","ok");
    onClose&&onClose();
  };

  // Reissue sub-modal
  if(reissueModalOpen){
    const expectedExpiry=plusDaysISO(reissueDate+"T00:00:00",HOLD_DAYS);
    return <Modal title="🚓 Reissue police hold" onClose={busy?undefined:()=>setReissueModalOpen(false)}>
      <div style={{...c.bnr("warn"),marginBottom:14}}>A reissue extends the hold by another {HOLD_DAYS} calendar days. Police may only reissue once — after this window expires the item is releasable unless a court order has been served.</div>
      <div style={{fontSize:11,color:T.muted,marginBottom:8}}>Item: <strong style={{color:T.text}}>{itemLabel}</strong></div>
      <div style={c.g2(10)}>
        <F label="Reissue date" type="date" required value={reissueDate} onChange={setReissueDate}/>
        <F label="Reissue reference" required value={reissueRef} onChange={setReissueRef} placeholder="e.g. VPL-12345-R1"/>
      </div>
      <div style={{...c.bnr("info"),marginTop:10,marginBottom:14}}>New expiry: <strong>{fmtIso(expectedExpiry)}</strong></div>
      <div style={{display:"flex",gap:10}}>
        <button style={c.btn(T.red,T.bg)} onClick={submitReissue} disabled={busy}>{busy?"Saving…":"Confirm reissue"}</button>
        <button style={c.bsm()} onClick={()=>setReissueModalOpen(false)} disabled={busy}>Cancel</button>
      </div>
    </Modal>;
  }

  // Release sub-modal
  if(releaseModalOpen){
    return <Modal title="🚓 Release from police hold" onClose={busy?undefined:()=>setReleaseModalOpen(false)}>
      <div style={{...c.bnr("warn"),marginBottom:14}}>Lifting the hold marks the item available for sale. If a court order is on the way, do NOT release — leave the hold in place until you receive written confirmation.</div>
      <div style={{fontSize:11,color:T.muted,marginBottom:8}}>Item: <strong style={{color:T.text}}>{itemLabel}</strong></div>
      <F label="Release reason (≥5 chars)" as="textarea" value={releaseReason} onChange={setReleaseReason} placeholder="e.g. Hold expired, no reissue served by day 21. Confirmed by phone with VicPol case officer."/>
      <div style={{display:"flex",gap:10,marginTop:10,flexWrap:"wrap"}}>
        <button style={c.btn(T.green,T.bg)} onClick={submitRelease} disabled={busy}>{busy?"Saving…":"Confirm release"}</button>
        <button style={c.bsm()} onClick={()=>setReleaseModalOpen(false)} disabled={busy}>Cancel</button>
      </div>
    </Modal>;
  }

  // Manage view (default in manage mode)
  const expiredOrExpiring=expiryDays!=null&&expiryDays<=3;
  return <Modal title="🚓 Manage police hold" onClose={onClose}>
    <div style={{
      ...c.bnr(expiredOrExpiring?"block":"info"),
      marginBottom:14,
    }}>
      <div style={{fontWeight:"bold",marginBottom:4}}>{statusLabel}</div>
      {expiryDays!=null&&<div style={{fontSize:12}}>
        {expiryDays>=0?"Expires in "+expiryDays+" day"+(expiryDays===1?"":"s")+" ("+expDateLabel+").":"Expired "+Math.abs(expiryDays)+" day"+(expiryDays===-1?"":"s")+" ago ("+expDateLabel+")."}
      </div>}
    </div>

    <div style={{...c.card({padding:14}),marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:8}}>NOTICE DETAILS</div>
      <div style={{fontSize:12,lineHeight:1.6,color:T.text}}>
        <div>Item: <strong>{itemLabel}</strong>{item.txId?" · Tx "+sS(item.txId):""}</div>
        <div>Notice received: {fmtIso(item.policeNoticeReceivedDate)}</div>
        <div>Notice reference: {sS(item.policeNoticeRef)||"—"}</div>
        <div>First-window expiry: {fmtIso(item.policeNoticeExpiryDate)}</div>
        {item.policeReissueDate&&<div>Reissue date: {fmtIso(item.policeReissueDate)}</div>}
        {item.policeReissueExpiryDate&&<div>Reissue expiry: {fmtIso(item.policeReissueExpiryDate)}</div>}
        {item.policeReissueRef&&<div>Reissue reference: {sS(item.policeReissueRef)}</div>}
      </div>
    </div>

    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      {canReissue&&<button style={c.btn(T.orange,T.bg)} onClick={()=>{setReissueDate(todayISO());setReissueRef("");setReissueModalOpen(true);}}>Reissue (+{HOLD_DAYS} days)</button>}
      <button style={c.btn(T.green,T.bg)} onClick={()=>{setReleaseReason("");setReleaseModalOpen(true);}}>Release item</button>
      <button style={c.bsm()} onClick={onClose}>Close</button>
    </div>
    {!canReissue&&<div style={{fontSize:11,color:T.muted,marginTop:10}}>Reissue not available — this hold is already in its second (reissued) window. Release the item once the final window expires unless a court order has been served.</div>}
  </Modal>;
}
