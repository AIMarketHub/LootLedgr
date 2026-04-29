// LootLedger — Prices screen.
// Mechanically extracted from src/App.tsx during Phase 2 step 9e
// (briefing §7.3). No semantic changes; markup preserved verbatim.
//
// Renders the manual spot-price override panel (configurable TTL),
// the API status / refresh row, the API-error banner, and the
// catalog grouped by metal with computed buy/sell unit prices.
//
// `manualTs` is a useRef forwarded from App.tsx so the countdown
// against MANUAL_TTL can be computed at render time. MANUAL_TTL is
// derived in App.tsx from settings.manualPriceTTL — pass-through
// numeric prop (or Infinity when "Always on" is selected, in which
// case the countdown is suppressed and the override never auto-
// expires; Refresh / Resume API still cancels).

import React from "react";
import {T,c} from "../theme.js";
import {fmtAUD} from "../lib/utils.js";
import {calcUnitPrice} from "../lib/compliance/index.js";
import {AIGhost,SF} from "../components/ui";

const TTL_OPTIONS=[{value:"always",label:"Always on"},{value:"1h",label:"1 hour"},{value:"6h",label:"6 hours"},{value:"12h",label:"12 hours"},{value:"24h",label:"24 hours"}];

export default function Prices({
  settings,setSettings,gSpot,sSpot,catalog,
  spotStatus,spotSource,apiError,
  manualTs,MANUAL_TTL,
  setShowCat,setGSpotManual,setSSpotManual,forceResumeAPI,
}){
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <div style={{fontSize:17,fontWeight:"bold",color:T.white}}>Price Sheet<AIGhost settings={settings} label="Prices"/></div>
      <button style={c.btn(T.border,T.text,{padding:"8px 14px",fontSize:11})} onClick={()=>setShowCat(true)}>✎ Edit Catalog</button>
    </div>
    <div style={c.card({padding:12,marginBottom:14})}>
      <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10}}>Manual Spot Override</div>
      <div style={{display:"flex",gap:10}}>
        <div style={{flex:1}}><label style={c.lbl}>Gold (AUD/oz)</label><input style={c.inp()} type="number" value={gSpot||""} onChange={e=>setGSpotManual(parseFloat(e.target.value)||0)}/></div>
        <div style={{flex:1}}><label style={c.lbl}>Silver (AUD/oz)</label><input style={c.inp()} type="number" value={sSpot||""} onChange={e=>setSSpotManual(parseFloat(e.target.value)||0)}/></div>
        <div style={{flex:1}}><SF label="TTL" value={settings.manualPriceTTL||"1h"} onChange={v=>setSettings(p=>({...p,manualPriceTTL:v}))} options={TTL_OPTIONS}/></div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,flexWrap:"wrap"}}>
        <span style={{fontSize:11,flex:1,color:spotStatus==="live"?T.readyGreen:spotStatus==="manual"?T.gold:T.orange}}>{spotStatus==="live"?"🟢 Live — "+spotSource:spotStatus==="manual"?(MANUAL_TTL===Infinity?"🟡 Manual — always on":(()=>{const m=Math.max(0,Math.ceil((MANUAL_TTL-(Date.now()-manualTs.current))/60000));return "🟡 Manual — "+m+" min remaining";})()):"🟠 No API feed"}</span>
        <button style={c.btn(spotStatus==="manual"?T.gold:T.border,spotStatus==="manual"?T.bg:T.muted,{fontSize:11,padding:"7px 16px"})} onClick={forceResumeAPI}>↺ {spotStatus==="manual"?"Resume API":"Refresh"}</button>
      </div>
    </div>
    {apiError&&<div style={{background:"#2a0a0a",border:"1px solid #cc3333",borderRadius:6,padding:"10px 14px",marginTop:8,fontSize:12,color:"#ff6666",wordBreak:"break-word"}}><strong>API Error:</strong> {apiError}</div>}
    {(catalog||[]).filter(p=>p.active).length===0 ?
      <div style={{...c.card({padding:40}),textAlign:"center"}}><div style={{fontSize:18,marginBottom:12}}>📂</div><div style={{color:T.white,fontWeight:"bold",marginBottom:8}}>No products in catalog</div><button style={c.btn(T.gold,T.bg,{fontSize:12})} onClick={()=>setShowCat(true)}>+ Add First Product</button></div>
      :["Gold","Silver","Other"].map(cat=>{const prods=(catalog||[]).filter(p=>p.cat===cat&&p.active);if(!prods.length)return null;return <div key={cat} style={{marginBottom:14}}>
        <div style={c.shead(cat==="Gold")}>{cat==="Gold"?"⬡":cat==="Silver"?"◈":"◇"} {cat}</div>
        {prods.map(p=><div key={p.id} style={{...c.card({padding:12}),marginBottom:6,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{flex:1}}>
            <div style={{fontWeight:"bold",color:T.white,fontSize:13}}>{p.label}</div>
            <div style={{fontSize:11,color:T.muted,marginTop:2}}><span style={c.badge(p.type==="bullion"?T.gold:T.muted)}>{p.type}</span><span style={{marginLeft:6}}>{p.unit}{p.carat?" · "+p.carat+"ct":p.purity?" · "+(p.purity*100).toFixed(0)+"%":""}</span></div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontSize:13,fontWeight:"bold",color:T.green}}>Buy: {fmtAUD(calcUnitPrice(p,gSpot,sSpot,"buy"))}/{p.unit}</div>
            <div style={{fontSize:13,fontWeight:"bold",color:T.gold}}>Sell: {fmtAUD(calcUnitPrice(p,gSpot,sSpot,"sell"))}/{p.unit}</div>
          </div>
        </div>)}
      </div>;})}
  </div>;
}
