// LootLedger — AIGhost UI primitive.
// Mechanically extracted from src/App.tsx during Phase 2 step 7e
// (briefing §7.3). No semantic changes.
//
// Placeholder for the Sophiie AI integration (briefing — full
// agent UI lands in the FINAL roadmap step). Renders a subtle dot
// + label next to other controls when an AI provider is actually
// wired up. Returns null otherwise.
//
// Render gate (added 2026-04-29 Phase 2.7 smoke-test follow-up):
// the toggle alone is not enough — the dot would otherwise appear
// for every user as soon as they flicked the switch, even though
// no provider is connected and clicking it would do nothing.
// Until Sophiie integration lands, settings.aiAgentUrl will stay
// blank, so AIGhost effectively renders nowhere.

import React from "react";
import {sS} from "../../lib/utils.js";

export default function AIGhost({settings,label}){
  if(!settings||!settings.aiAgentEnabled)return null;
  // Provider gate — at least one connection field must be filled.
  // Add new provider keys here (e.g. sophiieApiKey) as they land.
  const providerConfigured=!!sS(settings.aiAgentUrl||"").trim();
  if(!providerConfigured)return null;
  const col=settings.aiAgentLevel>=2?"#F59E0B":"#3B82F6";
  return <div title={sS(settings.aiAgentName||"AI")+" — "+label} style={{display:"inline-flex",alignItems:"center",gap:4,opacity:0.55,marginLeft:6}}><span style={{width:6,height:6,borderRadius:"50%",background:col,boxShadow:"0 0 6px "+col,display:"inline-block"}}/><span style={{fontSize:9,color:col,fontFamily:"monospace"}}>{settings.aiAgentName||"AI"}</span></div>;
}
