// LootLedger — SaaS auth abstraction (Stage 1.A, 2026-05-02).
//
// Wraps @supabase/supabase-js so the rest of the app interacts
// with auth through a single ergonomic surface. The legacy
// sbFetch / SHOP_ID="default" pattern in src/lib/storage.js stays
// in place for now; Commit 6 swaps SHOP_ID for getCurrentShopId()
// reading from this auth context.
//
// Identity model:
//   - Both email AND phone are required at signup. Supabase Auth
//     can use either as the primary identifier; we collect both
//     and store the non-primary one in user_metadata so the user
//     can sign in with whichever is on hand.
//   - Email is the primary by default (more reliable for password
//     reset; phone OTP is a future Stage 2 nicety).
//   - Phone signup path is built but uses Supabase's signUp with
//     phone field; OTP delivery requires Twilio configured in
//     Studio per the migration's USER FOLLOW-UP steps.
//
// Shop creation:
//   On successful signup we insert a matching shops row + users
//   row in the same code path. The shop slug is derived from the
//   business name (kebab-case, ASCII only, dedupe with -2/-3
//   suffix). The users row carries role='owner' for the signup
//   user; later staff invites are role='staff' (Stage 2).
//
// Trial timer:
//   shops.trial_ends_at defaults to now() + 3 months in the
//   migration. The app reads this on mount via getCurrentShop()
//   and drives the RequireAuth guard's trial-expired redirect.

import {createClient} from "@supabase/supabase-js";
import {getCookie,setCookie,removeCookie} from "./cookies.js";

const SB_URL=import.meta.env.VITE_SUPABASE_URL;
const SB_KEY=import.meta.env.VITE_SUPABASE_KEY;

// Phase 5.2-PRE (2026-05-11) — cross-subdomain auth via cookies
// scoped to `.lootledger.au`. When running on the production
// custom domain or any of its subdomains, the Supabase session
// lives in a cookie readable by every shop subdomain. Dev hosts
// (localhost, lootledger.netlify.app) keep the default
// localStorage strategy — no cross-subdomain need.
//
// One-time tradeoff: any existing localStorage session at
// lootledger.au is invalidated on next page load (the storage
// bucket changes), forcing a re-login. Acknowledged per chat
// decision 2026-05-11.
const _hostname=typeof window!=="undefined"?window.location.hostname:"";
const _useCookieStorage=_hostname.endsWith("lootledger.au");

// Browsers' per-cookie limit is 4096 bytes (name + value +
// attributes). Supabase session payloads can approach this with
// refresh tokens. Above the safety threshold we fall back to
// localStorage and console.warn — Phase 5.5 cleanup can add
// chunked-cookie storage if it actually starts firing.
const COOKIE_SIZE_LIMIT=3500;

const _cookieStorage={
  getItem:(k)=>{
    if(typeof window==="undefined")return null;
    const v=getCookie(k);
    if(v!=null)return v;
    // Fallback read covers payloads written via the size-guard
    // setItem branch below — keeps getItem/setItem symmetric.
    try{return window.localStorage.getItem(k);}catch(e){return null;}
  },
  setItem:(k,v)=>{
    if(typeof window==="undefined")return;
    if(v&&String(v).length>COOKIE_SIZE_LIMIT){
      console.warn("[loot-auth] session payload "+String(v).length+"B exceeds "+COOKIE_SIZE_LIMIT+"B; falling back to localStorage");
      try{window.localStorage.setItem(k,v);}catch(e){}
      return;
    }
    setCookie(k,v,{
      domain:".lootledger.au",
      path:"/",
      sameSite:"Lax",
      secure:true,
      maxAge:60*60*24*365,
    });
  },
  removeItem:(k)=>{
    if(typeof window==="undefined")return;
    removeCookie(k,{domain:".lootledger.au",path:"/"});
    try{window.localStorage.removeItem(k);}catch(e){}
  },
};

