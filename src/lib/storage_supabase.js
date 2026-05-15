// LootLedger — Supabase Storage helpers.
// Phase 5.2 Commit 1 (2026-05-15). Thin wrappers around
// supabase.storage so call sites don't need to know about the
// signed-URL / direct-upload / delete-object verbs.
//
// Buckets used by this commit:
//   "invoices"         — Settings → Accounting → Invoice Manager
//   "staff-documents"  — Commit 2 (Documents tab)
//
// Both buckets are PRIVATE. Reads happen via short-lived signed
// URLs so the dealer can preview / download invoices without
// exposing a public bucket. Writes are direct uploads from the
// browser using the user's JWT — bucket RLS gates which paths
// they're allowed to write to (see migration 0023's
// STORAGE_RLS_* sections).

import {supabase} from "./auth/saas.js";

// Returns a clean file extension (lowercased, no dot) from a
// MIME type or filename. Falls back to "bin" so storage paths
// always have an extension.
export function extFromFile(file){
  if(!file)return "bin";
  const name=String(file.name||"");
  const dot=name.lastIndexOf(".");
  if(dot>0&&dot<name.length-1)return name.slice(dot+1).toLowerCase();
  const mime=String(file.type||"");
  if(mime==="image/jpeg")return "jpg";
  if(mime==="image/png")return "png";
  if(mime==="image/webp")return "webp";
  if(mime==="application/pdf")return "pdf";
  return "bin";
}

// Upload a File to a bucket at a specific object path. Returns
// {ok:true, path} or {ok:false, error}. The path argument is the
// final path inside the bucket — caller decides the prefix
// convention so bucket RLS matches.
export async function uploadObject(bucket,path,file,opts){
  try{
    const upsert=!!(opts&&opts.upsert);
    const contentType=(opts&&opts.contentType)||file.type||"application/octet-stream";
    const{error}=await supabase.storage.from(bucket).upload(path,file,{
      contentType,
      upsert,
      cacheControl:"3600",
    });
    if(error)return{ok:false,error:error.message||String(error)};
    return{ok:true,path};
  }catch(e){
    return{ok:false,error:(e&&e.message)||String(e)};
  }
}

// Returns {ok:true, url} where url is a short-lived signed
// download URL. ttlSeconds is clamped to [60, 3600] — keep it
// short so URLs don't outlive a session.
export async function signedDownloadUrl(bucket,path,ttlSeconds){
  try{
    const ttl=Math.max(60,Math.min(3600,parseInt(ttlSeconds,10)||300));
    const{data,error}=await supabase.storage.from(bucket).createSignedUrl(path,ttl);
    if(error)return{ok:false,error:error.message||String(error)};
    return{ok:true,url:data&&data.signedUrl};
  }catch(e){
    return{ok:false,error:(e&&e.message)||String(e)};
  }
}

// Delete a single object. Returns {ok:true} or {ok:false, error}.
// Used by the Invoice Manager delete flow.
export async function deleteObject(bucket,path){
  try{
    const{error}=await supabase.storage.from(bucket).remove([path]);
    if(error)return{ok:false,error:error.message||String(error)};
    return{ok:true};
  }catch(e){
    return{ok:false,error:(e&&e.message)||String(e)};
  }
}
