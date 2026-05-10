// LootLedger — signature pad driver.
// Phase 5.2-A. Pointer Events API + canvas covers any HID-
// compliant tablet (Wacom, Huion, XP-Pen, Gaomon, generic)
// plus pen-on-touchscreen and mouse fallback. No vendor SDK
// needed.
//
// captureCanvas(canvasEl) attaches the pointerdown / move /
// up listeners and records strokes as { x, y, pressure, t }
// arrays. detach() removes them. normalize(strokes) computes
// bounding box, scales + centers to fit the canvas with 5%
// margin, returns a PNG dataURL of the normalized image.
//
// The fallback "Type your full name" text input is handled
// at the form level (NewTx capture flow), not here.
//
// NOT wired into NewTx in this commit (per 5.2-A scope
// guardrails). The driver is reachable via
// src/lib/hardware/index.js for the /admin/diagnostics
// page only.

import {store} from "../storage.js";
import {logCommand} from "./log.js";

const MODE_KEY="hw.mode.signature";
const DEVICE_TYPE="signature";

let _canvas=null;
let _ctx=null;
let _strokes=[];          // [[{x,y,pressure,t}, ...], [...], ...]
let _current=null;
let _onDown=null,_onMove=null,_onUp=null;

export function getMode(){return store.get(MODE_KEY,"mock")==="live"?"live":"mock";}
export function setMode(m){store.set(MODE_KEY,m==="live"?"live":"mock");}

export async function isAvailable(){
  return typeof window!=="undefined"&&typeof window.PointerEvent!=="undefined";
}

export function captureCanvas(canvasEl){
  if(!canvasEl||typeof canvasEl.getContext!=="function"){
    console.warn("[hardware/signature] captureCanvas needs a real canvas element");
    return;
  }
  _canvas=canvasEl;
  _ctx=canvasEl.getContext("2d");
  _strokes=[];
  _ctx.strokeStyle="#111";
  _ctx.lineWidth=2;
  _ctx.lineCap="round";
  _ctx.lineJoin="round";
  _onDown=(e)=>{
    e.preventDefault();
    const r=_canvas.getBoundingClientRect();
    _current=[];
    const pt={x:e.clientX-r.left,y:e.clientY-r.top,pressure:e.pressure||0.5,t:Date.now()};
    _current.push(pt);
    _ctx.beginPath();_ctx.moveTo(pt.x,pt.y);
  };
  _onMove=(e)=>{
    if(!_current)return;
    e.preventDefault();
    const r=_canvas.getBoundingClientRect();
    const pt={x:e.clientX-r.left,y:e.clientY-r.top,pressure:e.pressure||0.5,t:Date.now()};
    _current.push(pt);
    _ctx.lineTo(pt.x,pt.y);
    _ctx.stroke();
  };
  _onUp=(e)=>{
    if(!_current)return;
    e.preventDefault();
    _strokes.push(_current);
    _current=null;
  };
  _canvas.addEventListener("pointerdown",_onDown);
  _canvas.addEventListener("pointermove",_onMove);
  _canvas.addEventListener("pointerup",_onUp);
  _canvas.addEventListener("pointercancel",_onUp);
  logCommand({deviceType:DEVICE_TYPE,command:"captureCanvas",params:{w:_canvas.width,h:_canvas.height},result:{ok:true},mode:getMode(),succeeded:true,latencyMs:0});
}

export function detach(){
  if(!_canvas)return;
  if(_onDown)_canvas.removeEventListener("pointerdown",_onDown);
  if(_onMove)_canvas.removeEventListener("pointermove",_onMove);
  if(_onUp){_canvas.removeEventListener("pointerup",_onUp);_canvas.removeEventListener("pointercancel",_onUp);}
  _canvas=null;_ctx=null;_strokes=[];_current=null;
  _onDown=null;_onMove=null;_onUp=null;
}

export function clear(){
  _strokes=[];_current=null;
  if(_ctx&&_canvas)_ctx.clearRect(0,0,_canvas.width,_canvas.height);
}

export function getStrokes(){return _strokes;}

// Auto-fit + center: compute bounding box of all strokes,
// scale to fit canvas with 5% margin on each side, translate
// to center. Returns a PNG dataURL of the normalized image.
export function normalize(rawStrokes){
  const t0=performance.now();
  const mode=getMode();
  const strokes=Array.isArray(rawStrokes)?rawStrokes:_strokes;
  if(!_canvas||!_ctx||!strokes.length){
    const result={ok:false,error:"no strokes or no canvas attached"};
    logCommand({deviceType:DEVICE_TYPE,command:"normalize",params:{strokeCount:strokes.length},result:result,mode:mode,succeeded:false,latencyMs:performance.now()-t0,error:result.error});
    return result;
  }
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  strokes.forEach(s=>s.forEach(p=>{
    if(p.x<minX)minX=p.x;if(p.x>maxX)maxX=p.x;
    if(p.y<minY)minY=p.y;if(p.y>maxY)maxY=p.y;
  }));
  const W=_canvas.width,H=_canvas.height;
  const margin=0.05;
  const targetW=W*(1-2*margin),targetH=H*(1-2*margin);
  const bbW=Math.max(1,maxX-minX),bbH=Math.max(1,maxY-minY);
  const scale=Math.min(targetW/bbW,targetH/bbH);
  const offX=(W-bbW*scale)/2-minX*scale;
  const offY=(H-bbH*scale)/2-minY*scale;
  _ctx.clearRect(0,0,W,H);
  _ctx.strokeStyle="#111";_ctx.lineWidth=2;_ctx.lineCap="round";_ctx.lineJoin="round";
  strokes.forEach(s=>{
    if(!s.length)return;
    _ctx.beginPath();
    s.forEach((p,i)=>{
      const x=p.x*scale+offX,y=p.y*scale+offY;
      if(i===0)_ctx.moveTo(x,y);else _ctx.lineTo(x,y);
    });
    _ctx.stroke();
  });
  const dataUrl=_canvas.toDataURL("image/png");
  const latency=performance.now()-t0;
  const result={ok:true,dataUrl:dataUrl,strokeCount:strokes.length};
  logCommand({deviceType:DEVICE_TYPE,command:"normalize",params:{strokeCount:strokes.length},result:{ok:true,dataUrlBytes:dataUrl.length},mode:mode,succeeded:true,latencyMs:latency});
  return result;
}

// 1x1 transparent PNG — placeholder when Mock mode normalize
// fires without an attached canvas.
const PLACEHOLDER_PNG="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export async function diagnose(){
  const mode=getMode();
  const t0=performance.now();
  let ok=false,details="",error;
  if(mode==="mock"){
    await new Promise(r=>setTimeout(r,50+Math.random()*80));
    ok=true;details="Mock signature OK — placeholder PNG dataURL returned.";
  }else if(typeof window==="undefined"||typeof window.PointerEvent==="undefined"){
    ok=false;details="Pointer Events API not supported in this browser.";error="no-pointer-events";
  }else{
    ok=true;
    details=_canvas
      ?"Signature pad attached to canvas "+_canvas.width+"x"+_canvas.height+", "+_strokes.length+" stroke(s) recorded."
      :"Pointer Events API ready. Call captureCanvas(canvasRef) to attach.";
  }
  const latencyMs=performance.now()-t0;
  logCommand({deviceType:DEVICE_TYPE,command:"diagnose",params:{},result:{ok:ok,details:details},mode:mode,succeeded:ok,latencyMs:latencyMs,error:error});
  return{ok:ok,mode:mode,details:details,error:error,latencyMs:Math.round(latencyMs),placeholder:mode==="mock"?PLACEHOLDER_PNG:null};
}