// Single shared client for the whole app. Storage strategy is
// chosen above based on hostname; persistSession + autoRefresh
// behave the same regardless.
export const supabase=createClient(SB_URL,SB_KEY,{
  auth:{
    persistSession:true,
    autoRefreshToken:true,
    detectSessionInUrl:true,
    storage:_useCookieStorage
      ?_cookieStorage
      :(typeof window!=="undefined"?window.localStorage:undefined),
  },
});

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

// kebab-case ASCII slug, max 40 chars, fallback "shop".
function makeSlug(s){
  const base=String(s||"")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g,"")
    .replace(/[^a-z0-9]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,40);
  return base||"shop";
}

// Find a slug that doesn't collide with an existing shops row.
// Walks "name", "name-2", "name-3" ... until a free one is found
// or we give up after 50 attempts (then we suffix a short uuid).
async function findFreeSlug(base){
  const candidates=[base];
  for(let i=2;i<=50;i++)candidates.push(base+"-"+i);
  for(const slug of candidates){
    const{data,error}=await supabase.from("shops").select("id").eq("slug",slug).maybeSingle();
    if(error)continue;
    if(!data)return slug;
  }
  // 50 collisions — extreme edge case. Append a short random suffix.
  return base+"-"+Math.random().toString(36).slice(2,8);
}

// Wraps an async call, returns {ok, data, error} so callers can
// branch without try/catch boilerplate. Mirrors the sbWarn pattern
// in App.tsx.
async function safe(fn){
  try{
    const r=await fn();
    if(r&&r.error)return{ok:false,error:r.error.message||String(r.error),raw:r};
    return{ok:true,data:r&&r.data,raw:r};
  }catch(e){
    return{ok:false,error:(e&&e.message)||String(e)};
  }
}

