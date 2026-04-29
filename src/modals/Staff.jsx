// LootLedger — Staff modal.
// Mechanically extracted from src/App.tsx during Phase 2 step 10h
// (briefing §7.3). No semantic changes; markup preserved verbatim.
//
// Add staff members (name + optional role + optional PIN), pick the
// active one (used by the staff section of the new-transaction
// flow), and delete entries. The active selection persists via the
// `activeStaff` state in App.tsx, which is itself written through
// to localStorage by the existing useEffect.
//
// Per-staff PIN (added 2026-04-29 Phase 2.7 follow-up): stored on
// the staff record but does NOT gate authentication yet. Phase 3
// will read these values for the real auth layer. Until then the
// field is purely compliance-tracking metadata. Validation: 4–6
// digits or blank; non-digit input is rejected silently. Display
// in the staff list is masked (•••• style) so the PIN never
// appears in plain text.

import React from "react";
import {T,c} from "../theme.js";
import {sS,uid} from "../lib/utils.js";
import {Modal,F} from "../components/ui";

// Trim, then accept only 4-6 digit strings or blank. Returns the
// canonical value to store, or null if the input is rejected.
function normalizePin(v){
  const s=(v==null?"":String(v)).trim();
  if(s==="")return "";
  if(!/^\d{4,6}$/.test(s))return null;
  return s;
}

export default function Staff({
  staffList,setStaffList,
  staffForm,setStaffForm,
  activeStaff,setActiveStaff,
  pop,setShowStaff,
}){
  const[editId,setEditId]=React.useState(null);
  const[editForm,setEditForm]=React.useState({});
  const startEdit=s=>{setEditId(s.id);setEditForm({name:s.name||"",role:s.role||"",pin:s.pin||""});};
  const cancelEdit=()=>{setEditId(null);setEditForm({});};
  const saveEdit=()=>{
    if(!editForm.name){pop("Name required.","warn");return;}
    const pin=normalizePin(editForm.pin);
    if(pin===null){pop("PIN must be 4–6 digits, or blank.","warn");return;}
    setStaffList(p=>p.map(x=>x.id===editId?{...x,name:editForm.name,role:editForm.role,pin}:x));
    cancelEdit();
    pop("Staff member updated.","ok");
  };
  const addStaff=()=>{
    if(!staffForm.name){pop("Name required.","warn");return;}
    const pin=normalizePin(staffForm.pin);
    if(pin===null){pop("PIN must be 4–6 digits, or blank.","warn");return;}
    setStaffList(p=>[...p,{...staffForm,pin,id:uid()}]);
    setStaffForm({});
    pop("Staff member added.","ok");
  };
  return <Modal title="👥 Staff" onClose={()=>setShowStaff(false)}>
    <div style={{marginBottom:14}}>
      <div style={c.g2(10)}>
        <F label="Staff Name" required value={staffForm.name||""} onChange={v=>setStaffForm(p=>({...p,name:v}))}/>
        <F label="Role" value={staffForm.role||""} onChange={v=>setStaffForm(p=>({...p,role:v}))} placeholder="e.g. Buyer, Manager"/>
        <F label="PIN (4–6 digits)" type="password" value={staffForm.pin||""} onChange={v=>setStaffForm(p=>({...p,pin:v}))} placeholder="optional" note="Stored against this staff member. Phase 3 will use it for staff-level auth; for now it is recorded but not enforced."/>
      </div>
      <button style={c.btn(T.gold)} onClick={addStaff}>Add Staff Member</button>
    </div>
    <div style={{marginBottom:14}}>
      <label style={c.lbl}>Active Staff Member</label>
      <select style={{...c.sel(),width:"100%"}} value={activeStaff} onChange={e=>setActiveStaff(e.target.value)}>
        <option value="">— None selected —</option>
        {(staffList||[]).map(s=><option key={s.id} value={s.id}>{sS(s.name)}{s.role?" ("+s.role+")":""}</option>)}
      </select>
    </div>
    {(staffList||[]).map(s=>editId===s.id?<div key={s.id} style={{...c.card({padding:12}),marginBottom:8}}>
      <div style={c.g2(10)}>
        <F label="Staff Name" required value={editForm.name||""} onChange={v=>setEditForm(p=>({...p,name:v}))}/>
        <F label="Role" value={editForm.role||""} onChange={v=>setEditForm(p=>({...p,role:v}))} placeholder="e.g. Buyer, Manager"/>
        <F label="PIN (4–6 digits)" type="password" value={editForm.pin||""} onChange={v=>setEditForm(p=>({...p,pin:v}))} placeholder="optional"/>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={saveEdit}>Save</button>
        <button style={c.bsm()} onClick={cancelEdit}>Cancel</button>
      </div>
    </div>:<div key={s.id} style={{...c.card({padding:12}),marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <div>
        <div style={{fontWeight:"bold",color:T.white}}>{sS(s.name)}</div>
        <div style={{fontSize:11,color:T.muted}}>{sS(s.role)}{s.pin?" · PIN "+"•".repeat(sS(s.pin).length):" · No PIN"}</div>
      </div>
      <div style={{display:"flex",gap:6}}>
        <button style={c.bsm()} onClick={()=>startEdit(s)}>Edit</button>
        <button style={c.bsm(T.redBg,T.red)} onClick={()=>setStaffList(p=>p.filter(x=>x.id!==s.id))}>🗑</button>
      </div>
    </div>)}
  </Modal>;
}
