// LootLedger — ClientDetail modal.
// Phase 2.7.7. Full record view + edit + photo upload/download/erase.
//
// Structure:
//   - Header: name, badges (BLACKLISTED, TEST DATA), txCount,
//     last-visit (30-day rule via formatLastVisit()).
//   - Photo block: preview, Replace / Download / Erase actions.
//     Photo actions DON'T flow through the edit form — they save
//     directly via clients.update({idPhoto: …}). Available in both
//     read-only and edit modes.
//   - Identity card: fullName, dob, phone, email, address,
//     idType, idNumber. The five mandatory keys for the warning
//     gate live here (everything except phone/email).
//   - Compliance card: pepCheck, tfsCheck, riskRating,
//     sourceOfFunds, sourceOfWealth, blacklisted, internalNotes.
//   - Action row: Edit / Close in read-only; Save / Cancel in edit.
//
// Mandatory-field warning gate (Phase 2.7 spec):
//   On Save (NOT during transactions, NOT on photo actions), if
//   any of MANDATORY_CLIENT_FIELDS are blank, render a warn-banner
//   modal:
//     "Some information is missing. It is your duty to collect
//      the mandatory information. Proceed anyway?"
//     [Proceed] [Cancel]
//   Cancel keeps edit state. Proceed saves the partial.

import React,{useState,useMemo,useEffect} from "react";
import {T,c} from "../theme.js";
import {Modal,F,SF} from "../components/ui";
import {ID_OPTIONS} from "../lib/constants.js";
import {sN,sS,fmtAUD,fmtDate,nowISO} from "../lib/utils.js";
import {checkPhotoSize} from "../lib/storage.js";
import {clients,getMissingMandatoryFields,formatLastVisit} from "../lib/clients.js";

function ReadField({label,value}){
  return <div style={{marginBottom:6,display:"flex",gap:8,flexWrap:"wrap",alignItems:"baseline"}}>
    <span style={{fontSize:10,color:T.muted,letterSpacing:"0.1em",textTransform:"uppercase",minWidth:140}}>{label}</span>
    <span style={{fontSize:12,color:T.text}}>{sS(value)||"—"}</span>
  </div>;
}

// Compact item-list summary for a transaction row. "Ring (+2 more)"
// when multi-item; just the label when single. Falls back to "(no
// items)" so empty-basket records still render.
function itemSummary(tx){
  const items=Array.isArray(tx&&tx.items)?tx.items:[];
  if(!items.length)return "(no items)";
  const head=sS(items[0]&&items[0].product&&items[0].product.label)||"(unlabelled)";
  return items.length===1?head:head+" (+"+(items.length-1)+" more)";
}

// Returns the modes present on the items array — used to render
// the BUY / SELL badges. A mixed transaction shows both badges.
function modesOf(tx){
  const items=Array.isArray(tx&&tx.items)?tx.items:[];
  const has={buy:false,sell:false};
  items.forEach(i=>{if(i&&i.mode==="buy")has.buy=true;if(i&&i.mode==="sell")has.sell=true;});
  return has;
}

