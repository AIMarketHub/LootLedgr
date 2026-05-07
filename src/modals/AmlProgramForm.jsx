// LootLedger — AML/CTF Program form modal.
// Phase 2.7 follow-up (2026-04-30). The 12-section governance
// form. Pre-fills statutory-correct defaults from
// src/lib/amlProgram/defaults.js so the dealer mostly confirms
// rather than authors. Two save paths:
//
//   Save Draft        writes to settings.amlProgram.draft. Doesn't
//                     bump currentVersion. Drafts are mutable —
//                     each save overwrites the previous draft.
//   Save & Approve    writes a new immutable entry to
//                     settings.amlProgram.versions[], updates
//                     settings.amlProgram.currentVersion to the
//                     new version, clears the draft. Requires
//                     senior-manager name and explicit approval
//                     checkbox.
//
// The form data is a flat map keyed by `${section}.${field}` per
// the defaults module. Section navigation uses anchor jumps; the
// modal itself scrolls.
//
// Initial seed precedence (most recent first):
//   1. settings.amlProgram.draft.data — resume an in-progress edit
//   2. The most recent approved version's data — start from the
//      last approved baseline
//   3. buildDefaults(settings) — pristine statutory defaults

import React,{useState,useMemo} from "react";
import {T,c} from "../theme.js";
import {Modal,F,SF} from "../components/ui";
import {sS,nowISO} from "../lib/utils.js";
import {getCurrentUserId,getCurrentUserLabel,sb} from "../lib/storage.js";
import {SECTION_TITLES,SECTION_FIELDS,FIELD_META,buildDefaults,nextVersion} from "../lib/amlProgram/defaults.js";

function todayPlus3YearsISODate(){
  const d=new Date();
  d.setFullYear(d.getFullYear()+3);
  return d.toISOString().slice(0,10);
}

// Stage 1.C — AUSTRAC Compliance Officer notification popup.
//
// Fires immediately after a Save & Approve completes. Two-step UX:
//
//   1. Pre-click: explains the obligation and presents two buttons —
//      "Go to AUSTRAC Online" (opens online.austrac.gov.au in a new
//      tab) or "I'll do it later" (closes; the persistent banner in
//      Settings → AML/CTF Program takes over).
//
//   2. Post-click: the same modal reveals a confirmation checkbox.
//      Ticking + Confirm stamps austracCoNotified + austracCoNotifiedAt
//      on the just-approved version entry inside settings.amlProgram.
//      versions[]. The banner suppresses itself once stamped.
//
// The version's data block stays immutable — only the lifecycle
// metadata around it (notified flag + timestamp) mutates, in the same
// way savedAt / approvedAt do at approval time. When a new version is
// approved, that new version starts un-notified; the user is re-
// prompted in case the Compliance Officer changed (the popup name
// pulls from s2.officerName so this is visible in the wording).
function AustracNotifyPopup({officerName,version,onMarkNotified,onClose}){
  const[linkClicked,setLinkClicked]=useState(false);
  const[ack,setAck]=useState(false);
  const openAustrac=()=>{
    if(typeof window!=="undefined")window.open("https://online.austrac.gov.au","_blank","noopener");
    setLinkClicked(true);
  };
  return <Modal title="✓ Program approved — one more step" onClose={onClose}>
    <div style={{...c.bnr("info"),marginBottom:14}}>
      <strong>You're nearly there.</strong> AUSTRAC requires you to formally notify them of your AML/CTF Compliance Officer{officerName?" ("+sS(officerName)+")":""}.
    </div>
    <div style={{fontSize:12,color:T.text,lineHeight:1.6,marginBottom:14}}>
      Notification must be submitted within 14 days of appointment, or by your transitional deadline:
      <ul style={{marginTop:8,paddingLeft:20,color:T.muted}}>
        <li>If you were enrolled with AUSTRAC before 31 March 2026: deadline <strong>30 May 2026</strong></li>
        <li>If newly regulated (precious metals dealer post-1 July 2026): deadline <strong>29 July 2026</strong> or 14 days from appointment, whichever later</li>
      </ul>
    </div>
    {!linkClicked?<div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      <button style={c.btn(T.gold,T.bg)} onClick={openAustrac}>🔗 Go to AUSTRAC Online to notify</button>
      <button style={c.bsm()} onClick={onClose}>I'll do it later — close</button>
    </div>:<>
      <div style={{fontSize:11,color:T.muted,marginBottom:10,lineHeight:1.5}}>AUSTRAC Online opened in a new tab. Once you've submitted your notification there, come back and tick the box below to record it against v{sS(version)}.</div>
      <label style={{display:"flex",alignItems:"flex-start",gap:8,cursor:"pointer",fontSize:12,marginBottom:14,lineHeight:1.5}}>
        <input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} style={{marginTop:3}}/>
        <span>I have notified AUSTRAC of the Compliance Officer for v{sS(version)}.</span>
      </label>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button style={c.btn(T.green,T.bg)} disabled={!ack} onClick={onMarkNotified}>✓ Confirm notification</button>
        <button style={c.bsm()} onClick={openAustrac}>🔗 Re-open AUSTRAC Online</button>
        <button style={c.bsm()} onClick={onClose}>I'll do it later — close</button>
      </div>
    </>}
  </Modal>;
}

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

