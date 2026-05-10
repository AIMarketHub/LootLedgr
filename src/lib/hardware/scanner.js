// LootLedger — barcode / ID scanner driver.
// Phase 5.2-A. HID keyboard-emulation pattern: most cheap
// scanners "type" the barcode into a focused input followed
// by Enter or Tab. Live mode wires a global keydown listener
// that detects rapid-burst input + terminator and dispatches
// to a handler. Mock mode lets diagnostic / dev paths emit a
// fake scan via simulateScan() so the rest of the app can be
// exercised without hardware.
//
// Format detection (EAN-13 / UPC-A / Code128 / QR) is
// inferred from the captured buffer length + character class
// at handler dispatch time.
//
// NOT wired into NewTx or any capture flow in this commit
// (per 5.2-A scope guardrails).

import {store} from "../storage.js";
import {logCommand} from "./log.js";

const MODE_KEY="hw.mode.scanner";
const DEVICE_TYPE="scanner";

// Burst detection thresholds — a human typing produces
// keystrokes at ~5-10 char/sec; an HID scanner produces
// 50-200 char/sec. The buffer flushes when a terminator
// (Enter / Tab) lands within 200ms of the last keystroke,
// or 200ms after the last char if no terminator.
const BURST_GAP_MS=80;
const FLUSH_TIMEOUT_MS=200;
const MIN_BARCODE_LEN=4;

let _handler=null;
let _listening=false;
let _buffer="";
let _lastKeyAt=0;
let _flushTimer=null;
let _keydown=null;

function _detectFormat(s){
  const len=String(s||"").length;
  if(/^\d{13}$/.test(s))return "EAN-13";
  if(/^\d{12}$/.test(s))return "UPC-A";
  if(/^\d{8}$/.test(s))return "EAN-8";
  if(len>=20&&/[A-Za-z]/.test(s))return "QR";
  if(/^[\x20-\x7E]+$/.test(s))return "Code128";
  return "unknown";
}

function _flush(){
  const buf=_buffer;_buffer="";
  if(_flushTimer){clearTimeout(_flushTimer);_flushTimer=null;}
  if(buf.length<MIN_BARCODE_LEN)return;
  const scan={barcode:buf,format:_detectFormat(buf)};
  logCommand({deviceType:DEVICE_TYPE,command:"barcode",params:{length:buf.length},result:scan,mode:"live",succeeded:true,latencyMs:0});
  if(_handler)try{_handler(scan);}catch(e){console.warn("[hardware/scanner] handler threw",e);}
}

function _onKeyDown(e){
  // Don't capture when an input/textarea is focused — the user
  // is typing into a field and the scanner stream would mix
  // with their input. Most scanners type fast enough that the
  // first burst lands while focus is on the field anyway,
  // which is the desired UX.
  const tag=e&&e.target&&e.target.tagName;
  if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT")return;
  const now=Date.now();
  const dt=now-_lastKeyAt;
  if(dt>BURST_GAP_MS&&_buffer.length>0){_buffer="";}
  _lastKeyAt=now;
  if(e.key==="Enter"||e.key==="Tab"){
    if(_buffer.length>=MIN_BARCODE_LEN){e.preventDefault();_flush();}
    return;
  }
  if(e.key&&e.key.length===1){
    _buffer+=e.key;
    if(_flushTimer)clearTimeout(_flushTimer);
    _flushTimer=setTimeout(_flush,FLUSH_TIMEOUT_MS);
  }
}

export function getMode(){return store.get(MODE_KEY,"mock")==="live"?"live":"mock";}
export function setMode(m){store.set(MODE_KEY,m==="live"?"live":"mock");}

export async function isAvailable(){
  return typeof window!=="undefined";
}

export function startListening(handler){
  _handler=typeof handler==="function"?handler:null;
  if(_listening)return;
  _listening=true;
  if(typeof window!=="undefined"){
    _keydown=_onKeyDown;
    window.addEventListener("keydown",_keydown,true);
  }
  logCommand({deviceType:DEVICE_TYPE,command:"startListening",params:{},result:{ok:true},mode:getMode(),succeeded:true,latencyMs:0});
}

export function stopListening(){
  if(!_listening)return;
  _listening=false;
  _handler=null;
  if(_flushTimer){clearTimeout(_flushTimer);_flushTimer=null;}
  _buffer="";
  if(typeof window!=="undefined"&&_keydown){
    window.removeEventListener("keydown",_keydown,true);
    _keydown=null;
  }
  logCommand({deviceType:DEVICE_TYPE,command:"stopListening",params:{},result:{ok:true},mode:getMode(),succeeded:true,latencyMs:0});
}

// Mock helper — emit a simulated scan, useful for the
// diagnostics page test row. Live mode also accepts a
// forced emit (operator-driven test).
export function simulateScan(barcode){
  const b=String(barcode||"5901234123457");  // sample EAN-13
  const scan={barcode:b,format:_detectFormat(b)};
  logCommand({deviceType:DEVICE_TYPE,command:"simulateScan",params:{},result:scan,mode:getMode(),succeeded:true,latencyMs:0});
  if(_handler)try{_handler(scan);}catch(e){}
  return scan;
}

export async function diagnose(){
  const mode=getMode();
  const t0=performance.now();
  let ok=false,details="",error;
  if(mode==="mock"){
    await new Promise(r=>setTimeout(r,40+Math.random()*80));
    const sample=simulateScan("5901234123457");
    ok=true;details="Mock scanner OK — simulated scan: "+sample.barcode+" ("+sample.format+").";
  }else{
    if(typeof window==="undefined"){
      ok=false;details="No window object — cannot attach keydown listener.";error="no-window";
    }else{
      ok=true;
      details=_listening
        ?"Scanner listening: keydown handler active. Trigger a real scan to test."
        :"Scanner not listening yet. Call startListening(handler) to attach.";
    }
  }
  const latencyMs=performance.now()-t0;
  logCommand({deviceType:DEVICE_TYPE,command:"diagnose",params:{},result:{ok:ok,details:details},mode:mode,succeeded:ok,latencyMs:latencyMs,error:error});
  return{ok:ok,mode:mode,details:details,error:error,latencyMs:Math.round(latencyMs)};
}
