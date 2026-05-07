// LootLedger — Privacy Policy form modal.
// Mirrors src/modals/AmlProgramForm.jsx — same Save Draft / Save &
// Approve pattern, same anchor-section nav, same dirty-state logic,
// same approver typed-name signature. Differences:
//
//   • Reads / writes settings.privacyPolicy (vs settings.amlProgram).
//   • Imports defaults from src/lib/legal/privacyPolicyDefaults.js
//     (14 sections covering APPs 1-13 + NDB scheme).
//   • Approver wording is "Authorised approver" instead of "Senior
//     manager" — Privacy Policies don't carry the same statutory
//     senior-manager-approval requirement as the AML/CTF Program.
//   • No AUSTRAC notification popup — that's specific to AML/CTF
//     compliance officer registration and not a Privacy Policy
//     concern.
//
// Initial seed precedence (most recent first):
//   1. settings.privacyPolicy.draft.data — resume an in-progress edit
//   2. The most recent approved version's data — start from baseline
//   3. buildDefaults(settings) — pristine statutory defaults

import React,{useState,useMemo} from "react";
import {T,c} from "../theme.js";
import {Modal,F} from "../components/ui";
import {sS,nowISO} from "../lib/utils.js";
import {getCurrentUserId,getCurrentUserLabel} from "../lib/storage.js";
import {SECTION_TITLES,SECTION_FIELDS,FIELD_META,buildDefaults,nextVersion} from "../lib/legal/privacyPolicyDefaults.js";

// Renders a single field by key. Reads from the form-data map and
// writes back via setData. Type derived from FIELD_META; falls back
// to a single-line text input.
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

export default function PrivacyPolicyForm({settings,setSettings,activeStaff,pop,onClose}){
  // Initial seed precedence per file header. Same pattern as
  // AmlProgramForm — setSeed lets a successful save resync the
  // dirty-state baseline so the unsaved-changes indicator clears.
  const[seed,setSeed]=useState(()=>{
    const prog=(settings&&settings.privacyPolicy)||{};
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
      setSettings(p=>({...p,privacyPolicy:{...(p.privacyPolicy||{currentVersion:null,versions:[]}),draft}}));
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
      // Auto-fill effective date if blank.
      if(!finalData["s14.policyEffectiveDate"])finalData["s14.policyEffectiveDate"]=new Date().toISOString().slice(0,10);
      // Pre-fill privacy officer name from approver if not set —
      // a privacy policy without an Officer name reads oddly.
      if(!sS(finalData["s1.privacyOfficerName"]).trim())finalData["s1.privacyOfficerName"]=approverName.trim();

      const prog=(settings&&settings.privacyPolicy)||{currentVersion:null,versions:[]};
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
      setSettings(p=>({...p,privacyPolicy:{currentVersion:newVersion,versions:[...versions,entry],draft:null}}));
      pop&&pop("Privacy Policy approved as v"+newVersion+".","ok");
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

  return <Modal title="🔒 Privacy Policy" onClose={onCancel} wide>
    <div style={{...c.bnr("info"),marginBottom:14}}>
      Statutory defaults are pre-filled per the Privacy Act 1988 (Cth) and the Australian Privacy Principles (APPs 1-13). Confirm or edit each section. <strong>Save Draft</strong> keeps the in-progress edit. <strong>Save &amp; Approve</strong> creates an immutable approved version (records who approved, when, and locks the data for audit).
    </div>

    {/* Section nav — anchor links so the user can jump quickly */}
    <div style={{...c.card({padding:10}),marginBottom:14,display:"flex",flexWrap:"wrap",gap:6,fontSize:11}}>
      {sections.map(k=>(
        <a key={k} href={"#pp-"+k} style={{color:T.gold,textDecoration:"none",padding:"3px 8px",border:"1px solid "+T.border,borderRadius:4}}>{SECTION_TITLES[k]}</a>
      ))}
    </div>

    {sections.map(sk=>(
      <div key={sk} id={"pp-"+sk} style={{...c.card({padding:14}),marginBottom:14,scrollMarginTop:16}}>
        <div style={{fontSize:13,fontWeight:"bold",color:T.gold,marginBottom:12,paddingBottom:8,borderBottom:"1px solid "+T.border}}>{SECTION_TITLES[sk]}</div>
        {SECTION_FIELDS[sk].map(fk=><FormField key={fk} fieldKey={fk} data={data} setData={setData}/>)}
      </div>
    ))}

    {/* Approval panel — collapsed until ready to lock a version. */}
    <div style={c.card({padding:14,marginBottom:14,borderLeft:"3px solid "+T.green})}>
      <div style={{fontSize:12,fontWeight:"bold",color:T.green,marginBottom:8}}>SAVE &amp; APPROVE — creates immutable v{nextVersion((settings&&settings.privacyPolicy&&settings.privacyPolicy.currentVersion)||null)}</div>
      <div style={{fontSize:10,color:T.muted,marginBottom:10,lineHeight:1.5}}>Once approved, this version is locked and saved to the audit trail. Use this when the policy has been reviewed and is ready to publish. Use <em>Save Draft</em> below for in-progress edits.</div>
      {!showApprovePanel&&<button style={c.btn(T.green,T.bg)} onClick={()=>setShowApprovePanel(true)}>Open approval panel</button>}
      {showApprovePanel&&<div>
        <F label="Authorised approver name (typed full name acts as signature)" value={approverName} onChange={setApproverName} required/>
        <label style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:12,marginTop:8,marginBottom:14,cursor:"pointer",lineHeight:1.5}}>
          <input type="checkbox" checked={approveAck} onChange={e=>setApproveAck(e.target.checked)} style={{marginTop:3}}/>
          <span><strong>I, {approverName.trim()||"[name]"}, approve this Privacy Policy version on behalf of the business.</strong> The text captured above accurately reflects this entity's privacy practices as of today.</span>
        </label>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <button style={c.btn(T.green,T.bg)} disabled={approving||!approverName.trim()||!approveAck} onClick={onApprove}>{approving?"Approving…":"Save & Approve"}</button>
          <button style={c.bsm()} onClick={()=>setShowApprovePanel(false)} disabled={approving}>Cancel approval</button>
        </div>
      </div>}
    </div>

    {/* Bottom button row — Save Draft and Cancel always visible. */}
    <div style={{display:"flex",gap:10,flexWrap:"wrap",position:"sticky",bottom:0,padding:"12px 0",background:T.bg,borderTop:"1px solid "+T.border}}>
      <button style={c.btn(T.gold,T.bg)} onClick={onSaveDraft} disabled={savingDraft}>{savingDraft?"Saving…":"💾 Save Draft"}</button>
      <button style={c.bsm()} onClick={onCancel}>Cancel</button>
      {dirty&&<span style={{fontSize:10,color:T.orange,fontWeight:700,padding:"6px 0"}}>• Unsaved changes</span>}
    </div>
  </Modal>;
}
