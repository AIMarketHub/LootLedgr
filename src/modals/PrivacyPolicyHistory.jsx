// LootLedger — Privacy Policy version history viewer.
// Mirrors src/modals/AmlProgramHistory.jsx with paths swapped to
// settings.privacyPolicy + privacy-policy defaults imports.
//
// Approved versions are immutable. The restore path always produces
// a NEW draft; an existing draft is replaced after a confirm prompt.

import React,{useState} from "react";
import {T,c} from "../theme.js";
import {Modal} from "../components/ui";
import {sS,nowISO} from "../lib/utils.js";
import {SECTION_TITLES,SECTION_FIELDS,FIELD_META} from "../lib/legal/privacyPolicyDefaults.js";

function fmtDateTime(iso){if(!iso)return "—";try{return new Date(iso).toLocaleString("en-AU",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"});}catch(_){return sS(iso);}}

function VersionDetail({version}){
  const data=version&&version.data||{};
  const sections=Object.keys(SECTION_TITLES);
  return <div>
    <div style={{...c.bnr("info"),marginBottom:14}}>
      <strong>v{sS(version.version)}</strong> · saved {fmtDateTime(version.savedAt)}{version.savedBy?" by "+sS(version.savedBy):""} · approved {fmtDateTime(version.approvedAt)}{version.approvedBy?" by "+sS(version.approvedBy):""}
    </div>
    {sections.map(sk=>(
      <div key={sk} style={{...c.card({padding:14}),marginBottom:14}}>
        <div style={{fontSize:13,fontWeight:"bold",color:T.gold,marginBottom:10,paddingBottom:6,borderBottom:"1px solid "+T.border}}>{SECTION_TITLES[sk]}</div>
        {SECTION_FIELDS[sk].map(fk=>{
          const meta=FIELD_META[fk]||{label:fk};
          const v=data[fk];
          let display;
          if(meta.type==="checkbox")display=v?"✓ Yes":"— No";
          else if(v==null||String(v).trim()==="")display="—";
          else display=String(v);
          return <div key={fk} style={{marginBottom:8}}>
            <div style={{fontSize:10,color:T.muted,letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:2}}>{meta.label}</div>
            <div style={{fontSize:12,color:T.text,whiteSpace:"pre-wrap",lineHeight:1.5}}>{display}</div>
          </div>;
        })}
      </div>
    ))}
  </div>;
}

export default function PrivacyPolicyHistory({settings,setSettings,activeStaff,pop,onClose,onRestoredOpenForm}){
  const prog=(settings&&settings.privacyPolicy)||{currentVersion:null,versions:[]};
  const versions=Array.isArray(prog.versions)?[...prog.versions].sort((a,b)=>(b.savedAt||"").localeCompare(a.savedAt||"")):[];
  const hasDraft=!!(prog.draft&&prog.draft.data);
  const[selectedVersion,setSelectedVersion]=useState(null);

  const onRestore=v=>{
    if(hasDraft){
      if(typeof window!=="undefined"&&window.confirm){
        if(!window.confirm("A draft already exists. Restoring v"+v.version+" will replace it. Continue?"))return;
      }
    }
    setSettings(p=>({
      ...p,
      privacyPolicy:{
        ...(p.privacyPolicy||{currentVersion:null,versions:[]}),
        draft:{data:v.data||{},savedAt:nowISO(),savedBy:sS(activeStaff||"Unknown")},
      },
    }));
    pop&&pop("Restored v"+v.version+" as new draft. Open the form to edit.","ok");
    onClose&&onClose();
    if(typeof onRestoredOpenForm==="function")onRestoredOpenForm();
  };

  if(selectedVersion){
    return <Modal title={"📜 Privacy Policy v"+sS(selectedVersion.version)} onClose={()=>setSelectedVersion(null)} wide>
      <VersionDetail version={selectedVersion}/>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",position:"sticky",bottom:0,padding:"12px 0",background:T.bg,borderTop:"1px solid "+T.border}}>
        <button style={c.btn(T.gold,T.bg)} onClick={()=>onRestore(selectedVersion)}>↺ Restore as new draft</button>
        <button style={c.bsm()} onClick={()=>setSelectedVersion(null)}>← Back to list</button>
        <button style={c.bsm()} onClick={onClose}>Close</button>
      </div>
    </Modal>;
  }

  return <Modal title="📜 Privacy Policy — Version History" onClose={onClose} wide>
    {versions.length===0?<div style={{...c.bnr("info"),marginBottom:14}}>No approved versions yet. Use the form's <strong>Save &amp; Approve</strong> button to create the first version.</div>:<div>
      <div style={{fontSize:11,color:T.muted,marginBottom:10}}>Click any row to view that version. Approved versions are immutable; use <em>Restore as new draft</em> to start a new version seeded from a historical one.</div>
      {versions.map(v=>(
        <button
          key={v.version+"-"+v.savedAt}
          onClick={()=>setSelectedVersion(v)}
          style={{...c.card({padding:12,background:T.surface}),width:"100%",border:"1px solid "+T.border,cursor:"pointer",textAlign:"left",fontFamily:"inherit",color:T.text,marginBottom:8,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}
        >
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:13,fontWeight:"bold",color:T.gold}}>v{sS(v.version)}{prog.currentVersion===v.version&&<span style={{...c.badge(T.green),marginLeft:8}}>CURRENT</span>}</div>
            <div style={{fontSize:11,color:T.muted,marginTop:3}}>Saved {fmtDateTime(v.savedAt)}{v.savedBy?" by "+sS(v.savedBy):""}</div>
            {v.approvedBy&&<div style={{fontSize:11,color:T.muted,marginTop:1}}>Approved {fmtDateTime(v.approvedAt)} by <strong>{sS(v.approvedBy)}</strong></div>}
          </div>
          <div style={{fontSize:11,color:T.muted}}>View →</div>
        </button>
      ))}
    </div>}
    <div style={{display:"flex",gap:10,marginTop:14}}>
      <button style={c.bsm()} onClick={onClose}>Close</button>
    </div>
  </Modal>;
}
