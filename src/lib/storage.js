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

const SB_URL=import.meta.env.VITE_SUPABASE_URL;
const SB_KEY=import.meta.env.VITE_SUPABASE_KEY;
const SHOP_ID="default";

export const store={
  get:(k,d)=>{try{const v=localStorage.getItem("gf_"+k);return v!=null?JSON.parse(v):d;}catch(_){return d;}},
  set:(k,v)=>{try{localStorage.setItem("gf_"+k,JSON.stringify(v));}catch(_){}},
  del:(k)=>{try{localStorage.removeItem("gf_"+k);}catch(_){}},
};

export const sbFetch=async(path,opts={})=>{try{const r=await fetch(SB_URL+"/rest/v1/"+path,{...opts,headers:{"apikey":SB_KEY,"Authorization":"Bearer "+SB_KEY,"Content-Type":"application/json","Prefer":opts.prefer||"",...opts.headers}});if(!r.ok)return null;const t=await r.text();return t?JSON.parse(t):null;}catch(_){return null;}};

const ts=()=>new Date().toISOString();
const upsSB=(tbl,body)=>sbFetch(tbl+"?on_conflict="+(tbl==="settings"?"shop_id":"id"),{method:"POST",prefer:"resolution=merge-duplicates",body:JSON.stringify(body)});

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
