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

import React,{useState,useEffect,useCallback} from "react";
import {T,c} from "../theme.js";
import {sS,todayStr,daysAgoISO} from "../lib/utils.js";
import {Modal,F,SF} from "../components/ui";
import {useAuth} from "../components/AuthProvider.jsx";
import {supabase,createStaffInvite,setMyPin,setStaffPin,setMyJobTitle,listStaffHours,upsertStaffHours} from "../lib/auth/saas.js";

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

// "Thu 09 May" label for the My Hours 14-day grid.
function formatDateLabel(iso){
  if(!iso)return "";
  const d=new Date(iso+"T00:00:00");
  if(isNaN(d.getTime()))return iso;
  return d.toLocaleDateString("en-AU",{weekday:"short",day:"2-digit",month:"short"});
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

  // ─── Section A.5 — My Hours (14-day catch-up) ───────────────
  // State: per-row {date, start, end, break, note, dirty,
  // existing_id}. Pre-filled from listStaffHours(...) on mount;
  // dirty flag tracks edits since the last successful save.
  const[hoursPin,setHoursPin]=useState("");
  const[hoursRows,setHoursRows]=useState([]);
  const[hoursLoading,setHoursLoading]=useState(true);
  const[hoursSaving,setHoursSaving]=useState(false);

  const refreshMyHours=useCallback(async()=>{
    if(!auth||!auth.shop||!auth.shop.id||!auth.user||!auth.user.id)return;
    setHoursLoading(true);
    try{
      const fromDate=daysAgoISO(13);
      const toDate=todayStr();
      const all=await listStaffHours(String(auth.shop.id),fromDate,toDate);
      const mine=all.filter(r=>r.user_id===auth.user.id);
      // Build 14-row grid (today + 13 days back, newest first).
      const rows=[];
      for(let i=0;i<14;i++){
        const date=daysAgoISO(i);
        const existing=mine.find(r=>r.work_date===date);
        rows.push(existing?{
          date,
          start:existing.start_time?String(existing.start_time).slice(0,5):"",
          end:existing.end_time?String(existing.end_time).slice(0,5):"",
          break:String(existing.break_minutes||0),
          note:sS(existing.note),
          dirty:false,
          existing_id:existing.id,
        }:{date,start:"",end:"",break:"0",note:"",dirty:false,existing_id:null});
      }
      setHoursRows(rows);
    }catch(e){
      pop&&pop("Could not load your hours: "+sS(e&&e.message),"err");
    }finally{setHoursLoading(false);}
  },[auth&&auth.shop&&auth.shop.id,auth&&auth.user&&auth.user.id]);

  useEffect(()=>{refreshMyHours();},[refreshMyHours]);

  const updateHoursRow=(idx,patch)=>{
    setHoursRows(p=>p.map((r,i)=>i===idx?{...r,...patch,dirty:true}:r));
  };

  const onSaveMyHours=async()=>{
    const pin=String(hoursPin||"").trim();
    if(!/^\d{4,12}$/.test(pin)){pop("Enter your 4-12 digit per-staff PIN.","warn");return;}
    setHoursSaving(true);
    let saved=0,failed=0;
    try{
      for(const row of hoursRows){
        if(!row.dirty)continue;
        // Skip blank rows that have no existing entry — nothing
        // to do. Owner-only DELETE for clearing existing entries
        // is handled outside this UI.
        if(!row.existing_id&&!row.start&&!row.end&&(parseInt(row.break,10)||0)===0&&!row.note)continue;
        try{
          await upsertStaffHours({
            pin,
            userId:auth.user.id,
            workDate:row.date,
            startTime:row.start||null,
            endTime:row.end||null,
            breakMinutes:parseInt(row.break,10)||0,
            note:row.note||"",
          });
          saved++;
        }catch(e){
          failed++;
          pop&&pop("Save failed for "+formatDateLabel(row.date)+": "+sS(e&&e.message),"err");
        }
      }
      if(saved>0){
        pop&&pop("Saved "+saved+" day"+(saved===1?"":"s")+(failed>0?" ("+failed+" failed)":"."),"ok");
        await refreshMyHours();
        setHoursPin("");
      }else if(failed===0){
        pop&&pop("No changes to save.","warn");
      }
    }finally{setHoursSaving(false);}
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

    {/* ─── Section A.5 — My Hours (last 14 days) ──────────────── */}
    <div style={{...c.card({padding:14}),marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,letterSpacing:"0.05em",textTransform:"uppercase"}}>My Hours (last 14 days)</div>
      <div style={{fontSize:11,color:T.muted,marginBottom:10}}>Catch-up entry for your own shifts. Edit any date in the past 14 days; PIN-required save covers all changed rows.</div>
      <F label="Your per-staff PIN (4–12 digits)" type="password" value={hoursPin} onChange={setHoursPin} placeholder="••••"/>
      {hoursLoading?<div style={{fontSize:11,color:T.muted,marginTop:8}}>Loading…</div>:hoursRows.length===0?<div style={{fontSize:11,color:T.muted,marginTop:8}}>No rows.</div>:<div style={{marginTop:8}}>
        <div style={{display:"grid",gridTemplateColumns:"110px 1fr 1fr 1fr 2fr",gap:8,fontSize:10,color:T.muted,letterSpacing:"0.05em",textTransform:"uppercase",paddingBottom:6,borderBottom:"1px solid "+T.border+"55"}}>
          <div>Date</div><div>Start</div><div>End</div><div>Break (min)</div><div>Note</div>
        </div>
        {hoursRows.map((row,idx)=>(
          <div key={row.date} style={{display:"grid",gridTemplateColumns:"110px 1fr 1fr 1fr 2fr",gap:8,padding:"6px 0",borderBottom:"1px solid "+T.border+"22",alignItems:"center"}}>
            <div style={{fontSize:11,color:T.text}}>{formatDateLabel(row.date)}{row.dirty?<span style={{color:T.gold,marginLeft:6}}>•</span>:null}</div>
            <input style={c.inp({padding:"6px 8px",fontSize:12})} type="time" value={row.start} onChange={e=>updateHoursRow(idx,{start:e.target.value})}/>
            <input style={c.inp({padding:"6px 8px",fontSize:12})} type="time" value={row.end} onChange={e=>updateHoursRow(idx,{end:e.target.value})}/>
            <input style={c.inp({padding:"6px 8px",fontSize:12})} type="number" min="0" max="1440" value={row.break} onChange={e=>updateHoursRow(idx,{break:e.target.value})}/>
            <input style={c.inp({padding:"6px 8px",fontSize:12})} type="text" value={row.note} onChange={e=>updateHoursRow(idx,{note:e.target.value})} placeholder="optional"/>
          </div>
        ))}
      </div>}
      <div style={{marginTop:10}}>
        <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={onSaveMyHours} disabled={hoursSaving||hoursLoading||!hoursPin}>{hoursSaving?"Saving…":"Save changed rows"}</button>
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

  </Modal>;
}
