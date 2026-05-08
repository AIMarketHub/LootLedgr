// LootLedger — Logo component (rewritten 2026-05-08).
//
// Single-variant single-prop design. The branded asset is one
// black-silhouette + gold-ring PNG on a transparent background,
// pre-rendered at 48 / 64 / 80 / 120 / 200 pixel heights and
// served as a static file from public/logos/ (see branding.js).
// The component picks the closest-or-larger source for the
// requested rendered height, so a 32px topbar gets the 48px
// source (~4KB) and a 200px PDF cover header gets the 200px
// source. No variant prop — there's only one logo.
//
// Custom shop uploads via Settings → Logo Manager still win on
// every surface: when settings.logoImg is non-default per
// isDefaultLogo(), it's used as-is.
//
// What changed from the previous (49b48d0 / c403a36) version
// ----------------------------------------------------------
//   • variant prop dropped — there's no contrast routing now.
//   • onError fallback dropped — static files in public/ either
//     load or fail loudly; no silent corruption window like
//     base64 inlining had.
//   • per-instance error state + useEffect dropped along with
//     the fallback.
//   • imports trimmed: just the URL constants and isDefaultLogo.
// Visually: every existing call site rendered "dark" or "gold"
// before. The new branded asset works on both surface types,
// so removing variant doesn't change what staff actually see.

import React from "react";
import {LOGO_48,LOGO_64,LOGO_80,LOGO_120,LOGO_200,isDefaultLogo} from "../lib/branding.js";

// Picks the smallest pre-rendered source whose native height is
// >= the requested rendered height, so we never up-scale and
// blur. Falls through to LOGO_200 for anything taller than the
// largest source (graceful degradation; the 200h is high enough
// that down-scaling is rare).
function pickAsset(height){
  if(height<=48)return LOGO_48;
  if(height<=64)return LOGO_64;
  if(height<=80)return LOGO_80;
  if(height<=120)return LOGO_120;
  return LOGO_200;
}

export default function Logo({height=32,settings,style,className,alt}){
  const custom=settings&&settings.logoImg;
  const useCustom=custom&&!isDefaultLogo(custom);
  const src=useCustom?custom:pickAsset(height);
  const finalAlt=alt!=null?alt:(useCustom?"":"LootLedger");
  return <img
    src={src}
    alt={finalAlt}
    style={{height:height,width:"auto",objectFit:"contain",display:"block",...style}}
    className={className}
  />;
}
