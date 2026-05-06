// LootLedger — TFS list IndexedDB cache.
//
// The screening flow needs to work offline (the dealer's internet
// can drop while a customer is at the counter). We keep a full local
// copy of tfs_list in IndexedDB so the matcher can run synchronously
// against an in-memory snapshot loaded at app boot.
//
// Sync strategy:
//   1. At app boot, syncTfsCache() compares local cache's
//      last_updated_at against tfs_list_metadata.last_updated_at on
//      Supabase.
//   2. If the cache is missing OR Supabase is newer, fetch the full
//      list (paginated 1000 rows per request) and replace the local
//      cache atomically (clear-then-bulk-add).
//   3. If the cache is current, do nothing — instant cold-start.
//
// IndexedDB schema:
//   DB name:   "loot_tfs_cache"  (versioned; bump VERSION below on
//                                  schema changes — that triggers
//                                  the onupgradeneeded handler and
//                                  rebuilds the stores).
//   Stores:
//     "list" — keyPath "id" (the tfs_list.id from Postgres). Index
//              "name_normalized" for fast exact-match lookups.
//     "meta" — keyPath "id". Single row at id="metadata" carrying
//              {last_updated_at, record_count, source_filename}.
//
// We don't try to keep the cache schema in lockstep with Postgres
// columns — IndexedDB stores whole records as objects, so adding a
// new column to tfs_list is a no-op for the cache (it just appears
// on the next sync).

import {supabase} from "../auth/saas.js";

const DB_NAME="loot_tfs_cache";
const VERSION=1;
const STORE_LIST="list";
const STORE_META="meta";
const META_KEY="metadata";

// Open or create the database. The onupgradeneeded handler is the
// only place new stores or indexes can be created; bumping VERSION
// reruns it.
export function openTfsDb(){
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==="undefined"){
      reject(new Error("IndexedDB not available in this browser."));
      return;
    }
    const req=indexedDB.open(DB_NAME,VERSION);
    req.onupgradeneeded=ev=>{
      const db=ev.target.result;
      if(!db.objectStoreNames.contains(STORE_LIST)){
        const store=db.createObjectStore(STORE_LIST,{keyPath:"id"});
        store.createIndex("name_normalized","name_normalized",{unique:false});
        store.createIndex("primary_reference","primary_reference",{unique:false});
      }
      if(!db.objectStoreNames.contains(STORE_META)){
        db.createObjectStore(STORE_META,{keyPath:"id"});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error("Could not open IndexedDB."));
  });
}

function tx(db,storeNames,mode){
  return db.transaction(Array.isArray(storeNames)?storeNames:[storeNames],mode||"readonly");
}

function awaitRequest(req){
  return new Promise((resolve,reject)=>{
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

function awaitTransaction(t){
  return new Promise((resolve,reject)=>{
    t.oncomplete=()=>resolve();
    t.onerror=()=>reject(t.error);
    t.onabort=()=>reject(t.error||new Error("Transaction aborted."));
  });
}

// Read the singleton metadata row from IndexedDB. Returns null if
// the cache hasn't been populated yet.
export async function getCachedMetadata(){
  const db=await openTfsDb();
  try{
    const t=tx(db,STORE_META,"readonly");
    const store=t.objectStore(STORE_META);
    const r=await awaitRequest(store.get(META_KEY));
    return r||null;
  }finally{db.close();}
}

// Read the full cached list. Used by the matcher at app boot to
// load a working snapshot. The list is ~10k records of ~500 bytes
// each — ~5 MB — fast to slurp.
export async function getCachedTfsList(){
  const db=await openTfsDb();
  try{
    const t=tx(db,STORE_LIST,"readonly");
    const store=t.objectStore(STORE_LIST);
    const r=await awaitRequest(store.getAll());
    return Array.isArray(r)?r:[];
  }finally{db.close();}
}

// Indexed exact-match lookup on the normalized name. Useful for
// fast-path checks; the fuzzy matcher in Commit 2 iterates the
// full snapshot from getCachedTfsList() instead.
export async function searchTfsByName(normalizedName){
  if(!normalizedName)return [];
  const db=await openTfsDb();
  try{
    const t=tx(db,STORE_LIST,"readonly");
    const store=t.objectStore(STORE_LIST);
    const ix=store.index("name_normalized");
    const r=await awaitRequest(ix.getAll(normalizedName));
    return Array.isArray(r)?r:[];
  }finally{db.close();}
}

// Atomically replace the cache with a fresh list of records. Used
// after a successful upload AND after a sync from Supabase.
//
// "Atomically" within IndexedDB semantics: a single readwrite
// transaction does the clear-and-bulk-add. If any add fails, the
// transaction aborts and the previous cache is preserved.
export async function replaceTfsCache(records,metadata){
  const db=await openTfsDb();
  try{
    const t=tx(db,[STORE_LIST,STORE_META],"readwrite");
    const list=t.objectStore(STORE_LIST);
    const meta=t.objectStore(STORE_META);
    list.clear();
    for(const rec of records||[]){
      // The Postgres bigserial id maps to a number on the JS side;
      // IndexedDB requires keyPath values to be present + valid.
      // If a row arrives without an id (e.g. straight from the
      // parser before insert), assign a synthetic stable key.
      if(rec.id==null)rec.id="local-"+(rec.reference||Math.random().toString(36).slice(2));
      list.add(rec);
    }
    meta.put({id:META_KEY,...(metadata||{})});
    await awaitTransaction(t);
  }finally{db.close();}
}

// Pull tfs_list_metadata + the full tfs_list from Supabase and
// refresh the local cache, but only if Supabase is newer (or if
// the cache is empty). Returns:
//   {synced: true,  metadata: {...}, recordCount: N}  on actual sync
//   {synced: false, metadata: {...}}                  on no-op (cache fresh)
//   {synced: false, error: "..."}                     on failure
//
// Failure is non-throwing — the screening flow can still run
// against whatever cache is local (possibly stale, possibly empty).
// The UI surfaces the staleness via tfs_list_metadata.last_updated_at.
export async function syncTfsCache(){
  try{
    // Step 1 — fetch the metadata row.
    const{data:meta,error:metaErr}=await supabase.from("tfs_list_metadata").select("*").eq("id",1).maybeSingle();
    if(metaErr)return{synced:false,error:"metadata fetch: "+metaErr.message};
    if(!meta)return{synced:false,error:"No metadata row — list not yet uploaded by an admin."};

    // Step 2 — compare with local cache.
    const cached=await getCachedMetadata();
    if(cached&&cached.last_updated_at===meta.last_updated_at&&cached.record_count===meta.record_count){
      return{synced:false,metadata:meta};
    }

    // Step 3 — fetch the full list, paginated 1000 rows per round-
    // trip (PostgREST max). Order by id for stable pagination.
    const PAGE=1000;
    let from=0;
    const all=[];
    while(true){
      const{data,error}=await supabase
        .from("tfs_list")
        .select("*")
        .order("id",{ascending:true})
        .range(from,from+PAGE-1);
      if(error)return{synced:false,error:"list fetch: "+error.message};
      if(!data||!data.length)break;
      all.push(...data);
      if(data.length<PAGE)break;
      from+=PAGE;
    }

    // Step 4 — replace the local cache atomically.
    await replaceTfsCache(all,{
      last_updated_at:meta.last_updated_at,
      record_count:meta.record_count,
      source_filename:meta.source_filename||null,
    });
    return{synced:true,metadata:meta,recordCount:all.length};
  }catch(e){
    return{synced:false,error:e.message||String(e)};
  }
}
