// LootLedger — Australia regional compliance module.
// Mechanically extracted from src/App.tsx + src/lib/constants.js
// during Phase 2 step 3a. No semantic changes; values and function
// bodies preserved exactly as they were in App.tsx.
//
// This module conforms to the contract documented in ./types.js
// (briefing Section 6.4). It is registered in ./index.js, which is
// the import entry point for the rest of the app.
//
// === COMPLIANCE VERIFICATION SUMMARY (briefing §9, Phase 2 step 3c) ===
// Verification pass completed 2026-04-28 against App.tsx + this module.
//
//  Gap 1 — Rolling 30-day structuring detection: MISSING
//          checkCompliance evaluates single transactions; no history
//          lookup. Deferred — needs schema decision (vendor match by
//          name+phone vs Phase 2.7 client_id) and threshold config
//          (legal docs prescribe 80% / 100% of TTR). See TODO in
//          checkCompliance below.
//
//  Gap 2 — Linked-transaction detection: MISSING
//          No same-day same-client banner. Deferred — same-shape work
//          as Gap 1 (history-aware lookup at client step). See TODO in
//          checkCompliance below.
//
//  Gap 3 — Enhanced CDD at $10k cash: PARTIALLY PRESENT → fixed in
//          step 3c. App.tsx:749 has sourceOfFunds gated on TTR flag;
//          sourceOfWealth field added in step 3c (briefing DOC2 §2.6).
//
//  Gap 4 — Per-item storage location: PARTIALLY PRESENT → fixed in
//          step 3c. Captured at App.tsx:877 (required at staff step),
//          flows to stock records (App.tsx:381). Storage column added
//          to genPoliceReport CSV in step 3c (briefing §21A: police
//          must locate items on demand).
//
//  Gap 5 — Tipping-off audit (SMR confidentiality): PRESENT.
//          See dedicated audit block below.
//
//  Gap 6 — Override audit trail: MISSING. PIN modal at App.tsx:367
//          accepts and proceeds with no log entry. Deferred — full
//          implementation requires Phase 3 (per-user identity);
//          briefing §9 explicitly says "data structure should be in
//          place from Phase 2" but no schema decision yet. See TODO
//          in checkCompliance below.
//
//  Gap 7 — TTR day-7 / day-9 reminder alerts: PARTIALLY PRESENT.
//          App.tsx:625 has a static "TTR pending" banner with count;
//          no day-based escalation. Deferred — small dashboard tweak,
//          will land alongside the dashboard extraction (Phase 2 later
//          step). See TODO in App.tsx near the existing banner.
//
//  Gap 8 — Police notice 21-day countdown: PARTIALLY PRESENT.
//          policeHold is a binary boolean (App.tsx:487); no
//          noticeDate, no expiryDate, no day-18 alert. Deferred —
//          new fields + modal + countdown UI is a self-contained
//          feature, lands as a follow-up commit after Phase 2 modular
//          split completes. See TODO in App.tsx near togglePoliceHold.
//
//  Gap 9 — Retention semantics (7-year photos): PRESENT.
//          App.tsx:380/381 set deleteAfter via sevenYrsFrom; purge at
//          App.tsx:488 uses isExpired7yr; photos linked through
//          photoKey are deleted alongside the transaction. No 3-month
//          deletion logic anywhere — the wrong founding rule did not
//          regress.
//
// === TIPPING-OFF AUDIT (briefing §9 Gap 5, last verified 2026-04-28) ===
// Walked every code path that produces customer-visible output.
// Confirmed clean of SMR / TTR / flag references in:
//   - makeReceiptFn (this file): no SMR/TTR/flag fields written.
//   - sendSquareSell (App.tsx:387):  line items only; no compliance fields.
//   - sendSquareBuy  (App.tsx:392):  vendor note + metadata; no SMR.
//   - sendShopifySell (App.tsx:404): tags="loot-ledgr-sale"; no SMR.
//   - sendShopifyBuy  (App.tsx:408): tags="vendor-purchase,loot-ledgr"; no SMR.
//   - Generic webhookUrl push (App.tsx:481): event/invoice/items/total/
//     payment/net only — no SMR, ttrRequired, ttrStatus, or flags.
//   - Xero: no per-transaction push exists yet (test connection only at
//     App.tsx:1348). Re-audit when Xero send is implemented.
// Intentionally INCLUDE SMR (staff / police only, not customer):
//   - makeTxt (this file): full record; .txt download is the staff/
//     backup artefact, never handed to a customer.
//   - genPoliceReport (this file): SMR column — police are entitled.
//   - Accounting export "COMPLIANCE LOG" sheet (App.tsx:469): owner-
//     only export, never reaches customer.
// Re-run this audit before any new external-integration code lands.

