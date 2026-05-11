// LootLedger — RequirePlatformAdmin guard.
// Phase 5.2-PRE-2 (2026-05-11). Client-side gate for the
// admin.lootledger.au app shell. Sibling to RequireAdmin.jsx
// (which gates the per-shop /admin/* routes). DIFFERENT
// concept: RequireAdmin checks `useAuth().admin` (which maps
// to the legacy `admins` table from 0003 — SaaS-wide
// subscription-management admin), while this guard checks
// the new `platform_admins` table (UUID-based, Phase 5.2-PRE-2).
//
// Loading sequence:
//   1. Wait for AuthProvider to resolve (useAuth().loading === false).
//   2. If no signed-in user → redirect to apex login with next=/.
//   3. Probe platform_admins via sbFetch — if a row exists for
//      auth.uid(), the user is a platform admin → render children.
//   4. Otherwise → redirect to apex with ?reason=not_platform_admin.
//
// Security note: this guard is UX. The actual security is in
// RLS — the migration 0020 policies refuse all non-platform-admin
// reads of platform_admins, and the shops_platform_admin_read
// policy limits cross-shop SELECT to platform admins. Even if
// someone bypasses this client-side guard, the DB will return
// nothing.

import React,{useEffect,useState} from "react";
import {useAuth} from "./AuthProvider.jsx";
import {sbFetch} from "../lib/storage.js";

const _spinner=<div style={{padding:40,fontFamily:"system-ui",color:"#666"}}>Verifying access…</div>;

export default function RequirePlatformAdmin({children}){
  const{user,loading}=useAuth();
  // null = checking, true = ok, false = denied (redirect in flight)
  const[verified,setVerified]=useState(null);

  useEffect(()=>{
    if(loading)return;
    if(!user){
      window.location.replace("https://lootledger.au/login?next=/");
      return;
    }
    let cancelled=false;
    sbFetch("platform_admins?user_id=eq."+encodeURIComponent(user.id)+"&select=id&limit=1")
      .then(r=>{
        if(cancelled)return;
        if(!r||r.__sbError){
          setVerified(false);
          window.location.replace("https://lootledger.au/?reason=not_platform_admin");
          return;
        }
        const ok=Array.isArray(r)&&r.length>0;
        setVerified(ok);
        if(!ok){
          window.location.replace("https://lootledger.au/?reason=not_platform_admin");
        }
      })
      .catch(()=>{
        if(cancelled)return;
        setVerified(false);
        window.location.replace("https://lootledger.au/?reason=not_platform_admin");
      });
    return()=>{cancelled=true;};
  },[user,loading]);

  if(loading||verified===null)return _spinner;
  if(verified===false)return null;  // redirect in progress
  return children;
}
