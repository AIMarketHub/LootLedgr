// LootLedger — Vendors / Suppliers modal.
// Mechanically extracted from src/App.tsx during Phase 2 step 10g
// (briefing §7.3). No semantic changes; markup preserved verbatim.
//
// Add / edit / delete supplier records. Each entry: name (required),
// ABN/ACN, phone, email, address. Adding stamps `addedAt` with the
// current ISO timestamp.

import React from "react";
import {T,c} from "../theme.js";
import {sS,uid,nowISO} from "../lib/utils.js";
import {Modal,F} from "../components/ui";

export default function Vendors({
  vendors,setVendors,
  vendorForm,setVendorForm,
  editVendor,setEditVendor,
  pop,setShowVendors,
}){
  return <Modal title="🏪 Suppliers / Vendors" onClose={()=>setShowVendors(false)}>
    <div style={{marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:"bold",color:T.white,marginBottom:10}}>{editVendor?"Edit Supplier":"Add Supplier"}</div>
      <div style={c.g2(10)}>
        <F label="Name" required value={vendorForm.name||""} onChange={v=>setVendorForm(p=>({...p,name:v}))}/>
        <F label="ABN / ACN" value={vendorForm.abn||""} onChange={v=>setVendorForm(p=>({...p,abn:v}))}/>
        <F label="Phone" value={vendorForm.phone||""} onChange={v=>setVendorForm(p=>({...p,phone:v}))}/>
        <F label="Email" value={vendorForm.email||""} onChange={v=>setVendorForm(p=>({...p,email:v}))}/>
        <F label="Address" value={vendorForm.address||""} onChange={v=>setVendorForm(p=>({...p,address:v}))}/>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button style={c.btn(T.gold)} onClick={()=>{if(!vendorForm.name){pop("Supplier name required.","warn");return;}if(editVendor)setVendors(p=>p.map(x=>x.id===editVendor.id?{...x,...vendorForm}:x));else setVendors(p=>[...p,{...vendorForm,id:uid(),addedAt:nowISO()}]);setEditVendor(null);setVendorForm({});pop("Supplier saved.","ok");}}>Save</button>
        {editVendor&&<button style={c.bsm()} onClick={()=>{setEditVendor(null);setVendorForm({});}}>Cancel</button>}
      </div>
    </div>
    {(vendors||[]).map(v=><div key={v.id} style={{...c.card({padding:12}),marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div><div style={{fontWeight:"bold",color:T.white}}>{v.name}</div><div style={{fontSize:11,color:T.muted}}>{sS(v.abn)}{v.phone?" · "+v.phone:""}</div></div>
      <div style={{display:"flex",gap:6}}><button style={c.bsm()} onClick={()=>{setEditVendor(v);setVendorForm({...v});}}>✎</button><button style={c.bsm(T.redBg,T.red)} onClick={()=>setVendors(p=>p.filter(x=>x.id!==v.id))}>🗑</button></div>
    </div>)}
  </Modal>;
}