import {sN,sS,fmt2,fmtAUD,fmtDate} from "../utils.js";
import {TROY_OZ,GOLD_P,SILV_P} from "../constants.js";

// Compliance thresholds (AUD).
export const THRESH={CASH_WARN:2000,BULLION_CDD:5000,CASH_TTR:10000,HOLD_HOURS:168};

// Australian state/territory metadata for the police report generator.
// Each entry: governing act, hold period, submission cadence, default
// email, and submission note shown in the police-report modal.
export const STATE_INFO={
  VIC:{name:"Victoria",act:"Second-Hand Dealers and Pawnbrokers Act 1989 (Vic)",hold:"7 days",freq:"Weekly (within 3 working days)",defaultEmail:"",note:"Submit to your local Victoria Police station by email."},
  NSW:{name:"New South Wales",act:"Pawnbrokers and Second-hand Dealers Act 1996 (NSW)",hold:"14 days",freq:"Within 3 working days",defaultEmail:"#PBU@police.nsw.gov.au",note:"Submit via NSW Police Weblink or email #PBU@police.nsw.gov.au"},
  QLD:{name:"Queensland",act:"Second-hand Dealers and Pawnbrokers Act 2003 (Qld)",hold:"Check local conditions",freq:"Regular forwarding to SPIRS",defaultEmail:"SPIRS.Admin@police.qld.gov.au",note:"Forward CSV to SPIRS (Stolen Property ID & Recovery System)."},
  SA:{name:"South Australia",act:"Second-hand Dealers and Pawnbrokers Act 1996 (SA)",hold:"10 days (3 if full buyer details)",freq:"Keep on premises — available for inspection",defaultEmail:"sapol.leb@police.sa.gov.au",note:"Keep records on premises. Email SAPOL Licensing Enforcement Branch."},
  WA:{name:"Western Australia",act:"Second-hand Dealers and Pawnbrokers Act 1994 (WA)",hold:"3 days minimum",freq:"Available for inspection on request",defaultEmail:"",note:"Submit to local WA Police on request."},
  NT:{name:"Northern Territory",act:"Second-hand Dealers Act (NT)",hold:"14 days",freq:"Available for police inspection at any time",defaultEmail:"",note:"Contact local NT Police station."},
  ACT:{name:"Australian Capital Territory",act:"Second-Hand Dealers Act 1995 (ACT)",hold:"7 days",freq:"Available for ACT Policing inspection",defaultEmail:"",note:"Available for ACT Policing inspection."},
  TAS:{name:"Tasmania",act:"Second-Hand Dealers Act 1994 (Tas)",hold:"7 days",freq:"Available for Tasmania Police inspection",defaultEmail:"",note:"Contact your local Tasmania Police station."},
};

// Privacy notice rendered to the customer at point of transaction.
export const PRIVACY_NOTICE=(biz,abn)=>"PRIVACY NOTICE — "+sS(biz)+"  ABN "+sS(abn)+"\n\nWe collect your personal information (name, DOB, address, ID) to verify your identity as required by:\n• Anti-Money Laundering & Counter-Terrorism Financing Act 2006 (Cth)\n• Second-Hand Dealers & Pawnbrokers Act 1989 (Vic)\n\nRetained 7 years. May be reported to AUSTRAC or Victoria Police if required by law.";

