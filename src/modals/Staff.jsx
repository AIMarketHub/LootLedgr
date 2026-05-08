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
// field is purely compliance-tracking metadata. Validation: 4–12
// digits or blank; non-digit input is rejected silently. Display
// in the staff list is masked (•••• style) so the PIN never
// appears in plain text. The 4–12 range matches the Admin PIN
// policy app-wide.

import React,{useState,useEffect,useCallback} from "react";
import {T,c} from "../theme.js";
import {sS,uid} from "../lib/utils.js";
import {Modal,F,SF} from "../components/ui";
import {useAuth} from "../components/AuthProvider.jsx";
import {supabase,createStaffInvite,setMyPin,setStaffPin,setMyJobTitle} from "../lib/auth/saas.js";

// Trim, then accept only 4-12 digit strings or blank. Returns the
// canonical value to store, or null if the input is rejected.
function normalizePin(v){
  const s=(v==null?"":String(v)).trim();
  if(s==="")return "";
  if(!/^\d{4,12}$/.test(s))return null;
  return s;
}

// Cheap email shape check for the invite form. Server-side
// validation via the create_staff_invite RPC is the authority;
// this just blocks obviously-bad input before round-tripping.
function isValidEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||"").trim());}

// Relative-time helper: "2 days", "in 13 days", "expired".
function relTime(iso){
  if(!iso)return "—";
  const d=new Date(iso).getTime();
  if(!isFinite(d))return "—";
  const diff=d-Date.now();
  const abs=Math.abs(diff);
  const days=Math.floor(abs/86400000);
  const hours=Math.floor((abs%86400000)/3600000);
  const unit=days>0?(days+" day"+(days===1?"":"s")):(hours+" hour"+(hours===1?"":"s"));
  if(diff<0)return "expired "+unit+" ago";
  return "in "+unit;
}

// Display label for a user row.
function userLabel(u){
  if(!u)return "(unknown)";
  const fn=sS(u.first_name||"");
  const ln=sS(u.family_name||"");
  const full=(fn+" "+ln).trim();
  return full||sS(u.email)||"(no name)";
}

