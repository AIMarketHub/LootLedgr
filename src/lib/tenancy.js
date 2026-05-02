// LootLedger — multi-tenant subdomain helpers.
// Stage 1.A SaaS foundation (2026-05-02).
//
// Each shop gets a slug at signup (kebab-case from business
// name, dedupe via -2/-3 suffix). In production the slug becomes
// the subdomain: ballarat.lootledger.com.au. In dev we run on
// lootledger.netlify.app and on localhost — there are no real
// subdomains, so the helpers fall back to "the user's shop" via
// the auth context.
//
// The Router runs the subdomain check on mount via useShopSlug
// hook; if the URL slug doesn't match the user's shop slug, the
// hook returns a redirect target. App.tsx renders the slug at the
// top of the dashboard so the dealer can see which shop they're
// signed into.

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

// Returns one of:
//   { mode: "dev"    }                  → development, no host check
//   { mode: "apex"   }                  → marketing / login site
//   { mode: "tenant", slug: "ballarat" } → real tenant subdomain
//   { mode: "admin"  }                  → admin.lootledger.* — reserved
//
// Callers branch on .mode. The slug is whatever sits to the left
// of the apex hostname; if the user is on
// "ballarat.lootledger.com.au", slug is "ballarat".
export function detectTenantHost(host){
  const h=String(host||(typeof window!=="undefined"?window.location.hostname:"")||"").toLowerCase();
  if(!h)return{mode:"dev"};
  if(DEV_HOSTS.has(h)||h.endsWith(".netlify.app")||h.endsWith(".local"))return{mode:"dev"};
  if(APEX_HOSTS.has(h))return{mode:"apex"};
  // admin.lootledger.* — reserved subdomain for the SaaS-wide
  // panel. Stage 2 may move /admin onto its own subdomain; for
  // now /admin under /app routing handles it.
  if(/^admin\./.test(h))return{mode:"admin"};
  // Any other host with at least 3 segments (slug.lootledger.au,
  // slug.lootledger.com.au, slug.foo.bar) → take the leftmost as
  // the tenant slug. We don't enforce that the rest matches a
  // known apex — keeps the helper resilient to custom domains
  // and staging hosts.
  const parts=h.split(".");
  if(parts.length<3)return{mode:"dev"};
  return{mode:"tenant",slug:parts[0]};
}

// Convenience: returns the slug or null. Use detectTenantHost for
// the full mode.
export function getCurrentShopFromSubdomain(host){
  const r=detectTenantHost(host);
  return r.mode==="tenant"?r.slug:null;
}

// Builds the URL for a given shop slug, preserving the current
// path / query string. Used by the cross-subdomain redirect when
// the user signs in on the wrong host.
export function buildShopUrl(slug,opts){
  if(typeof window==="undefined")return "";
  const o=opts||{};
  const proto=window.location.protocol;
  const host=window.location.hostname;
  const port=window.location.port?":"+window.location.port:"";
  // In dev, don't actually rewrite host — just stay where we are.
  // The user's shop is identified by auth context, not hostname.
  const r=detectTenantHost(host);
  if(r.mode==="dev")return o.path||window.location.pathname;
  // In production, swap the leftmost subdomain for the target slug.
  const parts=host.split(".");
  if(parts.length<3)return o.path||window.location.pathname;
  parts[0]=String(slug||"").toLowerCase();
  const newHost=parts.join(".");
  const path=o.path||window.location.pathname;
  return proto+"//"+newHost+port+path;
}
