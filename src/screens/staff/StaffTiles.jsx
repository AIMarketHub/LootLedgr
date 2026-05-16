// LootLedger — Staff workspace tile selector.
// Phase 5.2 Commit 1 (2026-05-15).
//
// Lists every user in the current shop as a tile. Click a tile →
// PIN prompt → on success navigate to /staff/profile/{user_id}.
// PIN verification + 3-strike server-side lockout via the
// verify_staff_pin RPC (migration 0023).
//
// The PIN entered here is cached in sessionStorage so the Profile
// can pass it to the upsert_staff_hours RPC without re-prompting.
// Key: gf_staff_pin_session_{user_id}. Cleared on lock / sign-out.

import React,{useEffect,useState,useRef,useCallback} from "react";
import {useNavigate} from "react-router-dom";
import {T,c} from "../../theme.js";
import {sS} from "../../lib/utils.js";
import {F} from "../../components/ui";
import {useAuth} from "../../components/AuthProvider.jsx";
import {supabase,verifyStaffPin} from "../../lib/auth/saas.js";
// 2026-05-16 — UI merge. The Staff modal (now Invite-focused)
// is opened from the "👥 Invite staff" button on this page
// rather than from a separate Dashboard entry.
import Staff from "../../modals/Staff.jsx";
// 2026-05-16 fix-forward 1.5 — per-tile ✏ Edit panel for
// owner / manager.
import EditStaffPanel from "./EditStaffPanel.jsx";

const ADMIN_PIN_SESSION_KEY="gf_admin_pin_session";

function userLabel(u){
  if(!u)return "(unknown)";
  const fn=sS(u.first_name||"");
  const ln=sS(u.family_name||"");
  const full=(fn+" "+ln).trim();
  return full||sS(u.email)||"(no name)";
}

function roleBadge(role){
  const r=sS(role).toLowerCase();
  if(r==="owner")return{label:"OWNER",color:T.gold};
  if(r==="manager")return{label:"MANAGER",color:T.green};
  return{label:"STAFF",color:T.muted};
}

export const SESSION_PIN_KEY=(userId)=>"gf_staff_pin_session_"+userId;

