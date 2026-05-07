// LootLedger — branding assets (rewritten 2026-05-08).
//
// Logo files live as static assets in public/logos/, served by
// Vite as URL paths from the site root. The browser fetches and
// caches them; the build embeds a single small URL string in the
// JS bundle instead of a multi-megabyte base64 blob.
//
// Single-variant design: the same logo (black silhouette + gold
// ring on transparent background) reads correctly on every
// surface — dark UI chrome, white printed receipts, white admin
// pages, white PDF covers. No more variant routing; the Logo
// component just picks the closest pre-rendered size for the
// requested rendered height.
//
// Why URL paths instead of inline base64
// --------------------------------------
// Previous commits (49b48d0 + c403a36) inlined PNG bytes as
// base64 data URIs in this file. The Write tool truncated
// strings >12k chars mid-payload, producing valid PNG headers
// with corrupt IDAT chunks — these decoded as fully-transparent
// 132×120 images, so the new branding "rendered" but invisibly,
// and the c403a36 onError fallback to SEED_LOGO masked the
// failure. Static files in public/ skip that ingestion path
// entirely; what's on disk is what the browser fetches.
//
// Resolution choices: 48 / 64 / 80 / 120 / 200. Pre-rendered
// sources cover the surface heights actually used (32, 40, 64,
// 80) plus PDF cover headroom. The Logo component picks the
// closest-or-larger source so the displayed pixels stay crisp
// without sending the 200h monster to a 32-pixel topbar.

import {SEED_LOGO} from "./constants.js";

export const LOGO_48 = "/logos/logo_ringed_48h.png";
export const LOGO_64 = "/logos/logo_ringed_64h.png";
export const LOGO_80 = "/logos/logo_ringed_80h.png";
export const LOGO_120 = "/logos/logo_ringed_120h.png";
export const LOGO_200 = "/logos/logo_ringed_200h.png";

// Default-logo recognition. settings.logoImg holds the per-shop
// active logo. When it matches one of these "default" markers,
// the Logo component treats it as "no custom upload — render
// the branded asset". Anything else (a real shop upload via
// LogoManager) wins on every surface.
//
// SEED_LOGO is the legacy gold "LL" SVG seeded by App.tsx's
// first-run effect (still present, unchanged) — keeping it in
// this set is what lets shops with the old seed in their
// Supabase settings.logoImg automatically pick up the new
// branded PNGs without a one-shot data migration.
export const KNOWN_DEFAULT_LOGOS = new Set([SEED_LOGO]);

export function isDefaultLogo(src){
  if(!src)return true;
  return KNOWN_DEFAULT_LOGOS.has(src);
}
