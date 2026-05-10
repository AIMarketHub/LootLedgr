// LootLedger — receipt printer driver.
// Phase 5.2-A. Targets Zebra ZD411 (network IP, port 9100,
// ESC/POS) as the primary path; generic ESC/POS thermal
// printers and Star Micronics use the same protocol family.
// Bluetooth + USB paths are stubbed (return graceful errors)
// — the spec expects real implementations but those need
// hardware to validate; full wiring lands in a later commit.
// window.print() is the ultimate A4 fallback so the dealer
// can always get a receipt onto paper somehow.
//
// NOT wired into Receipt or any transaction flow in this
// commit (per 5.2-A scope guardrails). The driver is
// reachable via src/lib/hardware/index.js for the
// /admin/diagnostics page only.

import {store} from "../storage.js";
import {logCommand} from "./log.js";

const MODE_KEY="hw.mode.printer";
const DEVICE_TYPE="printer";

let _settings={};
export function setSettings(s){_settings=s||{};}

export function getMode(){return store.get(MODE_KEY,"mock")==="live"?"live":"mock";}
export function setMode(m){store.set(MODE_KEY,m==="live"?"live":"mock");}

export async function isAvailable(){
  if(getMode()==="mock")return true;
  if(_settings.printerNetworkIP)return true;
  if(typeof navigator!=="undefined"&&(navigator.bluetooth||navigator.usb))return true;
  return typeof window!=="undefined"&&typeof window.print==="function";
}

// ESC/POS encoder — basic text + cut. Enough for plain-text
// receipts; logos, barcodes, alternate fonts can land in a
// later commit when the driver is wired into Receipt.
const ESC=0x1B,GS=0x1D;
function _esc(){return new Uint8Array(arguments);}
function _join(parts){
  let total=0;parts.forEach(p=>{total+=p.length;});
  const out=new Uint8Array(total);let off=0;
  parts.forEach(p=>{out.set(p,off);off+=p.length;});
  return out;
}
function _text(s){return new TextEncoder().encode(String(s||""));}
function _renderEscPos(content){
  const init=_esc(ESC,0x40);
  const align_center=_esc(ESC,0x61,1);
  const align_left=_esc(ESC,0x61,0);
  const bold_on=_esc(ESC,0x45,1);
  const bold_off=_esc(ESC,0x45,0);
  const cut=_esc(GS,0x56,0x42,0x00);  // GS V B 0 — full cut
  const nl=_text("\n");
  const parts=[init,align_center,bold_on];
  const h=(content&&content.header)||{};
  if(h.shopName)parts.push(_text(h.shopName),nl);
  parts.push(bold_off);
  if(h.address)parts.push(_text(h.address),nl);
  if(h.phone)parts.push(_text(h.phone),nl);
  if(h.abn)parts.push(_text("ABN "+h.abn),nl);
  parts.push(nl,align_left);
  const tx=(content&&content.transaction)||{};
  if(tx.id)parts.push(_text("Receipt #: "+tx.id),nl);
  if(tx.date)parts.push(_text("Date: "+tx.date),nl);
  if(tx.vendor)parts.push(_text("Vendor: "+tx.vendor),nl);
  parts.push(nl);
  const items=Array.isArray(tx.lineItems)?tx.lineItems:[];
  items.forEach(li=>{
    const desc=String((li&&li.description)||(li&&li.name)||"");
    const amt=(li&&li.amount!=null)?Number(li.amount).toFixed(2):"";
    parts.push(_text(desc+(amt?(" "+amt):"")),nl);
  });
  parts.push(nl,bold_on);
  if(tx.total!=null)parts.push(_text("TOTAL: $"+Number(tx.total).toFixed(2)),nl);
  parts.push(bold_off,nl);
  const f=(content&&content.footer)||{};
  if(f.taxNote)parts.push(_text(f.taxNote),nl);
  if(f.customMessage)parts.push(nl,_text(f.customMessage),nl);
  parts.push(nl,nl,nl,cut);
  return _join(parts);
}