// === Compliance / pricing / reporting functions ============================

// TODO (briefing §9 Gap 1) — Rolling 30-day structuring detection.
//   Add second arg `txHistory` here. Filter to same vendor (name+phone
//   pre-Phase 2.7, client_id post-Phase 2.7) over the last 30 days.
//   Sum cash totals; flag at 80% of CASH_TTR (warn) and 100% (block).
// TODO (briefing §9 Gap 2) — Linked-transaction detection.
//   Same-day-same-client lookup at the client step (App.tsx step 3),
//   not here. This function gets the history; App.tsx surfaces the
//   notice with a "review previous transaction" link.
// TODO (briefing §9 Gap 6) — Override audit trail.
//   When a `block` flag is overridden via the PIN flow (App.tsx:367),
//   the override needs logging (who, when, reason ≥20 chars). Schema
//   not yet decided — likely an `overrides` Supabase table or a sub-
//   record on the transaction. Lands fully in Phase 3 (auth + roles);
//   data shape can land earlier if a small schema change suffices.
export function checkCompliance(items,payment,ttrEnabled=true,cashHardBlockAbove=null){
  const isCash=payment==="cash";
  const buys=(items||[]).filter(i=>i.mode==="buy");
  const total=buys.reduce((s,i)=>s+sN(i.price),0);
  const bullionCash=isCash?buys.filter(i=>i.product&&i.product.type==="bullion").reduce((s,i)=>s+sN(i.price),0):0;
  const anyCash=isCash?total:0;
  const flags=[{level:"info",key:"id",msg:"🪪 ID must be sighted for every transaction — Victorian law s.19, no exceptions."}];
  if(isCash&&total>=THRESH.CASH_WARN&&bullionCash<THRESH.BULLION_CDD&&anyCash<THRESH.CASH_TTR)
    flags.push({level:"warn",key:"cash_warn",msg:"⚠️ $"+fmt2(total)+" cash — Admin must acknowledge before proceeding."});
  if(bullionCash>=THRESH.BULLION_CDD&&anyCash<THRESH.CASH_TTR)
    flags.push({level:"block",key:"bullion_cdd",msg:"🔴 $"+fmt2(bullionCash)+" BULLION — AUSTRAC HARD BLOCK: Full KYC/CDD mandatory."});
  if(ttrEnabled&&anyCash>=THRESH.CASH_TTR)
    flags.push({level:"block",key:"ttr",msg:"🔴 $"+fmt2(anyCash)+" cash — AUSTRAC HARD BLOCK: KYC/CDD + TTR required within 10 business days."});
  // Shop-level configurable cash hard-block (Phase 2 step 3c). Stricter
  // than legal minimums; dealer sets a numeric ceiling (or leaves blank
  // for no extra block). Stacks with bullionCDD and TTR — does NOT
  // require KYC because it is a flat refusal of the cash payment.
  const shopHardBlock=sN(cashHardBlockAbove);
  if(isCash&&shopHardBlock>0&&total>=shopHardBlock)
    flags.push({level:"block",key:"cash_shop_hardblock",msg:"🔴 $"+fmt2(total)+" cash — exceeds shop hard limit of $"+fmt2(shopHardBlock)+". Refuse cash payment for this transaction."});
  return{flags,total,bullionCash,anyCash,requiresKYC:bullionCash>=THRESH.BULLION_CDD||(ttrEnabled&&anyCash>=THRESH.CASH_TTR)};
}

