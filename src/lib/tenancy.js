// LootLedger — multi-tenant subdomain helpers.
// Stage 1.A SaaS foundation (2026-05-02).
// Phase 5.2-PRE refactor (2026-05-11): Fork A — `subdomain`
// (separate column added in migration 0019_shop_subdomains.sql)
// is now the canonical routing key. The existing `slug` column
// (kebab-case from business name) stays as the human-readable
// identifier — surfaced in the admin panel, support tools, and
// the dashboard top-bar — but is no longer used for routing.
//
// Each shop's subdomain is `[a-z0-9]{1,32}` (no hyphens). For
// the platform launch tenants:
//   daylesford.lootledger.au → Daylesford (platform-owner)
//   ballarat.lootledger.au   → Ballarat (platform-owner's boss)
//
// In dev (lootledger.netlify.app, localhost) there's no real
// subdomain — the helpers fall back to "the user's shop" via
// the auth context and skip cross-host enforcement.
//
// Cross-subdomain redirect: RequireAuth runs the check on every
// route resolve; if window.location's subdomain doesn't match
// the user's shop.subdomain, it window.location.replace's to the
// correct host.

const APEX_HOSTS=new Set([
  // Apex (no subdomain) hostnames where the app should show the
  // landing / login surface rather than tenant-scoped content.
  // Adjust as deployments evolve.
  "lootledger.au",
  "www.lootledger.au",
  "lootledger.com.au",
  "www.lootledger.com.au",
]);

const DEV_HOSTS=new Set([
  // Hosts that bypass subdomain logic entirely. In dev there is
  // no subdomain — the user signs in via /login and the app
  // routes them based on their auth context's shop_id, no
  // hostname check.
  "lootledger.netlify.app",
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
]);

// Reserved subdomain words rejected at signup. List documented
// in supabase/migrations/0019_shop_subdomains.sql for cross-
// reference. Enforced in code, not at the DB level.
export const RESERVED_SUBDOMAINS=[
  "admin","api","www","auth","mail","smtp","ftp",
  "blog","app","help","support","status","dev",
  "staging","test","demo","docs","secure","login",
  "signup","dashboard","root","mx","cpanel",
  "webmail","ns1","ns2",
];

// Returns one of:
//   { mode: "dev"     }                       → development, no host check
//   { mode: "apex"    }                       → marketing / login site
//   { mode: "tenant", subdomain: "ballarat" } → real tenant subdomain
//   { mode: "admin"   }                       → admin.lootledger.* — reserved
//
// Callers branch on .mode. The subdomain is whatever sits to
// the left of the apex hostname; if the user is on
// "ballarat.lootledger.au", subdomain is "ballarat".
export function detectTenantHost(host){
  const h=String(host||(typeof window!=="undefined"?window.location.hostname:"")||"").toLowerCase();
  if(!h)return{mode:"dev"};
  if(DEV_HOSTS.has(h)||h.endsWith(".netlify.app")||h.endsWith(".local"))return{mode:"dev"};
  if(APEX_HOSTS.has(h))return{mode:"apex"};
  // admin.lootledger.* — reserved subdomain for the SaaS-wide
  // panel. Stage 2 may move /admin onto its own subdomain; for
  // now /admin under /app routing handles it.
  if(/^admin\./.test(h))return{mode:"admin"};
  // Any other host with at least 3 segments (subdomain.lootledger.au,
  // subdomain.lootledger.com.au, subdomain.foo.bar) → take the
  // leftmost as the tenant subdomain. We don't enforce that the
  // rest matches a known apex — keeps the helper resilient to
  // custom domains and staging hosts.
  const parts=h.split(".");
  if(parts.length<3)return{mode:"dev"};
  return{mode:"tenant",subdomain:parts[0]};
}

// Convenience: returns the subdomain or null. Use detectTenantHost
// for the full mode.
export function getCurrentShopFromSubdomain(host){
  const r=detectTenantHost(host);
  return r.mode==="tenant"?r.subdomain:null;
}

// Builds the URL for a given shop subdomain, preserving the
// current path / query string. Used by the cross-subdomain
// redirect when the user signs in on the wrong host.
export function buildShopUrl(subdomain,opts){
  if(typeof window==="undefined")return "";
  const o=opts||{};
  const proto=window.location.protocol;
  const host=window.location.hostname;
  const port=window.location.port?":"+window.location.port:"";
  // In dev, don't actually rewrite host — just stay where we are.
  // The user's shop is identified by auth context, not hostname.
  const r=detectTenantHost(host);
  if(r.mode==="dev")return o.path||window.location.pathname;
  // Production / apex paths: swap the leftmost subdomain for the
  // target. When current host is the apex (no subdomain), prepend
  // the subdomain to the existing host parts instead of replacing.
  const parts=host.split(".");
  const sd=String(subdomain||"").toLowerCase();
  if(r.mode==="apex"){
    // Apex like "lootledger.au" → "{sd}.lootledger.au"
    parts.unshift(sd);
  }else if(parts.length>=3){
    // Already a subdomain → swap leftmost
    parts[0]=sd;
  }else{
    return o.path||window.location.pathname;
  }
  const newHost=parts.join(".");
  const path=o.path||window.location.pathname;
  return proto+"//"+newHost+port+path;
}

// True if the subdomain string is a reserved word.
// Case-insensitive.
export function isReservedSubdomain(s){
  if(!s)return false;
  return RESERVED_SUBDOMAINS.indexOf(String(s).toLowerCase())!==-1;
}

// True if subdomain matches the storage format constraint:
// 1-32 chars, lowercase alphanumeric only. Mirrors the CHECK
// constraint added by 0019_shop_subdomains.sql.
export function isValidSubdomainFormat(s){
  if(!s)return false;
  return /^[a-z0-9]{1,32}$/.test(s);
}

// Sanitize a candidate subdomain (e.g. from a shop name during
// signup). NFD-decompose to strip diacritics, lowercase, strip
// non-[a-z0-9], truncate to 32 chars. Returns null if result is
// empty after sanitization.
//
// Examples:
//   "Daylesford Gold Trades" → "daylesfordgoldtrades"
//   "Café d'Or" → "cafedor"
//   "!!!" → null
export function sanitizeSubdomainCandidate(input){
  if(!input)return null;
  const cleaned=String(input)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g,"")
    .replace(/[^a-z0-9]/g,"")
    .slice(0,32);
  return cleaned.length===0?null:cleaned;
}
