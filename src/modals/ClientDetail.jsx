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

import React,{useState} from "react";
import {T,c} from "../theme.js";
import {Modal,F,SF} from "../components/ui";
import {ID_OPTIONS} from "../lib/constants.js";
import {sS} from "../lib/utils.js";
import {checkPhotoSize} from "../lib/storage.js";
import {clients,getMissingMandatoryFields,formatLastVisit} from "../lib/clients.js";

function ReadField({label,value}){
  return <div style={{marginBottom:6,display:"flex",gap:8,flexWrap:"wrap",alignItems:"baseline"}}>
    <span style={{fontSize:10,color:T.muted,letterSpacing:"0.1em",textTransform:"uppercase",minWidth:140}}>{label}</span>
    <span style={{fontSize:12,color:T.text}}>{sS(value)||"—"}</span>
  </div>;
}

export default function ClientDetail({client,onSave,onClose,pop,withAdminGate}){
  const[editing,setEditing]=useState(false);
  const[form,setForm]=useState({});
  const[showGate,setShowGate]=useState(false);
  const[busy,setBusy]=useState(false);

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

  return <>
    <Modal title="Client Record" onClose={onClose} wide>
      {/* Header */}
      <div style={{marginBottom:14}}>
        <div style={{fontSize:16,fontWeight:"bold",color:T.gold,marginBottom:4}}>{sS(client.fullName)||"(no name)"}</div>
        <div style={{fontSize:11,color:T.muted,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          {client.blacklisted&&<span style={c.badge(T.red)}>⛔ BLACKLISTED</span>}
          {client.isTest&&<span style={c.badge(T.muted)}>TEST DATA</span>}
          <span>Transactions: {client.txCount||0}</span>
          {lastVisit&&<span>Last visit: {lastVisit}</span>}
        </div>
      </div>

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
          <F label="Date of Birth" required type="date" value={form.dob||""} onChange={v=>setForm(p=>({...p,dob:v}))}/>
          <F label="Phone" value={form.phone||""} onChange={v=>setForm(p=>({...p,phone:v}))}/>
          <F label="Email" value={form.email||""} onChange={v=>setForm(p=>({...p,email:v}))}/>
          <F label="Residential Address" required value={form.address||""} onChange={v=>setForm(p=>({...p,address:v}))}/>
          <SF label="ID Type" required value={form.idType||""} onChange={v=>setForm(p=>({...p,idType:v}))} options={ID_OPTIONS}/>
          <F label="ID Number" required value={form.idNumber||""} onChange={v=>setForm(p=>({...p,idNumber:v}))}/>
        </div>:<div>
          <ReadField label="Full Name" value={client.fullName}/>
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
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:12,marginTop:10,marginBottom:10,cursor:"pointer"}}><input type="checkbox" checked={!!form.blacklisted} onChange={e=>setForm(p=>({...p,blacklisted:e.target.checked}))}/>Blacklist this client</label>
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

      {/* Phase 2.7.11 — blacklist override history. Collapsed by
          default; <details>/<summary> handles the toggle without
          extra state. Hidden entirely when no overrides recorded. */}
      {Array.isArray(client.blacklistOverrides)&&client.blacklistOverrides.length>0&&<details style={{marginBottom:14}}>
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

      {/* Actions */}
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        {editing?<>
          <button style={c.btn(T.green,T.bg)} onClick={trySave} disabled={busy}>💾 Save</button>
          <button style={c.bsm()} onClick={cancelEdit} disabled={busy}>Cancel</button>
          {missing.length>0&&<span style={{fontSize:10,color:T.orange,padding:"5px 0"}}>Missing: {missing.join(", ")}</span>}
        </>:<>
          <button style={c.btn(T.gold,T.bg)} onClick={startEdit}>✎ Edit</button>
          <button style={c.bsm()} onClick={onClose}>Close</button>
        </>}
      </div>
    </Modal>

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
