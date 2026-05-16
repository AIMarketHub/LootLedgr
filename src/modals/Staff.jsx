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
import {supabase,createStaffInvite,createStaffProfileManually} from "../lib/auth/saas.js";

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
  const inviteRoleOptions=role==="owner"
    ?[{value:"staff",label:"Staff"},{value:"manager",label:"Manager"},{value:"owner",label:"Owner"}]
    :[{value:"staff",label:"Staff"},{value:"manager",label:"Manager"}];

  // ─── Section A retired 2026-05-16 (fix-forward 1.5) ───────
  // "My PIN + Job Title" — moved into the per-user Profile
  // Settings tab (src/screens/staff/SettingsTab.jsx). This
  // modal is now invite-focused; personal settings belong in
  // the user's own profile, not a shop-wide admin surface.

  // ─── Section A.5 retired 2026-05-16 ────────────────────────
  // The "My Hours (last 14 days)" grid that lived here was
  // replaced by the Staff Workspace at /staff (per-user profile
  // Hours tab) plus the bulk hours editor at /staff/today
  // (owner / manager only). Source file kept on disk per
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

  // Section C — pending invites only. Section D ("Active staff")
  // was retired 2026-05-16; the active-staff CRUD now lives on
  // StaffTiles via the per-tile ✏ Edit panel.
  const[pendingInvites,setPendingInvites]=useState([]);
  const[listsLoading,setListsLoading]=useState(true);

  const refreshLists=useCallback(async()=>{
    if(!auth||!auth.shop||!auth.shop.id)return;
    setListsLoading(true);
    try{
      const pi=await supabase.from("staff_invites")
        .select("id, email, role, token, created_by, created_at, expires_at")
        .eq("shop_id",String(auth.shop.id))
        .is("claimed_at",null)
        .gt("expires_at",new Date().toISOString())
        .order("created_at",{ascending:false});
      if(!pi.error&&Array.isArray(pi.data))setPendingInvites(pi.data);
    }finally{setListsLoading(false);}
  },[auth&&auth.shop&&auth.shop.id]);

  useEffect(()=>{refreshLists();},[refreshLists]);

  // ─── NEW Section E — Add profile manually ────────────────────
  // Used when an email invite isn't viable (no email address,
  // urgent, etc.). Calls the create-staff-profile Edge Function
  // which requires service-role auth (verified caller is owner/
  // manager and same-shop server-side).
  const[manAddOpen,setManAddOpen]=useState(false);
  const[manAddEmail,setManAddEmail]=useState("");
  const[manAddFirst,setManAddFirst]=useState("");
  const[manAddFamily,setManAddFamily]=useState("");
  const[manAddRole,setManAddRole]=useState("staff");
  const[manAddPin,setManAddPin]=useState("");
  const[manAddBusy,setManAddBusy]=useState(false);
  const[manAddResult,setManAddResult]=useState(null);
  const[manAddErr,setManAddErr]=useState("");

  const onCreateManually=async()=>{
    setManAddErr("");
    if(!isValidEmail(manAddEmail)){setManAddErr("Valid email required.");return;}
    if(!manAddFirst.trim()){setManAddErr("First name required.");return;}
    if(!/^\d{4,12}$/.test(manAddPin.trim())){setManAddErr("Initial PIN must be 4–12 digits.");return;}
    setManAddBusy(true);
    const r=await createStaffProfileManually({
      email:manAddEmail.trim(),
      firstName:manAddFirst.trim(),
      familyName:manAddFamily.trim(),
      role:manAddRole,
      pin:manAddPin.trim(),
    });
    setManAddBusy(false);
    if(r&&r.ok){
      setManAddResult({email:manAddEmail.trim(),tempPassword:r.tempPassword,pin:manAddPin.trim()});
      // Clear form for next add (but keep result block visible).
      setManAddEmail("");setManAddFirst("");setManAddFamily("");setManAddRole("staff");setManAddPin("");
      pop&&pop("Profile created. Capture the temp password + PIN now — they won't be shown again.","warn");
    }else{
      setManAddErr("Create failed: "+sS((r&&r.error)||"unknown"));
    }
  };

  return <Modal title="👥 Invite staff" onClose={()=>setShowStaff(false)}>
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

    {/* ─── Section D retired 2026-05-16 ─────────────────────────
        "Active Staff" listing + Reset PIN UI is now on the
        StaffTiles page via the ✏ Edit panel per tile. */}

    {/* ─── Section E — Add profile manually (owner / manager) ─── */}
    {canInvite&&<div style={{...c.card({padding:14}),marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,letterSpacing:"0.05em",textTransform:"uppercase"}}>Add profile manually</div>
      <div style={{fontSize:11,color:T.muted,marginBottom:10}}>
        Use when email invite isn't viable (no email, urgent, in-person setup). Creates the auth user + the staff profile in one step. The temporary password + initial PIN are shown ONCE — capture them before closing.
      </div>
      {!manAddOpen?<button style={c.bsm(T.goldBg,T.gold)} onClick={()=>setManAddOpen(true)}>+ New manual profile</button>:<div>
        <div style={c.g2(10)}>
          <F label="First name" value={manAddFirst} onChange={setManAddFirst} placeholder="Jane"/>
          <F label="Family name" value={manAddFamily} onChange={setManAddFamily} placeholder="Smith"/>
        </div>
        <div style={c.g2(10)}>
          <F label="Email" value={manAddEmail} onChange={setManAddEmail} placeholder="jane@example.com"/>
          <SF label="Role" value={manAddRole} onChange={setManAddRole} options={inviteRoleOptions}/>
        </div>
        <div style={{marginTop:8}}>
          <F label="Initial PIN (4–12 digits)" type="password" value={manAddPin} onChange={setManAddPin} placeholder="••••"/>
        </div>
        {manAddErr?<div style={{...c.bnr("block"),marginTop:10}}>{manAddErr}</div>:null}
        <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
          <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={onCreateManually} disabled={manAddBusy}>{manAddBusy?"Creating…":"Create profile"}</button>
          <button style={c.bsm()} onClick={()=>{setManAddOpen(false);setManAddErr("");setManAddResult(null);}} disabled={manAddBusy}>Close</button>
        </div>
      </div>}
      {manAddResult?<div style={{...c.bnr("warn"),marginTop:10}}>
        <div style={{fontSize:12,fontWeight:"bold",marginBottom:6}}>✅ Profile created. Capture these now:</div>
        <div style={{fontFamily:"monospace",fontSize:12,lineHeight:1.6,color:T.white}}>
          <div>Email: <strong>{sS(manAddResult.email)}</strong></div>
          <div>Temp password: <strong style={{letterSpacing:"0.1em"}}>{sS(manAddResult.tempPassword)}</strong></div>
          <div>Initial PIN: <strong style={{letterSpacing:"0.2em"}}>{sS(manAddResult.pin)}</strong></div>
        </div>
        <div style={{fontSize:10,color:T.muted,marginTop:6}}>The temp password will not be shown again. Have the staff sign in and change it, then set a new PIN via Profile → Settings.</div>
        <div style={{marginTop:8}}>
          <button style={c.bsm()} onClick={()=>setManAddResult(null)}>Done</button>
        </div>
      </div>:null}
    </div>}

  </Modal>;
}
