// LootLedger — TrialExpired screen.
// Stage 1.A SaaS foundation. Reachable when isLockedOut()
// returns true — either trial_ends_at has passed and
// shops.subscription_active is false (trial-expired path), or
// subscription_plan='cancelled' (renewal-needed path).
// RequireAuth redirects here from /app; this screen has no
// escape back to /app — the only outs are sign out, or an
// admin flipping subscription_active (and/or subscription_plan)
// so isLockedOut() returns false on the next refresh.
//
// 2026-05-16 — copy refreshed to point at renewal alongside
// trial-expiry messaging. Payment-link button is a Phase 5.5
// addition once Stripe lands.

import React,{useState} from "react";
import {useNavigate} from "react-router-dom";
import AuthLayout from "./auth/AuthLayout.jsx";
import {useAuth} from "../components/AuthProvider.jsx";
import {signOut} from "../lib/auth/saas.js";
import {formatDateAU} from "../lib/utils.js";

const SUPPORT_EMAIL="support@lootledger.au";

const fmtLong=iso=>iso?formatDateAU(iso):"—";

export default function TrialExpired(){
  const{shop,refresh}=useAuth();
  const[busy,setBusy]=useState(false);
  const nav=useNavigate();

  const onSignOut=async()=>{
    setBusy(true);
    await signOut();
    await refresh();
    nav("/login",{replace:true});
  };

  // Distinguish "trial ended" vs "cancelled subscription" so the
  // copy matches the actual state. plan is read off the shop row
  // (subscription_plan column from migration 0019).
  const plan=shop&&shop.subscription_plan;
  const isCancelled=plan==="cancelled";

  const subject=encodeURIComponent("Subscription renewal — "+(shop&&shop.business_name||"LootLedger"));
  const body=encodeURIComponent(
    "Hi,\n\nMy LootLedger subscription has lapsed. I'd like to renew.\n\n"+
    "Business name: "+(shop&&shop.business_name||"")+"\n"+
    "Shop slug: "+(shop&&shop.slug||"")+"\n"+
    (isCancelled
      ?"Subscription status: cancelled.\n"
      :"Trial ended: "+fmtLong(shop&&shop.trial_ends_at)+"\n")+
    "\nThanks."
  );

  return <AuthLayout
    title={isCancelled?"Subscription lapsed":"Trial expired"}
    subtitle={isCancelled
      ?"Your subscription is no longer active."
      :(shop?("Your free trial ended on "+fmtLong(shop.trial_ends_at)):"Your free trial has ended.")}
  >
    <div style={{padding:"14px 16px",background:"#fff8e1",border:"1px solid #f0d878",borderRadius:4,fontSize:13,color:"#6b5818",marginBottom:18,lineHeight:1.55}}>
      <strong>Your subscription has lapsed. Please renew to regain access to LootLedger.</strong>
      <div style={{marginTop:6}}>Your data is preserved — once an admin reactivates your subscription you'll be able to sign back in and continue exactly where you left off.</div>
    </div>
    <div style={{fontSize:13,color:"#444",lineHeight:1.6,marginBottom:16}}>
      Contact <a href={"mailto:"+SUPPORT_EMAIL+"?subject="+subject+"&body="+body} style={{color:"#c9a84c",fontWeight:"bold",textDecoration:"none"}}>{SUPPORT_EMAIL}</a> if you need assistance.
      <div style={{fontSize:11,color:"#888",marginTop:6}}>Click the email link above to pre-fill your business name and shop slug — speeds up support reactivating your access.</div>
    </div>
    <button style={{width:"100%",padding:"10px 16px",background:"#fff",color:"#444",border:"1px solid #ccc",borderRadius:4,fontSize:13,cursor:"pointer",fontFamily:"inherit"}} onClick={onSignOut} disabled={busy}>{busy?"Signing out…":"Sign out"}</button>
  </AuthLayout>;
}
