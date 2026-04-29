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

import React,{useState,useMemo} from "react";
import {T,c} from "../theme.js";
import {Modal,F,SF} from "../components/ui";
import {ID_OPTIONS} from "../lib/constants.js";
import {sN,sS,fmtAUD,fmtDate} from "../lib/utils.js";
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

export default function ClientDetail({client,txList,onSave,onClose,pop,withAdminGate,setSelTx}){
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