// ──────────────────────────────────────────────────────────────────
// Sign up — creates auth.users entry, then calls the SECURITY
// DEFINER signup_shop() RPC to atomically insert the shops + users
// rows in a single Postgres transaction. The RPC bypasses the
// shops_insert RLS check (which raced with auth-state propagation
// in earlier client-side INSERT-shop / INSERT-user attempts) and
// re-imposes correctness inside the function (auth.uid() check,
// duplicate-shop guard, slug dedupe).
//
// On RPC failure the auth.users entry lingers — Supabase doesn't
// expose client-side auth-user delete, so a stranded auth account
// without a shops/users row will be re-claimed on the next signUp
// retry with the same email (the RPC's "User already has a shop"
// guard is the safety net there: it'll fire only if a previous
// retry actually succeeded in creating the users row, which means
// the shop exists too and there's nothing to roll back).
// ──────────────────────────────────────────────────────────────────
export async function signUp({
  email,phone,password,
  firstName,familyName,
  businessName,abn,
  // Pre-launch — clickwrap consent. The Signup screen captures
  // both versions strings (the version of the in-app default
  // template the user just read before ticking the checkbox).
  // For a brand-new shop with no approved versions yet, the
  // versions are stamped as the literal string "default" — the
  // re-acceptance gate then fires once the dealer approves their
  // first customised version. acceptedAt is the timestamp of the
  // signup itself.
  termsVersionAccepted,
  privacyPolicyVersionAccepted,
  // dealerLicenceNo / address accepted for forward-compat; not
  // currently passed through to signup_shop. The dealer fills
  // those in via Settings → Business Details after signup.
}){
  if(!email)return{ok:false,error:"Email is required."};
  if(!phone)return{ok:false,error:"Phone is required."};
  if(!password||password.length<8)return{ok:false,error:"Password must be at least 8 characters."};
  if(!businessName)return{ok:false,error:"Business name is required."};
  if(!termsVersionAccepted||!privacyPolicyVersionAccepted)return{ok:false,error:"Acceptance of Terms of Service and Privacy Policy is required."};

  // Step 1 — auth.users via Supabase Auth.
  const authResult=await safe(()=>supabase.auth.signUp({
    email,
    password,
    phone,
    options:{
      data:{first_name:firstName||"",family_name:familyName||"",phone:phone||""},
    },
  }));
  if(!authResult.ok)return{ok:false,error:"Signup failed: "+authResult.error};
  const authUser=authResult.data&&authResult.data.user;
  if(!authUser||!authUser.id)return{ok:false,error:"Signup returned no user id."};

  // Step 2 — atomic shops + users insert via SECURITY DEFINER RPC.
  // Returns json: { shop_id, slug, role }. Any failure surfaces
  // here as r.error; the auth.users row is left in place per the
  // header comment.
  const r=await safe(()=>supabase.rpc("signup_shop",{
    p_business_name:businessName,
    p_abn:abn||"",
    p_first_name:firstName||"",
    p_family_name:familyName||"",
    p_email:email||"",
    p_phone:phone||"",
  }));
  if(!r.ok)return{ok:false,error:"Could not create shop: "+r.error};

  // Stamp legal acceptance on the just-created users row. The RPC
  // didn't take these as parameters because the consent record
  // belongs to the natural person, not the shop, and we want the
  // signup_shop function to stay focused on the shop+users
  // creation. Failure here is not fatal — log and continue; the
  // re-acceptance gate will pick it up on next login. The 0005
  // migration's nullable columns mean an unstamped users row is
  // valid; the gate treats it as "not accepted" → prompts.
  const acceptedAt=new Date().toISOString();
  const updateResult=await safe(()=>supabase.from("users").update({
    terms_accepted_at:acceptedAt,
    terms_version_accepted:termsVersionAccepted,
    privacy_policy_version_accepted:privacyPolicyVersionAccepted,
  }).eq("id",authUser.id));
  if(!updateResult.ok&&typeof console!=="undefined"){
    // eslint-disable-next-line no-console
    console.warn("[loot] could not stamp legal acceptance on users row:",updateResult.error);
  }

  // RPC returned shape: { shop_id, slug, role }. Hydrate to the
  // legacy {user, shop, userRecord} shape callers expect by doing
  // a SELECT for the shop. The users row is keyed on auth.uid()
  // which equals authUser.id; we don't need a round-trip for it.
  const shopRow=await safe(()=>supabase.from("shops").select("*").eq("id",r.data.shop_id).maybeSingle());
  // Auth fix (2026-05-09) — fresh-login bypass for the lock
  // screen. App.tsx boot reads this flag in the appUnlocked
  // initializer; if present it auto-unlocks (and clears the
  // flag), so a successful signup doesn't dump the user at the
  // PIN gate. See also signIn / signUpForInvite below.
  try{localStorage.setItem("gf_freshLogin","1");}catch(_){/* non-fatal */}
  return{
    ok:true,
    data:{
      user:authUser,
      shop:shopRow.ok?shopRow.data:{id:r.data.shop_id,slug:r.data.slug,business_name:businessName},
      userRecord:{
        id:authUser.id,
        shop_id:r.data.shop_id,
        role:r.data.role,
        first_name:firstName||"",
        family_name:familyName||"",
        email,
        phone,
      },
    },
  };
}

// ──────────────────────────────────────────────────────────────────
// Sign in — accepts either email or phone as the identifier.
// Auto-detects: contains "@" → email, otherwise treated as phone.
// ──────────────────────────────────────────────────────────────────
export async function signIn({identifier,password}){
  if(!identifier)return{ok:false,error:"Email or phone required."};
  if(!password)return{ok:false,error:"Password required."};
  const isEmail=String(identifier).includes("@");
  const r=await safe(()=>isEmail
    ?supabase.auth.signInWithPassword({email:identifier,password})
    :supabase.auth.signInWithPassword({phone:identifier,password}));
  if(!r.ok)return{ok:false,error:r.error};
  // Auth fix (2026-05-09) — fresh-login bypass for the lock
  // screen. See signUp() for the rationale.
  try{localStorage.setItem("gf_freshLogin","1");}catch(_){/* non-fatal */}
  return{ok:true,data:r.data};
}

