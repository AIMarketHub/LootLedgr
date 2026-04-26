// LootLedger — regional compliance registry.
//
// Adding a new region is a drop-in: place a new module beside this
// file (e.g. cn.js, eu.js, us.js — briefing Section 6.3), add it
// to REGIONS below, and the rest of the app does not change.
//
// Currently AU is the only built region. The named re-exports
// below preserve the existing call-site syntax in App.tsx so
// Phase 2 step 3a is a clean mechanical extraction. When a real
// second region ships, region-aware call sites switch to:
//
//   import { loadRegion } from "./lib/compliance";
//   const region = loadRegion(settings.region);
//   region.checkCompliance(...);

import au from "./au.js";

const REGIONS={AU:au};

export function loadRegion(code){
  return REGIONS[code]||REGIONS.AU;
}

// Backward-compat named re-exports (currently always the AU module).
export {THRESH,STATE_INFO,PRIVACY_NOTICE,checkCompliance,calcUnitPrice,calcMeltFn,makeReceiptFn,makeTxt,genPoliceReport} from "./au.js";
