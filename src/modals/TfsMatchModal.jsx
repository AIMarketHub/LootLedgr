// LootLedger — TFS match review modal.
//
// Surfaces every HIGH / MEDIUM severity match returned by the
// matcher so staff can resolve each one before the transaction
// can advance past the Client step.
//
// Per-match decision buttons (per Commit 3 spec):
//   ✓ Citizenship matches — block transaction      (red)
//   ✗ Different person — override with PIN          (yellow)
//   ⏸ Need to ask customer for citizenship          (default;
//                                                     closes modal)
//
// Block path: shows the refuse-politely overlay, then on
// Acknowledge calls onBlock(matchRef). Parent (NewTx) writes the
// audit log + resets the transaction.
//
// Override path: inline PIN + reason form. PIN compared against
// settings.staffPin (the "Admin PIN" — same key the rest of the
// app gates with). Reason must be ≥ 20 chars per spec. On valid
// entry, calls onOverride(matchRef, reason).
//
// Need-citizenship path: closes modal silently. Parent's banner
// remains; the next field-blur re-runs screenCustomer with any
// new citizenship value the staff captures.
//
// When all matches in the list have been overridden (resolved
// via the override path), the modal auto-closes and signals
// onAllResolved() so the parent can clear the banner.

import React,{useState,useMemo} from "react";
import {T,c} from "../theme.js";
import {Modal,F} from "../components/ui";
import {sS} from "../lib/utils.js";

