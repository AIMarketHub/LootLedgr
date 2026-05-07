// LootLedger — theme palette and module-level style helpers.
// Mechanically extracted from src/App.tsx during Phase 2 step 6
// (briefing §7.3). No semantic changes; values preserved verbatim.
//
// `LIGHT` is the single canonical palette today. Future themes
// (DARK is contemplated but not yet built; briefing §5 hints at it
// landing in Phase 9 polish) will be added beside LIGHT and the
// component will pick between them.
//
// `T` is the live "current theme" object. Initialised as a shallow
// clone of LIGHT so the component can overlay contrast/density
// adjustments on T (Object.assign(T, …)) without mutating LIGHT
// itself. The original code in App.tsx used `var T = LIGHT` and
// reassigned T to a new object on contrast change; the extraction
// preserves the same end-state by mutating T's properties in place
// (App.tsx now does Object.assign(T, LIGHT) to reset and
// Object.assign(T, {…overrides}) to apply contrast). Property
// values at any given render are identical to the original.
//
// `c` is the initial style-helper object. Functions inside `c`
// close over this module's T and read it at call time, so the
// component's in-render overrides flow through automatically.
// The component additionally mutates `c` via Object.assign(c, …)
// to apply font-size / simplicity (`simp`) adjustments — those
// dynamic overrides depend on component state and remain in
// App.tsx by design (briefing §7.3 step 6 is explicit on this).

export const LIGHT={bg:"#F5F4F0",surface:"#FFF",card:"#FFF",border:"rgba(0,0,0,0.12)",gold:"#9C7A00",goldLight:"#C9A520",goldDim:"#E8C840",goldBg:"#FEFBEE",silver:"#4A7A78",silverDim:"#7AB0AC",silverBg:"#EEF5F4",green:"#9C7A00",greenDim:"#C9A520",greenBg:"#FEFBEE",readyGreen:"#22c55e",readyGreenBg:"#F0FDF4",orange:"#F97316",orangeDim:"#F97316",orangeBg:"#FFF7ED",red:"#EF4444",redDim:"#EF4444",redBg:"#FEF2F2",blue:"#9C7A00",blueBg:"#FEFBEE",text:"#111",textDim:"#3A3A3A",muted:"#737373",white:"#111",ff:"'Inter',-apple-system,sans-serif"};

export const T={...LIGHT};

export const c={
  card:(x={})=>({background:T.card,border:"1px solid "+T.border,borderRadius:10,boxShadow:"6px 6px 19px rgba(0,0,0,0.18),3px 3px 0 rgba(0,0,0,0.06),inset 0 1px 0 rgba(255,255,255,0.07)",...x}),
  inp:(x={})=>({background:T.surface,border:"1px solid "+T.border,borderRadius:6,color:T.text,fontFamily:T.ff,fontSize:13,padding:"9px 12px",outline:"none",width:"100%",boxSizing:"border-box",...x}),
  sel:(x={})=>({background:T.card,border:"1px solid "+T.border,borderRadius:6,color:T.text,fontFamily:T.ff,fontSize:12,padding:"8px 12px",outline:"none",...x}),
  btn:(bg=T.gold,col="#080c09",x={})=>({background:bg,color:col,border:"none",borderRadius:6,padding:"14px 28px",fontFamily:T.ff,fontSize:14,fontWeight:"bold",letterSpacing:"0.08em",textTransform:"uppercase",cursor:"pointer",whiteSpace:"nowrap",...x,boxShadow:"4px 4px 14px rgba(0,0,0,0.22)"}),
  bsm:(bg=T.border,col=T.text)=>({background:bg,color:col,border:"none",borderRadius:5,padding:"10px 18px",fontFamily:T.ff,fontSize:13,fontWeight:"600",cursor:"pointer",whiteSpace:"nowrap",boxShadow:"3px 3px 10px rgba(0,0,0,0.18)"}),
  lbl:{fontSize:10,color:T.muted,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:5,display:"block"},
  row:(g=12)=>({display:"flex",alignItems:"center",gap:g}),
  g2:(g=16)=>({display:"grid",gridTemplateColumns:"1fr 1fr",gap:g}),
  g3:(g=12)=>({display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:g}),
  g4:(g=13)=>({display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:g}),
  th:{padding:"8px 12px",fontSize:10,color:T.muted,letterSpacing:"0.1em",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid "+T.border,background:T.surface},
  td:(x={})=>({padding:"9px 12px",fontSize:12,borderBottom:"1px solid "+T.border+"22",verticalAlign:"middle",...x}),
  dot:(col)=>({width:10,height:10,borderRadius:"50%",background:col,boxShadow:"0 0 8px "+col+"99",flexShrink:0,display:"inline-block"}),
  badge:(col,bg)=>({display:"inline-block",padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:"bold",color:col,background:bg||col+"22"}),
  // 2026-05-08 — red and orange banners (warn / block) carry
  // fontWeight:700 so compliance alerts visually outweigh the
  // surrounding regular text. Info banners (gold) stay at the
  // default weight; they're informational, not actionable.
  bnr:(lv)=>{const m={info:[T.gold,T.goldBg],warn:[T.orange,T.orangeBg],block:[T.red,T.redBg]};const[cl,bg]=m[lv]||m.info;const bold=lv==="warn"||lv==="block";return{background:bg,border:"1px solid "+cl+"55",borderRadius:6,padding:"10px 14px",marginBottom:8,fontSize:12,color:cl,lineHeight:1.6,fontWeight:bold?700:undefined};},
  shead:(g)=>({padding:"10px 16px",background:g?T.gold+"18":T.silver+"14",borderBottom:"1px solid "+T.border,fontSize:11,fontWeight:"bold",letterSpacing:"0.12em",textTransform:"uppercase",color:g?T.goldLight:T.silver}),
};

// Note for the th and lbl entries: these are static objects (not
// factory functions). They were captured from T at module load and
// will NOT pick up later mutations of T. App.tsx's dynamic-override
// block re-assigns lbl with a fresh T-driven version on every
// render via Object.assign(c, {…lbl…}); th does not currently
// receive a dynamic override, which mirrors original App.tsx
// behaviour. Same applies to the muted/border colours referenced in
// the in-render style overrides (gf-focus stylesheet, etc.).
