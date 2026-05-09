// LootLedger — top-level router.
// Stage 1.A SaaS foundation. Wraps everything in <AuthProvider>
// so routes / components can read the auth context, then
// dispatches:
//
//   /                 → if signed in, /app; if not, /login
//   /login            → Login
//   /signup           → Signup
//   /forgot           → ForgotPassword
//   /trial-expired    → TrialExpired (Commit 4)
//   /admin            → AdminPanel under <RequireAdmin> (Commit 4)
//   /app/*            → existing App, gated by <RequireAuth>
//   *                 → fallback to /
//
// The TrialExpired and AdminPanel screens are stubbed in Commit 4;
// for now we route to /app placeholder content so the build is
// green. Lazy imports keep the auth bundle small.

import React,{Suspense,lazy} from "react";
import {BrowserRouter,Routes,Route,Navigate} from "react-router-dom";
import {AuthProvider,useAuth} from "./components/AuthProvider.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import RequireLegalAcceptance from "./components/RequireLegalAcceptance.jsx";
import Login from "./screens/auth/Login.jsx";
import Signup from "./screens/auth/Signup.jsx";
import ForgotPassword from "./screens/auth/ForgotPassword.jsx";

const App=lazy(()=>import("./App.tsx"));
const TrialExpired=lazy(()=>import("./screens/TrialExpired.jsx"));
const AdminPanel=lazy(()=>import("./screens/admin/AdminPanel.jsx"));
const TfsListAdmin=lazy(()=>import("./screens/admin/TfsListAdmin.jsx"));
const RequireAdmin=lazy(()=>import("./components/RequireAdmin.jsx"));
// Phase 3 commit 3d-4-b — staff invite-claim entry point.
const ClaimInvite=lazy(()=>import("./screens/auth/ClaimInvite.jsx"));
// Auth fix (2026-05-09) — password-reset landing page (target of
// the email link sent by ForgotPassword). detectSessionInUrl=true
// in the supabase client config means the recovery session is
// auto-loaded from the URL fragment; the screen renders a new-
// password form and calls supabase.auth.updateUser({password}).
const ResetPassword=lazy(()=>import("./screens/auth/ResetPassword.jsx"));

function RootRedirect(){
  const{user,loading}=useAuth();
  if(loading)return <div style={{padding:40,fontFamily:"system-ui",color:"#666"}}>Loading…</div>;
  return <Navigate to={user?"/app":"/login"} replace/>;
}

const loadingFallback=<div style={{padding:40,fontFamily:"system-ui",color:"#666"}}>Loading…</div>;

export default function Router(){
  return <BrowserRouter>
    <AuthProvider>
      <Suspense fallback={loadingFallback}>
        <Routes>
          <Route path="/" element={<RootRedirect/>}/>
          <Route path="/login" element={<Login/>}/>
          <Route path="/signup" element={<Signup/>}/>
          <Route path="/forgot" element={<ForgotPassword/>}/>
          <Route path="/claim-invite" element={<ClaimInvite/>}/>
          <Route path="/reset-password" element={<ResetPassword/>}/>
          <Route path="/trial-expired" element={<TrialExpired/>}/>
          <Route path="/admin/tfs" element={<RequireAdmin><TfsListAdmin/></RequireAdmin>}/>
          <Route path="/admin/*" element={<RequireAdmin><AdminPanel/></RequireAdmin>}/>
          <Route path="/app/*" element={<RequireAuth><RequireLegalAcceptance><App/></RequireLegalAcceptance></RequireAuth>}/>
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
      </Suspense>
    </AuthProvider>
  </BrowserRouter>;
}
