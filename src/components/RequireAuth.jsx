// LootLedger — RequireAuth route guard.
// Stage 1.A SaaS foundation. Redirects:
//   not signed in        → /login
//   trial expired + no   → /trial-expired
//   active subscription
//   no users record yet  → /signup (auth.users exists but the
//                          public.users link wasn't created;
//                          rare — happens when a previous signup
//                          left the auth row but rolled back the
//                          shops/users insert)
//   wrong subdomain      → cross-host redirect to the user's
//                          actual shop subdomain. Skipped on
//                          dev hosts (lootledger.netlify.app /
//                          localhost) where there is no
//                          subdomain to enforce.
// Otherwise renders children.

import React,{useEffect} from "react";
import {Navigate,useLocation} from "react-router-dom";
import {useAuth} from "./AuthProvider.jsx";
import {detectTenantHost,buildShopUrl} from "../lib/tenancy.js";

export default function RequireAuth({children}){
  const{user,userRecord,shop,locked,loading}=useAuth();
  const loc=useLocation();

  // Cross-subdomain redirect: when the user's shop subdomain
  // doesn't match the current host's leftmost segment, navigate
  // to the right host. Phase 5.2-PRE switched the routing key
  // from shop.slug → shop.subdomain (added by migration 0019).
  // shop.slug stays in the DB as a human-readable identifier
  // but is no longer compared here.
  //
  // Backward-compat safety: if shop.subdomain is NULL (legacy
  // row not yet migrated), bypass the guard — let the user
  // stay on whatever URL they're on.
  //
  // Runs as a side-effect because the redirect is
  // window.location.replace, not a router Navigate. Dev hosts
  // (lootledger.netlify.app, localhost) skip this entirely.
  useEffect(()=>{
    if(loading||!user||!shop||!shop.subdomain)return;
    const detected=detectTenantHost(typeof window!=="undefined"?window.location.hostname:"");
    if(detected.mode!=="tenant")return;
    if(detected.subdomain===shop.subdomain)return;
    const target=buildShopUrl(shop.subdomain,{path:loc.pathname+loc.search});
    if(target&&target!==window.location.href){
      window.location.replace(target);
    }
  },[loading,user,shop&&shop.subdomain,loc.pathname,loc.search]);

  if(loading){
    return <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"60vh",fontFamily:"system-ui",color:"#666"}}>Loading…</div>;
  }
  if(!user){
    // Preserve the attempted URL so login can bounce back here.
    return <Navigate to="/login" replace state={{from:loc.pathname+loc.search}}/>;
  }
  if(!userRecord){
    // Edge case — auth row but no domain row. Push to signup so
    // the dealer can complete the shop setup.
    return <Navigate to="/signup" replace/>;
  }
  if(locked){
    return <Navigate to="/trial-expired" replace/>;
  }
  return children;
}