// Phase 2.7.8 — getRequiredFields drives the conditional rendering
// of compliance fields in the new NewTx step 3 (2.7.9). Returns
// the list of field keys to render given the in-progress
// transaction + the dealer's settings (which may carry tightened
// threshold overrides from Phase 2.7.4b).
//
// Phase 2.7 follow-up (2026-04-29) — settings.requireIdOnEveryTx
// (default true) adds name / idType / idNumber to the required set
// regardless of transaction value. Shop policy: every transaction
// sights ID. KYC fields stay threshold-driven exactly as before.
//
// Settings overrides honoured (each null = use regional default;
// values above the legal default fall back to the default
// defensively):
//   cashKycThreshold              default THRESH.CASH_TTR    ($10k)
//   bullionCddThreshold           default THRESH.BULLION_CDD ($5k)
//   sourceOfFundsCashThreshold    default THRESH.CASH_TTR    ($10k)
//   sourceOfWealthCashThreshold   default THRESH.CASH_TTR    ($10k)
//
// Field keys returned:
//   pepCheck       — KYC-required tx
//   tfsCheck       — KYC-required tx
//   riskRating     — KYC-required tx
//   sourceOfFunds  — cash ≥ sourceOfFundsCashThreshold
//   sourceOfWealth — cash ≥ sourceOfWealthCashThreshold
//
// "KYC-required" =  bullionCash ≥ bullionCddThreshold
//                   OR cashTotal ≥ cashKycThreshold
//
// checkCompliance() is intentionally NOT modified — its AUSTRAC
// warning banners stay tied to the legal thresholds. The dealer's
// tightened overrides only affect WHICH FIELDS APPEAR in step 3,
// not the AUSTRAC verbiage. Field-trigger and statutory-banner
// are different concerns.

function readTighten(settings,key,legalMin){
  const v=settings&&settings[key];
  if(v==null)return legalMin;
  const n=Number(v);
  if(!isFinite(n)||n<=0)return legalMin;
  if(n>legalMin)return legalMin;
  return n;
}

export function getRequiredFields(tx,settings){
  const isCash=(tx&&tx.payment)==="cash";
  const items=(tx&&tx.items)||[];
  const buyTotal=items.filter(i=>i&&i.mode==="buy").reduce((s,i)=>s+sN(i.price),0);
  const cashTotal=isCash?buyTotal:0;
  const bullionCash=isCash?items.filter(i=>i&&i.mode==="buy"&&i.product&&i.product.type==="bullion").reduce((s,i)=>s+sN(i.price),0):0;
  const cashKyc=readTighten(settings,"cashKycThreshold",THRESH.CASH_TTR);
  const bullionCdd=readTighten(settings,"bullionCddThreshold",THRESH.BULLION_CDD);
  const sofMin=readTighten(settings,"sourceOfFundsCashThreshold",THRESH.CASH_TTR);
  const sowMin=readTighten(settings,"sourceOfWealthCashThreshold",THRESH.CASH_TTR);
  const kycRequired=bullionCash>=bullionCdd||cashTotal>=cashKyc;
  const fields=[];
  // Shop-policy ID gate. Default ON. Captures the dedupe-friendly
  // minimum (name + ID type + ID number) on every transaction
  // regardless of value, separate from the threshold-driven KYC
  // fields below. Toggle in Settings → Compliance Thresholds.
  const requireIdEveryTx=settings==null||settings.requireIdOnEveryTx!==false;
  if(requireIdEveryTx)fields.push("name","idType","idNumber");
  if(kycRequired)fields.push("pepCheck","tfsCheck","riskRating");
  if(cashTotal>=sofMin)fields.push("sourceOfFunds");
  if(cashTotal>=sowMin)fields.push("sourceOfWealth");
  return fields;
}

export function calcUnitPrice(p,gSpot,sSpot,mode="buy"){
  if(!p||!gSpot||!sSpot)return null;
  const isG=p.cat==="Gold",perG=(isG?gSpot:sSpot)/TROY_OZ,perOz=isG?gSpot:sSpot;
  const mult=mode==="buy"?p.buyMult:p.sellMult;
  // Carat-mode branch fires for both buy and sell (briefing §18.3 fix,
  // Phase 2 step 3c). saveProd in App.tsx sets buyMode:"carat" whenever
  // carat is entered, and the qf form clears purity in that case — so a
  // catalog item can legitimately have carat without purity. Without
  // this branch firing on sell, fall-through used (purity||1) and
  // mis-priced sell as 24ct gold. Multiplier is mode-correct via `mult`;
  // mult==null skip preserves the original null-safety on the fall-
  // through and tightens the previous NaN-on-buy edge case.
  if(p.buyMode==="carat"&&p.carat&&mult!=null)return(perG/24)*p.carat*mult;
  if(mult==null)return null;
  if(p.weightG&&p.purity)return perG*p.purity*p.weightG*mult;
  if(p.unit==="oz")return perOz*(p.purity||1)*mult;
  return perG*(p.purity||1)*mult;
}