function fmtLong(iso){if(!iso)return null;try{return new Date(iso).toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"});}catch(_){return sS(iso);}}

// Format the parsed DOB for human display alongside the raw text.
function formatDob(parsed){
  if(!parsed||parsed.type==="unknown")return null;
  if(parsed.type==="exact"&&Array.isArray(parsed.dates)&&parsed.dates.length){
    return parsed.dates.map(d=>fmtLong(d)).filter(Boolean).join(" or ");
  }
  if(parsed.type==="range"&&Array.isArray(parsed.yearsRange)&&parsed.yearsRange.length===2){
    return parsed.yearsRange[0]+" — "+parsed.yearsRange[1];
  }
  if(parsed.type==="multiple"){
    const datePart=Array.isArray(parsed.dates)&&parsed.dates.length?parsed.dates.map(d=>fmtLong(d)).filter(Boolean).join(", "):"";
    const yearPart=Array.isArray(parsed.years)&&parsed.years.length?parsed.years.join(", "):"";
    return [datePart,yearPart].filter(Boolean).join(" / ");
  }
  return null;
}

// Sanctions flag chips. Only renders chips for flags set true.
function FlagChips({record}){
  const chips=[];
  if(record.tfs)chips.push("TFS");
  if(record.travel_ban)chips.push("Travel Ban");
  if(record.arms_embargo)chips.push("Arms Embargo");
  if(record.maritime_restriction)chips.push("Maritime Restriction");
  if(!chips.length)return null;
  return <div style={{display:"flex",gap:6,flexWrap:"wrap",margin:"8px 0"}}>
    {chips.map(label=><span key={label} style={{...c.badge(T.red),fontSize:10}}>{label}</span>)}
  </div>;
}

function SeverityBadge({severity}){
  const colour=severity==="high"?T.red:severity==="medium"?T.orange:T.muted;
  return <span style={{...c.badge(colour),fontSize:11,padding:"3px 10px",letterSpacing:"0.05em"}}>{severity.toUpperCase()}</span>;
}

// Single match card. Owns its local resolved state (whether the
// staff has overridden this specific match yet) so the parent can
// keep its state minimal.
function MatchCard({match,resolved,settings,onBlockRequested,onOverrideSubmit,onCloseModal}){
  const r=match.primaryRecord||{};
  const dobLong=formatDob(r.dob_parsed);
  const aliases=Array.isArray(match.aliases)?match.aliases:[];
  const[overrideOpen,setOverrideOpen]=useState(false);
  const[pin,setPin]=useState("");
  const[reason,setReason]=useState("");
  const[err,setErr]=useState("");
  const[busy,setBusy]=useState(false);

  const submitOverride=async()=>{
    setErr("");
    const expectedPin=String((settings&&settings.staffPin)||"").trim();
    const typedPin=String(pin||"").trim();
    if(!typedPin)return setErr("Admin PIN required.");
    if(!expectedPin)return setErr("No Admin PIN configured. Set one in Settings → Security.");
    if(typedPin!==expectedPin)return setErr("Incorrect PIN.");
    if(reason.trim().length<20)return setErr("Reason must be at least 20 characters.");
    setBusy(true);
    try{
      await onOverrideSubmit(r.primary_reference||r.reference,reason.trim());
      // Local fields cleared — the parent will mark this card
      // resolved and re-render.
      setPin("");setReason("");setOverrideOpen(false);
    }catch(e){
      setErr("Override failed: "+(e&&e.message||String(e)));
    }finally{
      setBusy(false);
    }
  };

  const blockedColour=resolved?T.muted:match.severity==="high"?T.red:T.orange;

  return <div style={{...c.card({padding:14}),borderLeft:"4px solid "+blockedColour,marginBottom:14,opacity:resolved?0.55:1}}>
    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:8}}>
      <SeverityBadge severity={match.severity}/>
      <span style={{fontSize:11,color:T.muted}}>matched via {match.matchedVia}</span>
      <span style={{fontSize:11,color:T.muted}}>• name distance {match.nameDistance}</span>
      {resolved&&<span style={{...c.badge(T.green),fontSize:10}}>✓ Overridden</span>}
    </div>
    <div style={{fontSize:14,fontWeight:"bold",color:T.white,marginBottom:6}}>{sS(r.name)}</div>
    <div style={{fontSize:11,color:T.muted,marginBottom:8}}>Reference {sS(r.reference)} ({sS(r.type)})</div>

    {aliases.length>0&&<div style={{fontSize:11,color:T.muted,marginBottom:8,lineHeight:1.6}}>
      <strong style={{color:T.text}}>Matched aliases / scripts:</strong>{" "}
      {aliases.map(a=>sS(a.name)).join(" · ")}
    </div>}

    {/* Compact metadata grid — one row per non-empty field. Skips
        rows where the entry has nothing to say. */}
    <div style={{fontSize:12,lineHeight:1.7,color:T.text}}>
      {r.dob_raw&&<div><strong style={{color:T.muted,fontSize:11,letterSpacing:"0.05em",textTransform:"uppercase"}}>DOB:</strong>{" "}{sS(r.dob_raw)}{dobLong?<span style={{color:T.muted}}> — {dobLong}</span>:null}</div>}
      {r.place_of_birth&&<div><strong style={{color:T.muted,fontSize:11,letterSpacing:"0.05em",textTransform:"uppercase"}}>Place of birth:</strong>{" "}{sS(r.place_of_birth)}</div>}
      {r.citizenship&&<div><strong style={{color:T.muted,fontSize:11,letterSpacing:"0.05em",textTransform:"uppercase"}}>Citizenship:</strong>{" "}{sS(r.citizenship)}</div>}
      {r.address&&<div><strong style={{color:T.muted,fontSize:11,letterSpacing:"0.05em",textTransform:"uppercase"}}>Address:</strong>{" "}{sS(r.address)}</div>}
      {r.imo_number&&<div><strong style={{color:T.muted,fontSize:11,letterSpacing:"0.05em",textTransform:"uppercase"}}>IMO:</strong>{" "}{sS(r.imo_number)}</div>}
      {r.committees&&<div><strong style={{color:T.muted,fontSize:11,letterSpacing:"0.05em",textTransform:"uppercase"}}>Committees:</strong>{" "}{sS(r.committees)}</div>}
      {r.instrument&&<div><strong style={{color:T.muted,fontSize:11,letterSpacing:"0.05em",textTransform:"uppercase"}}>Instrument:</strong>{" "}{sS(r.instrument)}</div>}
    </div>

    <FlagChips record={r}/>

    {r.additional_info&&<div style={{...c.card({padding:10,background:T.surface}),marginTop:8,fontSize:11,color:T.text,lineHeight:1.55}}>
      <div style={{fontSize:10,color:T.muted,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:4}}>Additional information (often the disambiguator)</div>
      {sS(r.additional_info)}
    </div>}
    {r.listing_info&&<div style={{...c.card({padding:10,background:T.surface}),marginTop:6,fontSize:11,color:T.muted,lineHeight:1.55}}>
      <div style={{fontSize:10,color:T.muted,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:4}}>Listing information</div>
      {sS(r.listing_info)}
    </div>}

    {/* Decision buttons — hidden when this card is already
        resolved via override. */}
    {!resolved&&<>
      {!overrideOpen&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:14}}>
        <button style={c.btn(T.red,T.bg)} onClick={()=>onBlockRequested(r)}>✓ Citizenship matches — block transaction</button>
        <button style={c.bsm(T.orangeBg||T.surface,T.orange)} onClick={()=>setOverrideOpen(true)}>✗ Different person — override with PIN</button>
        <button style={c.bsm()} onClick={onCloseModal}>⏸ Need to ask customer for citizenship</button>
      </div>}
      {overrideOpen&&<div style={{...c.card({padding:12,background:T.surface}),marginTop:14,borderLeft:"3px solid "+T.orange}}>
        <div style={{fontSize:12,fontWeight:"bold",color:T.orange,marginBottom:10}}>OVERRIDE — admin PIN required</div>
        <div style={{fontSize:11,color:T.muted,marginBottom:10,lineHeight:1.5}}>
          You're declaring that this customer is NOT the same person as <strong style={{color:T.text}}>{sS(r.name)}</strong>. Both the PIN and a written justification (≥ 20 characters) are required and retained for 7 years.
        </div>
        <F label="Admin PIN" type="password" value={pin} onChange={setPin}/>
        <F label="Reason (e.g. customer's DOB / passport differs from sanctions entry; provided documentary evidence; etc.)" as="textarea" value={reason} onChange={setReason}/>
        {err&&<div style={{...c.bnr("warn"),marginTop:6,fontSize:11}}>{err}</div>}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
          <button style={c.btn(T.green,T.bg)} disabled={busy} onClick={submitOverride}>{busy?"Recording…":"Confirm override"}</button>
          <button style={c.bsm()} disabled={busy} onClick={()=>{setOverrideOpen(false);setPin("");setReason("");setErr("");}}>Cancel</button>
        </div>
      </div>}
    </>}
  </div>;
}

