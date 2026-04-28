// LootLedger — hold-timer UI primitive.
// Mechanically extracted from src/App.tsx during Phase 2 step 7d
// (briefing §7.3). No semantic changes.
//
// Renders one of three states for a stock item:
//   - POLICE  red badge (when policeHold is true)
//   - FREE    ready-green badge (no holdUntil, or expired)
//   - <time>  orange dot + remaining hold duration
//
// A 30-second interval re-renders the component so the displayed
// remaining-time string stays current without external re-render.

import React,{useState,useEffect} from "react";
import {T,c} from "../../theme.js";
import {hoursLeft,fmtHold} from "../../lib/utils.js";

export default function HoldTimer({holdUntil,policeHold}){
  const[,tick]=useState(0);
  useEffect(()=>{const t=setInterval(()=>tick(p=>p+1),30000);return()=>clearInterval(t);},[]);
  if(policeHold)return <span style={c.row(5)}><span style={c.dot(T.red)}/><span style={c.badge(T.red)}>POLICE</span></span>;
  if(!holdUntil||hoursLeft(holdUntil)<=0)return <span style={c.row(5)}><span style={c.dot(T.readyGreen)}/><span style={c.badge(T.readyGreen)}>FREE</span></span>;
  return <span style={c.row(5)}><span style={c.dot(T.orange)}/><span style={{fontSize:11,color:T.orange}}>{fmtHold(holdUntil)}</span></span>;
}
