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

const SB_URL=import.meta.env.VITE_SUPABASE_URL;
const SB_KEY=import.meta.env.VITE_SUPABASE_KEY;

// Single shared client for the whole app. Persists session in
// localStorage by default (gf_supabase_auth) so the user stays
// signed in across reloads.
export const supabase=createClient(SB_URL,SB_KEY,{
  auth:{
    persistSession:true,
    autoRefreshToken:true,
    detectSessionInUrl:true,
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
// Sign up — creates auth.users entry + shops row + users row.
// All three must succeed for the signup to be considered complete.
// On any failure we attempt to roll back the shop insert (the
// auth.users entry can stick around — Supabase doesn't expose a
// client-side delete for the active session, and a stranded auth
// account without a users row will be re-claimed on next signup
// attempt with the same email).
// ──────────────────────────────────────────────────────────────────
export async function signUp({
  email,phone,password,
  firstName,familyName,
  businessName,abn,dealerLicenceNo,address,
}){
  if(!email)return{ok:false,error:"Email is required."};
  if(!phone)return{ok:false,error:"Phone is required."};
  if(!password||password.length<8)return{ok:false,error:"Password must be at least 8 characters."};
  if(!businessName)return{ok:false,error:"Business name is required."};

  // Step 1 — auth.users via Supabase Auth. Email is primary; phone
  // goes into user_metadata so the user can sign in with either
  // (the signIn helpers below check both fields).
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

  // Step 2 — shops row.
  const baseSlug=makeSlug(businessName);
  const slug=await findFreeSlug(baseSlug);
  const shopInsert=await safe(()=>supabase.from("shops").insert({
    slug,
    business_name:businessName,
    abn:abn||null,
    dealer_licence_no:dealerLicenceNo||null,
    address:address||null,
    phone:phone||null,
    created_by:authUser.id,
  }).select().single());
  if(!shopInsert.ok)return{ok:false,error:"Could not create shop: "+shopInsert.error};
  const shop=shopInsert.data;

  // Step 3 — users row linking auth.users.id → shops.id, role=owner.
  const userInsert=await safe(()=>supabase.from("users").insert({
    id:authUser.id,
    shop_id:shop.id,
    role:"owner",
    first_name:firstName||"",
    family_name:familyName||"",
    email:email||"",
    phone:phone||"",
  }).select().single());
  if(!userInsert.ok){
    // Roll back the shop. The auth user lingers — they can retry
    // with the same email and the next signUp will return the
    // existing auth row; we'll create a fresh shop + users row
    // on the retry.
    await safe(()=>supabase.from("shops").delete().eq("id",shop.id));
    return{ok:false,error:"Could not create user record: "+userInsert.error};
  }

  return{ok:true,data:{user:authUser,shop,userRecord:userInsert.data}};
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
  return safe(()=>supabase.auth.resetPasswordForEmail(email,{
    redirectTo:typeof window!=="undefined"?window.location.origin+"/login":undefined,
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
// { id, shop_id, role, first_name, family_name, email, phone }.
// null when the user hasn't been signed up via signUp() above
// (i.e. an auth.users row exists but no matching public.users).
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
