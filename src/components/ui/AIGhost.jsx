// LootLedger — AIGhost UI primitive.
// Mechanically extracted from src/App.tsx during Phase 2 step 7e
// (briefing §7.3). No semantic changes.
//
// Placeholder for the Sophiie AI integration (briefing — full
// agent UI lands in a later phase). Renders a subtle dot + label
// next to other controls when settings.aiAgentEnabled is true.
// Returns null otherwise.

import React from "react";
import {sS} from "../../lib/utils.js";

export default function AIGhost({settings,label}){
  if(!settings||!settings.aiAgentEnabled)return null;
  const col=settings.aiAgentLevel>=2?"#F59E0B":"#3B82F6";
  return <div title={sS(settings.aiAgentName||"AI")+" — "+label} style={{display:"inline-flex",alignItems:"center",gap:4,opacity:0.55,marginLeft:6}}><span style={{width:6,height:6,borderRadius:"50%",background:col,boxShadow:"0 0 6px "+col,display:"inline-block"}}/><span style={{fontSize:9,color:col,fontFamily:"monospace"}}>{settings.aiAgentName||"AI"}</span></div>;
}
