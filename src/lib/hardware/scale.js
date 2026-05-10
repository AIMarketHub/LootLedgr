// LootLedger — scale driver.
// Phase 5.2-A. Refactored from the inline connectScale /
// disconnectScale logic that previously lived at App.tsx:687-703.
// Behaviour preserved: same Web Bluetooth requestDevice call,
// same protocol fall-through (Standard BLE → Nordic UART), same
// pop() messages, same gattserverdisconnected handling.
//
// App.tsx still owns the React state for scaleStatus / scaleDevice
// / scaleLive (cross-component access via props). The driver
// notifies App.tsx via handlers registered through setHandlers().
//
// Per-device Live/Mock toggle (Adjustment 18 from v3.2). Mock
// connect produces a fake "Mock BLE Scale" device and emits a
// 25.30g sample reading so the rest of the buy flow can be
// exercised without hardware.

import {SCALE_STD_SVC,SCALE_STD_CHAR,NUS_SVC,NUS_TX} from "../constants.js";
import {parseStdWeight,parseAsciiWeight} from "../utils.js";
import {store} from "../storage.js";
import {logCommand} from "./log.js";

const MODE_KEY="hw.mode.scale";
const DEVICE_TYPE="scale";

// Module-level state — the actual BluetoothDevice instance and the
// last-seen status / live reading. Mirrored into React state in
// App.tsx via the registered handlers.
let _device=null;
let _status="off";  // "off" | "connecting" | "connected" | "error"
let _live=null;
let _settings={};
let _onStatus=null;
let _onDevice=null;
let _onLive=null;
let _popHandler=null;

export function getMode(){return store.get(MODE_KEY,"mock")==="live"?"live":"mock";}
export function setMode(m){store.set(MODE_KEY,m==="live"?"live":"mock");}

export function setSettings(s){_settings=s||{};}
export function setHandlers(h){
  if(!h||typeof h!=="object")return;
  if(typeof h.onStatus==="function")_onStatus=h.onStatus;
  if(typeof h.onDevice==="function")_onDevice=h.onDevice;
  if(typeof h.onLive==="function")_onLive=h.onLive;
  if(typeof h.pop==="function")_popHandler=h.pop;
}

function _setStatus(s){_status=s;if(_onStatus)try{_onStatus(s);}catch(e){}}
function _setDevice(d){_device=d;if(_onDevice)try{_onDevice(d);}catch(e){}}
function _setLive(r){_live=r;if(_onLive)try{_onLive(r);}catch(e){}}
function _notify(msg,kind){if(_popHandler)try{_popHandler(msg,kind);}catch(e){}}

export function getStatus(){return _status;}
export function getDevice(){return _device;}
export function getLive(){return _live;}

export async function isAvailable(){
  if(getMode()==="mock")return true;
  return!!(typeof navigator!=="undefined"&&navigator.bluetooth);
}

async function _liveConnect(){
  if(!navigator.bluetooth){
    _notify("Web Bluetooth not supported. Use Chrome or Edge on Android.","err");
    return{ok:false,error:"no-bluetooth"};
  }
  const proto=_settings.scaleProtocol||"auto";
  const optServices=[];
  if(proto==="auto"||proto==="standard")optServices.push(SCALE_STD_SVC);
  if(proto==="auto"||proto==="nordic_uart")optServices.push(NUS_SVC);
  if(proto==="custom"&&_settings.scaleCustomServiceUUID){
    optServices.push(String(_settings.scaleCustomServiceUUID).toLowerCase());
  }
  try{
    _setStatus("connecting");_notify("Opening Bluetooth scanner…","ok");
    const device=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:optServices});
    _setDevice(device);
    const server=await device.gatt.connect();
    let connected=false;
    if(proto==="auto"||proto==="standard"){
      try{
        const svc=await server.getPrimaryService(SCALE_STD_SVC);
        const ch=await svc.getCharacteristic(SCALE_STD_CHAR);
        await ch.startNotifications();
        ch.addEventListener("characteristicvaluechanged",e=>{
          const r=parseStdWeight(e.target.value);
          if(r)_setLive(r);
        });
        connected=true;
        _setStatus("connected");
        _notify("Scale connected (Standard BLE).","ok");
      }catch(e){/* fall through to Nordic UART */}
    }
    if((proto==="auto"||proto==="nordic_uart")&&!connected){
      try{
        const svc=await server.getPrimaryService(NUS_SVC);
        const tx=await svc.getCharacteristic(NUS_TX);
        await tx.startNotifications();
        let buf="";
        tx.addEventListener("characteristicvaluechanged",e=>{
          buf+=new TextDecoder().decode(e.target.value);
          if(buf.length>30){
            const r=parseAsciiWeight(buf);
            if(r)_setLive(r);
            buf="";
          }
        });
        connected=true;
        _setStatus("connected");
        _notify("Scale connected (Nordic UART).","ok");
      }catch(e){/* fall through */}
    }
    if(!connected){
      _setStatus("error");
      _notify("Connected but no scale service found. Try a different Protocol in Settings.","warn");
      return{ok:false,error:"no-service"};
    }
    device.addEventListener("gattserverdisconnected",()=>{
      _setStatus("off");_setLive(null);_setDevice(null);
    });
    return{ok:true,device:device.name||device.id||"connected"};
  }catch(e){
    _setStatus("off");
    if(e&&e.name!=="NotFoundError"){
      _notify("Scale: "+(e&&e.message||"unknown error"),"err");
    }
    return{ok:false,error:(e&&e.message)||"connect failed"};
  }
}

