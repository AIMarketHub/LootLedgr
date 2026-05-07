// LootLedger — Terms of Service form modal.
// Mirrors src/modals/PrivacyPolicyForm.jsx with paths swapped to
// settings.termsOfService and the legal/termsOfServiceDefaults
// import. Same Save Draft / Save & Approve flow.
//
// LAWYER REVIEW RECOMMENDED before publishing this document with
// real customisations to fee-paying customers (Stage 2 launch).
// The Australian Consumer Law's non-excludable consumer guarantees
// override anything written in s6/s7 that purports to exclude or
// limit them — the document acknowledges this in s14, but the
// dealer's lawyer should review the specific liability cap and
// carve-outs against the dealer's risk profile.

import React,{useState,useMemo} from "react";
import {T,c} from "../theme.js";
import {Modal,F} from "../components/ui";
import {sS,nowISO} from "../lib/utils.js";
import {getCurrentUserId,getCurrentUserLabel} from "../lib/storage.js";
import {SECTION_TITLES,SECTION_FIELDS,FIELD_META,buildDefaults,nextVersion} from "../lib/legal/termsOfServiceDefaults.js";

function FormField({fieldKey,data,setData}){
  const meta=FIELD_META[fieldKey]||{type:"text",label:fieldKey};
  const value=data[fieldKey];
  const set=v=>setData(p=>({...p,[fieldKey]:v}));
  if(meta.type==="checkbox"){
    return <label style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:12,marginBottom:10,cursor:"pointer",lineHeight:1.5}}>
      <input type="checkbox" checked={!!value} onChange={e=>set(e.target.checked)} style={{marginTop:3,flexShrink:0}}/>
      <span>{meta.label}</span>
    </label>;
  }
  if(meta.type==="textarea"){
    return <F label={meta.label} as="textarea" value={value==null?"":String(value)} onChange={set} note={meta.help}/>;
  }
  if(meta.type==="date"){
    return <F label={meta.label} type="date" value={value==null?"":String(value)} onChange={set} note={meta.help}/>;
  }
  return <F label={meta.label} value={value==null?"":String(value)} onChange={set} note={meta.help}/>;
}