export default function Staff({
  staffList,setStaffList,
  staffForm,setStaffForm,
  activeStaff,setActiveStaff,
  pop,setShowStaff,
  withAdminGate,
}){
  // ─── Phase 3 commit 3d-4-b — Supabase-backed sections ────────
  const auth=useAuth();
  const role=(auth&&auth.role)||null;
  const canInvite=role==="owner"||role==="manager";
  const canResetStaffPins=role==="owner";
  const inviteRoleOptions=role==="owner"
    ?[{value:"staff",label:"Staff"},{value:"manager",label:"Manager"},{value:"owner",label:"Owner"}]
    :[{value:"staff",label:"Staff"},{value:"manager",label:"Manager"}];

  // Section A — My PIN + Job Title state.
  const[myPinInput,setMyPinInput]=useState("");
  const[jobTitleInput,setJobTitleInput]=useState("");
  const[myBusy,setMyBusy]=useState(false);
  const myPinSet=!!(auth&&auth.userRecord&&auth.userRecord.pin);

  // Sync job title input from auth.userRecord on mount + auth
  // refresh. PIN field stays empty (it's a "set new" not "edit
  // current" affordance — current PIN is opaque).
  useEffect(()=>{
    setJobTitleInput((auth&&auth.userRecord&&auth.userRecord.job_title)||"");
  },[auth&&auth.userRecord]);

  const onSetMyPin=async()=>{
    const norm=normalizePin(myPinInput);
    if(norm===null||norm===""){pop("PIN must be 4–12 digits.","warn");return;}
    setMyBusy(true);
    try{
      await setMyPin(norm);
      setMyPinInput("");
      if(typeof auth.refresh==="function")await auth.refresh();
      pop("Your PIN was updated.","ok");
    }catch(e){pop("PIN update failed: "+sS(e&&e.message),"err");}
    finally{setMyBusy(false);}
  };
  const onClearMyPin=async()=>{
    if(typeof window!=="undefined"&&window.confirm){
      if(!window.confirm("Clear your per-staff PIN? You'll need the shop Admin PIN to unlock the app until you set a new one."))return;
    }
    setMyBusy(true);
    try{
      await setMyPin(null);
      setMyPinInput("");
      if(typeof auth.refresh==="function")await auth.refresh();
      pop("Your PIN was cleared.","ok");
    }catch(e){pop("Clear failed: "+sS(e&&e.message),"err");}
    finally{setMyBusy(false);}
  };
  const onSaveJobTitle=async()=>{
    setMyBusy(true);
    try{
      await setMyJobTitle(jobTitleInput);
      if(typeof auth.refresh==="function")await auth.refresh();
      pop("Job title updated.","ok");
    }catch(e){pop("Job title update failed: "+sS(e&&e.message),"err");}
    finally{setMyBusy(false);}
  };

  // Section B — Invite state.
  const[inviteEmail,setInviteEmail]=useState("");
  const[inviteRole,setInviteRole]=useState("staff");
  const[inviteBusy,setInviteBusy]=useState(false);
  const[lastInvite,setLastInvite]=useState(null);

  const onSendInvite=async()=>{
    if(!isValidEmail(inviteEmail)){pop("Valid email required.","warn");return;}
    setInviteBusy(true);
    try{
      const inv=await createStaffInvite(inviteEmail.trim(),inviteRole);
      setLastInvite(inv);
      setInviteEmail("");
      // Refresh pending invites list to include the new one.
      await refreshLists();
      pop("Invite created. Share the link with the new staff member.","ok");
    }catch(e){pop("Invite failed: "+sS(e&&e.message),"err");}
    finally{setInviteBusy(false);}
  };

  const inviteUrl=lastInvite?(typeof window!=="undefined"?window.location.origin:"")+"/claim-invite?token="+sS(lastInvite.token):"";
  const onCopyInvite=async()=>{
    if(!inviteUrl)return;
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText){
        await navigator.clipboard.writeText(inviteUrl);
        pop("Invite link copied.","ok");
      }else pop("Clipboard unavailable — copy manually.","warn");
    }catch(_){pop("Copy failed — copy manually.","warn");}
  };

  // Sections C + D — pending invites + active staff lists.
  const[pendingInvites,setPendingInvites]=useState([]);
  const[activeStaffList,setActiveStaffList]=useState([]);
  const[listsLoading,setListsLoading]=useState(true);
  const[resetPinFor,setResetPinFor]=useState(null);

  const refreshLists=useCallback(async()=>{
    if(!auth||!auth.shop||!auth.shop.id)return;
    setListsLoading(true);
    try{
      const[pi,as]=await Promise.all([
        supabase.from("staff_invites")
          .select("id, email, role, token, created_by, created_at, expires_at")
          .eq("shop_id",String(auth.shop.id))
          .is("claimed_at",null)
          .gt("expires_at",new Date().toISOString())
          .order("created_at",{ascending:false}),
        supabase.from("users")
          .select("id, role, first_name, family_name, email, pin, job_title")
          .eq("shop_id",auth.shop.id)
          .order("role",{ascending:true}),
      ]);
      if(!pi.error&&Array.isArray(pi.data))setPendingInvites(pi.data);
      if(!as.error&&Array.isArray(as.data))setActiveStaffList(as.data);
    }finally{setListsLoading(false);}
  },[auth&&auth.shop&&auth.shop.id]);

  useEffect(()=>{refreshLists();},[refreshLists]);

  const onConfirmResetPin=async()=>{
    if(!resetPinFor)return;
    const norm=normalizePin(resetPinFor.value);
    if(norm===null||norm===""){pop("PIN must be 4–12 digits.","warn");return;}
    setResetPinFor(p=>({...p,busy:true}));
    try{
      await setStaffPin(resetPinFor.userId,norm);
      pop("PIN reset for "+sS(resetPinFor.label||"")+". Share securely.","ok");
      setResetPinFor(null);
      await refreshLists();
    }catch(e){
      pop("Reset failed: "+sS(e&&e.message),"err");
      setResetPinFor(p=>({...p,busy:false}));
    }
  };

  // ─── Legacy local-only state (3d-4-c retires) ────────────────
  const[editId,setEditId]=React.useState(null);
  const[editForm,setEditForm]=React.useState({});
  const gate=(reason,fn)=>typeof withAdminGate==="function"?withAdminGate(reason,fn):fn();
  const startEdit=s=>{
    gate("Edit staff member: "+sS(s.name||"(no name)"),()=>{
      setEditId(s.id);
      setEditForm({name:s.name||"",role:s.role||"",pin:s.pin||""});
    });
  };
  const cancelEdit=()=>{setEditId(null);setEditForm({});};
  const saveEditImpl=()=>{
    if(!editForm.name){pop("Name required.","warn");return;}
    const pin=normalizePin(editForm.pin);
    if(pin===null){pop("PIN must be 4–12 digits, or blank.","warn");return;}
    setStaffList(p=>p.map(x=>x.id===editId?{...x,name:editForm.name,role:editForm.role,pin}:x));
    cancelEdit();
    pop("Staff member updated.","ok");
  };
  const saveEdit=()=>gate("Save staff member: "+sS(editForm.name||"(no name)"),saveEditImpl);
  const addStaffImpl=()=>{
    if(!staffForm.name){pop("Name required.","warn");return;}
    const pin=normalizePin(staffForm.pin);
    if(pin===null){pop("PIN must be 4–12 digits, or blank.","warn");return;}
    setStaffList(p=>[...p,{...staffForm,pin,id:uid()}]);
    setStaffForm({});
    pop("Staff member added.","ok");
  };
  const addStaff=()=>gate("Add staff member: "+sS(staffForm.name||"(no name)"),addStaffImpl);
  const deleteStaff=s=>gate("Delete staff member: "+sS(s.name||"(no name)"),()=>{
    setStaffList(p=>p.filter(x=>x.id!==s.id));
    pop("Staff member deleted.","ok");
  });
  return <Modal title="👥 Staff" onClose={()=>setShowStaff(false)}>
    {/* ─── Section A — My PIN + Job Title ─────────────────────── */}
    <div style={{...c.card({padding:14}),marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,letterSpacing:"0.05em",textTransform:"uppercase"}}>My PIN + Job Title</div>
      <div style={{fontSize:11,color:T.muted,marginBottom:10}}>{myPinSet?"You have a per-staff PIN set. The shop Admin PIN also works as a fallback.":"You don't have a per-staff PIN. Set one to unlock the app quickly without using the shop Admin PIN."}</div>
      <div style={c.g2(10)}>
        <F label={myPinSet?"New PIN (4–12 digits)":"PIN (4–12 digits)"} type="password" value={myPinInput} onChange={setMyPinInput} placeholder="••••"/>
        <F label="Job title (decorative)" value={jobTitleInput} onChange={setJobTitleInput} placeholder="e.g. Goldsmith, Buyer"/>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:6}}>
        <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={onSetMyPin} disabled={myBusy||!myPinInput}>{myBusy?"…":"Save PIN"}</button>
        <button style={c.bsm()} onClick={onSaveJobTitle} disabled={myBusy}>{myBusy?"…":"Save job title"}</button>
        {myPinSet&&<button style={c.bsm(T.redBg,T.red)} onClick={onClearMyPin} disabled={myBusy}>Clear PIN</button>}
      </div>
    </div>

    {/* ─── Section B — Invite staff member (owner / manager) ─── */}
    {canInvite&&<div style={{...c.card({padding:14}),marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,letterSpacing:"0.05em",textTransform:"uppercase"}}>Invite Staff Member</div>
      <div style={{fontSize:11,color:T.muted,marginBottom:10}}>The new staff member will get a one-time link. They sign up (or sign in) to claim and join your shop.</div>
      <div style={c.g2(10)}>
        <F label="Email" value={inviteEmail} onChange={setInviteEmail} placeholder="staff@example.com"/>
        <SF label="Role" value={inviteRole} onChange={setInviteRole} options={inviteRoleOptions}/>
      </div>
      <div style={{marginTop:6}}>
        <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={onSendInvite} disabled={inviteBusy||!inviteEmail}>{inviteBusy?"Creating…":"Create invite"}</button>
      </div>
      {lastInvite&&<div style={{...c.bnr("ok"),marginTop:10}}>
        <div style={{fontSize:12,marginBottom:6}}>Invite created for <strong>{sS(lastInvite.email)}</strong> as <strong>{sS(lastInvite.role)}</strong>. Share this link:</div>
        <div style={{background:T.surface,border:"1px solid "+T.border,borderRadius:4,padding:"8px 10px",fontSize:11,fontFamily:"monospace",wordBreak:"break-all",marginBottom:8,color:T.text}}>{inviteUrl}</div>
        <button style={c.bsm(T.goldBg,T.gold)} onClick={onCopyInvite}>📋 Copy link</button>
      </div>}
    </div>}

    {/* ─── Section C — Pending invites ────────────────────────── */}
    <div style={{...c.card({padding:14}),marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,letterSpacing:"0.05em",textTransform:"uppercase"}}>Pending Invites</div>
      {listsLoading?<div style={{fontSize:11,color:T.muted}}>Loading…</div>:pendingInvites.length===0?<div style={{fontSize:11,color:T.muted}}>No pending invites.</div>:pendingInvites.map(inv=>(
        <div key={inv.id} style={{padding:"8px 0",borderBottom:"1px solid "+T.border+"33",fontSize:12}}>
          <div><strong>{sS(inv.email)}</strong> — {sS(inv.role)}</div>
          <div style={{fontSize:10,color:T.muted}}>Expires {relTime(inv.expires_at)} · created {relTime(inv.created_at)}</div>
        </div>
      ))}
    </div>

    {/* ─── Section D — Active staff (Supabase users table) ───── */}
    <div style={{...c.card({padding:14}),marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,letterSpacing:"0.05em",textTransform:"uppercase"}}>Active Staff</div>
      {listsLoading?<div style={{fontSize:11,color:T.muted}}>Loading…</div>:activeStaffList.length===0?<div style={{fontSize:11,color:T.muted}}>No staff yet.</div>:activeStaffList.map(u=>{
        const isMe=auth&&auth.user&&auth.user.id===u.id;
        const userPinSet=!!u.pin;
        const resetting=resetPinFor&&resetPinFor.userId===u.id;
        return <div key={u.id} style={{padding:"10px 0",borderBottom:"1px solid "+T.border+"33"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:160}}>
              <div style={{fontSize:13,color:T.white}}>{userLabel(u)}{isMe?" (you)":""}</div>
              <div style={{fontSize:10,color:T.muted}}>
                <span style={{color:u.role==="owner"?T.gold:u.role==="manager"?T.green:T.muted}}>{sS(u.role).toUpperCase()}</span>
                {u.job_title?" · "+sS(u.job_title):""}
                {" · PIN "+(userPinSet?"•".repeat(Math.max(4,sS(u.pin).length)):"not set")}
              </div>
            </div>
            {canResetStaffPins&&!isMe&&!resetting&&<button style={c.bsm()} onClick={()=>setResetPinFor({userId:u.id,label:userLabel(u),value:"",busy:false})}>Reset PIN</button>}
          </div>
          {resetting&&<div style={{...c.card({padding:10}),marginTop:8,background:T.warn||T.surface}}>
            <div style={{fontSize:11,marginBottom:6}}>Reset PIN for <strong>{sS(resetPinFor.label)}</strong>. They'll need the new PIN to unlock the app.</div>
            <F label="New PIN (4–12 digits)" type="password" value={resetPinFor.value} onChange={v=>setResetPinFor(p=>({...p,value:v}))}/>
            <div style={{display:"flex",gap:8}}>
              <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={onConfirmResetPin} disabled={resetPinFor.busy||!resetPinFor.value}>{resetPinFor.busy?"…":"Confirm reset"}</button>
              <button style={c.bsm()} onClick={()=>setResetPinFor(null)} disabled={resetPinFor.busy}>Cancel</button>
            </div>
          </div>}
        </div>;
      })}
    </div>

    {/* ─── Legacy local-only sections (retired in 3d-4-c) ─────── */}
    <div style={{fontSize:10,color:T.muted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8,marginTop:14}}>Legacy local-only staff list</div>
    <div style={{marginBottom:14}}>
      <div style={c.g2(10)}>
        <F label="Staff Name" required value={staffForm.name||""} onChange={v=>setStaffForm(p=>({...p,name:v}))}/>
        <F label="Role" value={staffForm.role||""} onChange={v=>setStaffForm(p=>({...p,role:v}))} placeholder="e.g. Buyer, Manager"/>
        <F label="PIN (4–12 digits)" type="password" value={staffForm.pin||""} onChange={v=>setStaffForm(p=>({...p,pin:v}))} placeholder="optional" note="Stored against this staff member. Phase 3 will use it for staff-level auth; for now it is recorded but not enforced."/>
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
        <F label="PIN (4–12 digits)" type="password" value={editForm.pin||""} onChange={v=>setEditForm(p=>({...p,pin:v}))} placeholder="optional"/>
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
        <button style={c.bsm(T.redBg,T.red)} onClick={()=>deleteStaff(s)}>🗑</button>
      </div>
    </div>)}
  </Modal>;
}