// ──────────────────────────────────────────────────────────────────
// Sign out — clears the local session.
// ──────────────────────────────────────────────────────────────────
export async function signOut(){
  return safe(()=>supabase.auth.signOut());
}

// ──────────────────────────────────────────────────────────────────
// Password reset — sends an email with a reset link.
// Requires Site URL configured in Studio (see migration USER
// FOLLOW-UP steps).
// ──────────────────────────────────────────────────────────────────
export async function resetPasswordViaEmail(email){
  if(!email)return{ok:false,error:"Email required."};
  // Auth fix (2026-05-09) — redirectTo points to the new
  // /reset-password screen. Supabase's detectSessionInUrl=true
  // (configured at line 44) auto-loads the recovery session
  // from the URL fragment when ResetPassword.jsx mounts; the
  // user just has to set + confirm a new password.
  // STUDIO ACTION REQUIRED: add `${SITE_URL}/reset-password` to
  // Project Settings → Auth → URL Configuration → Redirect URLs.
  // Otherwise Supabase rejects the redirectTo at runtime.
  return safe(()=>supabase.auth.resetPasswordForEmail(email,{
    redirectTo:typeof window!=="undefined"?window.location.origin+"/reset-password":undefined,
  }));
}

// ──────────────────────────────────────────────────────────────────
// Session / context lookups
// ──────────────────────────────────────────────────────────────────

// Returns the current auth.users row (id, email, phone, metadata)
// or null if not signed in. Reads from the local session — no
// network round-trip in the common case.
export async function getCurrentUser(){
  const{data}=await supabase.auth.getUser();
  return(data&&data.user)||null;
}

// Returns the user's domain record from the public.users table:
//   { id, shop_id, role, first_name, family_name, email, phone,
//     terms_accepted_at, terms_version_accepted,
//     privacy_policy_version_accepted, pin, job_title }
// null when the user hasn't been signed up via signUp() above
// (i.e. an auth.users row exists but no matching public.users).
//
// Refreshed 2026-05-08 (3d-4-b) to include the legal-acceptance
// trio (added by 0005) and the per-user PIN + job_title pair
// (added by 0011_user_pins.sql). SELECT * picks them up
// automatically — the doc just needed updating.
export async function getCurrentUserRecord(){
  const u=await getCurrentUser();
  if(!u)return null;
  const{data,error}=await supabase.from("users").select("*").eq("id",u.id).maybeSingle();
  if(error)return null;
  return data||null;
}

// Returns the user's shop row: { id, slug, business_name, ... ,
// trial_ends_at, subscription_active }. null when no user record
// or no shop link.
export async function getCurrentShop(){
  const ur=await getCurrentUserRecord();
  if(!ur||!ur.shop_id)return null;
  const{data,error}=await supabase.from("shops").select("*").eq("id",ur.shop_id).maybeSingle();
  if(error)return null;
  return data||null;
}

export async function getCurrentRole(){
  const ur=await getCurrentUserRecord();
  return ur&&ur.role||null;
}

export async function isAdmin(){
  const u=await getCurrentUser();
  if(!u||!u.email)return false;
  const{data}=await supabase.from("admins").select("email").eq("email",u.email.toLowerCase()).maybeSingle();
  return!!data;
}

// Phase 5.2-PRE-2 — platform admin role (UUID-based, separate
// from the legacy email-based `admins` allowlist above).
// Returns true iff the signed-in user has a row in the
// platform_admins table (RLS in 0020 restricts SELECT to
// platform admins, so this returns false for non-admins
// without leaking the table contents).
export async function isPlatformAdmin(){
  const u=await getCurrentUser();
  if(!u||!u.id)return false;
  const{data}=await supabase.from("platform_admins").select("id").eq("user_id",u.id).maybeSingle();
  return!!data;
}

