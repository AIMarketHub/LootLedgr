// LootLedger — TrialExpired screen.
// Stage 1.A SaaS foundation. Reachable when the dealer's
// trial_ends_at has passed and shops.subscription_active is
// false. RequireAuth redirects here from /app; this screen has
// no escape back to /app — the only outs are sign out, or an
// admin flipping subscription_active to true (which makes
// isLockedOut() return false, the next /app navigation succeeds).
//
// Contact email is settings-driven later (Stage 2 marketing
// pass); hardcoded for now to admin@lootledger.com.au —
// adjust in code if/when the SaaS-side support inbox is real.

import React,{useState} from "react";
import {useNavigate} from "react-router-dom";
import AuthLayout from "./auth/AuthLayout.jsx";
import {useAuth} from "../components/AuthProvider.jsx";
import {signOut} from "../lib/auth/saas.js";

const SUPPORT_EMAIL="admin@lootledger.com.au";

function fmtLong(iso){if(!iso)return "—";try{return new Date(iso).toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"});}catch(_){return String(iso);}}

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

  const subject=encodeURIComponent("Subscription request — "+(shop&&shop.business_name||"LootLedger"));
  const body=encodeURIComponent(
    "Hi,\n\nMy free trial has expired. I'd like to subscribe.\n\n"+
    "Business name: "+(shop&&shop.business_name||"")+"\n"+
    "Shop slug: "+(shop&&shop.slug||"")+"\n"+
    "Trial ended: "+fmtLong(shop&&shop.trial_ends_at)+"\n\n"+
    "Thanks."
  );

  return <AuthLayout
    title="Trial expired"
    subtitle={shop?("Your free trial ended on "+fmtLong(shop.trial_ends_at)):"Your free trial has ended."}
  >
    <div style={{padding:"14px 16px",background:"#fff8e1",border:"1px solid #f0d878",borderRadius:4,fontSize:13,color:"#6b5818",marginBottom:18,lineHeight:1.55}}>
      Your data is preserved. Once an admin activates your subscription, you'll be able to sign back in and continue exactly where you left off.
    </div>
    <div style={{fontSize:13,color:"#444",lineHeight:1.6,marginBottom:16}}>
      To unlock your account, contact us:
      <div style={{margin:"10px 0"}}>
        <a href={"mailto:"+SUPPORT_EMAIL+"?subject="+subject+"&body="+body} style={{color:"#c9a84c",fontWeight:"bold",textDecoration:"none"}}>
          ✉ {SUPPORT_EMAIL}
        </a>
      </div>
      Reference your business name and shop slug — they're already filled in if you click the email link above.
    </div>
    <button style={{width:"100%",padding:"10px 16px",background:"#fff",color:"#444",border:"1px solid #ccc",borderRadius:4,fontSize:13,cursor:"pointer",fontFamily:"inherit"}} onClick={onSignOut} disabled={busy}>{busy?"Signing out…":"Sign out"}</button>
  </AuthLayout>;
}
