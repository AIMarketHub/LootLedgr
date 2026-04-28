// LootLedger — toast notification UI primitive.
// Mechanically extracted from src/App.tsx during Phase 2 step 7c
// (briefing §7.3). No semantic changes.
//
// Three levels: "ok" (green), "warn" (orange), default (red, used
// for errors). Renders nothing when msg is empty.

import React from "react";
import {T,c} from "../../theme.js";

export default function Notif({msg,type,onClose}){
  if(!msg)return null;
  const col=type==="ok"?T.green:type==="warn"?T.orange:T.red;
  return <div style={{position:"fixed",bottom:70,right:16,zIndex:2000,background:T.card,border:"1px solid "+col,borderRadius:8,padding:"12px 18px",fontSize:13,color:col,maxWidth:340,boxShadow:"0 4px 20px #00000080"}}>{msg}<button style={{...c.bsm(T.border),marginLeft:12,fontSize:10}} onClick={onClose}>✕</button></div>;
}
