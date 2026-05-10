// LootLedger — cash drawer driver.
// Phase 5.2-A. Most cash drawers in the wild plug into the
// receipt printer's RJ-11 jack and fire on the standard
// ESC/POS kicker command. This driver delegates to the
// printer driver's openCashDrawer() so the kicker bytes
// flow through the same connection.
//
// If no printer is configured, kick() returns
// { ok: false, reason: "no printer to kick through" } —
// the dealer can still operate manually with the physical
// key. Standalone serial-attached drawers are a future
// enhancement (rare in jewelry shops).
//
// NOT wired into the buy flow in this commit (per 5.2-A
// scope guardrails). The driver is reachable via
// src/lib/hardware/index.js for the /admin/diagnostics
// page only.

import {store} from "../storage.js";
import {logCommand} from "./log.js";
import * as printer from "./printer.js";

const MODE_KEY="hw.mode.cashDrawer";
const DEVICE_TYPE="cashDrawer";

export function getMode(){return store.get(MODE_KEY,"mock")==="live"?"live":"mock";}
export function setMode(m){store.set(MODE_KEY,m==="live"?"live":"mock");}

export async function isAvailable(){
  if(getMode()==="mock")return true;
  // Available iff the printer driver can fire kicker bytes.
  return printer.isAvailable();
}

export async function kick(){
  const mode=getMode();
  const t0=performance.now();
  let result;
  if(mode==="mock"){
    await new Promise(r=>setTimeout(r,30+Math.random()*60));
    result={ok:true,path:"mock"};
  }else{
    const printerAvailable=await printer.isAvailable();
    if(!printerAvailable){
      result={ok:false,reason:"no printer to kick through",path:"none"};
    }else{
      // Fire through the printer driver's kicker pathway.
      const r=await printer.openCashDrawer();
      result={ok:!!r.ok,path:"printer-pass-through",error:r.error};
    }
  }
  const latency=performance.now()-t0;
  logCommand({deviceType:DEVICE_TYPE,command:"kick",params:{},result:result,mode:mode,succeeded:!!result.ok,latencyMs:latency,error:result&&result.error});
  return result;
}

export async function diagnose(){
  const mode=getMode();
  const t0=performance.now();
  let ok=false,details="",error;
  if(mode==="mock"){
    await new Promise(r=>setTimeout(r,40+Math.random()*60));
    ok=true;details="Mock cash drawer OK — kick attempted (mocked).";
  }else{
    const printerAvailable=await printer.isAvailable();
    if(printerAvailable){
      ok=true;details="Cash drawer kick available via printer pass-through.";
    }else{
      ok=false;
      details="No printer configured — cannot fire kicker bytes. Configure printer in Settings, or operate the drawer manually with the physical key.";
      error="no-printer";
    }
  }
  const latencyMs=performance.now()-t0;
  logCommand({deviceType:DEVICE_TYPE,command:"diagnose",params:{},result:{ok:ok,details:details},mode:mode,succeeded:ok,latencyMs:latencyMs,error:error});
  return{ok:ok,mode:mode,details:details,error:error,latencyMs:Math.round(latencyMs)};
}
