// LootLedger — Staff workspace profile shell.
// Phase 5.2 Commit 1 (2026-05-15).
//
// Tabbed shell for a single staff member's workspace.
// Tabs (Commit 1):
//   - Hours      (fully implemented, ./HoursTab.jsx)
//   - Documents  (placeholder, Commit 2)
//   - Contacts   (placeholder, Commit 2)
//   - Email      (placeholder, Commit 2)
//
// PIN: cached in sessionStorage by StaffTiles.jsx after a
// successful verify_staff_pin RPC call. Read here and passed
// down so child tabs don't re-prompt for every save.
//
// Auto-lock: 10-minute idle timer resets on any pointer / key
// event inside the shell. On expiry the PIN is wiped from
// sessionStorage and the user is bounced back to /staff.
//
// Default target: when the route is hit without a userId path
// param, falls back to auth.user.id (the signed-in user's own
// profile). The tile flow always supplies the path param, so
// the fallback is mainly for deep links / refreshes.

import React,{useEffect,useState,useRef,useCallback} from "react";
import {useNavigate,useParams} from "react-router-dom";
import {T,c} from "../../theme.js";
import {sS} from "../../lib/utils.js";
import {useAuth} from "../../components/AuthProvider.jsx";
import {supabase} from "../../lib/auth/saas.js";
import {SESSION_PIN_KEY} from "./StaffTiles.jsx";
import HoursTab from "./HoursTab.jsx";
import SettingsTab from "./SettingsTab.jsx";

const IDLE_LOCK_MS=10*60*1000;

function userLabel(u){
  if(!u)return "(unknown)";
  const fn=sS(u.first_name||"");
  const ln=sS(u.family_name||"");
  const full=(fn+" "+ln).trim();
  return full||sS(u.email)||"(no name)";
}

function Toast({msg}){
  if(!msg)return null;
  const colors={
    ok:{bg:T.green,fg:T.bg},
    warn:{bg:T.gold,fg:T.bg},
    err:{bg:T.red,fg:T.white},
    info:{bg:T.surface,fg:T.text},
  };
  const k=msg.kind||"info";
  const col=colors[k]||colors.info;
  return <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:col.bg,color:col.fg,padding:"10px 20px",borderRadius:8,fontSize:12,zIndex:3000,boxShadow:"0 4px 12px rgba(0,0,0,0.4)",maxWidth:480}}>
    {msg.text}
  </div>;
}

