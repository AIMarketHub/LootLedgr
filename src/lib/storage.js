// LootLedger — persistence layer.
// Mechanically extracted from src/App.tsx during Phase 2 step 4.
// No semantic changes; signatures preserved exactly.
//
// Two persistence channels live here:
//
//   1. `store` — a localStorage wrapper. Keys namespaced with the
//      "gf_" prefix (Goldenfrog, the pre-rename project namespace,
//      retained so existing user data in the browser keeps working).
//      The wrapper is the single point of access to localStorage for
//      the rest of the app, so future concerns (quota handling,
//      encryption, IndexedDB migration) land here without touching
//      call sites.
//
//   2. `sb` — Supabase REST operations against the lootledger-dev
//      project. Each method handles one (table, action) pair
//      (saveTx, loadTxList, deleteTx, ...). Errors are swallowed by
//      `sbFetch` and surface as null so the app falls back to the
//      localStorage cache and remains responsive.
//
// SHOP_ID was hardcoded "default" before the Stage 1.A SaaS
// foundation landed. The migration in 0003_saas_foundation.sql
// + the auth context in src/components/AuthProvider.jsx + the
// signup flow in src/lib/auth/saas.js together produce a real
// shops.id UUID per dealer.
//
// Stage 1.A (2026-05-02) — sb / clients module-level reads now
// route through getCurrentShopId() which returns the live UUID
// from the cached auth state. Calls before sign-in throw, but in
// practice every call site is downstream of <RequireAuth/> which
// blocks render until auth resolves. App.tsx's mount-time
// useEffect (the one that pulls txList / stock / settings /
// catalog from Supabase) is the one path that fires before
// auth.shop is in scope; it now waits for the cached id.
//
// SHOP_ID is exported as a fixed sentinel string ("__no_shop__")
// rather than the legacy "default" so any stray hard-coded
// callers fail loudly rather than silently writing into the
// wrong tenant. Tests and dev paths should never reach a state
// where SHOP_ID is read directly.
//
// `checkPhotoSize` is a thin pass-through today; it exists so a real
// resize/compress step can be added later without changing call
// sites that already wrap photo reads in this guard.
//
// `runMigration` runs once on module load (the import side effect at
// the bottom of this file). It seeds the default logo on first run
// and clears localStorage on app-version bumps. Idempotent — safe to
// call any number of times.
//
// `initTxList` is the boot-time hydration helper that re-attaches
// inline photos to transactions whose photoKey was saved separately.

import {APP_VERSION,SEED_LOGO} from "./constants.js";
import {supabase} from "./auth/saas.js";

const SB_URL=import.meta.env.VITE_SUPABASE_URL;
const SB_KEY=import.meta.env.VITE_SUPABASE_KEY;
// Exported (Phase 2.7.2) so src/lib/clients.js can scope its REST
// queries to the same shop. Phase 3 swaps this for a per-user /
// per-tenant id read from the auth session.
export const SHOP_ID="__no_shop__";

// Cached shop id, set by AuthProvider whenever the auth context
// resolves to a shop. The sb.* methods below use this to scope
// reads / writes; the cache avoids an async lookup per sb call.
let _cachedShopId=null;
export function setCurrentShopId(id){_cachedShopId=id?String(id):null;}
export function getCurrentShopId(){
  if(_cachedShopId)return _cachedShopId;
  // Defensive — surfaces clearly in console and lets the failing
  // call return null/[] rather than silently writing into a
  // shop-less row that RLS would reject anyway.
  console.warn("[storage] getCurrentShopId() called before auth context cached a shop_id; sb.* call will likely fail.");
  return SHOP_ID;
}

export const store={
  get:(k,d)=>{try{const v=localStorage.getItem("gf_"+k);return v!=null?JSON.parse(v):d;}catch(_){return d;}},
  set:(k,v)=>{try{localStorage.setItem("gf_"+k,JSON.stringify(v));}catch(_){}},
  del:(k)=>{try{localStorage.removeItem("gf_"+k);}catch(_){}},
};