export function calcMeltFn(item,frozenSnap,gSpot,sSpot){
  const g=frozenSnap?frozenSnap.gSpot:gSpot,s=frozenSnap?frozenSnap.sSpot:sSpot;
  const metal=sS(item.product&&item.product.cat||item.metalCat);
  const weight=sN(item.weight_g||item.qty);
  if(!weight)return null;
  const pk=sS(item.purity||(item.product&&item.product.purity));
  const pn=sN(item.purity||(item.product&&item.product.purity));
  const cn=sN(item.carat||(item.product&&item.product.carat));
  if(metal==="Gold"){
    if(GOLD_P[pk])return weight*(g/TROY_OZ)*GOLD_P[pk];
    if(cn>0)return weight*(g/TROY_OZ)*(cn/24);
    if(pn>0&&pn<=1)return weight*(g/TROY_OZ)*pn;
    return null;
  }
  if(metal==="Silver"){
    if(SILV_P[pk])return weight*(s/TROY_OZ)*SILV_P[pk];
    if(pn>0&&pn<=1)return weight*(s/TROY_OZ)*pn;
    return null;
  }
  return null;
}

export function makeReceiptFn(tx,settings){
  const b=sS(settings.businessName)||"The Gold Shop";
  const L=["========================================",b.toUpperCase(),"ABN: "+sS(settings.abn),sS(settings.address),"========================================","CONTRACT:  "+sS(tx.id),"DATE:      "+new Date(tx.date).toLocaleString("en-AU"),"CLIENT:    "+sS(tx.client&&tx.client.fullName),"----------------------------------------"];
  (tx.items||[]).forEach((it,i)=>{L.push((i+1)+". "+sS(it.product&&it.product.label||"Item").slice(0,30));L.push("   "+it.mode.toUpperCase()+" "+fmtAUD(it.price));if(it.note)L.push("   "+sS(it.note).slice(0,40));});
  L.push("----------------------------------------");
  if(tx.buyTotal>0)L.push("BUY TOTAL:  "+fmtAUD(tx.buyTotal));
  if(tx.sellTotal>0)L.push("SELL TOTAL: "+fmtAUD(tx.sellTotal));
  L.push("NET:        "+fmtAUD(Math.abs(tx.net||0))+(sN(tx.net)>=0?" (client pays)":" (we pay)"));
  L.push("PAYMENT:    "+sS(tx.payment).toUpperCase(),"========================================","Signature: _____________________________","Date:      _____________________________","========================================","Licensed — SHD Act 1989 (Vic) | AUSTRAC entity");
  return L.join("\n");
}

export function makeTxt(tx){
  const cl=tx.client||{},st=tx.staff||{};
  return["LOOT LEDGR — TRANSACTION RECORD","Invoice: "+sS(tx.id),"Date: "+fmtDate(tx.date),"Payment: "+sS(tx.payment).toUpperCase(),"","── CLIENT ──────────────────","Name: "+sS(cl.fullName),"DOB: "+sS(cl.dob),"Phone: "+sS(cl.phone),"Address: "+sS(cl.address),"","── ID ──────────────────────","Type: "+sS(cl.idType),"Number: "+sS(cl.idNumber),"Sighted: "+(tx.idSighted?"Yes":"No"),"","── ITEMS ───────────────────",
    ...(tx.items||[]).filter(i=>i.mode==="buy").map((it,n)=>"  "+(n+1)+". [BUY] "+sS(it.product&&it.product.label||"Item")+" — "+fmtAUD(it.price)+(it.note?" ("+it.note+")":"")),
    ...(tx.items||[]).filter(i=>i.mode==="sell").map((it,n)=>"  "+(n+1)+". [SELL] "+sS(it.product&&it.product.label||"Item")+" — "+fmtAUD(it.price)+(it.note?" ("+it.note+")":"")),
    "","Buy Total: "+fmtAUD(tx.buyTotal),"Sell Total: "+fmtAUD(tx.sellTotal),"","── COMPLIANCE ──────────────","KYC: "+(tx.kycDone?"Completed":"N/A"),"TTR: "+sS(tx.ttrStatus||"N/A"),"SMR: "+(tx.smrFlagged?"YES":"No"),"Staff: "+sS(st.staffName),"Storage: "+sS(st.storageLocation),"","Delete After: "+fmtDate(tx.deleteAfter)
  ].join("\n");
}

