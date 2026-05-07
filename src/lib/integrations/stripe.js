// LootLedger — Stripe payments integration.
// Added 2026-04-29 during Phase 2.7 smoke-test follow-up. Pattern
// mirrors the idAutofill provider abstraction: fully wired, dormant
// by default. Activation requires a deliberate Settings toggle and a
// secret-key entry. Costs nothing while disabled.
//
// API surface (briefing convention — settings is always the first
// arg so callers don't have to compose):
//   createPaymentIntent(settings, amountAUD, metadata)
//     One-shot card-present intent for Stripe Terminal flows. Wired
//     end-to-end against the Stripe API; Terminal *hardware* dispatch
//     lands in Phase 7 (locked roadmap, Stage 5.2 — multi-vendor
//     hardware abstraction). The NewTx Stripe sub-option for
//     "Charge card now" therefore stubs the click with the Phase 7
//     notice while keeping the underlying fetch wired.
//
//   confirmPaymentIntent(settings, paymentIntentId, paymentMethodId)
//     Server-side confirm step for an existing Intent — paired with
//     createPaymentIntent for the card-present path.
//
//   probeStripe(settings)
//     Test-Connection helper for the Settings UI. GETs a tiny,
//     read-only endpoint (`/v1/customers?limit=1`) so the user can
//     verify their key + mode without spending money or touching
//     real records.
//
//   createPaymentLink(settings, amountAUD, description)
//     Hosted Stripe Checkout URL the customer can pay from their
//     phone. Uses Checkout Sessions in `payment` mode with inline
//     `price_data` so no pre-existing Stripe products are required.
//     This is the "Send payment link" path in NewTx — fully usable
//     today, no hardware needed.
//
// Webhook callbacks (payment confirmation, refund, dispute) are NOT
// handled here. A real production deployment needs a server endpoint
// at settings.stripeWebhookUrl to receive Stripe-signed events and
// reconcile against the local transaction record. That endpoint is
// out of scope for this dormant skeleton — the URL field stores it,
// nothing more. Wire the handler during Stage 7 production cutover.
//
// ===========================================================
// CORS LIMITATION — read before testing in the dev app
// ===========================================================
// Stripe deliberately blocks browser CORS on api.stripe.com for the
// secret-key REST surface. Pasting a real sk_test_… in Settings and
// hitting Test Connection / Send Payment Link from the dev app will
// fail with a CORS error in the browser console. This is by design —
// Stripe wants secret keys handled server-side.
//
// The functions below are correct against the Stripe REST contract
// and will start working as-is the moment they're called from a
// server context (Netlify Function, Cloudflare Worker, or any
// Stage 7 production proxy). They're also correct as spec for any
// future test that mocks fetch.
//
// For interactive smoke testing today: skip Test Connection. Stage 7
// cutover (locked roadmap) is when the proxy gets built; until then
// the integration is plumbing only. Do NOT replace these functions
// with browser-side workarounds (PaymentRequest / Stripe.js) —
// hosted Checkout via a server proxy is the intended path.
//
// Privacy / compliance posture (briefing §11):
//   - Card data NEVER touches LootLedger. Stripe Checkout collects
//     PAN/CVV on Stripe's hosted page; we only see redacted
//     payment_method ids and amounts. PCI-DSS scope is therefore
//     SAQ-A (the lightest level), same as Square.
//   - The Settings UI must surface a privacy notice referencing the
//     Stripe DPA so the dealer makes a conscious data-export choice.
//   - All requests carry the secret key in the Authorization header
//     — never query string — and rely on Stripe's CORS allowlist.
//   - Test-mode keys (`sk_test_...`) hit a sandbox; live-mode keys
//     hit production. The mode dropdown is informational only — the
//     key prefix is what Stripe routes on, but the dropdown lets the
//     dealer see at a glance which environment is active.

import {sN,sS,uid} from "../utils.js";

const API_BASE="https://api.stripe.com/v1";

// Stripe POST endpoints accept application/x-www-form-urlencoded.
// Object → URL-encoded form body, with Stripe's bracket-array form
// for nested keys: {line_items:[{quantity:1}]} →
// "line_items[0][quantity]=1".
function encodeForm(obj,prefix){
  const parts=[];
  Object.keys(obj||{}).forEach(k=>{
    const v=obj[k];
    const key=prefix?prefix+"["+k+"]":k;
    if(v==null)return;
    if(Array.isArray(v)){
      v.forEach((item,i)=>{
        if(item&&typeof item==="object"){parts.push(encodeForm(item,key+"["+i+"]"));}
        else{parts.push(encodeURIComponent(key+"["+i+"]")+"="+encodeURIComponent(sS(item)));}
      });
    }else if(typeof v==="object"){
      parts.push(encodeForm(v,key));
    }else{
      parts.push(encodeURIComponent(key)+"="+encodeURIComponent(sS(v)));
    }
  });
  return parts.filter(Boolean).join("&");
}