// sbFetch returns one of four shapes so callers can distinguish
// success-with-no-body (PostgREST's normal upsert response) from
// real failures:
//   { __sbOk: true }         2xx with empty body — common for upserts
//                              and DELETEs without Prefer:
//                              return=representation. Treat as success.
//   { __sbError: <status> }  2xx-not-ok response — server reachable
//                              but rejected the request. Treat as
//                              error; the status is the diagnostic.
//   <parsed JSON>            2xx with body — typically an array (for
//                              SELECTs) or the inserted/updated row(s)
//                              when Prefer: return=representation is
//                              set. Treat as success.
//   null                     hard network failure (fetch threw,
//                              JSON.parse threw, etc.). Treat as error.
//
// Callers reading list / object data continue to work unchanged
// (they read array indices or properties, which on the sentinel
// objects come back undefined → falsy → graceful fallback).
// Callers that distinguish success from failure should test with
// the sbOk helper below rather than `r == null`.
//
// Stage 1.B (2026-05-06) — Authorization header now carries the
// user's JWT (session.access_token) when signed in, falling back
// to the anon key when there isn't a session. Before Stage 1.A
// the request used the anon key for both apikey and Authorization;
// that worked because the dev_allow_all_* RLS policies didn't
// look at auth.uid(). After Stage 1.A switched to per-shop
// tenant-isolation policies (current_shop_id() / current_is_admin())
// the anon key by itself produces auth.uid() = NULL → 401 on
// every request to a shop-scoped table. The JWT lets PostgREST
// resolve auth.uid() and apply the right policy.
//
// supabase.auth.getSession() reads from in-memory session storage
// (no network round-trip). One extra await per sbFetch call;
// negligible cost.
export const sbFetch=async(path,opts={})=>{
  try{
    let token=SB_KEY;
    try{
      const{data}=await supabase.auth.getSession();
      if(data&&data.session&&data.session.access_token)token=data.session.access_token;
    }catch(_){/* fall back to anon key */}
    const r=await fetch(SB_URL+"/rest/v1/"+path,{...opts,headers:{"apikey":SB_KEY,"Authorization":"Bearer "+token,"Content-Type":"application/json","Prefer":opts.prefer||"",...opts.headers}});
    if(!r.ok)return{__sbError:r.status};
    const t=await r.text();
    if(!t)return{__sbOk:true};
    return JSON.parse(t);
  }catch(_){return null;}
};

// Truthy iff the sbFetch result represents a success of any kind.
// Both null (network failure) and __sbError (HTTP failure) are
// not-ok; the empty-body sentinel and any parsed JSON are ok.
export const sbOk=r=>r!=null&&!r.__sbError;

const ts=()=>new Date().toISOString();
// PostgREST `?on_conflict=` must name the EXACT columns of the
// table's PRIMARY KEY (or a UNIQUE constraint). The four mirrored
// tables in lootledger-dev / -prod use composite (id, shop_id) PKs
// for transactions / catalog / stock — the multi-tenant design that
// only requires id-uniqueness within a shop. settings is keyed on
// shop_id alone (one row per shop). clients is single-key on id
// (uuid PK from the 0001 migration). Sending the wrong column name
// here returns 400 ("no unique or exclusion constraint matching the
// ON CONFLICT specification") and the upsert silently fails — root
// cause of the Phase 2.7 console-noise saga, fixed 2026-04-30.
const ON_CONFLICT={
  transactions:"id,shop_id",
  catalog:"id,shop_id",
  stock:"id,shop_id",
  clients:"id",
  settings:"shop_id",
};
const upsSB=(tbl,body)=>sbFetch(tbl+"?on_conflict="+(ON_CONFLICT[tbl]||"id"),{method:"POST",prefer:"resolution=merge-duplicates",body:JSON.stringify(body)});

