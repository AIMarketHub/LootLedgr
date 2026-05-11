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
//   path     — pass "/" for app-wide.
//   maxAge   — seconds from now (preferred for refresh stability)
//   expires  — alternative absolute date; converted via toUTCString
//   sameSite — "Lax" | "Strict" | "None"
//   secure   — boolean; true required when sameSite="None"
//
// 5.2-PRE bug-fix iteration (2026-05-11): cross-subdomain reads
// were returning null on subdomains even though document.cookie
// confirmed the cookie was present. Re-implemented the parser
// to match the cookie's "; "-separated layout precisely (the
// `name=` prefix check is now exact-match against split tokens
// rather than indexOf at-position-0; the previous approach
// could be fooled by trim() removing the leading space but
// leaving the equals sign comparison brittle).
//
// DEBUG flag: set window.__LOOT_AUTH_COOKIE_DEBUG__ = true in
// the browser console to enable verbose logging of every cookie
// read/write. Off by default in production.

function _debug(){
  if(typeof window==="undefined")return false;
  return!!window.__LOOT_AUTH_COOKIE_DEBUG__;
}
function _log(){
  if(!_debug())return;
  try{console.log.apply(console,["[loot-cookie]"].concat(Array.prototype.slice.call(arguments)));}catch(e){}
}

export function getCookie(name){
  if(typeof document==="undefined")return null;
  const raw=document.cookie||"";
  if(!raw){_log("get",name,"→ null (no document.cookie)");return null;}
  // Cookies are joined by "; " per RFC; split on ";" + trim each
  // to be tolerant of "; " vs ";" producers.
  const tokens=raw.split(";");
  const prefix=name+"=";
  for(let i=0;i<tokens.length;i++){
    const tok=tokens[i].trim();
    if(tok.length<prefix.length)continue;
    if(tok.substring(0,prefix.length)!==prefix)continue;
    const rawVal=tok.substring(prefix.length);
    let decoded;
    try{decoded=decodeURIComponent(rawVal);}
    catch(e){
      _log("get",name,"→ decodeURIComponent threw; returning raw value (len="+rawVal.length+")",e&&e.message);
      return rawVal;
    }
    _log("get",name,"→ ok (rawLen="+rawVal.length+", decodedLen="+decoded.length+", first8="+decoded.substring(0,8)+")");
    return decoded;
  }
  _log("get",name,"→ null (not in "+tokens.length+" tokens)");
  return null;
}

export function setCookie(name,value,opts){
  if(typeof document==="undefined")return;
  const o=opts||{};
  const sval=value==null?"":String(value);
  const encoded=encodeURIComponent(sval);
  let str=name+"="+encoded;
  if(o.domain)str+="; Domain="+o.domain;
  if(o.path)str+="; Path="+o.path;
  if(o.maxAge!=null)str+="; Max-Age="+Math.floor(Number(o.maxAge));
  if(o.expires)str+="; Expires="+new Date(o.expires).toUTCString();
  if(o.sameSite)str+="; SameSite="+o.sameSite;
  if(o.secure)str+="; Secure";
  _log("set",name,"(rawLen="+sval.length+", encodedLen="+encoded.length+", totalLen="+str.length+", domain="+(o.domain||"-")+")");
  document.cookie=str;
}

export function removeCookie(name,opts){
  if(typeof document==="undefined")return;
  const o=opts||{};
  let str=name+"=; Max-Age=0; Path="+(o.path||"/");
  if(o.domain)str+="; Domain="+o.domain;
  _log("remove",name,"(domain="+(o.domain||"-")+")");
  document.cookie=str;
}