async function _mockConnect(){
  await new Promise(r=>setTimeout(r,80+Math.random()*120));
  const fakeDev={name:"Mock BLE Scale"};
  _setDevice(fakeDev);
  _setStatus("connected");
  _setLive({g:25.30,raw:"25.30 g (mock)",stable:true});
  _notify("Scale connected (Mock).","ok");
  return{ok:true,device:fakeDev.name};
}

export async function connect(){
  const mode=getMode();
  const t0=performance.now();
  let result;
  try{
    result=mode==="live"?await _liveConnect():await _mockConnect();
  }catch(e){result={ok:false,error:(e&&e.message)||"connect threw"};}
  const latency=performance.now()-t0;
  logCommand({deviceType:DEVICE_TYPE,command:"connect",params:{protocol:_settings.scaleProtocol||"auto"},result:result,mode:mode,succeeded:!!result.ok,latencyMs:latency,error:result&&result.error});
  return result;
}

export function disconnect(){
  const mode=getMode();
  const t0=performance.now();
  if(mode==="live"&&_device&&_device.gatt&&_device.gatt.connected){
    try{_device.gatt.disconnect();}catch(e){}
  }
  _setStatus("off");
  _setDevice(null);
  _setLive(null);
  const latency=performance.now()-t0;
  logCommand({deviceType:DEVICE_TYPE,command:"disconnect",params:{},result:{ok:true},mode:mode,succeeded:true,latencyMs:latency});
}

export async function read(){
  const mode=getMode();
  const t0=performance.now();
  let result;
  if(mode==="mock"){
    await new Promise(r=>setTimeout(r,40+Math.random()*80));
    const w=Math.round((1+Math.random()*99.9)*100)/100;
    result={weight:w,unit:"g",stable:true,raw:w+" g (mock)"};
  }else if(_status!=="connected"){
    result={ok:false,error:"scale not connected"};
  }else if(!_live){
    result={ok:false,error:"no reading available yet"};
  }else{
    result={weight:_live.g,unit:"g",stable:!!_live.stable,raw:_live.raw||""};
  }
  const latency=performance.now()-t0;
  logCommand({deviceType:DEVICE_TYPE,command:"read",params:{},result:result,mode:mode,succeeded:!!(result&&result.weight!=null),latencyMs:latency,error:result&&result.error});
  return result;
}

export async function diagnose(){
  const mode=getMode();
  const t0=performance.now();
  let ok=false,details="",error;
  if(mode==="mock"){
    await new Promise(r=>setTimeout(r,60+Math.random()*100));
    ok=true;details="Mock scale OK — simulated 25.30g reading.";
  }else if(!navigator.bluetooth){
    ok=false;details="Web Bluetooth not supported in this browser.";error="no-bluetooth";
  }else if(_status==="connected"){
    ok=true;details="Scale connected: "+((_device&&_device.name)||"BLE device");
  }else{
    ok=false;details="Scale not connected. Open Settings → Bluetooth Scale and connect.";error="not-connected";
  }
  const latencyMs=performance.now()-t0;
  logCommand({deviceType:DEVICE_TYPE,command:"diagnose",params:{},result:{ok:ok,details:details},mode:mode,succeeded:ok,latencyMs:latencyMs,error:error});
  return{ok:ok,mode:mode,details:details,error:error,latencyMs:Math.round(latencyMs)};
}
