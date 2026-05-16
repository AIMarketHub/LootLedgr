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

import React,{createContext,useContext,useEffect,useState,useCallback,useRef} from "react";
import {supabase,getCurrentUser,getCurrentUserRecord,getCurrentShop,isAdmin,isPlatformAdmin,isLockedOut,signOut} from "../lib/auth/saas.js";
import {setCurrentShopId,setCurrentUserId} from "../lib/storage.js";

const AuthCtx=createContext({
  user:null,userRecord:null,shop:null,role:null,
  admin:false,isPlatformAdmin:false,locked:false,loading:true,
  refresh:()=>{},
});

export function useAuth(){return useContext(AuthCtx);}

export function AuthProvider({children}){
  const[state,setState]=useState({
    user:null,userRecord:null,shop:null,role:null,
    admin:false,isPlatformAdmin:false,locked:false,loading:true,
  });
  // Tracks whether we currently have a signed-in user. Used to
  // distinguish a real SIGNED_IN transition (logged-out → logged-in)
  // from a session-restore SIGNED_IN that Supabase fires when a tab
  // regains focus. See the onAuthStateChange handler below.
  const hadUserRef=useRef(false);

  const refresh=useCallback(async()=>{
    setState(s=>({...s,loading:true}));
    const user=await getCurrentUser();
    if(!user){
      hadUserRef.current=false;
      setCurrentShopId(null);
      setCurrentUserId(null,null);
      setState({user:null,userRecord:null,shop:null,role:null,admin:false,isPlatformAdmin:false,locked:false,loading:false});
      return;
    }
    hadUserRef.current=true;
    const[userRecord,shop,admin,platformAdmin,locked]=await Promise.all([
      getCurrentUserRecord(),
      getCurrentShop(),
      isAdmin(),
      isPlatformAdmin(),
      isLockedOut(),
    ]);

    // 2026-05-16 — soft-delete enforcement. If users.is_active is
    // explicitly false, sign the session out and bounce to login.
    // Defensive: only acts when the field is the literal `false`
    // (not null/undefined) so a missing column or pre-migration
    // row doesn't accidentally lock anyone out.
    if(userRecord&&userRecord.is_active===false){
      try{await signOut();}catch(_){}
      hadUserRef.current=false;
      setCurrentShopId(null);
      setCurrentUserId(null,null);
      if(typeof window!=="undefined"){
        try{window.alert("This profile has been deactivated. Contact your shop owner to reactivate.");}catch(_){}
      }
      setState({user:null,userRecord:null,shop:null,role:null,admin:false,isPlatformAdmin:false,locked:false,loading:false});
      return;
    }
    // Cache the shop id in storage.js so module-level sb.* helpers
    // can read it synchronously from this point on. Cleared above
    // when the user signs out.
    setCurrentShopId(shop&&shop.id||null);
    // Phase 3 commit 3d-2 — cache the auth user id + display label
    // so storage.js can stamp created_by / last_updated_by on every
    // sb.* write and modal-level audit fields can read a stable
    // freetext label. Display label fallback chain:
    //   first_name + family_name → email → "Unknown"
    setCurrentUserId(
      user&&user.id||null,
      ((userRecord&&userRecord.first_name||"")+" "+(userRecord&&userRecord.family_name||"")).trim()
        ||(userRecord&&userRecord.email)
        ||(user&&user.email)
        ||null
    );
    setState({
      user,
      userRecord,
      shop,
      role:userRecord&&userRecord.role||null,
      admin,
      isPlatformAdmin:platformAdmin,
      locked,
      loading:false,
    });
  },[]);

  useEffect(()=>{
    refresh();
    const{data}=supabase.auth.onAuthStateChange((event)=>{
      // Production blocker fix (2026-05-06): Supabase fires
      // TOKEN_REFRESHED (and sometimes SIGNED_IN) when a browser
      // tab regains focus. The previous handler re-fetched on
      // every event except INITIAL_SESSION, which set
      // loading=true, caused RequireAuth to swap children for a
      // Loading fallback, unmounted the App tree, and reset all
      // in-memory state — losing in-progress transactions every
      // time staff switched tabs / minimised the window.
      //
      // Re-fetch only on real auth transitions:
      //   • SIGNED_OUT — must clear state.
      //   • SIGNED_IN  — only when we don't already have a user
      //                  (a true logged-out → logged-in event).
      //                  A SIGNED_IN that fires while we already
      //                  have a user is a session-restore /
      //                  tab-focus event; the session is
      //                  unchanged for the user.
      // INITIAL_SESSION is covered by the mount-time refresh().
      // TOKEN_REFRESHED / USER_UPDATED are silent token-rotation
      // events; nothing the user sees should change.
      if(event==="SIGNED_OUT"){refresh();return;}
      if(event==="SIGNED_IN"&&!hadUserRef.current){refresh();return;}
    });
    return()=>{if(data&&data.subscription)data.subscription.unsubscribe();};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  return <AuthCtx.Provider value={{...state,refresh}}>{children}</AuthCtx.Provider>;
}
