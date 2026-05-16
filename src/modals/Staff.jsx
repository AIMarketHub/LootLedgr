// LootLedger — Staff modal.
//
// Phase 3 commit 3d-4-c (2026-05-09) — fully Supabase-backed.
// Four sections, all reading/writing through the auth context +
// new RPCs (3d-1 + 3d-4-a + 3d-4-b):
//   A — My PIN + Job Title (current user; set_my_pin /
//       set_my_job_title RPCs).
//   B — Invite Staff Member (owner / manager only;
//       create_staff_invite RPC; copy-link affordance).
//   C — Pending Invites (read from staff_invites filtered to
//       current shop, unclaimed + unexpired).
//   D — Active Staff (read from users filtered to current shop;
//       owner-only "Reset PIN" per non-self row via
//       set_staff_pin RPC).
//
// What was retired in 3d-4-c:
//   - Legacy localStorage staffList[] add/edit/delete form.
//   - Legacy active-staff dropdown selector.
//   - activeStaff / setActiveStaff prop drilling.
//   - withAdminGate prop (the new sections gate via the SQL
//     layer + role checks, not the shop-level Admin PIN).
//   - Local editId / editForm state + handlers.
//
// What was retired in the 2026-05-16 fix-forward (after Phase 5.2
// staff-workspace Commit 1):
//   - Section A.5 "My Hours (last 14 days)" grid + its helpers,
//     state, save/unlock handlers. Replaced with a notice pointing
//     to the new /staff workspace (per-user profile Hours tab) and
//     /staff/today (owner/manager bulk editor). Source file kept
//     on disk per "only add, never remove"; only the section is
//     gone.

import React,{useState,useEffect,useCallback} from "react";
import {T,c} from "../theme.js";
import {sS} from "../lib/utils.js";
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

export default function Staff({pop,setShowStaff}){
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

  // ─── Section A.5 retired 2026-05-16 ────────────────────────
  // The "My Hours (last 14 days)" grid that lived here was
  // replaced by the Staff Workspace at /staff (per-user profile
  // Hours tab) plus the bulk hours editor at /staff/today
  // (owner / manager only). See the redirect notice card in the
  // JSX below for the user-facing pointer. Source-file removal
  // is intentionally NOT done — the file stays on disk per
  // "only add, never remove."

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

    {/* ─── Section A.5 — RETIRED 2026-05-16 (redirect notice) ── */}
    <div style={{...c.card({padding:14}),marginBottom:14,borderColor:T.gold}}>
      <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,letterSpacing:"0.05em",textTransform:"uppercase"}}>My Hours — moved</div>
      <div style={{fontSize:12,color:T.text,lineHeight:1.5,marginBottom:10}}>
        Hours editing has moved out of this modal. There are now two surfaces:
      </div>
      <ul style={{fontSize:12,color:T.text,lineHeight:1.6,paddingLeft:20,marginTop:0,marginBottom:10}}>
        <li><strong>Your own hours</strong> — Dashboard → 🗂 Workspace → tap your tile → Hours tab. 14-day view with previous-week navigation, lock/unlock, and auto-save drafts.</li>
        <li><strong>Boss bulk entry</strong> (owner/manager) — Dashboard → 🗂 Workspace → 📅 Bulk hours editor. Pick a date, tick the staff who worked, fill hours, save them all in one round-trip.</li>
      </ul>
      <div style={{fontSize:11,color:T.muted}}>Both surfaces read and write the same staff_hours rows — entries here surface there immediately, and vice versa.</div>
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

  </Modal>;
}
