// LootLedger — Logo component.
// 2026-05-08. Single source of truth for rendering the LootLedger
// pickaxe-and-shovel branding. Resolves a per-render variant
// (gold / light / dark / dark-large) to the right pre-shipped
// PNG data URI (src/lib/branding.js), unless the shop has
// uploaded a custom logo via Settings → Logo Manager — in which
// case the upload wins on every surface.
//
// The "is this a default" check goes through isDefaultLogo()
// from branding.js, which knows about both the legacy SVG seed
// (constants.js SEED_LOGO) and the new branded LOGO_GOLD_48H.
// That means existing shops whose settings.logoImg already
// holds SEED_LOGO automatically pick up the new branded
// variants without a one-shot Supabase migration.
//
// Variant → asset mapping:
//   "gold"        → LOGO_GOLD_48H        (gold pixels; topbar, lock screen,
//                                          admin chrome — dark surfaces)
//   "light"       → LOGO_LIGHT_48H       (light pixels; reserved for future
//                                          dark-mode marketing surfaces)
//   "light-large" → LOGO_LIGHT_200H      (same as light, larger source)
//   "dark"        → LOGO_DARK_120H       (dark pixels; receipts, AuthLayout,
//                                          admin chrome on white bg)
//   "dark-large"  → LOGO_DARK_120H       (PDF cover headers; the 120h source
//                                          carries enough detail for ~80px
//                                          PDF rendering. A separate 200h
//                                          dark variant is pre-rendered in
//                                          the master file but isn't shipped
//                                          inline this commit because the
//                                          24KB+ data URI exceeds tooling
//                                          limits in this build pass; the
//                                          120h source resampled from the
//                                          973×878 master holds up at print
//                                          resolution and the upgrade is a
//                                          one-line swap when needed.)
// Custom logo (settings.logoImg present and not in KNOWN_DEFAULT_LOGOS):
//   Used as-is on every surface. The shop owner is responsible for
//   contrast — if their logo doesn't read on a particular background
//   they can manage it via Settings → Logo Manager.
//
// Render is a plain <img> with `objectFit: contain` so the aspect
// ratio survives whatever height the caller passes. alt="LootLedger"
// is the screen-reader label for the default. When a custom upload
// is active alt="" so screen readers don't announce a foreign brand
// name; the surrounding context already names the shop.

import React from "react";
import {
  LOGO_GOLD_48H,
  LOGO_LIGHT_48H,
  LOGO_LIGHT_200H,
  LOGO_DARK_120H,
  isDefaultLogo,
} from "../lib/branding.js";

const VARIANT_TO_ASSET = {
  "gold": LOGO_GOLD_48H,
  "light": LOGO_LIGHT_48H,
  "light-large": LOGO_LIGHT_200H,
  "dark": LOGO_DARK_120H,
  "dark-large": LOGO_DARK_120H,
};

export default function Logo({variant="gold", height=32, settings, style, className, alt}){
  const custom = settings && settings.logoImg;
  const useCustom = custom && !isDefaultLogo(custom);
  const src = useCustom ? custom : (VARIANT_TO_ASSET[variant] || LOGO_GOLD_48H);
  const finalAlt = alt!=null ? alt : (useCustom ? "" : "LootLedger");
  return <img
    src={src}
    alt={finalAlt}
    style={{height: height, width: "auto", objectFit: "contain", display: "block", ...style}}
    className={className}
  />;
}