export default function TermsOfServiceForm({settings,setSettings,activeStaff,pop,onClose}){
  const[seed,setSeed]=useState(()=>{
    const prog=(settings&&settings.termsOfService)||{};
    if(prog.draft&&prog.draft.data)return{...buildDefaults(settings),...prog.draft.data};
    if(Array.isArray(prog.versions)&&prog.currentVersion){
      const cur=prog.versions.find(v=>v.version===prog.currentVersion);
      if(cur&&cur.data)return{...buildDefaults(settings),...cur.data};
    }
    return buildDefaults(settings);
  });

  const[data,setData]=useState(seed);
  const[approverName,setApproverName]=useState("");
  const[approveAck,setApproveAck]=useState(false);
  const[savingDraft,setSavingDraft]=useState(false);
  const[approving,setApproving]=useState(false);
  const[showApprovePanel,setShowApprovePanel]=useState(false);

  const dirty=useMemo(()=>JSON.stringify(data)!==JSON.stringify(seed),[data,seed]);
  const sections=Object.keys(SECTION_TITLES);

  const onSaveDraft=async()=>{
    setSavingDraft(true);
    try{
      const draft={data,savedAt:nowISO(),savedBy:getCurrentUserLabel(),savedByActor:getCurrentUserId()};
      setSettings(p=>({...p,termsOfService:{...(p.termsOfService||{currentVersion:null,versions:[]}),draft}}));
      setSeed(data);
      pop&&pop("Draft saved.","ok");
    }finally{setSavingDraft(false);}
  };

  const onApprove=async()=>{
    if(!approverName.trim()){pop&&pop("Approver name required.","warn");return;}
    if(!approveAck){pop&&pop("Approval checkbox required.","warn");return;}
    setApproving(true);
    try{
      const nowIso=nowISO();
      const finalData={...data};
      if(!finalData["s14.policyEffectiveDate"])finalData["s14.policyEffectiveDate"]=new Date().toISOString().slice(0,10);
      // Pre-fill Service Provider name from settings.businessName
      // if blank — a ToS without an identified provider is unusable.
      if(!sS(finalData["s1.serviceProviderName"]).trim())finalData["s1.serviceProviderName"]=sS(settings&&settings.businessName)||"LootLedger";

      const prog=(settings&&settings.termsOfService)||{currentVersion:null,versions:[]};
      const newVersion=nextVersion(prog.currentVersion);
      const entry={
        version:newVersion,
        savedAt:nowIso,
        savedBy:getCurrentUserLabel(),
        savedByActor:getCurrentUserId(),
        approvedAt:nowIso,
        approvedBy:approverName.trim(),
        data:finalData,
      };
      const versions=Array.isArray(prog.versions)?prog.versions:[];
      setSettings(p=>({...p,termsOfService:{currentVersion:newVersion,versions:[...versions,entry],draft:null}}));
      pop&&pop("Terms of Service approved as v"+newVersion+".","ok");
      onClose&&onClose();
    }finally{setApproving(false);}
  };

  const onCancel=()=>{
    if(dirty){
      if(typeof window!=="undefined"&&window.confirm){
        if(!window.confirm("Discard unsaved changes? Use Save Draft to keep them."))return;
      }
    }
    onClose&&onClose();
  };

  return <Modal title="📜 Terms of Service" onClose={onCancel} wide>
    <div style={{...c.bnr("warn"),marginBottom:14,fontSize:11,lineHeight:1.5}}>
      <strong>⚖ Lawyer review recommended before public launch.</strong> This template limits exposure to the maximum permitted by Australian law. The Australian Consumer Law's non-excludable consumer guarantees (s.54 quality, s.55 fitness for purpose, s.60 services rendered with due care, s.61 services fit for any disclosed purpose) cannot be excluded by contract — they apply regardless of what these Terms say. The acknowledgment in Section 14 reflects that. A specialist contract lawyer should review Sections 6 (Disclaimer of Warranties), 7 (Limitation of Liability), and 8 (Indemnification) against your risk profile before this document is presented to fee-paying customers.
    </div>
    <div style={{...c.bnr("info"),marginBottom:14}}>
      Statutory defaults are pre-filled. Confirm or edit each section. <strong>Save Draft</strong> keeps the in-progress edit. <strong>Save &amp; Approve</strong> creates an immutable approved version (records who approved, when, and locks the data for audit).
    </div>

    <div style={{...c.card({padding:10}),marginBottom:14,display:"flex",flexWrap:"wrap",gap:6,fontSize:11}}>
      {sections.map(k=>(
        <a key={k} href={"#tos-"+k} style={{color:T.gold,textDecoration:"none",padding:"3px 8px",border:"1px solid "+T.border,borderRadius:4}}>{SECTION_TITLES[k]}</a>
      ))}
    </div>

    {sections.map(sk=>(
      <div key={sk} id={"tos-"+sk} style={{...c.card({padding:14}),marginBottom:14,scrollMarginTop:16}}>
        <div style={{fontSize:13,fontWeight:"bold",color:T.gold,marginBottom:12,paddingBottom:8,borderBottom:"1px solid "+T.border}}>{SECTION_TITLES[sk]}</div>
        {SECTION_FIELDS[sk].map(fk=><FormField key={fk} fieldKey={fk} data={data} setData={setData}/>)}
      </div>
    ))}

    <div style={c.card({padding:14,marginBottom:14,borderLeft:"3px solid "+T.green})}>
      <div style={{fontSize:12,fontWeight:"bold",color:T.green,marginBottom:8}}>SAVE &amp; APPROVE — creates immutable v{nextVersion((settings&&settings.termsOfService&&settings.termsOfService.currentVersion)||null)}</div>
      <div style={{fontSize:10,color:T.muted,marginBottom:10,lineHeight:1.5}}>Once approved, this version is locked. Existing users will be required to re-accept on next sign-in. Use this when the Terms have been reviewed and are ready to publish. Use <em>Save Draft</em> below for in-progress edits.</div>
      {!showApprovePanel&&<button style={c.btn(T.green,T.bg)} onClick={()=>setShowApprovePanel(true)}>Open approval panel</button>}
      {showApprovePanel&&<div>
        <F label="Authorised approver name (typed full name acts as signature)" value={approverName} onChange={setApproverName} required/>
        <label style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:12,marginTop:8,marginBottom:14,cursor:"pointer",lineHeight:1.5}}>
          <input type="checkbox" checked={approveAck} onChange={e=>setApproveAck(e.target.checked)} style={{marginTop:3}}/>
          <span><strong>I, {approverName.trim()||"[name]"}, approve this Terms of Service version on behalf of the business.</strong> The text captured above accurately reflects the terms on which the Service is offered as of today.</span>
        </label>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <button style={c.btn(T.green,T.bg)} disabled={approving||!approverName.trim()||!approveAck} onClick={onApprove}>{approving?"Approving…":"Save & Approve"}</button>
          <button style={c.bsm()} onClick={()=>setShowApprovePanel(false)} disabled={approving}>Cancel approval</button>
        </div>
      </div>}
    </div>

    <div style={{display:"flex",gap:10,flexWrap:"wrap",position:"sticky",bottom:0,padding:"12px 0",background:T.bg,borderTop:"1px solid "+T.border}}>
      <button style={c.btn(T.gold,T.bg)} onClick={onSaveDraft} disabled={savingDraft}>{savingDraft?"Saving…":"💾 Save Draft"}</button>
      <button style={c.bsm()} onClick={onCancel}>Cancel</button>
      {dirty&&<span style={{fontSize:10,color:T.orange,fontWeight:700,padding:"6px 0"}}>• Unsaved changes</span>}
    </div>
  </Modal>;
}
