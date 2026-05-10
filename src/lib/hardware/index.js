// LootLedger — hardware drivers barrel export.
// Phase 5.2-A. Single import surface for the rest of the app:
//
//   import {printer,scale,scanner,signature,cashDrawer} from "src/lib/hardware";
//   await printer.diagnose();
//   await scale.connect();
//   scanner.startListening(handler);
//   signature.captureCanvas(canvasRef);
//   await cashDrawer.kick();
//
// Each driver implements the common interface (isAvailable /
// getMode / setMode / diagnose) plus its own device-specific
// commands — see src/lib/hardware/types.js for typedefs.
//
// Hardware mode is per-device, persisted to localStorage with
// keys "hw.mode.{printer|scale|scanner|signature|cashDrawer}".
// Default for new installs: "mock" everywhere. The "Mock all
// hardware" / "Live all hardware" convenience helpers below
// flip all five at once.

import * as printer from "./printer.js";
import * as scale from "./scale.js";
import * as scanner from "./scanner.js";
import * as signature from "./signature.js";
import * as cashDrawer from "./cashDrawer.js";

export {printer,scale,scanner,signature,cashDrawer};
export {logCommand,getRecentLogs} from "./log.js";

export const DEVICES=["printer","scale","scanner","signature","cashDrawer"];

const _byName={printer:printer,scale:scale,scanner:scanner,signature:signature,cashDrawer:cashDrawer};

export function getDriver(name){return _byName[name]||null;}

export function getAllModes(){
  const out={};
  DEVICES.forEach(d=>{out[d]=_byName[d].getMode();});
  return out;
}

export function setAllModes(mode){
  const m=mode==="live"?"live":"mock";
  DEVICES.forEach(d=>{_byName[d].setMode(m);});
}

// Convenience: run diagnose() across every driver. Sequential
// with a small gap to keep log writes / network calls polite.
// Returns array of {device, ...DiagnoseResult}.
export async function diagnoseAll(gapMs){
  const gap=gapMs==null?500:Math.max(0,Number(gapMs));
  const out=[];
  for(let i=0;i<DEVICES.length;i++){
    const d=DEVICES[i];
    const r=await _byName[d].diagnose();
    out.push({device:d,...r});
    if(i<DEVICES.length-1&&gap>0){
      await new Promise(res=>setTimeout(res,gap));
    }
  }
  return out;
}