// === Section 9 C2 — shared helpers for the Gap 1/2 loaders =================

// Sum tx.buyTotal across a list of cash transactions. Used by
// loadCashTotal24h and loadCash30dByClient/Name to convert the
// raw row array from _loadTxFiltered into the scalar total the
// compliance evaluators want. Defensive against rows that
// somehow lack buyTotal (older shapes / partial writes).
const sumBuyTotalCash=rows=>(rows||[]).reduce((s,d)=>{
  if(!d)return s;
  const v=Number(d.buyTotal);
  return s+(isFinite(v)?v:0);
},0);

// 30 days ago in ISO. Used by the Gap 1 loaders.
const thirtyDaysAgoISO=()=>new Date(Date.now()-30*24*3600*1000).toISOString();

// Start of today (local time) in ISO. Used by the Gap 2 loaders.
// Local-time floor: a transaction at 00:30 today is "today"; one
// at 23:59 yesterday is not. Date stamps stored on tx records
// are ISO with explicit timezone offset, so the gte comparison
// is correct regardless of viewer timezone.
const startOfTodayISO=()=>{
  const d=new Date();
  d.setHours(0,0,0,0);
  return d.toISOString();
};

export const sb={
  saveTx:async tx=>{const sid=getCurrentShopId();return upsSB("transactions",{id:tx.id,shop_id:sid,data:tx,updated_at:ts()});},
  loadTxList:async()=>{const sid=getCurrentShopId();const r=await sbFetch("transactions?shop_id=eq."+encodeURIComponent(sid)+"&order=updated_at.desc&limit=500");return r&&!r.__sbError&&!r.__sbOk?(Array.isArray(r)?r.map(x=>x.data):null):null;},
  deleteTx:async id=>sbFetch("transactions?id=eq."+encodeURIComponent(id)+"&shop_id=eq."+encodeURIComponent(getCurrentShopId()),{method:"DELETE"}),
  saveStock:async item=>{const sid=getCurrentShopId();return upsSB("stock",{id:item.id,shop_id:sid,data:item,updated_at:ts()});},
  loadStock:async()=>{const sid=getCurrentShopId();const r=await sbFetch("stock?shop_id=eq."+encodeURIComponent(sid)+"&order=updated_at.desc&limit=2000");return r&&!r.__sbError&&!r.__sbOk?(Array.isArray(r)?r.map(x=>x.data):null):null;},
  deleteStock:async id=>sbFetch("stock?id=eq."+encodeURIComponent(id)+"&shop_id=eq."+encodeURIComponent(getCurrentShopId()),{method:"DELETE"}),
  saveSettings:async s=>{const sid=getCurrentShopId();return upsSB("settings",{shop_id:sid,data:s,updated_at:ts()});},
  loadSettings:async()=>{const sid=getCurrentShopId();const r=await sbFetch("settings?shop_id=eq."+encodeURIComponent(sid)+"&limit=1");return r&&!r.__sbError&&!r.__sbOk&&Array.isArray(r)&&r[0]?r[0].data:null;},
  saveCatalog:async cat=>{const sid=getCurrentShopId();return upsSB("catalog",{id:"catalog_"+sid,shop_id:sid,data:cat,updated_at:ts()});},
  loadCatalog:async()=>{const sid=getCurrentShopId();const r=await sbFetch("catalog?id=eq."+encodeURIComponent("catalog_"+sid)+"&limit=1");return r&&!r.__sbError&&!r.__sbOk&&Array.isArray(r)&&r[0]?r[0].data:null;},
  // Stage 1.C TTR rule 3 (24-hour aggregation). Returns the sum of
  // buy-total cash payments from prior transactions for the given
  // clientId in the rolling 24-hour window. Does NOT include the
  // in-progress transaction (the caller adds that in via
  // isTtrRequired). Returns 0 on no clientId, no auth, no matches,
  // or any failure mode — defensive: failure → no aggregation
  // bonus → the synchronous TTR check stands as the floor.
  loadCashTotal24h:async(clientId)=>{
    if(!clientId)return 0;
    const rows=await sb._loadTxFiltered({clientId,sinceISO:new Date(Date.now()-24*3600*1000).toISOString(),payment:"cash"});
    return sumBuyTotalCash(rows);
  },
  // Section 9 C2 — shared low-level transaction filter.
  // Used by:
  //   • loadCashTotal24h           (TTR aggregation, Stage 1.C)
  //   • loadCash30dByClient/Name   (Gap 1, structuring)
  //   • loadTodayTxByClient/Name   (Gap 2, linked-tx banner)
  // shop_id scoping is enforced server-side by RLS plus a belt-
  // and-braces eq filter here. Pass clientId XOR fullName — when
  // clientId is set, takes precedence; fullName is the manual-
  // entry fallback (case-insensitive substring) for txs the
  // dealer hasn't yet linked to a client record. Both are best-
  // effort: failure modes return [] so callers degrade cleanly.
  _loadTxFiltered:async({clientId,fullName,sinceISO,payment,limit=200}={})=>{
    const sid=getCurrentShopId();
    let path="transactions?shop_id=eq."+encodeURIComponent(sid)+"&select=data";
    if(clientId){
      path+="&data->>clientId=eq."+encodeURIComponent(clientId);
    }else if(fullName){
      // PostgREST nested path: data->client->>fullName accesses the
      // text value of tx.data.client.fullName. ilike pattern with
      // wildcards (* maps to %) gives case-insensitive substring.
      const q=String(fullName).trim();
      if(!q)return[];
      path+="&data->client->>fullName=ilike."+encodeURIComponent("*"+q+"*");
    }else{
      // No identifier → no rows. Forces the caller to provide one;
      // returning ALL shop tx by date alone would be wrong.
      return[];
    }
    if(payment)path+="&data->>payment=eq."+encodeURIComponent(payment);
    if(sinceISO)path+="&data->>date=gte."+encodeURIComponent(sinceISO);
    path+="&order=data->>date.desc&limit="+encodeURIComponent(limit);
    const r=await sbFetch(path);
    if(!r||r.__sbError||r.__sbOk||!Array.isArray(r))return[];
    return r.map(row=>row&&row.data).filter(Boolean);
  },
  // Section 9 Gap 1 — Rolling 30-day cash structuring detection.
  // Sums tx.buyTotal across same-client cash transactions in the
  // last 30 days. Uses clientId when available (precise); falls
  // back to a substring match on tx.client.fullName when staff
  // hasn't linked the in-progress tx to a persisted client yet.
  // The fallback is intentionally fuzzy — for a safety check we
  // accept false positives (over-warn) but not false negatives.
  // Returns 0 on no identifier or on failure (defensive).
  loadCash30dByClient:async(clientId)=>{
    if(!clientId)return 0;
    const rows=await sb._loadTxFiltered({clientId,sinceISO:thirtyDaysAgoISO(),payment:"cash"});
    return sumBuyTotalCash(rows);
  },
  loadCash30dByName:async(fullName)=>{
    const q=String(fullName||"").trim();
    if(!q)return 0;
    const rows=await sb._loadTxFiltered({fullName:q,sinceISO:thirtyDaysAgoISO(),payment:"cash"});
    return sumBuyTotalCash(rows);
  },
  // Section 9 Gap 2 — Same-client same-day linked-tx detection.
  // Returns the array of today's transactions for the given client
  // (newest first). Today = 00:00 local-time today; the date
  // stamps stored on tx records are ISO timestamps so the gte
  // comparison is correct in UTC too. Caller renders the banner +
  // detail modal. No payment filter — staff want to see ALL prior
  // tx today regardless of method. Same fallback semantics as the
  // 30-day structuring loader.
  loadTodayTxByClient:async(clientId)=>{
    if(!clientId)return[];
    return await sb._loadTxFiltered({clientId,sinceISO:startOfTodayISO()});
  },
  loadTodayTxByName:async(fullName)=>{
    const q=String(fullName||"").trim();
    if(!q)return[];
    return await sb._loadTxFiltered({fullName:q,sinceISO:startOfTodayISO()});
  },
  // TFS screening audit log. Inserts a row into tfs_screen_log per
  // staff decision (block / override) plus the LOW-severity audit
  // sweep at finalize. shop_id is set from getCurrentShopId();
  // delete_after is set to 7 years from now to match the existing
  // retention pattern. Caller passes the rest of the columns.
  // Returns sbFetch's success/failure shape so the caller can
  // surface a warning if logging fails.
  logTfsScreen:async(payload)=>{
    const sid=getCurrentShopId();
    const now=new Date();
    const deleteAfter=new Date(now.getTime()+7*365.25*24*3600*1000).toISOString();
    const row={
      shop_id:sid,
      created_at:now.toISOString(),
      delete_after:deleteAfter,
      ...(payload||{}),
    };
    return sbFetch("tfs_screen_log",{method:"POST",body:JSON.stringify(row)});
  },
  // TFS Commit 4 — read-only audit-log surface for the Settings →
  // TFS Screening Log panel. Returns rows newest-first, paginated.
  // status filter mirrors the panel's UI:
  //   "matched"      → matched=true
  //   "not_matched"  → matched=false
  //   "blocked"      → confirmed_match=true (transaction refused)
  //   "overridden"   → override_applied=true
  //   anything else  → no extra filter (returns everything)
  // sinceISO further constrains to created_at >= the given ISO
  // string. shop_id scoping is enforced server-side by RLS plus a
  // belt-and-braces eq filter here.
  loadTfsScreenLog:async({limit=50,offset=0,sinceISO=null,status=null}={})=>{
    const sid=getCurrentShopId();
    let path="tfs_screen_log?shop_id=eq."+encodeURIComponent(sid);
    if(sinceISO)path+="&created_at=gte."+encodeURIComponent(sinceISO);
    if(status==="matched")path+="&matched=is.true";
    else if(status==="not_matched")path+="&matched=is.false";
    else if(status==="blocked")path+="&confirmed_match=is.true";
    else if(status==="overridden")path+="&override_applied=is.true";
    path+="&order=created_at.desc&limit="+encodeURIComponent(limit)+"&offset="+encodeURIComponent(offset);
    const r=await sbFetch(path);
    return Array.isArray(r)?r:[];
  },
};

export const checkPhotoSize=(b64,cb)=>{if(b64)cb(b64);};

export function runMigration(){
  try{
    try{const lib=JSON.parse(localStorage.getItem("gf_logoLib")||"[]");if(!lib.length){localStorage.setItem("gf_logoLib",JSON.stringify([{id:"default-logo",data:SEED_LOGO,isLogo:true}]));const s=JSON.parse(localStorage.getItem("gf_settings")||"{}");localStorage.setItem("gf_settings",JSON.stringify({...s,logoImg:SEED_LOGO}));}}catch(_){}
    if(localStorage.getItem("gf_version")===APP_VERSION)return;
    const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k)keys.push(k);}
    keys.forEach(k=>localStorage.removeItem(k));
    localStorage.setItem("gf_version",APP_VERSION);
  }catch(_){}
}
runMigration();

export function initTxList(){const raw=store.get("txList",[]);return(Array.isArray(raw)?raw:[]).map(t=>{if(t.photoKey&&!t.photo&&(!t.itemPhotos||!Object.keys(t.itemPhotos||{}).length)){const ph=store.get(t.photoKey,null);if(ph)return{...t,photo:ph.idPhoto||null,itemPhotos:ph.itemPhotos||{}};}return t;});}
