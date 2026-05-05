// LootLedger — regional compliance registry.
//
// Adding a new region is a drop-in: place a new module beside this
// file (e.g. cn.js, eu.js, us.js — briefing Section 6.3), import
// it, add it to REGIONS, and the rest of the app does not change.
//
// At Phase 2 step 3b: AU is the production region; TEST is a
// dev-only stub used to verify the registry plumbing works.
//
// Active region is read from localStorage["gf_region"] at module
// load. Default is AU. To swap regions for verification:
//
//   1. DevTools console: __loot.setRegion("TEST")
//   2. Refresh the page.
//   3. Module re-imports, named exports re-bind to the new region.
//   4. To return: __loot.setRegion("AU") + refresh.
//
// The window.__loot helper is dev-only — Vite strips it from
// production builds because import.meta.env.DEV is false there.
// When a real second non-test region ships, region-aware call
// sites should switch to using loadRegion(code) explicitly rather
// than relying on the load-time binding.

import au from "./au.js";
import test from "./test.js";

const REGIONS={AU:au,TEST:test};

const _stored=(typeof localStorage!=="undefined"&&localStorage.getItem("gf_region"))||"AU";
const _active=REGIONS[_stored]||REGIONS.AU;

export function loadRegion(code){
  return REGIONS[code]||REGIONS.AU;
}

// Named exports bound to the currently-active region at module
// load. Call sites in App.tsx import from this module and get
// whichever region was selected.
export const THRESH=_active.THRESH;
export const STATE_INFO=_active.STATE_INFO;
export const PRIVACY_NOTICE=_active.PRIVACY_NOTICE;
export const checkCompliance=_active.checkCompliance;
export const cashAmountFromTx=_active.cashAmountFromTx;
export const isTtrRequired=_active.isTtrRequired;
export const getRequiredFields=_active.getRequiredFields;
export const calcUnitPrice=_active.calcUnitPrice;
export const calcMeltFn=_active.calcMeltFn;
export const makeReceiptFn=_active.makeReceiptFn;
export const makeTxt=_active.makeTxt;
export const genPoliceReport=_active.genPoliceReport;

// Dev-only console swap path. Vite strips this from production.
if(import.meta.env.DEV&&typeof window!=="undefined"){
  window.__loot=window.__loot||{};
  window.__loot.setRegion=(code)=>{
    if(!REGIONS[code]){
      console.warn("[loot] unknown region:",code,"— available:",Object.keys(REGIONS));
      return;
    }
    try{localStorage.setItem("gf_region",code);}catch(e){console.warn("[loot] localStorage write failed:",e);return;}
    console.log("[loot] region set to",code,"— refresh the page to apply.");
  };
  window.__loot.activeRegion=()=>({code:_active.code,name:_active.name});
  window.__loot.regions=()=>Object.keys(REGIONS);
  window.__loot.loadRegion=loadRegion;
}