// Refuse-politely overlay shown after the staff confirms a block.
// The wording is deliberate per the AML/CTF Act s.123 tipping-off
// rule — the customer must not be told why.
function RefusePolitelyOverlay({onAcknowledge}){
  return <div style={{position:"fixed",inset:0,background:"#000000ec",zIndex:1900,display:"flex",alignItems:"center",justifyContent:"center",padding:16,fontFamily:T.ff}}>
    <div style={{background:T.bg,color:T.text,border:"2px solid "+T.red,borderRadius:8,padding:24,maxWidth:560,width:"100%",boxShadow:"0 12px 36px #000c"}}>
      <div style={{fontSize:18,fontWeight:"bold",color:T.red,marginBottom:14,letterSpacing:"0.05em"}}>TRANSACTION REFUSED</div>
      <div style={{fontSize:13,color:T.text,marginBottom:14,lineHeight:1.55}}>
        <strong style={{color:T.gold}}>Tell the customer:</strong>
        <div style={{...c.card({padding:12,background:T.surface}),marginTop:6,fontStyle:"italic"}}>
          "I'm sorry, I cannot process this transaction. Please contact us at a later time if you have questions."
        </div>
      </div>
      <div style={{...c.bnr("block"),fontSize:12,lineHeight:1.55,marginBottom:18}}>
        <strong>IMPORTANT:</strong> Do <strong>NOT</strong> mention sanctions, the consolidated list, AUSTRAC, or any specific reason. Telling them the reason is a <strong>"tipping off" offence</strong> under section 123 of the AML/CTF Act and is itself criminal.
      </div>
      <button style={c.btn(T.red,T.bg)} onClick={onAcknowledge}>Acknowledge — close transaction</button>
    </div>
  </div>;
}

export default function TfsMatchModal({matches,settings,onBlockConfirmed,onOverrideSubmitted,onClose,onAllResolved}){
  // Track which matches have been resolved via override. Block
  // path doesn't add to this set — block exits the entire flow.
  const[resolvedRefs,setResolvedRefs]=useState(()=>new Set());
  // Pending block decision — set when the staff clicks the block
  // button on a card; the refuse-politely overlay shows in
  // response. On Acknowledge we call onBlockConfirmed and exit.
  const[pendingBlockRef,setPendingBlockRef]=useState(null);

  const overrideOnCard=async(matchRef,reason)=>{
    await onOverrideSubmitted(matchRef,reason);
    setResolvedRefs(prev=>{
      const next=new Set(prev);
      next.add(matchRef);
      return next;
    });
  };

  // Auto-close when every match has been resolved via override.
  // Block path closes via its own handler.
  const allResolved=useMemo(()=>{
    if(!Array.isArray(matches)||!matches.length)return false;
    return matches.every(m=>resolvedRefs.has((m.primaryRecord&&(m.primaryRecord.primary_reference||m.primaryRecord.reference))));
  },[matches,resolvedRefs]);

  // Effect-free auto-close: render returns null and signals via
  // onAllResolved which the parent uses to setReviewed(true).
  if(allResolved){
    if(typeof onAllResolved==="function"){
      // Defer to avoid setState-during-render in the parent.
      setTimeout(onAllResolved,0);
    }
    return null;
  }

  if(pendingBlockRef){
    return <RefusePolitelyOverlay onAcknowledge={()=>{
      const ref=pendingBlockRef;
      setPendingBlockRef(null);
      onBlockConfirmed(ref);
    }}/>;
  }

  const total=matches.length;
  return <Modal title={"⚠️ TFS sanctions match — review required ("+total+")"} onClose={onClose} wide>
    <div style={{...c.bnr("block"),marginBottom:14,lineHeight:1.55}}>
      <strong>Review every match below before continuing.</strong> Each candidate represents a possible hit against the DFAT Consolidated List of Targeted Financial Sanctions. A confirmed match means refusing the transaction and filing an SMR with AUSTRAC; an override means you've determined this is a different person and accept responsibility (PIN + written reason required, retained 7 years).
    </div>
    {matches.map((m,i)=>{
      const r=m.primaryRecord||{};
      const ref=r.primary_reference||r.reference||("match-"+i);
      return <MatchCard
        key={ref}
        match={m}
        resolved={resolvedRefs.has(ref)}
        settings={settings}
        onBlockRequested={(rec)=>setPendingBlockRef(rec.primary_reference||rec.reference)}
        onOverrideSubmit={overrideOnCard}
        onCloseModal={onClose}
      />;
    })}
    <div style={{display:"flex",gap:10,flexWrap:"wrap",position:"sticky",bottom:0,padding:"12px 0",background:T.bg,borderTop:"1px solid "+T.border}}>
      <button style={c.bsm()} onClick={onClose}>Close — return to transaction (banner stays visible)</button>
    </div>
  </Modal>;
}
