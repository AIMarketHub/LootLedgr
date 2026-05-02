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
import Login from "./screens/auth/Login.jsx";
import Signup from "./screens/auth/Signup.jsx";
import ForgotPassword from "./screens/auth/ForgotPassword.jsx";

const App=lazy(()=>import("./App.tsx"));
const TrialExpired=lazy(()=>import("./screens/TrialExpired.jsx"));
const AdminPanel=lazy(()=>import("./screens/admin/AdminPanel.jsx"));
const RequireAdmin=lazy(()=>import("./components/RequireAdmin.jsx"));

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
          <Route path="/trial-expired" element={<TrialExpired/>}/>
          <Route path="/admin/*" element={<RequireAdmin><AdminPanel/></RequireAdmin>}/>
          <Route path="/app/*" element={<RequireAuth><App/></RequireAuth>}/>
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
      </Suspense>
    </AuthProvider>
  </BrowserRouter>;
}
