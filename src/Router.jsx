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
// Phase 5.2-PRE-2 — admin.lootledger.au gets a separate app
// shell with the platform admin dashboard. Detected at boot
// via tenancy.detectTenantHost; the hostname doesn't change
// at runtime, so a one-shot mode check at the top of the
// Router is sufficient.
import {detectTenantHost} from "./lib/tenancy.js";

const App=lazy(()=>import("./App.tsx"));
const TrialExpired=lazy(()=>import("./screens/TrialExpired.jsx"));
const AdminPanel=lazy(()=>import("./screens/admin/AdminPanel.jsx"));
const TfsListAdmin=lazy(()=>import("./screens/admin/TfsListAdmin.jsx"));
// Phase 5.2-A — hardware abstraction + provider diagnostics
// admin screen. Coexists with the older src/modals/ApiDiagnostics
// modal (deferred removal, see project_deferred_items.md "Phase
// 5.2 cleanup deferred").
const Diagnostics=lazy(()=>import("./screens/diagnostics/index.jsx"));
const RequireAdmin=lazy(()=>import("./components/RequireAdmin.jsx"));
// Phase 5.2-PRE-2 — platform admin shell. Mounted only when
// detectTenantHost returns mode='admin' (i.e. on the
// admin.lootledger.au host). v2 expanded the MVP shops
// dashboard into a full multi-section app shell.
const RequirePlatformAdmin=lazy(()=>import("./components/RequirePlatformAdmin.jsx"));
const PlatformShell=lazy(()=>import("./screens/platform/Shell.jsx"));
const PlatformShops=lazy(()=>import("./screens/platform/Shops.jsx"));
const PlatformTfs=lazy(()=>import("./screens/platform/Tfs.jsx"));
const PlatformDiagnostics=lazy(()=>import("./screens/platform/Diagnostics.jsx"));
const PlatformAuditLog=lazy(()=>import("./screens/platform/AuditLog.jsx"));
const PlatformUsers=lazy(()=>import("./screens/platform/Users.jsx"));
const PlatformHealth=lazy(()=>import("./screens/platform/Health.jsx"));
const PlatformAdmins=lazy(()=>import("./screens/platform/Admins.jsx"));
const PlatformSearch=lazy(()=>import("./screens/platform/Search.jsx"));
const PlatformSecurity=lazy(()=>import("./screens/platform/Security.jsx"));
const PlatformJobs=lazy(()=>import("./screens/platform/Jobs.jsx"));
const PlatformFlags=lazy(()=>import("./screens/platform/FeatureFlags.jsx"));
const PlatformSubs=lazy(()=>import("./screens/platform/Subscriptions.jsx"));
const PlatformShopCreate=lazy(()=>import("./screens/platform/ShopCreate.jsx"));
const PlatformImpersonate=lazy(()=>import("./screens/platform/Impersonate.jsx"));
const PlatformAustrac=lazy(()=>import("./screens/platform/Austrac.jsx"));
const PlatformAgedAudit=lazy(()=>import("./screens/platform/AgedAudit.jsx"));
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

// Phase 5.2-PRE-2 — admin-mode detection. Read once at
// module load (hostname doesn't change at runtime). null
// outside the browser; one of "dev"|"apex"|"admin"|"tenant"
// otherwise. Only the "admin" branch is special-cased here;
// every other mode falls through to the regular Routes tree
// (which uses path-based routing for /admin/*, /app/*, etc.).
function _hostMode(){
  if(typeof window==="undefined")return null;
  return detectTenantHost(window.location.hostname).mode;
}

export default function Router(){
  if(_hostMode()==="admin"){
    return <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={loadingFallback}>
          <RequirePlatformAdmin>
            <Routes>
              <Route element={<PlatformShell/>}>
                <Route index element={<Navigate to="/shops" replace/>}/>
                <Route path="/shops" element={<PlatformShops/>}/>
                <Route path="/health" element={<PlatformHealth/>}/>
                <Route path="/tfs" element={<PlatformTfs/>}/>
                <Route path="/subscriptions" element={<PlatformSubs/>}/>
                <Route path="/diagnostics" element={<PlatformDiagnostics/>}/>
                <Route path="/jobs" element={<PlatformJobs/>}/>
                <Route path="/search" element={<PlatformSearch/>}/>
                <Route path="/audit" element={<PlatformAuditLog/>}/>
                <Route path="/users" element={<PlatformUsers/>}/>
                <Route path="/impersonate" element={<PlatformImpersonate/>}/>
                <Route path="/admins" element={<PlatformAdmins/>}/>
                <Route path="/shop-create" element={<PlatformShopCreate/>}/>
                <Route path="/flags" element={<PlatformFlags/>}/>
                <Route path="/security" element={<PlatformSecurity/>}/>
                <Route path="/austrac" element={<PlatformAustrac/>}/>
                <Route path="/aged-audit" element={<PlatformAgedAudit/>}/>
                <Route path="*" element={<Navigate to="/shops" replace/>}/>
              </Route>
            </Routes>
          </RequirePlatformAdmin>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>;
  }

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
          {/* Per-shop /admin/* routes: Phase 5.2-PRE-2 v2 moved
              the cross-shop AdminPanel + TfsListAdmin to
              admin.lootledger.au. The diagnostics route stays
              on shop subdomain because it tests per-machine
              hardware. The legacy AdminPanel.jsx and
              TfsListAdmin.jsx files stay in the repo per
              "only add, never remove"; their routes are just
              unwired. */}
          <Route path="/admin/diagnostics" element={<RequireAdmin><Diagnostics/></RequireAdmin>}/>
          <Route path="/app/*" element={<RequireAuth><RequireLegalAcceptance><App/></RequireLegalAcceptance></RequireAuth>}/>
          <Route path="*" element={<Navigate to="/" replace/>}/>
        </Routes>
      </Suspense>
    </AuthProvider>
  </BrowserRouter>;
}