export function genPoliceReport(dateFrom,dateTo,suspicious,stateCode,txList,settings){
  const sc=stateCode||sS(settings.state)||"VIC";
  const st=STATE_INFO[sc]||STATE_INFO.VIC;
  const txs=(txList||[]).filter(t=>{if(!t.date)return false;if(suspicious)return t.smrFlagged;const d=new Date(t.date);return d>=dateFrom&&d<=dateTo;});
  // Storage column added in Phase 2 step 3c (briefing §9 Gap 4 / SHD
  // Act §21A): police must locate held items on demand without a
  // treasure hunt. Tx-level location (set by staff at the buy step,
  // App.tsx:877) is recorded against every item in that transaction.
  const rows=[[st.name.toUpperCase()+" SECONDHAND DEALER TRANSACTION REPORT"],["Governing Act",st.act],["Dealer",sS(settings.businessName)],["ABN",sS(settings.abn)],["Licence",sS(settings.dealerLicenceNo)],["Address",sS(settings.address)],["Phone",sS(settings.phone)],suspicious?["Report Type","IMMEDIATE — SUSPICIOUS ITEM REPORT"]:["Report Type","TRANSACTION REGISTER"],["Period",suspicious?"All SMR-flagged":dateFrom.toLocaleDateString("en-AU")+" to "+dateTo.toLocaleDateString("en-AU")],["Hold Period",st.hold],["Instructions",st.note],["Generated",new Date().toLocaleString("en-AU")],[],["Contract No","Date","Item","Serial","Qty","Price AUD","Client Name","DOB","Address","ID Type","ID Number","KYC","TTR","SMR","Storage","Notes"]];
  txs.forEach(tx=>{const cl=tx.client||{},stf=tx.staff||{};(tx.items||[]).filter(i=>i.mode==="buy").forEach(it=>{const p=it.product||{};rows.push([sS(tx.id),new Date(tx.date).toLocaleDateString("en-AU"),sS(p.label||(it.note?"Unlisted: "+it.note:"Item")),sS(p.serial||"—"),sS(it.qty||"1"),sN(it.price).toFixed(2),sS(cl.fullName),sS(cl.dob),sS(cl.address),sS(cl.idType),sS(cl.idNumber),tx.kycDone?"YES":"NO",tx.ttrRequired?"YES":"NO",tx.smrFlagged?"YES":"NO",sS(stf.storageLocation||"—"),sS(it.note)]);});});
  if(rows.length<=15)rows.push(["(No qualifying buy transactions in this period)"]);
  return rows.map(r=>r.map(v=>'"'+sS(v).replace(/"/g,'""')+'"').join(",")).join("\n");
}

// === Region contract object (briefing Section 6.4) =========================
// Minimal population for Phase 2 step 3a — only fields the current AU code
// already provides. Section 6.4's fuller contract (regulator details,
// acceptedIdTypes, retentionYears, structuringWindow, etc.) populated in
// Phase 2 step 3c after the gap audit decisions.

const region={
  code:"AU",
  name:"Australia",
  currency:"AUD",
  currencySymbol:"$",
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
  getRequiredFields,
  calcUnitPrice,
  calcMeltFn,
  makeReceiptFn,
  makeTxt,
  genPoliceReport,
};

export default region;