export default function ClientDetail({client,txList,onSave,onClose,pop,withAdminGate,setSelTx,activeStaff}){
  const[editing,setEditing]=useState(false);
  const[form,setForm]=useState({});
  const[showGate,setShowGate]=useState(false);
  const[busy,setBusy]=useState(false);
  // Phase 2.7 follow-up (2026-04-30) — Blacklist toggle UI. Reason
  // text auto-saves on blur (no Admin gate to update once flagged);
  // the toggle itself is gated. The draft is hydrated from
  // client.blacklistReason on every render so it stays in sync if
  // another path updates the record.
  const[reasonDraft,setReasonDraft]=useState(sS((client&&client.blacklistReason)||""));
  useEffect(()=>{setReasonDraft(sS((client&&client.blacklistReason)||""));},[client&&client.id,client&&client.blacklistReason]);

  if(!client)return null;

  // Phase 2.7 follow-up batch 2 — Admin-PIN wrapper. Falls through
  // when withAdminGate isn't wired (defensive — existing callers).
  const adminGate=(reason,fn)=>typeof withAdminGate==="function"?withAdminGate(reason,fn):fn();
  const startEdit=()=>{
    adminGate("Edit client record: "+sS(client.fullName||"(no name)"),()=>{
      setForm({...client});
      setEditing(true);
    });
  };
  const cancelEdit=()=>{setEditing(false);setShowGate(false);};

  // 2026-05-07 — Delete / Archive / Restore.
  // Tx count is computed from linkedTxs.length further down (the
  // useMemo lives below this hook block); we recompute the same
  // filter here on demand inside the action handlers so we don't
  // re-order hooks. txCount > 0 → archive only (record must
  // survive 7-year retention). txCount === 0 → hard delete is
  // safe. Archive sets archived=true + archivedAt; Restore clears
  // both. All three are Admin-PIN gated through withAdminGate
  // (same posture as Edit / blacklist toggle / photo erase).
  const[confirmAction,setConfirmAction]=useState(null);  // null | "delete" | "archive" | "restore"
  const isArchived=!!(client&&client.archived);
  const linkedTxCount=Array.isArray(txList)?txList.filter(t=>t&&t.clientId===(client&&client.id)).length:0;
  const askDestructiveAction=()=>{
    if(isArchived){
      adminGate("Restore client from archive: "+sS(client.fullName||"(no name)"),()=>setConfirmAction("restore"));
      return;
    }
    if(linkedTxCount===0){
      adminGate("Permanently delete client (no transaction history): "+sS(client.fullName||"(no name)"),()=>setConfirmAction("delete"));
      return;
    }
    adminGate("Archive client: "+sS(client.fullName||"(no name)"),()=>setConfirmAction("archive"));
  };
  const closeConfirm=()=>setConfirmAction(null);
  const doArchive=async()=>{
    setBusy(true);
    try{
      const updated=await clients.update(client.id,{
        archived:true,
        archivedAt:nowISO(),
        archivedBy:sS(activeStaff||"")||null,
      });
      if(updated){
        onSave&&onSave(updated);
        pop&&pop("Client archived.","ok");
        closeConfirm();
        onClose&&onClose();
      }else{
        pop&&pop("Archive failed — please retry.","err");
      }
    }finally{setBusy(false);}
  };
  const doRestore=async()=>{
    setBusy(true);
    try{
      const updated=await clients.update(client.id,{archived:false,archivedAt:null});
      if(updated){
        onSave&&onSave(updated);
        pop&&pop("Client restored.","ok");
        closeConfirm();
        onClose&&onClose();
      }else{
        pop&&pop("Restore failed — please retry.","err");
      }
    }finally{setBusy(false);}
  };
  const doDelete=async()=>{
    setBusy(true);
    try{
      const ok=await clients.remove(client.id);
      if(ok){
        pop&&pop("Client deleted.","ok");
        closeConfirm();
        onClose&&onClose();
      }else{
        pop&&pop("Delete failed — please retry.","err");
      }
    }finally{setBusy(false);}
  };

  const trySave=()=>{
    adminGate("Save client record: "+sS(form.fullName||client.fullName||"(no name)"),()=>{
      if(getMissingMandatoryFields(form).length===0)doSave();
      else setShowGate(true);
    });
  };

  const doSave=async()=>{
    setBusy(true);
    setShowGate(false);
    try{
      const updated=await clients.update(client.id,form);
      if(updated){
        onSave&&onSave(updated);
        setEditing(false);
        pop&&pop("Client saved.","ok");
      }else{
        pop&&pop("Save failed.","err");
      }
    }finally{setBusy(false);}
  };

  const onUploadFile=e=>{
    const f=e.target.files&&e.target.files[0];
    if(!f)return;
    const r=new FileReader();
    r.onload=ev=>checkPhotoSize(ev.target.result,async d=>{
      setBusy(true);
      try{
        const updated=await clients.update(client.id,{idPhoto:d});
        if(updated){onSave&&onSave(updated);pop&&pop("Photo uploaded.","ok");}
        else pop&&pop("Photo upload failed.","err");
      }finally{setBusy(false);}
    });
    r.readAsDataURL(f);
    e.target.value="";
  };

  const downloadPhoto=()=>{
    if(!client.idPhoto)return;
    const lastName=(sS(client.fullName).trim().split(/\s+/).pop()||"client").replace(/[^a-zA-Z0-9]/g,"_");
    const a=document.createElement("a");
    a.href=client.idPhoto;
    a.download="client_"+client.id+"_"+lastName+".jpg";
    a.click();
  };

  // Asymmetric gate (2026-04-30 policy update): flagging is open
  // to any staff — when a problem customer is in front of you,
  // there is no time to chase a manager for a PIN to write down a
  // safety note. Clearing the flag is manager-only; absolution
  // shouldn't be a junior-staff decision. The override gate at the
  // NewTx Client step is unchanged and continues to fire on every
  // selection of a blacklisted client.
  //
  // Both sides preserve the prior trail — clearing the flag does
  // NOT delete blacklistedAt / blacklistedBy / blacklistReason; it
  // adds blacklistClearedAt / blacklistClearedBy alongside.
  const applyBlacklistChange=async next=>{
    const now=nowISO();
    const staff=sS(activeStaff||"Unknown");
    const patch=next
      ?{blacklisted:true,blacklistedAt:now,blacklistedBy:staff,blacklistReason:client.blacklistReason||""}
      :{blacklisted:false,blacklistClearedAt:now,blacklistClearedBy:staff};
    setBusy(true);
    try{
      const updated=await clients.update(client.id,patch);
      if(updated){
        onSave&&onSave(updated);
        pop&&pop(next?"Client flagged — soft-block enabled.":"Blacklist cleared.","ok");
      }else{
        pop&&pop("Update failed.","err");
      }
    }finally{setBusy(false);}
  };
  const toggleBlacklist=()=>{
    const next=!client.blacklisted;
    if(next){
      // Flag — open to any staff. No gate.
      applyBlacklistChange(true);
    }else{
      // Clear — manager-only. Admin PIN gate.
      adminGate("Clear blacklist on client",()=>applyBlacklistChange(false));
    }
  };

  // Inline reason save on blur. No gate — the spec is "no admin
  // gate to update text once flagged"; the gate sits on the toggle
  // that decides whether the field appears at all. Skips the write
  // when the draft hasn't actually changed (every focus → blur
  // would otherwise round-trip an identical update).
  const saveReason=async()=>{
    if(!client.blacklisted)return;
    const next=sS(reasonDraft);
    if(next===sS(client.blacklistReason||""))return;
    setBusy(true);
    try{
      const updated=await clients.update(client.id,{blacklistReason:next});
      if(updated){onSave&&onSave(updated);pop&&pop("Reason saved.","ok");}
      else pop&&pop("Save failed.","err");
    }finally{setBusy(false);}
  };

  const erasePhotoImpl=async()=>{
    if(typeof window!=="undefined"&&window.confirm&&!window.confirm("Erase the ID photo on file? This cannot be undone."))return;
    setBusy(true);
    try{
      const updated=await clients.update(client.id,{idPhoto:null});
      if(updated){onSave&&onSave(updated);pop&&pop("Photo erased.","ok");}
    }finally{setBusy(false);}
  };
  const erasePhoto=()=>adminGate("Erase ID photo for: "+sS(client.fullName||"(no name)"),erasePhotoImpl);

  const lastVisit=formatLastVisit(client);
  const missing=editing?getMissingMandatoryFields(form):[];

  // Phase 2.7 follow-up — linked transactions. Filtered by clientId
  // only (the orphan-clientId rule means tx.client snapshots without
  // a clientId reference are not aggregated against this record;
  // they show up in the History screen instead). Sorted descending
  // by date so the most recent is first.
  const linkedTxs=useMemo(()=>{
    if(!client||!Array.isArray(txList))return [];
    const list=txList.filter(t=>t&&t.clientId===client.id);
    list.sort((a,b)=>{
      const ad=a.date?new Date(a.date).getTime():0;
      const bd=b.date?new Date(b.date).getTime():0;
      return bd-ad;
    });
    return list;
  },[txList,client&&client.id]);

  // Lifetime totals — kept as two separate figures so neither
  // direction is hidden inside a net. "Bought from this client" =
  // sum of buyTotal across all their transactions (cash out from
  // the shop). "Sold to this client" = sum of sellTotal (cash in).
  const totals=useMemo(()=>{
    let bought=0,sold=0;
    linkedTxs.forEach(t=>{bought+=sN(t.buyTotal);sold+=sN(t.sellTotal);});
    return{bought,sold};
  },[linkedTxs]);
  const firstTx=linkedTxs.length?linkedTxs[linkedTxs.length-1]:null;
  const lastTx=linkedTxs.length?linkedTxs[0]:null;

  const openTx=tx=>{if(typeof setSelTx==="function")setSelTx(tx);};

  return <>
    <Modal title="Client Record" onClose={onClose} wide>
      {/* Header */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:16,fontWeight:"bold",color:T.gold,marginBottom:4}}>{sS(client.fullName)||"(no name)"}</div>
        <div style={{fontSize:11,color:T.muted,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          {client.blacklisted&&<span style={c.badge(T.red)}>⛔ BLACKLISTED</span>}
          {client.archived&&<span style={c.badge(T.muted)}>📦 ARCHIVED</span>}
          {client.isTest&&<span style={c.badge(T.muted)}>TEST DATA</span>}
          <span>Transactions: {client.txCount||0}</span>
          {lastVisit&&<span>Last visit: {lastVisit}</span>}
        </div>
      </div>
      {client.blacklisted&&<div style={{...c.bnr("warn"),marginBottom:14,borderLeft:"4px solid "+T.red,background:T.redBg||"#2a0a0a",color:T.red}}>
        ⚠ <strong>BLACKLISTED</strong> — flagged {client.blacklistedAt?fmtDate(client.blacklistedAt):"(no date)"}{client.blacklistedBy?" by "+sS(client.blacklistedBy):""}.
        {client.blacklistReason&&<div style={{fontSize:11,marginTop:4,color:T.text}}>Reason: {sS(client.blacklistReason)}</div>}
      </div>}

      {/* Photo block */}
      <div style={{...c.card({padding:14}),marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10}}>📷 ID PHOTO</div>
        {client.idPhoto?<div>
          <img src={client.idPhoto} alt="ID" style={{maxWidth:"100%",maxHeight:240,borderRadius:6,border:"1px solid "+T.border,display:"block",marginBottom:10}}/>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <label style={{...c.bsm(T.border,T.muted),cursor:busy?"default":"pointer",opacity:busy?0.5:1}}>📂 Replace<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{display:"none"}} onChange={onUploadFile} disabled={busy}/></label>
            <button style={c.bsm(T.goldBg,T.gold)} onClick={downloadPhoto} disabled={busy}>⬇ Download</button>
            <button style={c.bsm(T.redBg,T.red)} onClick={erasePhoto} disabled={busy}>🗑 Erase</button>
          </div>
        </div>:<div>
          <div style={{fontSize:11,color:T.muted,marginBottom:8}}>No ID photo on file.</div>
          <label style={{...c.btn(T.gold,T.bg),display:"inline-block",cursor:busy?"default":"pointer",opacity:busy?0.5:1}}>📂 Upload<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{display:"none"}} onChange={onUploadFile} disabled={busy}/></label>
        </div>}
      </div>

      {/* Identity */}
      <div style={{...c.card({padding:14}),marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10}}>IDENTITY</div>
        {editing?<div style={c.g2(10)}>
          <F label="Full Legal Name" required value={form.fullName||""} onChange={v=>setForm(p=>({...p,fullName:v}))}/>
          <F label="Middle Name" value={form.middleName||""} onChange={v=>setForm(p=>({...p,middleName:v}))} note="Optional. Helps distinguish customers with the same first + last name."/>
          <F label="Date of Birth" required type="date" value={form.dob||""} onChange={v=>setForm(p=>({...p,dob:v}))}/>
          <F label="Phone" value={form.phone||""} onChange={v=>setForm(p=>({...p,phone:v}))}/>
          <F label="Email" value={form.email||""} onChange={v=>setForm(p=>({...p,email:v}))}/>
          <F label="Residential Address" required value={form.address||""} onChange={v=>setForm(p=>({...p,address:v}))}/>
          <SF label="ID Type" required value={form.idType||""} onChange={v=>setForm(p=>({...p,idType:v}))} options={ID_OPTIONS}/>
          <F label="ID Number" required value={form.idNumber||""} onChange={v=>setForm(p=>({...p,idNumber:v}))}/>
        </div>:<div>
          <ReadField label="Full Name" value={client.fullName}/>
          {client.middleName&&<ReadField label="Middle Name" value={client.middleName}/>}
          <ReadField label="Date of Birth" value={client.dob}/>
          <ReadField label="Phone" value={client.phone}/>
          <ReadField label="Email" value={client.email}/>
          <ReadField label="Address" value={client.address}/>
          <ReadField label="ID Type" value={client.idType}/>
          <ReadField label="ID Number" value={client.idNumber}/>
        </div>}
      </div>

      {/* Compliance */}
      <div style={{...c.card({padding:14}),marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10}}>COMPLIANCE</div>
        {editing?<div>
          <SF label="PEP Check" value={form.pepCheck||""} onChange={v=>setForm(p=>({...p,pepCheck:v}))} options={[{value:"",label:"— Not recorded —"},{value:"no",label:"No — Not a PEP"},{value:"yes",label:"PEP — refer to compliance officer"}]}/>
          <SF label="TFS Check (dfat.gov.au sanctions)" value={form.tfsCheck||""} onChange={v=>setForm(p=>({...p,tfsCheck:v}))} options={[{value:"",label:"— Not recorded —"},{value:"clear",label:"Clear — not on list"},{value:"match",label:"MATCH — escalate"}]}/>
          <SF label="Risk Rating" value={form.riskRating||""} onChange={v=>setForm(p=>({...p,riskRating:v}))} options={[{value:"",label:"— Not recorded —"},{value:"low",label:"Low"},{value:"medium",label:"Medium"},{value:"high",label:"High"}]}/>
          <F label="Source of Funds" value={form.sourceOfFunds||""} onChange={v=>setForm(p=>({...p,sourceOfFunds:v}))} placeholder="e.g. wages, sale of asset, inheritance"/>
          <F label="Source of Wealth" value={form.sourceOfWealth||""} onChange={v=>setForm(p=>({...p,sourceOfWealth:v}))} placeholder="e.g. business income, savings, inheritance"/>
          {/* Blacklist moved to the dedicated RISK / STATUS section
              below — it has its own Admin-PIN gate per direction
              and a reason / history sub-panel. The edit form no
              longer routes through `form.blacklisted`. */}
          <F label="Internal Notes (staff-only)" as="textarea" value={form.internalNotes||""} onChange={v=>setForm(p=>({...p,internalNotes:v}))}/>
        </div>:<div>
          <ReadField label="PEP" value={client.pepCheck}/>
          <ReadField label="TFS" value={client.tfsCheck}/>
          <ReadField label="Risk Rating" value={client.riskRating}/>
          <ReadField label="Source of Funds" value={client.sourceOfFunds}/>
          <ReadField label="Source of Wealth" value={client.sourceOfWealth}/>
          {client.internalNotes&&<ReadField label="Internal Notes" value={client.internalNotes}/>}
        </div>}
      </div>

      {/* Phase 2.7 follow-up — linked transactions. Filtered by
          tx.clientId === client.id (orphan tx.client snapshots
          stay in the History screen). Click a row to open the
          App-level tx-detail modal; that modal renders later in
          App.tsx than ClientDetail so it stacks on top correctly. */}
      <div style={{...c.card({padding:14}),marginBottom:14}}>
        <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
          <span>📜 TRANSACTION HISTORY{linkedTxs.length>0?" ("+linkedTxs.length+")":""}</span>
        </div>
        {linkedTxs.length===0?<div style={{fontSize:11,color:T.muted}}>No linked transactions yet.</div>:<>
          {linkedTxs.map(tx=>{
            const m=modesOf(tx);
            const net=sN(tx.net);
            const netColor=net>=0?T.gold:T.green;
            const netLabel=net>=0?fmtAUD(net):"-"+fmtAUD(-net);
            return <div key={tx.id} style={{...c.card({padding:10}),marginBottom:6,background:T.surface,cursor:typeof setSelTx==="function"?"pointer":"default",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}} onClick={()=>openTx(tx)}>
              <div style={{flex:1,minWidth:200}}>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:3}}>
                  <span style={{fontWeight:"bold",color:T.gold,fontSize:12}}>{sS(tx.id)}</span>
                  <span style={{fontSize:10,color:T.muted}}>{fmtDate(tx.date)}</span>
                  {m.buy&&<span style={c.badge(T.gold)}>BUY</span>}
                  {m.sell&&<span style={c.badge(T.silver||T.muted)}>SELL</span>}
                  {tx.voided&&<span style={c.badge(T.muted)}>VOIDED</span>}
                  {tx.ttrRequired&&<span style={c.badge(T.red)}>TTR{tx.ttrStatus==="FILED"?" FILED":" PENDING"}</span>}
                  {tx.smrFlagged&&<span style={c.badge(T.orange)}>SMR</span>}
                  {tx.tfsOverrideApplied&&<span style={c.badge(T.orange)}>TFS-OVERRIDE</span>}
                  {tx.isHobbyProspector&&<span style={c.badge(T.muted)}>HOBBY</span>}
                  {tx.legacyNoId&&<span style={c.badge(T.muted)}>⚠ LEGACY UN-IDED</span>}
                </div>
                <div style={{fontSize:11,color:T.text,marginBottom:2}}>{itemSummary(tx)}</div>
                <div style={{fontSize:10,color:T.muted}}>{sS(tx.payment).toUpperCase()||"—"}</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:10,color:T.muted}}>Net</div>
                <div style={{fontSize:13,fontWeight:"bold",color:netColor}}>{netLabel}</div>
              </div>
            </div>;
          })}
          <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid "+T.border,fontSize:11,color:T.muted,display:"flex",flexWrap:"wrap",gap:12}}>
            <span><strong style={{color:T.green}}>Bought from this client:</strong> {fmtAUD(totals.bought)}</span>
            <span><strong style={{color:T.gold}}>Sold to this client:</strong> {fmtAUD(totals.sold)}</span>
            {firstTx&&<span>First: {fmtDate(firstTx.date)}</span>}
            {lastTx&&firstTx!==lastTx&&<span>Last: {fmtDate(lastTx.date)}</span>}
          </div>
        </>}
      </div>

      {/* Phase 2.7 follow-up (2026-04-30) — RISK / STATUS section.
          The toggle is the only place in the UI that flips
          client.blacklisted (the inline checkbox in the Compliance
          edit form was removed). Each direction is Admin-PIN gated
          via toggleBlacklist; the reason field auto-saves on blur
          when set. The override history (Phase 2.7.11) is folded
          into this panel so the trail lives next to the toggle. */}
      <div style={{...c.card({padding:14}),marginBottom:14,borderLeft:"3px solid "+(client.blacklisted?T.red:T.border)}}>
        <div style={{fontSize:11,fontWeight:"bold",color:client.blacklisted?T.red:T.gold,marginBottom:10}}>RISK / STATUS</div>
        <label style={{display:"flex",alignItems:"flex-start",gap:8,cursor:busy?"default":"pointer",fontSize:12,marginBottom:8,opacity:busy?0.6:1}}>
          <input type="checkbox" checked={!!client.blacklisted} onChange={toggleBlacklist} disabled={busy} style={{marginTop:3}}/>
          <span><strong>Blacklisted</strong> — block this client with manager override</span>
        </label>
        <div style={{fontSize:10,color:T.muted,marginBottom:10,lineHeight:1.5}}>When on, staff selecting this client at New Transaction Client step sees an Admin-PIN prompt: "BLACKLISTED CLIENT — Admin PIN required to proceed". Override events log to the audit trail below. Flagging is open to any staff member; clearing requires Admin PIN.</div>
        {client.blacklisted&&<div style={{...c.card({padding:10,background:T.surface}),marginBottom:10,borderLeft:"3px solid "+T.red}}>
          <div style={{fontSize:11,color:T.red,fontWeight:"bold",marginBottom:6}}>⚠ FLAGGED on {client.blacklistedAt?fmtDate(client.blacklistedAt):"—"}{client.blacklistedBy?" by "+sS(client.blacklistedBy):""}</div>
          <F label="Reason (optional)" as="textarea" value={reasonDraft} onChange={setReasonDraft} placeholder="Optional — why is this client flagged?"/>
          <button style={c.bsm()} onClick={saveReason} disabled={busy||sS(reasonDraft)===sS(client.blacklistReason||"")}>{busy?"Saving…":"Save reason"}</button>
        </div>}
        {!client.blacklisted&&client.blacklistClearedAt&&<div style={{fontSize:10,color:T.muted,marginBottom:10}}>Cleared on {fmtDate(client.blacklistClearedAt)}{client.blacklistClearedBy?" by "+sS(client.blacklistClearedBy):""}.{client.blacklistedAt?" Previously flagged on "+fmtDate(client.blacklistedAt)+(client.blacklistedBy?" by "+sS(client.blacklistedBy):"")+".":""}</div>}
        {Array.isArray(client.blacklistOverrides)&&client.blacklistOverrides.length>0&&<details>
          <summary style={{cursor:"pointer",fontSize:11,color:T.muted,padding:"6px 0",letterSpacing:"0.05em"}}>⛔ BLACKLIST OVERRIDE HISTORY ({client.blacklistOverrides.length})</summary>
          <div style={{...c.card({padding:10}),marginTop:8}}>
            {client.blacklistOverrides.map((o,i)=>(
              <div key={i} style={{padding:"6px 0",borderBottom:i<client.blacklistOverrides.length-1?"1px solid "+T.border+"44":"none",fontSize:11,color:T.muted}}>
                <div style={{color:T.text}}>{o.timestamp?new Date(o.timestamp).toLocaleString("en-AU"):"—"}</div>
                {o.staffId&&<div>Staff: {sS(o.staffId)}</div>}
                {o.reason&&<div>Reason: {sS(o.reason)}</div>}
              </div>
            ))}
          </div>
        </details>}
      </div>

      {/* Actions */}
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        {editing?<>
          <button style={c.btn(T.green,T.bg)} onClick={trySave} disabled={busy}>💾 Save</button>
          <button style={c.bsm()} onClick={cancelEdit} disabled={busy}>Cancel</button>
          {missing.length>0&&<span style={{fontSize:10,color:T.orange,fontWeight:700,padding:"5px 0"}}>Missing: {missing.join(", ")}</span>}
        </>:<>
          <button style={c.btn(T.gold,T.bg)} onClick={startEdit}>✎ Edit</button>
          <button style={c.bsm()} onClick={onClose}>Close</button>
          {/* 2026-05-07 — single button whose label adapts to the
              client's current state. Archived → Restore (green).
              No tx history → Delete (red). Otherwise → Archive
              (orange). The 7-year retention rule under AML/CTF
              Act + Privacy Act forbids hard-deleting a client
              with any tx on file; the Archive path keeps the
              record intact while hiding it from active surfaces. */}
          {isArchived?
            <button style={c.bsm(T.greenBg||T.surface,T.green)} onClick={askDestructiveAction} disabled={busy}>♻ Restore Client</button>
          :linkedTxCount===0?
            <button style={c.bsm(T.redBg,T.red)} onClick={askDestructiveAction} disabled={busy}>🗑 Delete Client</button>
          :
            <button style={c.bsm(T.orangeBg,T.orange)} onClick={askDestructiveAction} disabled={busy}>📦 Archive Client</button>
          }
        </>}
      </div>
    </Modal>

    {/* 2026-05-07 — Delete / Archive / Restore confirmation modal.
        Single component, copy varies by action so staff sees the
        retention rationale before they confirm. busy disables
        Confirm to prevent double-fire. Cancel just closes. */}
    {confirmAction&&<Modal title={
      confirmAction==="delete"?"Delete client — permanent":
      confirmAction==="archive"?"Archive client":
      "Restore client"
    } onClose={closeConfirm}>
      {confirmAction==="delete"&&<>
        <div style={{...c.bnr("block"),marginBottom:14}}>This client has no transaction history and will be permanently deleted. <strong>This cannot be undone.</strong></div>
        <div style={{fontSize:12,color:T.muted,marginBottom:14}}>Client: <strong style={{color:T.text}}>{sS(client.fullName)||"(no name)"}</strong>{client.idNumber?" · "+sS(client.idType).toUpperCase()+" "+sS(client.idNumber):""}</div>
        <div style={{display:"flex",gap:10}}>
          <button style={c.btn(T.red,T.white)} onClick={doDelete} disabled={busy}>{busy?"Deleting…":"Yes, delete permanently"}</button>
          <button style={c.bsm()} onClick={closeConfirm} disabled={busy}>Cancel</button>
        </div>
      </>}
      {confirmAction==="archive"&&<>
        <div style={{...c.bnr("warn"),marginBottom:14}}>This client has <strong>{linkedTxCount}</strong> transaction{linkedTxCount===1?"":"s"} on file. Archived clients are hidden from active search but kept in the system per AML/CTF 7-year retention requirements. Continue?</div>
        <div style={{fontSize:12,color:T.muted,marginBottom:14}}>Client: <strong style={{color:T.text}}>{sS(client.fullName)||"(no name)"}</strong>{client.idNumber?" · "+sS(client.idType).toUpperCase()+" "+sS(client.idNumber):""}</div>
        <div style={{display:"flex",gap:10}}>
          <button style={c.btn(T.orange,T.bg)} onClick={doArchive} disabled={busy}>{busy?"Archiving…":"Yes, archive"}</button>
          <button style={c.bsm()} onClick={closeConfirm} disabled={busy}>Cancel</button>
        </div>
      </>}
      {confirmAction==="restore"&&<>
        <div style={{...c.bnr("info"),marginBottom:14}}>Restoring this client will return them to the active Clients list and re-enable them as a search target during new transactions.</div>
        <div style={{fontSize:12,color:T.muted,marginBottom:14}}>Client: <strong style={{color:T.text}}>{sS(client.fullName)||"(no name)"}</strong>{client.archivedAt?" · archived "+fmtDate(client.archivedAt):""}</div>
        <div style={{display:"flex",gap:10}}>
          <button style={c.btn(T.green,T.bg)} onClick={doRestore} disabled={busy}>{busy?"Restoring…":"Yes, restore"}</button>
          <button style={c.bsm()} onClick={closeConfirm} disabled={busy}>Cancel</button>
        </div>
      </>}
    </Modal>}

    {showGate&&<Modal title="Mandatory information missing" onClose={()=>setShowGate(false)}>
      <div style={{...c.bnr("warn"),marginBottom:14}}>Some information is missing. It is your duty to collect the mandatory information. Proceed anyway?</div>
      <div style={{fontSize:11,color:T.muted,marginBottom:14}}><strong>Missing:</strong> {getMissingMandatoryFields(form).join(", ")}</div>
      <div style={{display:"flex",gap:10}}>
        <button style={c.btn(T.green,T.bg)} onClick={doSave} disabled={busy}>Proceed</button>
        <button style={c.bsm()} onClick={()=>setShowGate(false)} disabled={busy}>Cancel</button>
      </div>
    </Modal>}
  </>;
}
