// LootLedger — Stock screen.
// Mechanically extracted from src/App.tsx during Phase 2 step 9c
// (briefing §7.3). No semantic changes; markup preserved verbatim.
//
// Renders the stock / hold manager: a top row with the accounting
// download button, the frozen-snapshot banner (with manager-PIN-
// gated freeze / unfreeze), three category totals (Gold / Silver /
// Other) over the unsold inventory, the colour legend, and the
// list of StockCard rows (or an empty state).
//
// All state and callbacks flow in via props from App.tsx.

import React from "react";
import {T,c} from "../theme.js";
import {sN,sS,fmtAUD,hoursLeft,todayStr,formatDateAU} from "../lib/utils.js";
import {AIGhost} from "../components/ui";
import StockCard from "../components/StockCard.jsx";

export default function Stock({
  settings,gSpot,sSpot,stock,frozenSnap,
  dlAccounting,setPinModal,setFrozenSnap,pop,
  togglePoliceHold,setPinVal,setStock,setEditStockId,setEditStockVal,
  setPoliceHoldModal,
}){
  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
      <div style={{fontSize:17,fontWeight:"bold",color:T.white}}>Stock / Hold Manager<AIGhost settings={settings} label="Stock"/></div>
      <button style={c.btn(T.gold,T.bg,{fontSize:11,padding:"7px 12px"})} onClick={dlAccounting}>📊 Accounting</button>
    </div>
    {frozenSnap?<div style={{...c.bnr("warn"),marginBottom:10}}>❄ Frozen at {formatDateAU(frozenSnap.frozenAt)} — Au {fmtAUD(frozenSnap.gSpot)}/oz · Ag {fmtAUD(frozenSnap.sSpot)}/oz<button style={{...c.bsm(T.redBg,T.red),marginLeft:10,fontSize:10}} onClick={()=>setPinModal({reason:"Unfreeze snapshot — Admin PIN required.",cb:()=>{setFrozenSnap(null);pop("Snapshot unfrozen.","ok");}})}>Unfreeze</button></div> :
    <div style={{...c.bnr("info"),marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>📸 No frozen snapshot. Lock prices for month-end accounting.</span><button style={{...c.bsm(T.goldBg,T.gold),fontSize:10}} onClick={()=>setPinModal({reason:"Freeze snapshot at current spot prices — Admin PIN required.",cb:()=>{setFrozenSnap({gSpot,sSpot,frozenAt:todayStr()});pop("Snapshot locked.","ok");}})}>❄ Freeze Now</button></div>}
    {(stock||[]).length>0&&(
      <div style={c.g3(10)}>
        {["Gold","Silver","Other"].map(cat=>{const items=(stock||[]).filter(s=>s.product&&s.product.cat===cat&&!s.sold);if(!items.length)return null;return <div key={cat} style={c.card({padding:12,borderLeft:"3px solid "+(cat==="Gold"?T.gold:cat==="Silver"?T.silver:T.muted)})}>
          <div style={{fontSize:10,color:T.muted,textTransform:"uppercase",marginBottom:4}}>{cat==="Gold"?"⬡":cat==="Silver"?"◈":"◇"} {cat}</div>
          <div style={{fontSize:15,fontWeight:"bold",color:cat==="Gold"?T.gold:cat==="Silver"?T.silver:T.text}}>{fmtAUD(items.reduce((a,s)=>a+sN(s.price),0))}</div>
          <div style={{fontSize:10,color:T.readyGreen,marginTop:2}}>{items.filter(s=>!s.policeHold&&hoursLeft(s.holdUntil)<=0).length} ready</div>
        </div>;})}
      </div>
    )}
    <div style={{fontSize:11,color:T.muted,marginTop:8,marginBottom:12}}>🟠 In hold · 🟢 Ready for sale · 🔴 Police Hold</div>
    {/* Section 9 Gap 4 polish — top-of-list reminder when stock
        items lack a storage location. Police-locate-on-demand
        compliance fails if staff can't point at a bay/tray for
        every held item. Only counts unsold items (sold items
        are no longer on premises so location is irrelevant). */}
    {(()=>{
      const missing=(stock||[]).filter(s=>s&&!s.sold&&!sS(s.storageLocation).trim()).length;
      if(!missing)return null;
      return <div style={{...c.bnr("warn"),marginBottom:12}}>📍 {missing} item{missing===1?"":"s"} missing a storage location. Edit each affected item and set a bay / safe / tray so police can locate on demand (Vic SHD Act §21A).</div>;
    })()}
    {(stock||[]).length===0?<div style={{color:T.muted,padding:40,textAlign:"center"}}>No stock items yet.</div>
      :(stock||[]).map(s=><StockCard key={s.id} s={s} frozenSnap={frozenSnap} gSpot={gSpot} sSpot={sSpot} togglePoliceHold={togglePoliceHold} setPinModal={setPinModal} setPinVal={setPinVal} setStock={setStock} setEditStockId={setEditStockId} setEditStockVal={setEditStockVal} setPoliceHoldModal={setPoliceHoldModal}/>)}
  </div>;
}