export default function AmlProgramForm({settings,setSettings,activeStaff,pop,onClose}){
  // Initial seed at mount + a setter so successful saves can resync
  // it to the just-saved data. Without the setter, dirty stays
  // true forever after any save (Save Draft and Save & Approve
  // both update settings.amlProgram, but seed stays frozen at the
  // mount-time precedence value, so JSON.stringify(data) !==
  // JSON.stringify(seed) keeps reading dirty). Resyncing seed to
  // data on save makes dirty correctly flip back to false until
  // the next edit.
  const[seed,setSeed]=useState(()=>{
    const prog=(settings&&settings.amlProgram)||{};
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
  // Stage 1.C — version just approved (drives the AUSTRAC CO
  // notification popup). null until Save & Approve commits; the
  // popup unmounts when this resets to null. Form-level onClose is
  // deferred until the popup closes — closing the popup either
  // way (Confirm or "I'll do it later") then closes the form.
  const[approvedVersion,setApprovedVersion]=useState(null);
  const[officerNameAtApprove,setOfficerNameAtApprove]=useState("");

  const dirty=useMemo(()=>JSON.stringify(data)!==JSON.stringify(seed),[data,seed]);
  const sections=Object.keys(SECTION_TITLES);

  const onSaveDraft=async()=>{
    setSavingDraft(true);
    try{
      const draft={data,savedAt:nowISO(),savedBy:getCurrentUserLabel(),savedByActor:getCurrentUserId()};
      setSettings(p=>({...p,amlProgram:{...(p.amlProgram||{currentVersion:null,versions:[]}),draft}}));
      // Resync seed to the just-saved data so the dirty flag flips
      // back to false. Subsequent Cancel won't trigger the discard
      // prompt unless the user has typed more after this save.
      setSeed(data);
      pop&&pop("Draft saved.","ok");
    }finally{setSavingDraft(false);}
  };

  const onApprove=async()=>{
    if(!approverName.trim()){pop&&pop("Senior manager name required.","warn");return;}
    if(!approveAck){pop&&pop("Approval checkbox required.","warn");return;}
    setApproving(true);
    try{
      // Auto-fill computed fields if blank.
      const nowIso=nowISO();
      const finalData={...data};
      if(!finalData["s1.programApprovedDate"])finalData["s1.programApprovedDate"]=new Date().toISOString().slice(0,10);
      if(!finalData["s8.firstReviewDue"])finalData["s8.firstReviewDue"]=todayPlus3YearsISODate();
      if(!finalData["s12.nextReviewDate"])finalData["s12.nextReviewDate"]=todayPlus3YearsISODate();
      if(!finalData["s12.lastReviewDate"])finalData["s12.lastReviewDate"]=new Date().toISOString().slice(0,10);
      if(!finalData["s9.seniorManagerName"])finalData["s9.seniorManagerName"]=approverName.trim();
      if(!finalData["s1.seniorManagerName"])finalData["s1.seniorManagerName"]=approverName.trim();

      const prog=(settings&&settings.amlProgram)||{currentVersion:null,versions:[]};
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
      setSettings(p=>({...p,amlProgram:{currentVersion:newVersion,versions:[...versions,entry],draft:null}}));
      // Phase 3 commit 3d-3 — legal_doc_approved audit.
      try{
        sb.logAudit({
          event_type:"legal_doc_approved",
          target_table:"settings",
          target_id:"aml",
          reason:null,
          payload:{
            version:newVersion,
            approver_name:approverName.trim(),
          },
        });
      }catch(_){/* non-fatal */}
      pop&&pop("Approved as v"+newVersion+".","ok");
      // Stage 1.C — instead of closing the form, surface the
      // AUSTRAC CO notification popup. Officer name is captured
      // here so the popup wording stays correct even if the user
      // edits the form while the popup is open.
      setApprovedVersion(newVersion);
      setOfficerNameAtApprove(sS(finalData["s2.officerName"]||""));
    }finally{setApproving(false);}
  };

  // Stage 1.C — stamp austracCoNotified on the just-approved
  // version, then close popup + form. The version's data block is
  // immutable; this is lifecycle metadata that mutates after
  // approval, same way savedAt / approvedAt do at approval time.
  const onMarkAustracNotified=()=>{
    setSettings(p=>{
      const prog=p&&p.amlProgram?p.amlProgram:{currentVersion:null,versions:[],draft:null};
      const versions=Array.isArray(prog.versions)?prog.versions:[];
      const stampedAt=nowISO();
      return{...p,amlProgram:{...prog,versions:versions.map(v=>v.version===approvedVersion?{...v,austracCoNotified:true,austracCoNotifiedAt:stampedAt}:v)}};
    });
    pop&&pop("AUSTRAC notification recorded against v"+sS(approvedVersion)+".","ok");
    setApprovedVersion(null);
    onClose&&onClose();
  };

  // Either button on the popup that doesn't tick the checkbox
  // (the "I'll do it later" path or window-close on the modal)
  // routes through here. Form closes; banner takes over.
  const onPopupClose=()=>{
    setApprovedVersion(null);
    onClose&&onClose();
  };

  const onCancel=()=>{
    if(dirty){
      if(typeof window!=="undefined"&&window.confirm){
        if(!window.confirm("Discard unsaved changes? Use Save Draft to keep them."))return;
      }
    }
    onClose&&onClose();
  };

  return <Modal title="📋 AML/CTF Program" onClose={onCancel} wide>
    <div style={{...c.bnr("info"),marginBottom:14}}>
      Statutory defaults are pre-filled. Confirm or edit each section. <strong>Save Draft</strong> keeps the in-progress edit. <strong>Save &amp; Approve</strong> creates an immutable approved version (records who approved, when, and locks the data for audit).
    </div>

    {/* Section nav — anchor links so the dealer can jump quickly */}
    <div style={{...c.card({padding:10}),marginBottom:14,display:"flex",flexWrap:"wrap",gap:6,fontSize:11}}>
      {sections.map(k=>(
        <a key={k} href={"#aml-"+k} style={{color:T.gold,textDecoration:"none",padding:"3px 8px",border:"1px solid "+T.border,borderRadius:4}}>{SECTION_TITLES[k]}</a>
      ))}
    </div>

    {sections.map(sk=>(
      <div key={sk} id={"aml-"+sk} style={{...c.card({padding:14}),marginBottom:14,scrollMarginTop:16}}>
        <div style={{fontSize:13,fontWeight:"bold",color:T.gold,marginBottom:12,paddingBottom:8,borderBottom:"1px solid "+T.border}}>{SECTION_TITLES[sk]}</div>
        {SECTION_FIELDS[sk].map(fk=><FormField key={fk} fieldKey={fk} data={data} setData={setData}/>)}
      </div>
    ))}

    {/* Approval panel — collapsed until the dealer is ready to lock
        a version. Two-step pattern (open + confirm) prevents an
        accidental approve from a misclick on the bottom button. */}
    <div style={c.card({padding:14,marginBottom:14,borderLeft:"3px solid "+T.green})}>
      <div style={{fontSize:12,fontWeight:"bold",color:T.green,marginBottom:8}}>SAVE &amp; APPROVE — creates immutable v{nextVersion((settings&&settings.amlProgram&&settings.amlProgram.currentVersion)||null)}</div>
      <div style={{fontSize:10,color:T.muted,marginBottom:10,lineHeight:1.5}}>Once approved, this version is locked and saved to the audit trail. Use this when senior management has reviewed and signed off. Use <em>Save Draft</em> below for in-progress edits.</div>
      {!showApprovePanel&&<button style={c.btn(T.green,T.bg)} onClick={()=>setShowApprovePanel(true)}>Open approval panel</button>}
      {showApprovePanel&&<div>
        <F label="Senior manager name (typed full name acts as signature)" value={approverName} onChange={setApproverName} required/>
        <label style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:12,marginTop:8,marginBottom:14,cursor:"pointer",lineHeight:1.5}}>
          <input type="checkbox" checked={approveAck} onChange={e=>setApproveAck(e.target.checked)} style={{marginTop:3}}/>
          <span><strong>I, {approverName.trim()||"[name]"}, approve this AML/CTF Program version on behalf of senior management.</strong> The data captured above accurately reflects this entity's AML/CTF arrangements as of today.</span>
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

    {/* Stage 1.C — AUSTRAC CO notification popup. Mounted only after
        a successful Save & Approve. Modal-on-modal: this overlays
        the form modal, and onPopupClose closes both. */}
    {approvedVersion&&<AustracNotifyPopup
      officerName={officerNameAtApprove}
      version={approvedVersion}
      onMarkNotified={onMarkAustracNotified}
      onClose={onPopupClose}
    />}
  </Modal>;
}
