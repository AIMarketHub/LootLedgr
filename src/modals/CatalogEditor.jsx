// LootLedger — Catalog Editor modal.
// Mechanically extracted from src/App.tsx during Phase 2 step 10e
// (briefing §7.3). No semantic changes; markup preserved verbatim.
//
// Add / edit product entries (label, category, compliance type,
// unit, purity OR carat, fixed weight, buy / sell multipliers).
// Delete from the bottom list. The Cancel-Edit button restores
// `newProd` to its empty defaults — same shape used at the
// App.tsx-level useState initial value.

import React from "react";
import {T,c} from "../theme.js";
import {sN} from "../lib/utils.js";
import {Modal,F,SF} from "../components/ui";

export default function CatalogEditor({
  catalog,
  newProd,setNewProd,
  editProd,setEditProd,
  saveProd,deleteProd,
  setShowCat,
}){
  return <Modal title="Product Catalog Editor" onClose={()=>setShowCat(false)} wide>
    <div style={{marginBottom:18}}>
      <div style={{fontSize:12,fontWeight:"bold",color:T.white,marginBottom:12}}>{editProd?"Edit Product":"Add New Product"}</div>
      <div style={c.g2(10)}>
        <F label="Product Label" required value={newProd.label} onChange={v=>setNewProd(p=>({...p,label:v}))}/>
        <SF label="Category" value={newProd.cat} onChange={v=>setNewProd(p=>({...p,cat:v}))} options={["Gold","Silver","Other"].map(x=>({value:x,label:x}))}/>
        <SF label="Compliance Type" value={newProd.type} onChange={v=>setNewProd(p=>({...p,type:v}))} options={[{value:"bullion",label:"Bullion ($5k CDD)"},{value:"scrap",label:"Scrap / Jewellery ($10k)"},{value:"other",label:"Other"}]}/>
        <SF label="Unit" value={newProd.unit} onChange={v=>setNewProd(p=>({...p,unit:v}))} options={[{value:"g",label:"Grams (g)"},{value:"oz",label:"Troy oz"},{value:"pc",label:"Piece (pc)"}]}/>
        <F label="Purity (0–1, e.g. 0.999)" value={newProd.purity} onChange={v=>setNewProd(p=>({...p,purity:v}))} placeholder="e.g. 0.999"/>
        <F label="Carat (scrap gold only)" value={newProd.carat} onChange={v=>setNewProd(p=>({...p,carat:v}))} placeholder="e.g. 18"/>
        <F label="Fixed Weight g (for coins)" value={newProd.weightG} onChange={v=>setNewProd(p=>({...p,weightG:v}))} placeholder="e.g. 31.1"/>
        <F label="Buy Multiplier" value={newProd.buyMult} onChange={v=>setNewProd(p=>({...p,buyMult:v}))} placeholder="e.g. 0.95"/>
        <F label="Sell Multiplier" value={newProd.sellMult} onChange={v=>setNewProd(p=>({...p,sellMult:v}))} placeholder="e.g. 1.35"/>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button style={c.btn(T.gold)} onClick={saveProd}>Save</button>
        {editProd&&<button style={c.bsm()} onClick={()=>{setEditProd(null);setNewProd({cat:"Other",sub:"",type:"scrap",unit:"g",purity:"",carat:"",label:"",buyMult:"",sellMult:"",weightG:"",active:true});}}>Cancel Edit</button>}
      </div>
    </div>
    <div style={{borderTop:"1px solid "+T.border,paddingTop:14}}>
      <div style={{fontSize:12,fontWeight:"bold",color:T.white,marginBottom:10}}>All Products ({(catalog||[]).length})</div>
      {(catalog||[]).length===0?<div style={{color:T.muted,padding:16,textAlign:"center"}}>No products yet. Add one above.</div>
        :(catalog||[]).map(p=><div key={p.id} style={{background:T.surface,border:"1px solid "+T.border,borderRadius:8,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:"bold",color:T.white,fontSize:13}}>{p.label}</div>
            <div style={{fontSize:11,color:T.muted}}>{p.cat} · {p.type} · {p.unit}{p.carat?" · "+p.carat+"ct":p.purity?" · "+(sN(p.purity)*100).toFixed(0)+"%":""}</div>
            <div style={{fontSize:11,color:T.muted}}>Buy: {p.buyMult!=null?p.buyMult+"×":"custom"} · Sell: {p.sellMult!=null?p.sellMult+"×":"custom"}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <button style={c.bsm()} onClick={()=>{setEditProd(p);setNewProd({...p,purity:p.purity!=null?String(p.purity):"",carat:p.carat!=null?String(p.carat):"",buyMult:p.buyMult!=null?String(p.buyMult):"",sellMult:p.sellMult!=null?String(p.sellMult):"",weightG:p.weightG!=null?String(p.weightG):""})}}>✎ Edit</button>
            <button style={c.bsm(T.redBg,T.red)} onClick={()=>deleteProd(p.id,p.label)}>🗑</button>
          </div>
        </div>)}
    </div>
  </Modal>;
}
