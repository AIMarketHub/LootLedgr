// LootLedger — Staff modal.
// Mechanically extracted from src/App.tsx during Phase 2 step 10h
// (briefing §7.3). No semantic changes; markup preserved verbatim.
//
// Add staff members (name + optional role), pick the active one
// (used by the staff section of the new-transaction flow), and
// delete entries. The active selection persists via the
// `activeStaff` state in App.tsx, which is itself written through
// to localStorage by the existing useEffect.

import React from "react";
import {T,c} from "../theme.js";
import {sS,uid} from "../lib/utils.js";
import {Modal,F} from "../components/ui";

export default function Staff({
  staffList,setStaffList,
  staffForm,setStaffForm,
  activeStaff,setActiveStaff,
  pop,setShowStaff,
}){
  return <Modal title="👥 Staff" onClose={()=>setShowStaff(false)}>
    <div style={{marginBottom:14}}>
      <div style={c.g2(10)}>
        <F label="Staff Name" required value={staffForm.name||""} onChange={v=>setStaffForm(p=>({...p,name:v}))}/>
        <F label="Role" value={staffForm.role||""} onChange={v=>setStaffForm(p=>({...p,role:v}))} placeholder="e.g. Buyer, Manager"/>
      </div>
      <button style={c.btn(T.gold)} onClick={()=>{if(!staffForm.name){pop("Name required.","warn");return;}setStaffList(p=>[...p,{...staffForm,id:uid()}]);setStaffForm({});pop("Staff member added.","ok");}}>Add Staff Member</button>
    </div>
    <div style={{marginBottom:14}}>
      <label style={c.lbl}>Active Staff Member</label>
      <select style={{...c.sel(),width:"100%"}} value={activeStaff} onChange={e=>setActiveStaff(e.target.value)}>
        <option value="">— None selected —</option>
        {(staffList||[]).map(s=><option key={s.id} value={s.id}>{sS(s.name)}{s.role?" ("+s.role+")":""}</option>)}
      </select>
    </div>
    {(staffList||[]).map(s=><div key={s.id} style={{...c.card({padding:12}),marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div><div style={{fontWeight:"bold",color:T.white}}>{sS(s.name)}</div><div style={{fontSize:11,color:T.muted}}>{sS(s.role)}</div></div>
      <button style={c.bsm(T.redBg,T.red)} onClick={()=>setStaffList(p=>p.filter(x=>x.id!==s.id))}>🗑</button>
    </div>)}
  </Modal>;
}
