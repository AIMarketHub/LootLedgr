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
// Otherwise renders children.

import React from "react";
import {Navigate,useLocation} from "react-router-dom";
import {useAuth} from "./AuthProvider.jsx";

export default function RequireAuth({children}){
  const{user,userRecord,locked,loading}=useAuth();
  const loc=useLocation();

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
