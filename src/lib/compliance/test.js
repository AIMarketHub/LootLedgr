// LootLedger — TEST region stub.
//
// Phase 2 step 3b verification artefact. Exists to prove the
// regional compliance registry plumbing works: with this file in
// place and `__loot.setRegion("TEST")` set in DevTools followed by
// a page refresh, the app's call sites (which import named values
// from src/lib/compliance/index.js) automatically pick up these
// obviously-fake values without any other code change.
//
// NOT FOR PRODUCTION USE. Every value below is intentionally
// nonsensical so any leak of this region into a real workflow is
// immediately obvious.

// Fake thresholds — every cash transaction trips at the first dollar.
export const THRESH={CASH_WARN:1,BULLION_CDD:2,CASH_TTR:3,HOLD_HOURS:1};

// Fake state metadata — single fake jurisdiction.
export const STATE_INFO={
  TEST:{name:"Test Jurisdiction",act:"FAKE Act 1900 (TEST)",hold:"1 hour",freq:"Never (test region)",defaultEmail:"",note:"TEST REGION — not for production submission."},
};

// Fake privacy notice.
export const PRIVACY_NOTICE=(biz,abn)=>"TEST PRIVACY NOTICE — for region-swap verification only. Not a real privacy notice. Business: "+(biz||"")+" ABN: "+(abn||"")+".";

// Fake compliance check — fires obvious flags so leaks are visible.
export function checkCompliance(items,payment){
  const total=(items||[]).filter(i=>i&&i.mode==="buy").reduce((s,i)=>s+(+i.price||0),0);
  const flags=[{level:"info",key:"id",msg:"🪪 [TEST REGION] All transactions get this info flag."}];
  if(total>=THRESH.CASH_WARN)flags.push({level:"warn",key:"cash_warn",msg:"⚠️ [TEST REGION] Cash $"+total.toFixed(2)+" — fake warn threshold $"+THRESH.CASH_WARN+"."});
  if(total>=THRESH.CASH_TTR)flags.push({level:"block",key:"ttr",msg:"🔴 [TEST REGION] Cash $"+total.toFixed(2)+" — fake block threshold $"+THRESH.CASH_TTR+"."});
  return{flags,total,bullionCash:0,anyCash:total,requiresKYC:total>=THRESH.BULLION_CDD};
}

// Fake required-fields list — always empty (no conditional fields
// in the TEST region). Real region hooks in 2.7.9 NewTx step 3.
export function getRequiredFields(){return[];}

// Fake unit price — always $1.
export function calcUnitPrice(){return 1;}

// Fake melt value — always 0.
export function calcMeltFn(){return 0;}

// Fake receipt.
export function makeReceiptFn(tx){return"=== TEST REGION RECEIPT ===\nINVOICE: "+((tx&&tx.id)||"-")+"\nTHIS IS A TEST REGION RENDER. NOT FOR PRODUCTION.";}

// Fake transaction text record.
export function makeTxt(tx){return"TEST REGION RECORD\nInvoice: "+((tx&&tx.id)||"-")+"\n(Test region active — values are placeholders)";}

// Fake police report CSV.
export function genPoliceReport(){return"\"TEST REGION POLICE REPORT\"\n\"This is a test region. Do not submit.\"";}

// Region contract object (briefing Section 6.4 shape, fake values).
const region={
  code:"TEST",
  name:"Test Region (DEV ONLY)",
  currency:"TST",
  currencySymbol:"⚠",
  thresholds:{
    cashWarn:THRESH.CASH_WARN,
    bullionCDD:THRESH.BULLION_CDD,
    cashTTR:THRESH.CASH_TTR,
  },
  holdPeriodHours:THRESH.HOLD_HOURS,
  STATE_INFO,
  PRIVACY_NOTICE,
  checkCompliance,
  getRequiredFields,
  calcUnitPrice,
  calcMeltFn,
  makeReceiptFn,
  makeTxt,
  genPoliceReport,
};

export default region;