// True iff trial_ends_at is in the past AND subscription_active is
// false. Used by RequireAuth to decide whether to redirect to
// /trial-expired. null shop → also locked out (no active shop is
// not a useful state for the app surface).
export async function isLockedOut(){
  const shop=await getCurrentShop();
  if(!shop)return true;
  if(shop.subscription_active)return false;
  const ends=shop.trial_ends_at?new Date(shop.trial_ends_at).getTime():0;
  return ends<Date.now();
}

// Subscribe to auth state changes. Returns the unsubscribe handle.
// Used by Router.jsx to re-evaluate routes when the user signs in
// or out.
export function onAuthStateChange(cb){
  const{data}=supabase.auth.onAuthStateChange((event,session)=>cb(event,session));
  return data&&data.subscription;
}

// ──────────────────────────────────────────────────────────────────
// Pre-launch — legal acceptance helpers.
// Used by:
//   • Signup.jsx via signUp() above (signup-time stamp)
//   • RequireLegalAcceptance gate (re-stamp after re-acceptance)
//   • Settings → Account section (display current acceptance)
// ──────────────────────────────────────────────────────────────────

// Update the signed-in user's acceptance metadata. Either argument
// may be omitted (only the provided ones are updated). The RLS
// policy users_update USING (id = auth.uid()) permits a user to
// update their own row. Returns {ok, error} for the caller to act on.
export async function recordLegalAcceptance({termsVersion,privacyPolicyVersion}={}){
  const u=await getCurrentUser();
  if(!u)return{ok:false,error:"Not signed in."};
  // Migration 0005 added a single shared timestamp column
  // (terms_accepted_at) that tracks "most recent acceptance event"
  // across both documents. Any update touches both the relevant
  // version column and the shared timestamp.
  if(termsVersion==null&&privacyPolicyVersion==null)return{ok:false,error:"No acceptance versions provided."};
  const patch={terms_accepted_at:new Date().toISOString()};
  if(termsVersion!=null)patch.terms_version_accepted=termsVersion;
  if(privacyPolicyVersion!=null)patch.privacy_policy_version_accepted=privacyPolicyVersion;
  return safe(()=>supabase.from("users").update(patch).eq("id",u.id));
}

// Read settings.termsOfService.currentVersion + settings.privacy
// Policy.currentVersion for the user's shop. Used by the
// RequireLegalAcceptance gate to compare against the user's
// stamped versions. Returns {termsVersion, privacyVersion} where
// each is the string version (e.g. "1.0") or null when no version
// has been approved yet for this shop.
export async function getCurrentLegalDocumentVersions(){
  const ur=await getCurrentUserRecord();
  if(!ur||!ur.shop_id)return{termsVersion:null,privacyVersion:null};
  const{data,error}=await supabase.from("settings").select("data").eq("shop_id",ur.shop_id).maybeSingle();
  if(error||!data)return{termsVersion:null,privacyVersion:null};
  const d=(data&&data.data)||{};
  const tos=d.termsOfService||{};
  const pp=d.privacyPolicy||{};
  return{
    termsVersion:tos.currentVersion||null,
    privacyVersion:pp.currentVersion||null,
  };
}

// ──────────────────────────────────────────────────────────────────
// Phase 3 commit 3d-4-b — staff invite + per-user PIN helpers.
// ──────────────────────────────────────────────────────────────────

