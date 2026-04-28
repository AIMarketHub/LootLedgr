// LootLedger — form-field UI primitives.
// Mechanically extracted from src/App.tsx during Phase 2 step 7b
// (briefing §7.3). No semantic changes.
//
// F  — labelled text input. Optional textarea via as="textarea".
//      Required marker, read-only mode, helper note.
// SF — labelled select. Options array of {value, label}.
//
// Both use the c.lbl / c.inp / c.sel helpers, so font-size / simp
// adjustments applied by App.tsx in-render (Object.assign(c, …))
// flow through automatically.

import React from "react";
import {T,c} from "../../theme.js";

export function F({label,value,onChange,type="text",placeholder,required,readOnly,note,as}){
  const lbl=<label style={c.lbl}>{label}{required&&<span style={{color:T.red}}> *</span>}</label>;
  const val=value==null?"":value;
  return <div style={{marginBottom:14}}>{lbl}{as==="textarea"?<textarea style={{...c.inp(),height:80,resize:"vertical"}} value={val} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder||""}/>:<input style={c.inp({opacity:readOnly?0.6:1})} type={type} value={val} readOnly={readOnly} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder||""}/>}{note&&<div style={{fontSize:10,color:T.muted,marginTop:3}}>{note}</div>}</div>;
}

export function SF({label,value,onChange,options,required}){
  return <div style={{marginBottom:14}}><label style={c.lbl}>{label}{required&&<span style={{color:T.red}}> *</span>}</label><select style={{...c.sel(),width:"100%"}} value={value||""} onChange={e=>onChange(e.target.value)}>{(options||[]).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>;
}