async function _livePrint(content){
  const ip=_settings.printerNetworkIP;
  if(ip){
    const port=Number(_settings.printerPort)||9100;
    const url=_settings.printerProxyUrl||("http://"+ip+":"+port);
    try{
      const bytes=_renderEscPos(content);
      const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:bytes});
      if(r.ok)return{ok:true,path:"network",bytesSent:bytes.length};
      return{ok:false,path:"network",error:"print server "+r.status};
    }catch(e){return{ok:false,path:"network",error:(e&&e.message)||"network print failed"};}
  }
  if(typeof navigator!=="undefined"&&navigator.bluetooth){
    return{ok:false,path:"bluetooth-stub",error:"Bluetooth printer driver not yet wired. Configure printerNetworkIP in Settings or use the browser-print fallback."};
  }
  if(typeof navigator!=="undefined"&&navigator.usb){
    return{ok:false,path:"usb-stub",error:"USB printer driver not yet wired. Configure printerNetworkIP in Settings or use the browser-print fallback."};
  }
  try{
    if(typeof window!=="undefined"&&window.print){
      window.print();
      return{ok:true,path:"browser-print"};
    }
  }catch(e){}
  return{ok:false,path:"none",error:"no printer available"};
}

async function _mockPrint(content){
  await new Promise(r=>setTimeout(r,90+Math.random()*120));
  const lines=[];
  const h=(content&&content.header)||{};
  if(h.shopName)lines.push("=== "+h.shopName+" ===");
  if(h.address)lines.push(h.address);
  if(h.abn)lines.push("ABN "+h.abn);
  const tx=(content&&content.transaction)||{};
  if(tx.id)lines.push("Receipt #"+tx.id);
  if(tx.total!=null)lines.push("TOTAL: $"+Number(tx.total).toFixed(2));
  return{ok:true,path:"mock",mockedReceipt:lines.join("\n")};
}

export async function print(content){
  const mode=getMode();
  const t0=performance.now();
  let result;
  try{result=mode==="live"?await _livePrint(content):await _mockPrint(content);}
  catch(e){result={ok:false,error:(e&&e.message)||"print threw"};}
  const latency=performance.now()-t0;
  const lineCount=(content&&content.transaction&&content.transaction.lineItems||[]).length;
  logCommand({deviceType:DEVICE_TYPE,command:"print",params:{lineCount:lineCount},result:result,mode:mode,succeeded:!!result.ok,latencyMs:latency,error:result&&result.error});
  return result;
}

// ESC/POS cash-drawer kicker via the receipt printer (the
// most common cash-drawer wiring — drawer plugs into the
// printer's RJ-11 jack). Standard "fire pin 2, 25ms pulse,
// 250ms hold" command.
export async function openCashDrawer(){
  const mode=getMode();
  const t0=performance.now();
  let result;
  if(mode==="mock"){
    await new Promise(r=>setTimeout(r,30+Math.random()*70));
    result={ok:true,path:"mock"};
  }else{
    const ip=_settings.printerNetworkIP;
    if(!ip){
      result={ok:false,error:"no printer to kick through (configure printerNetworkIP in Settings)"};
    }else{
      try{
        const port=Number(_settings.printerPort)||9100;
        const url=_settings.printerProxyUrl||("http://"+ip+":"+port);
        const bytes=new Uint8Array([0x1B,0x70,0x00,0x19,0xFA]);
        const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:bytes});
        result=r.ok?{ok:true,path:"esc-pos-kicker"}:{ok:false,error:"kicker "+r.status};
      }catch(e){result={ok:false,error:(e&&e.message)||"kick failed"};}
    }
  }
  const latency=performance.now()-t0;
  logCommand({deviceType:DEVICE_TYPE,command:"openCashDrawer",params:{},result:result,mode:mode,succeeded:!!result.ok,latencyMs:latency,error:result&&result.error});
  return result;
}

export async function diagnose(){
  const mode=getMode();
  const t0=performance.now();
  let ok=false,details="",error;
  if(mode==="mock"){
    await new Promise(r=>setTimeout(r,80+Math.random()*100));
    ok=true;details="Mock printer OK — simulated ESC/POS render.";
  }else{
    const ip=_settings.printerNetworkIP;
    if(ip){
      const port=Number(_settings.printerPort)||9100;
      ok=true;details="Configured: network IP "+ip+":"+port+" (no probe call yet — driver wires into Receipt in a later 5.2 commit).";
    }else{
      ok=false;
      details="No printer network IP configured. Open Settings and set printerNetworkIP, OR rely on the window.print() A4 fallback.";
      error="not-configured";
    }
  }
  const latencyMs=performance.now()-t0;
  logCommand({deviceType:DEVICE_TYPE,command:"diagnose",params:{},result:{ok:ok,details:details},mode:mode,succeeded:ok,latencyMs:latencyMs,error:error});
  return{ok:ok,mode:mode,details:details,error:error,latencyMs:Math.round(latencyMs)};
}
