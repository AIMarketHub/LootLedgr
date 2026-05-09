// LootLedger — utility functions.
// Mechanically extracted from src/App.tsx during Phase 2 step 2.
// No semantic changes; signatures preserved exactly.
//
// Most exports are pure (no React, DOM, or storage). The two
// invoice-number helpers at the bottom (peekInv / makeInv) depend
// on the localStorage wrapper at src/lib/storage.js — they migrated
// here in Phase 2 step 4b to live alongside invDay (the date prefix
// they consume).

import {store} from "./storage.js";

// Defensive sanitisers — guard all data from users, servers, APIs.
export const sN=n=>(n==null||isNaN(n)||!isFinite(n))?0:Number(n);
export const sS=v=>v==null?"":String(v);

// Short uppercase pseudo-unique id.
export const uid=()=>Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,5).toUpperCase();

// Number / currency / date formatters (Australian locale).
export const fmt2=n=>sN(n).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
export const fmtAUD=n=>(n==null||isNaN(n)||!isFinite(n))?"—":"$"+fmt2(n);
export const fmtDate=iso=>iso?new Date(iso).toLocaleString("en-AU",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}):"—";

// Hold / hours math (used by HoldTimer and stock-card ready state).
export const addHours=(iso,h)=>new Date(new Date(iso).getTime()+h*3600000).toISOString();
export const hoursLeft=iso=>Math.max(0,(new Date(iso)-Date.now())/3600000);
export const fmtHold=iso=>{if(!iso)return"—";const h=hoursLeft(iso);if(h<=0)return"EXPIRED";return Math.floor(h)+"h "+Math.floor((h%1)*60)+"m";};

// Retention helpers (7-year boundary per AML/CTF Act + Privacy Act).
export const sevenYrsFrom=iso=>addHours(iso,7*365.25*24);
export const isExpired7yr=iso=>iso&&new Date(iso)<new Date();

// Time helpers.
export const nowISO=()=>new Date().toISOString();
export const todayStr=()=>nowISO().slice(0,10);
// Phase 3.5-A-2 — N days ago as a YYYY-MM-DD string (local time
// normalised to UTC midnight via toISOString().slice(0,10)). Used
// by the Staff modal "My Hours" 14-day catch-up grid.
export const daysAgoISO=n=>{const d=new Date();d.setDate(d.getDate()-n);return d.toISOString().slice(0,10);};

// Phase 3.5-A-3 — "Hours Worked" cell formatter for the XLSX
// staff-hours export. Takes a staff_hours row {start_time,
// end_time, break_minutes} and returns "Nh MMm" or "-" when
// either bound is missing or the math goes negative (e.g.
// overnight shift not yet supported — would show as a negative
// span and gets clamped to "-").
//
// Hour math is intentionally simple:
//   total minutes = (end_h*60 + end_m) - (start_h*60 + start_m) - break
// Same-day only. If you log a shift that crosses midnight, the
// user-facing UI prevents end_time < start_time anyway because
// HTML <input type="time"> won't accept it inline.
export function computeHoursWorked(row){
  if(!row||!row.start_time||!row.end_time)return "-";
  try{
    const[sh,sm]=String(row.start_time).split(":").map(Number);
    const[eh,em]=String(row.end_time).split(":").map(Number);
    if(!isFinite(sh)||!isFinite(sm)||!isFinite(eh)||!isFinite(em))return "-";
    const startMin=sh*60+sm;
    const endMin=eh*60+em;
    const breaks=sN(row.break_minutes);
    const totalMin=endMin-startMin-breaks;
    if(totalMin<=0)return "-";
    const hours=Math.floor(totalMin/60);
    const mins=totalMin%60;
    return hours+"h "+(mins<10?"0"+mins:mins)+"m";
  }catch(_){return "-";}
}

// Invoice-number date prefix (DDMMYY).
export const invDay=()=>{const d=new Date();return String(d.getDate()).padStart(2,"0")+String(d.getMonth()+1).padStart(2,"0")+String(d.getFullYear()).slice(-2);};

// Invoice-number generation. peekInv computes the next number without
// consuming it (used for the txNo display while a transaction is being
// built); makeInv increments and persists, returning the consumed
// number when the transaction is committed. Both keyed off invDay so
// the counter resets at midnight.
export function peekInv(){const t=invDay(),r=store.get("invday",{d:"",n:0});return t+((r.d===t?r.n:0)+1);}
export function makeInv(){const t=invDay();let r=store.get("invday",{d:"",n:0});if(r.d!==t)r={d:t,n:0};r.n++;store.set("invday",r);return t+r.n;}

// Bluetooth scale parsing.
// Standard BLE Weight Scale Service binary format + Nordic UART ASCII.
export function toGrams(val,unit){if(!val||isNaN(val))return null;if(unit==="kg"||unit==="kgs")return{g:val*1000,raw:val.toFixed(3)+"kg",stable:true};if(unit==="lb"||unit==="lbs")return{g:val*453.592,raw:val.toFixed(3)+"lb",stable:true};if(unit==="oz"&&!unit.includes("t"))return{g:val*28.3495,raw:val.toFixed(3)+"oz",stable:true};if(unit==="ozt"||unit==="toz")return{g:val*31.1035,raw:val.toFixed(3)+"ozt",stable:true};if(unit==="ct"||unit==="cts")return{g:val*0.2,raw:val.toFixed(2)+"ct",stable:true};return{g:val,raw:val.toFixed(3)+"g",stable:true};}
export function parseStdWeight(dv){const flags=dv.getUint8(0),raw=dv.getUint16(1,true),isImp=(flags&0x01)!==0;if(isImp){const lb=raw*0.01;return{g:lb*453.592,raw:lb.toFixed(3)+" lb",stable:true};}const kg=raw*0.005;return{g:kg*1000,raw:kg.toFixed(3)+" kg",stable:true};}
export function parseAsciiWeight(str){const s=sS(str).replace(/[\r\n]+/g,"").trim();const o=/[A-Z]{2},[A-Z]{2},[+-]?(\d+\.?\d*)\s*([a-zA-Z]+)?/.exec(s);if(o)return toGrams(parseFloat(o[1]),(o[2]||"g").toLowerCase());const g=/[+-]?\s*(\d+\.?\d*)\s*([a-zA-Z]+)?/.exec(s);if(g)return toGrams(parseFloat(g[1]),(g[2]||"g").toLowerCase());return null;}
export function fmtScaleWeight(reading,unit){if(!reading)return"—";if(unit==="ozt")return(reading.g/31.1035).toFixed(4)+" ozt";if(unit==="oz")return(reading.g/28.3495).toFixed(3)+" oz";return reading.g.toFixed(3)+" g";}
