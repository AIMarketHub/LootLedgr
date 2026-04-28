// LootLedger — TxPhotoManager.
// Mechanically extracted from src/App.tsx during Phase 2 step 8b
// (briefing §7.3). No semantic changes.
//
// Renders the ID photo + item photos for a selected transaction
// inside the transaction-detail modal. Reads the photo blob from
// localStorage by photoKey, merges any in-memory photos that the
// transaction object still carries, and writes back through
// `store.set` on add/remove.
//
// `store` continues to flow in as a prop (matching the original
// signature). `checkPhotoSize` is imported directly from storage.js
// rather than passed as a new prop — it's a pure pass-through guard
// that lives next to `store` and has the same module-load lifetime.

import React from "react";
import {T,c} from "../theme.js";
import {checkPhotoSize} from "../lib/storage.js";

export default function TxPhotoManager({selTx,store,setTxList,setSelTx}){
  const phKey=selTx.photoKey||("photos_"+selTx.id);
  const localPh=store.get(phKey,{idPhoto:null,itemPhotos:{}});
  const ph={idPhoto:selTx.photo||localPh.idPhoto||null,itemPhotos:{...localPh.itemPhotos,...(selTx.itemPhotos||{})}};
  const imgs=Object.entries(ph.itemPhotos||{});
  const save=updated=>{store.set(phKey,updated);const hasPh=!!(updated.idPhoto||Object.keys(updated.itemPhotos||{}).length);setTxList(prev=>prev.map(t=>t.id===selTx.id?{...t,hasPhotos:hasPh,photoKey:phKey}:t));setSelTx(prev=>({...prev,hasPhotos:hasPh,photoKey:phKey}));};
  return <div>
    <div style={{marginBottom:12}}>
      <div style={{fontSize:11,color:T.muted,marginBottom:6}}>ID / KYC Photo</div>
      {ph.idPhoto?<div style={c.row(10)}><img src={ph.idPhoto} alt="ID" style={{width:80,height:80,objectFit:"cover",borderRadius:6,border:"1px solid "+T.border}}/><button style={c.bsm(T.redBg,T.red)} onClick={()=>save({...ph,idPhoto:null})}>Remove</button></div> :
      <label style={{background:T.surface,border:"1px solid "+T.border,borderRadius:4,padding:"8px 14px",fontSize:12,cursor:"pointer",display:"inline-block",color:T.muted}}>Add ID Photo<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{display:"none"}} onChange={e=>{const f=e.target.files&&e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>checkPhotoSize(ev.target.result,d=>save({...ph,idPhoto:d}));r.readAsDataURL(f);e.target.value="";  }}/></label>}
    </div>
    <div>
      <div style={{fontSize:11,color:T.muted,marginBottom:6}}>Item Photos ({imgs.length})</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:8}}>{imgs.map(([key,src])=><div key={key} style={{position:"relative"}}><img src={src} alt="item" style={{width:72,height:72,objectFit:"cover",borderRadius:6,border:"1px solid "+T.border}}/><button onClick={()=>{const n={...ph,itemPhotos:{...ph.itemPhotos}};delete n.itemPhotos[key];save(n);}} style={{position:"absolute",top:-4,right:-4,background:T.red,color:"#fff",border:"none",borderRadius:"50%",width:18,height:18,fontSize:11,cursor:"pointer",padding:0,lineHeight:"18px",textAlign:"center"}}>x</button></div>)}</div>
      <label style={{background:T.surface,border:"1px solid "+T.border,borderRadius:4,padding:"8px 14px",fontSize:12,cursor:"pointer",display:"inline-block",color:T.muted}}>Add Item Photo<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{display:"none"}} onChange={e=>{const f=e.target.files&&e.target.files[0];if(!f)return;const r=new FileReader();const k="img_"+Date.now();r.onload=ev=>checkPhotoSize(ev.target.result,d=>save({...ph,itemPhotos:{...(ph.itemPhotos||{}),[k]:d}}));r.readAsDataURL(f);e.target.value="";  }}/></label>
    </div>
  </div>;
}