// Sign up a NEW staff member for an EXISTING shop (invite claim
// path). Distinct from signUp() above which creates a brand-new
// shop via the signup_shop RPC. signUpForInvite just creates the
// auth.users row; the public.users row + shop assignment land
// when the caller follows up with claimStaffInvite(token).
//
// Returns {ok, data:{user, session?}, error} for the caller to
// branch on. On success, the auth session is established (with
// auto-confirm) so the immediate claim_staff_invite call has an
// auth.uid() to attach to.
export async function signUpForInvite({email,password,firstName,familyName,phone}){
  if(!email)return{ok:false,error:"Email is required."};
  if(!password||password.length<8)return{ok:false,error:"Password must be at least 8 characters."};
  if(!firstName)return{ok:false,error:"First name is required."};
  if(!familyName)return{ok:false,error:"Family name is required."};
  const r=await safe(()=>supabase.auth.signUp({
    email,
    password,
    phone:phone||undefined,
    options:{
      data:{first_name:firstName,family_name:familyName,phone:phone||""},
    },
  }));
  if(!r.ok)return{ok:false,error:"Signup failed: "+r.error};
  const authUser=r.data&&r.data.user;
  if(!authUser||!authUser.id)return{ok:false,error:"Signup returned no user id."};
  // Auth fix (2026-05-09) — fresh-login bypass for the lock
  // screen. See signUp() for the rationale.
  try{localStorage.setItem("gf_freshLogin","1");}catch(_){/* non-fatal */}
  return{ok:true,data:{user:authUser,session:r.data&&r.data.session||null}};
}

// RPC wrappers for the SQL functions delivered in 3d-1 + 3d-4-a.
// All throw on error so call sites can use try/catch with
// pop-on-failure rather than {ok,error} branching.

export async function createStaffInvite(email,role){
  const{data,error}=await supabase.rpc("create_staff_invite",{p_email:email,p_role:role});
  if(error)throw error;
  return data;
}

export async function claimStaffInvite(token){
  const{data,error}=await supabase.rpc("claim_staff_invite",{p_token:token});
  if(error)throw error;
  return data;
}

export async function setMyPin(pin){
  const{data,error}=await supabase.rpc("set_my_pin",{p_pin:pin||null});
  if(error)throw error;
  return data;
}

export async function setStaffPin(userId,pin){
  const{data,error}=await supabase.rpc("set_staff_pin",{p_user_id:userId,p_pin:pin||null});
  if(error)throw error;
  return data;
}

export async function setMyJobTitle(title){
  const{data,error}=await supabase.rpc("set_my_job_title",{p_title:title||""});
  if(error)throw error;
  return data;
}

// ──────────────────────────────────────────────────────────────────
// Phase 5.2 Commit 1 (2026-05-15) — staff workspace PIN gate.
// Tile click → verifyStaffPin against the target user's plaintext
// pin column. Server-side lockout: 3 wrong → 10-min lock on the
// target user. Returns the RPC's jsonb shape verbatim:
//   {ok:true}
//   {ok:false, error:'locked',  locked_until:'<iso>'}
//   {ok:false, error:'no_pin'}
//   {ok:false, error:'wrong',   remaining:N}
//   {ok:false, error:'wrong',   locked_until:'<iso>'}
// ──────────────────────────────────────────────────────────────────
export async function verifyStaffPin(targetUserId,pin){
  const{data,error}=await supabase.rpc("verify_staff_pin",{
    p_target_user_id:targetUserId,
    p_pin:pin,
  });
  if(error)throw error;
  return data;
}

// ──────────────────────────────────────────────────────────────────
// Phase 5.2 fix-forward 1.5 (2026-05-16) — admin staff CRUD.
// Wrappers for the new RPCs in migration 0024 that let an
// owner/manager toggle is_active and update name/email/role on
// another user in the same shop. Both audit-logged server-side.
// ──────────────────────────────────────────────────────────────────
export async function adminSetStaffActive(userId,active){
  const{data,error}=await supabase.rpc("admin_set_staff_active",{
    p_user_id:userId,
    p_active:!!active,
  });
  if(error)throw error;
  return data;
}

export async function adminUpdateStaffFields({userId,firstName,familyName,email,role}){
  const{data,error}=await supabase.rpc("admin_update_staff_fields",{
    p_user_id:userId,
    p_first_name:firstName==null?null:firstName,
    p_family_name:familyName==null?null:familyName,
    p_email:email==null?null:email,
    p_role:role==null?null:role,
  });
  if(error)throw error;
  return data;
}

