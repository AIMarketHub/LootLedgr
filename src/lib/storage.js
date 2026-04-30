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
// SHOP_ID is hardcoded "default" for the single-tenant pre-Phase-3
// app. Phase 3 (auth) will swap this for a per-user / per-tenant id.
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

const SB_URL=import.meta.env.VITE_SUPABASE_URL;
const SB_KEY=import.meta.env.VITE_SUPABASE_KEY;
// Exported (Phase 2.7.2) so src/lib/clients.js can scope its REST
// queries to the same shop. Phase 3 swaps this for a per-user /
// per-tenant id read from the auth session.
export const SHOP_ID="default";

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
export const sbFetch=async(path,opts={})=>{
  try{
    const r=await fetch(SB_URL+"/rest/v1/"+path,{...opts,headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":"application/json","Prefer":opts.prefer||"",...opts.headers}});
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

export const sb={
  saveTx:async tx=>upsSB("transactions",{id:tx.id,shop_id:SHOP_ID,data:tx,updated_at:ts()}),
  loadTxList:async()=>{const r=await sbFetch("transactions?shop_id=eq."+SHOP_ID+"&order=updated_at.desc&limit=500");return r?r.map(x=>x.data):null;},
  deleteTx:async id=>sbFetch("transactions?id=eq."+id,{method:"DELETE"}),
  saveStock:async item=>upsSB("stock",{id:item.id,shop_id:SHOP_ID,data:item,updated_at:ts()}),
  loadStock:async()=>{const r=await sbFetch("stock?shop_id=eq."+SHOP_ID+"&order=updated_at.desc&limit=2000");return r?r.map(x=>x.data):null;},
  deleteStock:async id=>sbFetch("stock?id=eq."+id,{method:"DELETE"}),
  saveSettings:async s=>upsSB("settings",{shop_id:SHOP_ID,data:s,updated_at:ts()}),
  loadSettings:async()=>{const r=await sbFetch("settings?shop_id=eq."+SHOP_ID+"&limit=1");return r&&r[0]?r[0].data:null;},
  saveCatalog:async cat=>upsSB("catalog",{id:"catalog_"+SHOP_ID,shop_id:SHOP_ID,data:cat,updated_at:ts()}),
  loadCatalog:async()=>{const r=await sbFetch("catalog?id=eq.catalog_"+SHOP_ID+"&limit=1");return r&&r[0]?r[0].data:null;},
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