function authHeaders(settings){
  return {
    "Authorization":"Bearer "+sS(settings.stripeSecretKey),
    "Content-Type":"application/x-www-form-urlencoded",
  };
}

function configError(settings){
  if(!settings.stripeEnabled)return"Stripe disabled in Settings.";
  if(!sS(settings.stripeSecretKey).trim())return"Stripe secret key not configured.";
  return null;
}

// Test-Connection probe. Read-only — pulls one customer record (or
// gets a 200 with an empty list if no customers exist). Anything
// else is reported back so the dealer can fix it before going live.
export async function probeStripe(settings){
  const cfg=configError(settings);
  if(cfg)return{ok:false,msg:cfg};
  try{
    const r=await fetch(API_BASE+"/customers?limit=1",{headers:{"Authorization":"Bearer "+sS(settings.stripeSecretKey)}});
    const d=await r.json().catch(()=>({}));
    if(r.ok){
      const mode=sS(settings.stripeSecretKey).startsWith("sk_live_")?"live":"test";
      return{ok:true,msg:"Stripe connected ("+mode+" mode)."};
    }
    return{ok:false,msg:"Stripe "+r.status+": "+sS(d.error&&d.error.message||"check key")};
  }catch(e){return{ok:false,msg:"Stripe network: "+sS(e.message)};}
}

// PaymentIntent — card-present primitive. Stripe Terminal will
// later read this id and drive the reader; for now the call is wired
// so a future Phase 7 hardware adapter can plug straight in.
export async function createPaymentIntent(settings,amountAUD,metadata){
  const cfg=configError(settings);
  if(cfg)return{ok:false,msg:cfg};
  try{
    const body=encodeForm({
      amount:Math.round(sN(amountAUD)*100),
      currency:"aud",
      payment_method_types:["card_present"],
      capture_method:"automatic",
      metadata:metadata||{loot_ledgr_invoice:uid().slice(0,16)},
    });
    const r=await fetch(API_BASE+"/payment_intents",{method:"POST",headers:authHeaders(settings),body});
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.id)return{ok:true,id:d.id,clientSecret:d.client_secret,raw:d,msg:"Intent created."};
    return{ok:false,msg:"Stripe intent: "+sS(d.error&&d.error.message||r.status)};
  }catch(e){return{ok:false,msg:"Stripe intent: "+sS(e.message)};}
}

export async function confirmPaymentIntent(settings,paymentIntentId,paymentMethodId){
  const cfg=configError(settings);
  if(cfg)return{ok:false,msg:cfg};
  if(!paymentIntentId)return{ok:false,msg:"No paymentIntentId."};
  try{
    const body=encodeForm(paymentMethodId?{payment_method:paymentMethodId}:{});
    const r=await fetch(API_BASE+"/payment_intents/"+encodeURIComponent(paymentIntentId)+"/confirm",{method:"POST",headers:authHeaders(settings),body});
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.status)return{ok:d.status==="succeeded",status:d.status,raw:d,msg:"Status: "+d.status};
    return{ok:false,msg:"Stripe confirm: "+sS(d.error&&d.error.message||r.status)};
  }catch(e){return{ok:false,msg:"Stripe confirm: "+sS(e.message)};}
}

// Hosted-checkout link the customer pays from their own phone. No
// reader, no terminal, no card data through us. Returns the URL the
// dealer hands over (display + QR).
export async function createPaymentLink(settings,amountAUD,description){
  const cfg=configError(settings);
  if(cfg)return{ok:false,msg:cfg};
  const cents=Math.round(sN(amountAUD)*100);
  if(!(cents>0))return{ok:false,msg:"Amount must be > $0."};
  try{
    const origin=(typeof window!=="undefined"&&window.location&&window.location.origin)||"https://lootledgr.netlify.app";
    const body=encodeForm({
      mode:"payment",
      success_url:origin+"?stripe=success",
      cancel_url:origin+"?stripe=cancel",
      line_items:[{
        quantity:1,
        price_data:{
          currency:"aud",
          product_data:{name:sS(description||"Loot Ledger sale")},
          unit_amount:cents,
        },
      }],
      metadata:{loot_ledgr_invoice:uid().slice(0,16)},
    });
    const r=await fetch(API_BASE+"/checkout/sessions",{method:"POST",headers:authHeaders(settings),body});
    const d=await r.json().catch(()=>({}));
    if(r.ok&&d.url)return{ok:true,url:d.url,id:d.id,raw:d,msg:"Payment link created."};
    return{ok:false,msg:"Stripe link: "+sS(d.error&&d.error.message||r.status)};
  }catch(e){return{ok:false,msg:"Stripe link: "+sS(e.message)};}
}
