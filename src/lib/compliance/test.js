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

// Stage 1.C TTR plumbing (2026-05-06) — stub helpers for parity
// with au.js's new exports. Same shapes; absurd thresholds.
export function cashAmountFromTx(tx){
  if(!tx)return 0;
  if(Array.isArray(tx.payments))return tx.payments.filter(p=>p&&p.method==="cash").reduce((s,p)=>s+(+p.amount||0),0);
  return tx.payment==="cash"?(+tx.buyTotal||+tx.total||0):0;
}
export function isTtrRequired({currentCashAmount,priorCashIn24h,ttrEnabled}){
  const cur=+currentCashAmount||0,prior=+priorCashIn24h||0;
  return{required:(ttrEnabled!==false)&&cur>0&&(cur+prior)>=THRESH.CASH_TTR,eventCash:cur+prior,priorCashIn24h:prior,currentCashAmount:cur};
}
// Fake structuring — mirrors au.js evaluateStructuring shape with
// the same thresholds and message format. Phase 2 step 3b region-
// parity rule: TEST exports match AU exports so swapping regions
// at runtime doesn't surface a `cannot read property of undefined`
// at any call site.
export function evaluateStructuring({currentCashAmount,priorCash30d,threshold}={}){
  const cur=+currentCashAmount||0,prior=+priorCash30d||0;
  const total=cur+prior;
  const t=+threshold||THRESH.CASH_TTR;
  let level="ok";
  if(total>=t)level="block";
  else if(total>=t*0.8)level="warn";
  return{level,total,pct:t>0?(total/t)*100:0,threshold:t,priorCash30d:prior,currentCashAmount:cur,message:level==="ok"?null:"TEST region structuring "+level+" — total $"+total};
}
// Section 9 C3 region-parity stubs. Same shape as au.js so a TEST-
// region swap doesn't expose `undefined` to call sites.
export function businessDaysSince(dateISO){
  if(!dateISO)return 0;
  const start=new Date(dateISO),end=new Date();
  if(isNaN(start.getTime())||start>=end)return 0;
  let days=0;
  const cursor=new Date(start);
  while(cursor<end){cursor.setDate(cursor.getDate()+1);const d=cursor.getDay();if(d!==0&&d!==6)days++;}
  return days;
}
export function calendarDaysBetween(fromISO,toISO){
  if(!fromISO||!toISO)return null;
  const a=new Date(fromISO),b=new Date(toISO);
  if(isNaN(a.getTime())||isNaN(b.getTime()))return null;
  return Math.round((b.getTime()-a.getTime())/(24*3600*1000));
}
export function policeHoldState(item){
  if(!item||!item.policeHold)return{status:"none",daysRemaining:null,expiryDate:null};
  return{status:"active-legacy",daysRemaining:null,expiryDate:null};
}

// Fake required-fields list. Phase 2.7 follow-up (2026-04-29)
// honours settings.requireIdOnEveryTx for parity with the real
// regions; everything else stays empty (TEST region has no
// threshold-driven KYC fields). Default ON, same as au.js.
export function getRequiredFields(_tx,settings){
  const requireIdEveryTx=settings==null||settings.requireIdOnEveryTx!==false;
  return requireIdEveryTx?["fullName","idType","idNumber"]:[];
}

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
  THRESH,
  STATE_INFO,
  PRIVACY_NOTICE,
  checkCompliance,
  cashAmountFromTx,
  isTtrRequired,
  evaluateStructuring,
  businessDaysSince,
  calendarDaysBetween,
  policeHoldState,
  getRequiredFields,
  calcUnitPrice,
  calcMeltFn,
  makeReceiptFn,
  makeTxt,
  genPoliceReport,
};

export default region;