// ──────────────────────────────────────────────────────────────────
// Phase 5.2 fix-forward 1.5 (2026-05-16) — manual profile creation.
// Calls the create-staff-profile Edge Function. Used by the new
// "Add profile manually" flow in the Staff (Invite) modal when an
// email-based invite isn't viable.
// Args: { email, firstName, familyName, role, pin }.
// Returns: { ok:true, userId, tempPassword } or { ok:false, error }.
// ──────────────────────────────────────────────────────────────────
export async function createStaffProfileManually({email,firstName,familyName,role,pin}){
  try{
    const{data,error}=await supabase.functions.invoke("create-staff-profile",{
      body:{email,firstName,familyName,role,pin},
    });
    if(error)return{ok:false,error:(error&&error.message)||String(error)};
    if(data&&typeof data==="object")return data;
    return{ok:false,error:"Unexpected Edge Function response"};
  }catch(e){return{ok:false,error:(e&&e.message)||String(e)};}
}

// ──────────────────────────────────────────────────────────────────
// Phase 3.5-A-2 — staff_hours wrappers (table + RPCs from 0014).
// Reads use direct RLS-gated SELECT; writes go through the
// SECURITY DEFINER RPCs so PIN + role checks happen server-side
// in the same transaction as the audit_log row.
// ──────────────────────────────────────────────────────────────────

// Read staff_hours rows for a shop in [fromDate, toDate] inclusive.
// Returns rows ordered by work_date desc. Empty array on no rows.
// 3.5-A-2.5 (2026-05-09) — also returns lock columns so the UI can
// render the lock badge + disable inputs without a second round-trip.
export async function listStaffHours(shopId,fromDate,toDate){
  const{data,error}=await supabase
    .from("staff_hours")
    .select("id, user_id, work_date, start_time, end_time, break_minutes, note, updated_at, updated_by, locked, locked_at, locked_by")
    .eq("shop_id",shopId)
    .gte("work_date",fromDate)
    .lte("work_date",toDate)
    .order("work_date",{ascending:false});
  if(error)throw error;
  return data||[];
}

// PIN-gated upsert. ON CONFLICT (shop_id, user_id, work_date) DO
// UPDATE per the RPC. Caller must supply their own PIN; cross-user
// writes additionally require owner/manager role server-side.
export async function upsertStaffHours({pin,userId,workDate,startTime,endTime,breakMinutes,note}){
  const{data,error}=await supabase.rpc("upsert_staff_hours",{
    p_pin:pin,
    p_user_id:userId,
    p_work_date:workDate,
    p_start_time:startTime||null,
    p_end_time:endTime||null,
    p_break_minutes:breakMinutes||0,
    p_note:note||"",
  });
  if(error)throw error;
  return data;
}

// PIN-gated delete. Owner-only server-side.
export async function deleteStaffHours(pin,id){
  const{data,error}=await supabase.rpc("delete_staff_hours",{p_pin:pin,p_id:id});
  if(error)throw error;
  return data;
}

// ──────────────────────────────────────────────────────────────────
// Phase 3.5-A-2.5 (2026-05-09) — lock-for-processing wrappers.
// lock requires the CALLER's PIN; unlock requires the ROW OWNER's
// PIN (the staff member whose hours are being unlocked, NOT the
// caller). Server-side RPCs in 0015_staff_hours_lock.sql enforce
// this — these wrappers are thin pass-throughs.
// ──────────────────────────────────────────────────────────────────
export async function lockStaffHours(pin,id){
  const{data,error}=await supabase.rpc("lock_staff_hours",{p_pin:pin,p_id:id});
  if(error)throw error;
  return data;
}

export async function unlockStaffHours(rowOwnerPin,id){
  const{data,error}=await supabase.rpc("unlock_staff_hours",{p_pin:rowOwnerPin,p_id:id});
  if(error)throw error;
  return data;
}