export default function StaffTiles(){
  const navigate=useNavigate();
  const auth=useAuth();
  const[users,setUsers]=useState([]);
  const[loading,setLoading]=useState(true);
  const[errMsg,setErrMsg]=useState("");

  const[gateFor,setGateFor]=useState(null); // {user, pin, busy, msg}
  // Staff modal (Invite staff) toggle.
  const[showStaffModal,setShowStaffModal]=useState(false);
  // Per-tile Edit panel + admin PIN gate cached for the session.
  const[editTarget,setEditTarget]=useState(null); // user being edited
  const[adminGate,setAdminGate]=useState(null);  // {targetUser, pin, busy, msg}
  // Toast for the Staff modal's pop() callback.
  const[toast,setToast]=useState(null);
  const toastTimer=useRef(null);
  const pop=useCallback((text,kind)=>{
    if(toastTimer.current)clearTimeout(toastTimer.current);
    setToast({text,kind:kind||"info"});
    toastTimer.current=setTimeout(()=>setToast(null),3500);
  },[]);

  useEffect(()=>{
    if(!auth||!auth.shop||!auth.shop.id){setLoading(false);return;}
    let cancelled=false;
    (async()=>{
      setLoading(true);
      const{data,error}=await supabase.from("users")
        .select("id, role, job_title, first_name, family_name, email, pin, is_active")
        .eq("shop_id",auth.shop.id)
        .eq("is_active",true)
        .order("role",{ascending:true})
        .order("family_name",{ascending:true});
      if(cancelled)return;
      if(error){
        setErrMsg("Could not load staff: "+sS(error.message));
        setUsers([]);
      }else{
        setUsers(Array.isArray(data)?data:[]);
        setErrMsg("");
      }
      setLoading(false);
    })();
    return()=>{cancelled=true;};
  },[auth&&auth.shop&&auth.shop.id]);

  const openGate=(user)=>{
    setGateFor({user,pin:"",busy:false,msg:""});
  };

  const submitGate=async()=>{
    if(!gateFor||!gateFor.user)return;
    const pin=String(gateFor.pin||"").trim();
    if(!/^\d{4,12}$/.test(pin)){
      setGateFor(p=>({...p,msg:"PIN must be 4–12 digits."}));
      return;
    }
    setGateFor(p=>({...p,busy:true,msg:""}));
    try{
      const r=await verifyStaffPin(gateFor.user.id,pin);
      if(r&&r.ok){
        try{sessionStorage.setItem(SESSION_PIN_KEY(gateFor.user.id),pin);}catch(_){}
        setGateFor(null);
        navigate("/staff/profile/"+gateFor.user.id);
        return;
      }
      // Failure paths.
      const err=r&&r.error;
      if(err==="locked"){
        const until=r&&r.locked_until?new Date(r.locked_until):null;
        setGateFor(p=>({...p,busy:false,msg:"Locked"+(until?" until "+until.toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit"}):"")+". Try again later."}));
      }else if(err==="no_pin"){
        setGateFor(p=>({...p,busy:false,msg:"No PIN set for this user yet. Set one via Staff → My PIN."}));
      }else if(err==="wrong"&&r.locked_until){
        const until=new Date(r.locked_until);
        setGateFor(p=>({...p,busy:false,msg:"Too many wrong attempts. Locked until "+until.toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit"})+"."}));
      }else if(err==="wrong"&&typeof r.remaining==="number"){
        setGateFor(p=>({...p,busy:false,pin:"",msg:"Wrong PIN. "+r.remaining+" attempt"+(r.remaining===1?"":"s")+" left."}));
      }else{
        setGateFor(p=>({...p,busy:false,msg:"PIN check failed."}));
      }
    }catch(e){
      setGateFor(p=>({...p,busy:false,msg:"PIN check failed: "+sS(e&&e.message)}));
    }
  };

  // Per-tile Edit flow.
  // First ✏ click in a session prompts for the admin's own PIN
  // (verified against their own users row via verify_staff_pin).
  // Subsequent ✏ clicks skip the prompt — the verified PIN lives
  // in sessionStorage under ADMIN_PIN_SESSION_KEY for the
  // duration of the browser session.
  const openEdit=(targetUser)=>{
    if(!auth||!auth.user)return;
    let cached="";
    try{cached=sessionStorage.getItem(ADMIN_PIN_SESSION_KEY)||"";}catch(_){}
    if(cached){
      setEditTarget(targetUser);
      return;
    }
    setAdminGate({targetUser,pin:"",busy:false,msg:""});
  };

  const submitAdminGate=async()=>{
    if(!adminGate||!auth||!auth.user)return;
    const pin=String(adminGate.pin||"").trim();
    if(!/^\d{4,12}$/.test(pin)){
      setAdminGate(p=>({...p,msg:"PIN must be 4–12 digits."}));
      return;
    }
    setAdminGate(p=>({...p,busy:true,msg:""}));
    try{
      const r=await verifyStaffPin(auth.user.id,pin);
      if(r&&r.ok){
        try{sessionStorage.setItem(ADMIN_PIN_SESSION_KEY,pin);}catch(_){}
        const t=adminGate.targetUser;
        setAdminGate(null);
        setEditTarget(t);
        return;
      }
      const err=r&&r.error;
      if(err==="locked"){
        const until=r&&r.locked_until?new Date(r.locked_until):null;
        setAdminGate(p=>({...p,busy:false,msg:"Your PIN is locked"+(until?" until "+until.toLocaleTimeString("en-AU",{hour:"2-digit",minute:"2-digit"}):"")+"."}));
      }else if(err==="no_pin"){
        setAdminGate(p=>({...p,busy:false,msg:"You have no PIN set. Open your own profile → Settings → Set PIN."}));
      }else if(err==="wrong"&&typeof r.remaining==="number"){
        setAdminGate(p=>({...p,busy:false,pin:"",msg:"Wrong PIN. "+r.remaining+" attempt"+(r.remaining===1?"":"s")+" left."}));
      }else{
        setAdminGate(p=>({...p,busy:false,msg:"PIN check failed."}));
      }
    }catch(e){
      setAdminGate(p=>({...p,busy:false,msg:"PIN check failed: "+sS(e&&e.message)}));
    }
  };

  const reloadTiles=()=>{
    // Force the users effect to re-fetch by toggling a no-op
    // state. Simpler: clear users and let the existing effect
    // refire on shop_id (unchanged) by re-mounting an empty list.
    // Cheapest: re-call the same load logic inline.
    if(!auth||!auth.shop||!auth.shop.id)return;
    setLoading(true);
    supabase.from("users")
      .select("id, role, job_title, first_name, family_name, email, pin, is_active")
      .eq("shop_id",auth.shop.id)
      .eq("is_active",true)
      .order("role",{ascending:true})
      .order("family_name",{ascending:true})
      .then(({data,error})=>{
        if(error){setErrMsg("Could not reload staff: "+sS(error.message));setUsers([]);}
        else{setUsers(Array.isArray(data)?data:[]);setErrMsg("");}
        setLoading(false);
      });
  };

  const callerCanEdit=auth&&(auth.role==="owner"||auth.role==="manager");

  return <div style={{minHeight:"100vh",background:T.bg,color:T.text,padding:"24px 18px",fontFamily:"system-ui"}}>
    <div style={{maxWidth:900,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:18,fontWeight:"bold",color:T.white}}>🗂 Staff Workspace</div>
          <div style={{fontSize:11,color:T.muted,marginTop:4}}>{(auth&&auth.shop&&auth.shop.business_name)||"Shop"}</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {/* Fix-forward 2026-05-16 — bulk hours editor link, owner/manager only. */}
          {callerCanEdit?<button style={c.bsm(T.goldBg,T.gold)} onClick={()=>navigate("/staff/today")}>📅 Bulk hours editor</button>:null}
          {/* 2026-05-16 fix-forward 1.5 — Invite staff (formerly
              "Manage staff"). The Staff modal is now invite-focused
              after Section A + D were retired in favour of the
              per-user Profile → Settings tab + per-tile ✏ Edit. */}
          <button style={c.bsm(T.goldBg,T.gold)} onClick={()=>setShowStaffModal(true)}>👥 Invite staff</button>
          <button style={c.bsm()} onClick={()=>navigate("/app")}>← Back to dashboard</button>
        </div>
      </div>

      {/* 2026-05-16 — identity display + shared-device model explainer. */}
      <div style={{padding:"10px 12px",background:T.surface,border:"1px solid "+T.border,borderRadius:6,marginBottom:14,fontSize:11,color:T.text,lineHeight:1.5}}>
        <div>
          <strong style={{color:T.gold}}>Logged in as:</strong>{" "}
          <span style={{color:T.white}}>{(auth&&auth.user&&auth.user.email)||"(unknown)"}</span>
          {auth&&auth.role?<span style={{color:T.muted}}> · {sS(auth.role).toUpperCase()}</span>:null}
        </div>
        <div style={{marginTop:4,color:T.muted}}>
          Click your own tile + enter your PIN to access your personal profile. Click someone else's tile + their PIN if you need to act in their profile (e.g. edit your own hours on a shared device).
        </div>
      </div>

      {loading?<div style={{fontSize:12,color:T.muted}}>Loading…</div>:null}
      {errMsg?<div style={{...c.bnr("block"),marginBottom:14}}>{errMsg}</div>:null}
      {!loading&&users.length===0?<div style={{...c.card({padding:18}),fontSize:12,color:T.muted}}>No staff in this shop yet. Open Dashboard → 👥 Staff to invite someone.</div>:null}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))",gap:12}}>
        {users.map(u=>{
          const badge=roleBadge(u.role);
          const hasPin=!!u.pin;
          const isMe=auth&&auth.user&&auth.user.id===u.id;
          // Manager can't edit owners. Owner can edit anyone except
          // self. Manager can edit themselves via Profile Settings.
          const canEditThisTile=callerCanEdit&&!isMe&&(auth.role==="owner"||u.role!=="owner");
          return <div key={u.id} style={{position:"relative"}}>
            <button
              onClick={()=>openGate(u)}
              style={{...c.card({padding:16}),width:"100%",textAlign:"left",cursor:"pointer",border:"1px solid "+T.border,background:T.surface,minHeight:120,display:"flex",flexDirection:"column",justifyContent:"space-between",fontFamily:"inherit"}}
            >
              <div>
                <div style={{fontSize:13,fontWeight:"bold",color:T.white,marginBottom:6,paddingRight:20}}>{userLabel(u)}{isMe?" (you)":""}</div>
                {u.job_title?<div style={{fontSize:11,color:T.muted,marginBottom:6}}>{sS(u.job_title)}</div>:null}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:9,fontWeight:"bold",color:badge.color,letterSpacing:"0.08em"}}>{badge.label}</span>
                <span style={{fontSize:10,color:hasPin?T.gold:T.red}}>{hasPin?"🔒 PIN set":"⚠ No PIN"}</span>
              </div>
            </button>
            {canEditThisTile?<button
              title="Edit staff"
              onClick={e=>{e.stopPropagation();openEdit(u);}}
              style={{position:"absolute",top:6,right:6,width:28,height:28,padding:0,fontSize:12,background:T.gold,color:T.bg,border:"1px solid "+T.bg,borderRadius:4,cursor:"pointer",fontWeight:"bold"}}
            >✏</button>:null}
          </div>;
        })}
      </div>
    </div>

    {gateFor&&<div style={{position:"fixed",inset:0,background:"#000000e0",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>!gateFor.busy&&setGateFor(null)}>
      <div style={{...c.card({padding:20}),maxWidth:400,width:"100%"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:14,fontWeight:"bold",color:T.white,marginBottom:6}}>Enter PIN for {userLabel(gateFor.user)}</div>
        <div style={{fontSize:11,color:T.muted,marginBottom:12}}>4–12 digit per-staff PIN.</div>
        <F label="PIN" type="password" value={gateFor.pin} onChange={v=>setGateFor(p=>({...p,pin:v,msg:""}))} placeholder="••••"/>
        {gateFor.msg?<div style={{fontSize:11,color:T.red,marginTop:8}}>{gateFor.msg}</div>:null}
        <div style={{display:"flex",gap:10,marginTop:14,justifyContent:"flex-end"}}>
          <button style={c.bsm()} onClick={()=>setGateFor(null)} disabled={gateFor.busy}>Cancel</button>
          <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={submitGate} disabled={gateFor.busy||!gateFor.pin}>{gateFor.busy?"…":"Unlock"}</button>
        </div>
      </div>
    </div>}

    {/* 2026-05-16 — Staff modal opened from the "Invite staff"
        button. Same component used previously from the Dashboard. */}
    {showStaffModal?<Staff pop={pop} setShowStaff={(v)=>{setShowStaffModal(v);if(!v)reloadTiles();}}/>:null}

    {/* 2026-05-16 fix-forward 1.5 — admin PIN gate before Edit. */}
    {adminGate?<div style={{position:"fixed",inset:0,background:"#000000e0",zIndex:2050,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>!adminGate.busy&&setAdminGate(null)}>
      <div style={{...c.card({padding:20}),maxWidth:400,width:"100%"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:14,fontWeight:"bold",color:T.white,marginBottom:6}}>🔐 Admin PIN required</div>
        <div style={{fontSize:11,color:T.muted,marginBottom:12}}>Enter your own per-staff PIN to manage other staff. Cached for this browser session.</div>
        <F label="Your PIN" type="password" value={adminGate.pin} onChange={v=>setAdminGate(p=>({...p,pin:v,msg:""}))} placeholder="••••"/>
        {adminGate.msg?<div style={{fontSize:11,color:T.red,marginTop:8}}>{adminGate.msg}</div>:null}
        <div style={{display:"flex",gap:10,marginTop:14,justifyContent:"flex-end"}}>
          <button style={c.bsm()} onClick={()=>setAdminGate(null)} disabled={adminGate.busy}>Cancel</button>
          <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={submitAdminGate} disabled={adminGate.busy||!adminGate.pin}>{adminGate.busy?"…":"Unlock"}</button>
        </div>
      </div>
    </div>:null}

    {/* 2026-05-16 fix-forward 1.5 — Edit Staff Panel. */}
    {editTarget?<EditStaffPanel user={editTarget} onClose={()=>setEditTarget(null)} onChanged={reloadTiles} pop={pop}/>:null}

    {toast?<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:toast.kind==="ok"?T.green:toast.kind==="warn"?T.gold:toast.kind==="err"?T.red:T.surface,color:toast.kind==="err"?T.white:T.bg,padding:"10px 20px",borderRadius:8,fontSize:12,zIndex:3000,boxShadow:"0 4px 12px rgba(0,0,0,0.4)",maxWidth:480}}>{toast.text}</div>:null}
  </div>;
}
