// LootLedger — document.cookie helpers.
// Phase 5.2-PRE (2026-05-11). Used by the Supabase auth client
// in saas.js to scope sessions to `.lootledger.au` so signing
// in at apex carries auth to subdomain-scoped Netlify sites
// (daylesford.lootledger.au, ballarat.lootledger.au).
//
// Standard document.cookie wrappers with options support. No
// dependencies. Returns null / no-op when document is
// undefined (SSR safety, though we don't currently SSR).
//
// Options accepted by setCookie / removeCookie:
//   domain   — leading dot for cross-subdomain (".lootledger.au")
//   path     — defaults to omitted (browser interprets as current
//              page path); pass "/" for app-wide.
//   maxAge   — seconds from now (preferred for refresh stability)
//   expires  — alternative absolute date; converted via toUTCString
//   sameSite — "Lax" | "Strict" | "None"
//   secure   — boolean; true required when sameSite="None"

export function getCookie(name){
  if(typeof document==="undefined")return null;
  const all=document.cookie.split(";");
  for(let i=0;i<all.length;i++){
    const part=all[i].trim();
    if(part.indexOf(name+"=")===0){
      try{return decodeURIComponent(part.substring(name.length+1));}
      catch(e){return part.substring(name.length+1);}
    }
  }
  return null;
}

export function setCookie(name,value,opts){
  if(typeof document==="undefined")return;
  const o=opts||{};
  let str=name+"="+encodeURIComponent(value==null?"":String(value));
  if(o.domain)str+="; Domain="+o.domain;
  if(o.path)str+="; Path="+o.path;
  if(o.maxAge!=null)str+="; Max-Age="+Math.floor(Number(o.maxAge));
  if(o.expires)str+="; Expires="+new Date(o.expires).toUTCString();
  if(o.sameSite)str+="; SameSite="+o.sameSite;
  if(o.secure)str+="; Secure";
  document.cookie=str;
}

export function removeCookie(name,opts){
  if(typeof document==="undefined")return;
  const o=opts||{};
  let str=name+"=; Max-Age=0; Path="+(o.path||"/");
  if(o.domain)str+="; Domain="+o.domain;
  document.cookie=str;
}