export default function Profile(){
  const navigate=useNavigate();
  const params=useParams();
  const auth=useAuth();
  const[targetUser,setTargetUser]=useState(null);
  const[loading,setLoading]=useState(true);
  const[errMsg,setErrMsg]=useState("");
  const[tab,setTab]=useState("hours");
  const[toast,setToast]=useState(null);
  const toastTimer=useRef(null);

  const pop=useCallback((text,kind)=>{
    if(toastTimer.current)clearTimeout(toastTimer.current);
    setToast({text,kind:kind||"info"});
    toastTimer.current=setTimeout(()=>setToast(null),3500);
  },[]);

  const targetUserId=params.userId||(auth&&auth.user&&auth.user.id)||null;
  const sessionPin=(typeof window!=="undefined"&&targetUserId)
    ?(window.sessionStorage&&window.sessionStorage.getItem(SESSION_PIN_KEY(targetUserId)))||""
    :"";
  const isOwnProfile=!!(auth&&auth.user&&auth.user.id&&targetUserId&&auth.user.id===targetUserId);

  const lockAndReturn=useCallback(()=>{
    if(targetUserId){
      try{sessionStorage.removeItem(SESSION_PIN_KEY(targetUserId));}catch(_){}
    }
    navigate("/staff");
  },[targetUserId,navigate]);

  // Load the target user's row. Same-shop is enforced by RLS on
  // the users table — if cross-shop, this returns an empty row.
  useEffect(()=>{
    if(!targetUserId||!auth||!auth.shop||!auth.shop.id){setLoading(false);return;}
    let cancelled=false;
    (async()=>{
      setLoading(true);
      const{data,error}=await supabase.from("users")
        .select("id, role, job_title, first_name, family_name, email")
        .eq("id",targetUserId)
        .eq("shop_id",auth.shop.id)
        .maybeSingle();
      if(cancelled)return;
      if(error){
        setErrMsg("Could not load profile: "+sS(error.message));
        setTargetUser(null);
      }else if(!data){
        setErrMsg("Profile not found in this shop.");
        setTargetUser(null);
      }else{
        setTargetUser(data);
        setErrMsg("");
      }
      setLoading(false);
    })();
    return()=>{cancelled=true;};
  },[targetUserId,auth&&auth.shop&&auth.shop.id]);

  // Bounce if the PIN session is missing — the tile flow needs to
  // be re-completed to land here legitimately. Skip this guard
  // during the initial loading frame (sessionStorage may not be
  // available yet during SSR / first render).
  useEffect(()=>{
    if(loading||!targetUserId)return;
    if(!sessionPin){
      pop("PIN session missing — returning to Staff Tiles.","warn");
      const t=setTimeout(()=>navigate("/staff"),900);
      return()=>clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[loading,targetUserId,sessionPin]);

  // 10-minute idle auto-lock. Any pointer / key event in the
  // shell resets the timer.
  useEffect(()=>{
    if(!targetUserId)return;
    let timer=null;
    const reset=()=>{
      if(timer)clearTimeout(timer);
      timer=setTimeout(lockAndReturn,IDLE_LOCK_MS);
    };
    reset();
    const events=["mousemove","mousedown","keydown","touchstart","scroll"];
    events.forEach(ev=>window.addEventListener(ev,reset,{passive:true}));
    return()=>{
      if(timer)clearTimeout(timer);
      events.forEach(ev=>window.removeEventListener(ev,reset));
    };
  },[targetUserId,lockAndReturn]);

  const shopId=(auth&&auth.shop&&String(auth.shop.id))||null;

  const tabs=[
    {key:"hours",label:"⏱ Hours"},
    {key:"documents",label:"📄 Documents"},
    {key:"contacts",label:"📇 Contacts"},
    {key:"email",label:"✉ Email"},
    // 2026-05-16 — own-profile-only Settings tab (My PIN + Job
    // Title). Hidden when an admin views another staff's profile;
    // they manage that staff's PIN via the tile Edit panel
    // instead.
    ...(isOwnProfile?[{key:"settings",label:"⚙ Settings"}]:[]),
  ];

  return <div style={{minHeight:"100vh",background:T.bg,color:T.text,padding:"24px 18px",fontFamily:"system-ui"}}>
    <div style={{maxWidth:900,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:18,fontWeight:"bold",color:T.white}}>{targetUser?userLabel(targetUser):"Loading…"}</div>
          <div style={{fontSize:11,color:T.muted,marginTop:4}}>
            {targetUser?sS(targetUser.job_title||targetUser.role||""):""}
            {targetUser&&targetUser.email?" · "+sS(targetUser.email):""}
          </div>
        </div>
        <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={lockAndReturn}>🔒 Lock & return to Staff Tiles</button>
      </div>

      <div style={{fontSize:10,color:T.muted,marginBottom:14,letterSpacing:"0.05em"}}>
        AUTO-LOCK AFTER 10 MIN OF INACTIVITY
      </div>

      {errMsg?<div style={{...c.bnr("block"),marginBottom:14}}>{errMsg}</div>:null}

      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",borderBottom:"1px solid "+T.border}}>
        {tabs.map(t=>{
          const active=tab===t.key;
          return <button key={t.key}
            onClick={()=>setTab(t.key)}
            style={{
              padding:"10px 16px",
              fontSize:12,
              fontWeight:active?"bold":"normal",
              color:active?T.gold:T.muted,
              background:"transparent",
              border:"none",
              borderBottom:"2px solid "+(active?T.gold:"transparent"),
              cursor:"pointer",
              fontFamily:"inherit",
            }}
          >{t.label}</button>;
        })}
      </div>

      <div style={c.card({padding:18})}>
        {tab==="hours"&&!loading&&targetUser?
          <HoursTab userId={targetUserId} shopId={shopId} pin={sessionPin} pop={pop}/>:null}
        {tab==="documents"?<div style={{padding:"40px 0",textAlign:"center",fontSize:12,color:T.muted}}>
          <div style={{fontSize:32,marginBottom:10}}>📄</div>
          <div>Documents tab — coming in Commit 2.</div>
          <div style={{marginTop:6,fontSize:11}}>Personal contracts, ID copies, certifications. Stored in the staff-documents bucket.</div>
        </div>:null}
        {tab==="contacts"?<div style={{padding:"40px 0",textAlign:"center",fontSize:12,color:T.muted}}>
          <div style={{fontSize:32,marginBottom:10}}>📇</div>
          <div>Contacts tab — coming in Commit 2.</div>
          <div style={{marginTop:6,fontSize:11}}>Personal rolodex with role tags.</div>
        </div>:null}
        {tab==="email"?<div style={{padding:"40px 0",textAlign:"center",fontSize:12,color:T.muted}}>
          <div style={{fontSize:32,marginBottom:10}}>✉</div>
          <div>Email tab — coming in Commit 2.</div>
          <div style={{marginTop:6,fontSize:11}}>Compose emails to your contacts via SMTP2GO.</div>
        </div>:null}
        {tab==="settings"&&isOwnProfile?<SettingsTab sessionPin={sessionPin} pop={pop}/>:null}
      </div>
    </div>

    <Toast msg={toast}/>
  </div>;
}
