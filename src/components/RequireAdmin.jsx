// LootLedger — RequireAdmin placeholder.
// Stage 1.A foundation. Pass-through stub that just gates on
// "user must be signed in" for now; the real admins-table check
// is filled in by Commit 4 (where AdminPanel actually does
// something worth gating).

import React from "react";
import {Navigate} from "react-router-dom";
import {useAuth} from "./AuthProvider.jsx";

export default function RequireAdmin({children}){
  const{user,admin,loading}=useAuth();
  if(loading)return <div style={{padding:40,fontFamily:"system-ui",color:"#666"}}>Loading…</div>;
  if(!user)return <Navigate to="/login" replace/>;
  if(!admin)return <Navigate to="/app" replace/>;
  return children;
}
