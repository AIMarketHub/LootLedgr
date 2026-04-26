// LootLedger — pure utility functions.
// Mechanically extracted from src/App.tsx during Phase 2 step 2.
// No semantic changes; signatures preserved exactly.
//
// All exports below are pure functions with no React, DOM, or
// storage dependencies. peekInv() and makeInv() (invoice-number
// generation) depend on the localStorage wrapper `store` and stay
// in src/App.tsx until Phase 2 step 4 extracts storage; they will
// move at that point (likely into storage.js, or a dedicated
// invoice module).

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

// Invoice-number date prefix (DDMMYY).
// peekInv() and makeInv() that use this stay in App.tsx (depend on `store`).
export const invDay=()=>{const d=new Date();return String(d.getDate()).padStart(2,"0")+String(d.getMonth()+1).padStart(2,"0")+String(d.getFullYear()).slice(-2);};

// Bluetooth scale parsing.
// Standard BLE Weight Scale Service binary format + Nordic UART ASCII.
export function toGrams(val,unit){if(!val||isNaN(val))return null;if(unit==="kg"||unit==="kgs")return{g:val*1000,raw:val.toFixed(3)+"kg",stable:true};if(unit==="lb"||unit==="lbs")return{g:val*453.592,raw:val.toFixed(3)+"lb",stable:true};if(unit==="oz"&&!unit.includes("t"))return{g:val*28.3495,raw:val.toFixed(3)+"oz",stable:true};if(unit==="ozt"||unit==="toz")return{g:val*31.1035,raw:val.toFixed(3)+"ozt",stable:true};if(unit==="ct"||unit==="cts")return{g:val*0.2,raw:val.toFixed(2)+"ct",stable:true};return{g:val,raw:val.toFixed(3)+"g",stable:true};}
export function parseStdWeight(dv){const flags=dv.getUint8(0),raw=dv.getUint16(1,true),isImp=(flags&0x01)!==0;if(isImp){const lb=raw*0.01;return{g:lb*453.592,raw:lb.toFixed(3)+" lb",stable:true};}const kg=raw*0.005;return{g:kg*1000,raw:kg.toFixed(3)+" kg",stable:true};}
export function parseAsciiWeight(str){const s=sS(str).replace(/[\r\n]+/g,"").trim();const o=/[A-Z]{2},[A-Z]{2},[+-]?(\d+\.?\d*)\s*([a-zA-Z]+)?/.exec(s);if(o)return toGrams(parseFloat(o[1]),(o[2]||"g").toLowerCase());const g=/[+-]?\s*(\d+\.?\d*)\s*([a-zA-Z]+)?/.exec(s);if(g)return toGrams(parseFloat(g[1]),(g[2]||"g").toLowerCase());return null;}
export function fmtScaleWeight(reading,unit){if(!reading)return"—";if(unit==="ozt")return(reading.g/31.1035).toFixed(4)+" ozt";if(unit==="oz")return(reading.g/28.3495).toFixed(3)+" oz";return reading.g.toFixed(3)+" g";}
