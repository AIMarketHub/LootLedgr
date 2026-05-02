// LootLedger — AuthProvider context.
// Stage 1.A SaaS foundation (2026-05-02). Single source of truth
// for auth state across the app. Subscribes to Supabase Auth state
// changes via onAuthStateChange and re-fetches the user/shop/admin
// state whenever the session changes.
//
// Context shape:
//   user        — auth.users row (or null)
//   userRecord  — public.users row (or null)
//   shop        — public.shops row (or null)
//   role        — 'owner' | 'staff' | null
//   admin       — boolean (true if email in admins table)
//   locked      — boolean (true if trial expired AND not subscribed)
//   loading     — boolean (true during initial fetch / re-fetch)
//   refresh     — function() — manually re-fetches all of the above
//
// Components that need any of these read via useAuth(). Routes
// that should be auth-gated wrap their children in <RequireAuth>
// (src/components/RequireAuth.jsx).

import React,{createContext,useContext,useEffect,useState,useCallback} from "react";
import {supabase,getCurrentUser,getCurrentUserRecord,getCurrentShop,isAdmin,isLockedOut} from "../lib/auth/saas.js";

const AuthCtx=createContext({
  user:null,userRecord:null,shop:null,role:null,
  admin:false,locked:false,loading:true,
  refresh:()=>{},
});

export function useAuth(){return useContext(AuthCtx);}

export function AuthProvider({children}){
  const[state,setState]=useState({
    user:null,userRecord:null,shop:null,role:null,
    admin:false,locked:false,loading:true,
  });

  const refresh=useCallback(async()=>{
    setState(s=>({...s,loading:true}));
    const user=await getCurrentUser();
    if(!user){
      setState({user:null,userRecord:null,shop:null,role:null,admin:false,locked:false,loading:false});
      return;
    }
    const[userRecord,shop,admin,locked]=await Promise.all([
      getCurrentUserRecord(),
      getCurrentShop(),
      isAdmin(),
      isLockedOut(),
    ]);
    setState({
      user,
      userRecord,
      shop,
      role:userRecord&&userRecord.role||null,
      admin,
      locked,
      loading:false,
    });
  },[]);

  useEffect(()=>{
    refresh();
    const{data}=supabase.auth.onAuthStateChange((event)=>{
      // SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED / USER_UPDATED
      // all warrant a re-fetch. Skip INITIAL_SESSION because
      // refresh() above already covers the mount-time pull.
      if(event!=="INITIAL_SESSION")refresh();
    });
    return()=>{if(data&&data.subscription)data.subscription.unsubscribe();};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  return <AuthCtx.Provider value={{...state,refresh}}>{children}</AuthCtx.Provider>;
}
