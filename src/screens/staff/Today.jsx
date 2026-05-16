// LootLedger — Staff workspace bulk-hours editor (/staff/today).
// Phase 5.2 fix-forward 2026-05-16.
//
// Owner / manager only. Lets the boss enter or correct hours for
// every staff member in the shop on a given date in one screen,
// without round-tripping through each staff's tile-PIN-gated
// profile.
//
// Despite the URL name "/staff/today", the date picker is fully
// flexible — any past or future date can be selected. The name
// reflects the most common workflow (boss entering today's hours
// at end-of-day) but isn't a behavioural constraint.
//
// Read/write surface = the same staff_hours table the per-staff
// HoursTab uses. Single source of truth — entries made here
// surface immediately in each staff's HoursTab and vice versa.
// Last-write-wins per (user_id, work_date) per the table's unique
// index.
//
// PIN posture:
//   Save / Lock — operator types the PIN once at top of page; it
//                 caches in component state for the session. RPC
//                 re-validates every call.
//   Unlock      — REQUIRES fresh PIN entry per row (destructive,
//                 may affect data already in payroll). Cached
//                 operator PIN intentionally NOT used.
//
// Audit: every save / lock / unlock writes an audit_log row
// server-side via the existing RPCs (migrations 0014 / 0015).
// The actor is auth.uid() (the boss); the target_user_id is in
// the payload — so the trail is "boss saved hours for staff X on
// date D" without any client-side audit code.

import React,{useEffect,useState,useCallback,useMemo} from "react";
import {useNavigate} from "react-router-dom";
import {T,c} from "../../theme.js";
import {sS,sN,formatDateAU,formatDateTimeAU} from "../../lib/utils.js";
import {F} from "../../components/ui";
import {useAuth} from "../../components/AuthProvider.jsx";
import {supabase,listStaffHours,upsertStaffHours,lockStaffHours,unlockStaffHours} from "../../lib/auth/saas.js";

const DAY_MS=24*3600*1000;

function isoDate(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const dd=String(d.getDate()).padStart(2,"0");
  return y+"-"+m+"-"+dd;
}

function todayMidnight(){
  const t=new Date();
  t.setHours(0,0,0,0);
  return t;
}

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

function diffPromptText(date,existing,next){
  const fmtT=t=>t?String(t).slice(0,5):"—";
  const fmtBreak=v=>String(parseInt(v,10)||0)+"m";
  return "Hours already logged for "+formatDateAU(date)+".\n\n"
    +"Existing:\n"
    +"  Start "+fmtT(existing.start_time)+"  End "+fmtT(existing.end_time)
    +"  Break "+fmtBreak(existing.break_minutes)+"\n"
    +(existing.note?"  Note: "+sS(existing.note)+"\n":"")
    +"\nNew:\n"
    +"  Start "+(next.start||"—")+"  End "+(next.end||"—")
    +"  Break "+fmtBreak(next.break)+"\n"
    +(next.note?"  Note: "+next.note+"\n":"")
    +"\nClick OK to overwrite, Cancel to skip this row.";
}

// Toast — small inline component so /staff/today doesn't need to
// import Profile.jsx's wrapper. Same shape (msg = {text,kind}).
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

export default function Today(){
  const navigate=useNavigate();
  const auth=useAuth();
  const role=(auth&&auth.role)||null;
  const allowed=role==="owner"||role==="manager";

  const[selectedDate,setSelectedDate]=useState(()=>isoDate(todayMidnight()));
  const[users,setUsers]=useState([]);
  const[hoursByUser,setHoursByUser]=useState({}); // {[user_id]: row | null}
  const[checked,setChecked]=useState({}); // {[user_id]: bool}
  const[edits,setEdits]=useState({}); // {[user_id]: {start,end,break,note}}
  const[opPin,setOpPin]=useState("");
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[locking,setLocking]=useState(false);
  const[errMsg,setErrMsg]=useState("");
  const[unlockFor,setUnlockFor]=useState(null); // {userId, pin, busy}
  const[toast,setToast]=useState(null);

  const pop=useCallback((text,kind)=>{
    setToast({text,kind:kind||"info"});
    setTimeout(()=>setToast(null),3500);
  },[]);

  const shopId=(auth&&auth.shop&&String(auth.shop.id))||null;

  const load=useCallback(async()=>{
    if(!shopId)return;
    setLoading(true);
    setErrMsg("");
    try{
      const[usersRes,hoursRows]=await Promise.all([
        supabase.from("users")
          .select("id, role, job_title, first_name, family_name, email")
          .eq("shop_id",shopId)
          .order("role",{ascending:true})
          .order("family_name",{ascending:true}),
        listStaffHours(shopId,selectedDate,selectedDate),
      ]);
      if(usersRes.error)throw usersRes.error;
      const usrs=Array.isArray(usersRes.data)?usersRes.data:[];
      setUsers(usrs);
      const byUser={};
      const editsNext={};
      const checkedNext={};
      usrs.forEach(u=>{
        const hit=(hoursRows||[]).find(h=>h.user_id===u.id);
        byUser[u.id]=hit||null;
        if(hit){
          editsNext[u.id]={
            start:hit.start_time?String(hit.start_time).slice(0,5):"",
            end:hit.end_time?String(hit.end_time).slice(0,5):"",
            break:String(hit.break_minutes||0),
            note:sS(hit.note),
          };
        }else{
          editsNext[u.id]={start:"",end:"",break:"0",note:""};
        }
        checkedNext[u.id]=false;
      });
      setHoursByUser(byUser);
      setEdits(editsNext);
      setChecked(checkedNext);
    }catch(e){
      setErrMsg("Could not load: "+sS(e&&e.message));
    }finally{
      setLoading(false);
    }
  },[shopId,selectedDate]);

  useEffect(()=>{if(allowed)load();},[load,allowed]);

  const setOnDate=(deltaDays)=>{
    const d=new Date(selectedDate+"T00:00:00");
    d.setDate(d.getDate()+deltaDays);
    setSelectedDate(isoDate(d));
  };

  const updateEdit=(userId,patch)=>{
    setEdits(p=>({...p,[userId]:{...(p[userId]||{start:"",end:"",break:"0",note:""}),...patch}}));
  };

  const onSaveSelected=async()=>{
    // Force-flush focused time input. <input type="time"> doesn't
    // always fire onChange until blur, so a user who types a time
    // and clicks Save without tabbing out leaves React state
    // empty. Blur + microtask wait lets the pending onChange run
    // and updates `edits` before we read it below.
    if(typeof document!=="undefined"&&document.activeElement&&document.activeElement.blur)document.activeElement.blur();
    await new Promise(r=>setTimeout(r,0));

    const pin=String(opPin||"").trim();
    if(!/^\d{4,12}$/.test(pin)){pop("Enter your 4-12 digit PIN.","warn");return;}
    const ticked=users.filter(u=>checked[u.id]);
    if(ticked.length===0){pop("Tick at least one staff to save.","warn");return;}
    setSaving(true);
    let saved=0,failed=0,skippedLocked=0,skippedUserDeclined=0,skippedEmpty=0;
    try{
      for(const u of ticked){
        const existing=hoursByUser[u.id];
        if(existing&&existing.locked){skippedLocked++;continue;}
        const ed=edits[u.id]||{start:"",end:"",break:"0",note:""};
        // Skip ticked-but-empty rows — don't insert NULL-times
        // rows for staff who were ticked but whose time fields
        // were never filled. (Editing an existing row to clear
        // it still flows through, since `existing` is truthy.)
        const isEmpty=!ed.start&&!ed.end&&(parseInt(ed.break,10)||0)===0&&!(ed.note&&ed.note.trim());
        if(!existing&&isEmpty){skippedEmpty++;continue;}
        // Duplicate-day overwrite confirmation when DB row exists.
        if(existing){
          const ok=typeof window!=="undefined"&&window.confirm
            ?window.confirm(diffPromptText(selectedDate,existing,ed))
            :true;
          if(!ok){skippedUserDeclined++;continue;}
        }
        try{
          await upsertStaffHours({
            pin,
            userId:u.id,
            workDate:selectedDate,
            startTime:ed.start||null,
            endTime:ed.end||null,
            breakMinutes:parseInt(ed.break,10)||0,
            note:ed.note||"",
          });
          saved++;
        }catch(e){
          failed++;
          pop("Save failed for "+userLabel(u)+": "+sS(e&&e.message),"err");
        }
      }
      if(saved>0){
        const extras=[];
        if(failed>0)extras.push(failed+" failed");
        if(skippedLocked>0)extras.push(skippedLocked+" locked");
        if(skippedUserDeclined>0)extras.push(skippedUserDeclined+" overwrites declined");
        if(skippedEmpty>0)extras.push(skippedEmpty+" empty");
        pop("Saved "+saved+" entr"+(saved===1?"y":"ies")+(extras.length?" ("+extras.join(", ")+")":"."),"ok");
        await load();
      }else if(skippedLocked>0&&saved===0&&failed===0){
        pop("All ticked rows are locked. Unlock first.","warn");
      }else if(skippedUserDeclined>0&&saved===0){
        pop("All overwrites declined.","warn");
      }else if(skippedEmpty>0&&saved===0&&failed===0){
        pop("Ticked rows have no hours filled in — nothing to save.","warn");
      }
    }finally{setSaving(false);}
  };

  const onLockSelected=async()=>{
    const pin=String(opPin||"").trim();
    if(!/^\d{4,12}$/.test(pin)){pop("Enter your 4-12 digit PIN.","warn");return;}
    const lockable=users
      .filter(u=>checked[u.id])
      .map(u=>({u,row:hoursByUser[u.id]}))
      .filter(x=>x.row&&!x.row.locked);
    if(lockable.length===0){pop("No saved unlocked rows ticked.","warn");return;}
    const confirmMsg="Lock "+lockable.length+" entr"+(lockable.length===1?"y":"ies")
      +" for "+formatDateAU(selectedDate)+"? Once locked they cannot be edited or deleted without the row owner's PIN.";
    if(typeof window!=="undefined"&&window.confirm&&!window.confirm(confirmMsg))return;
    setLocking(true);
    let locked=0,failed=0;
    try{
      for(const{u,row} of lockable){
        try{
          await lockStaffHours(pin,row.id);
          locked++;
        }catch(e){
          failed++;
          pop("Lock failed for "+userLabel(u)+": "+sS(e&&e.message),"err");
        }
      }
      if(locked>0)pop("Locked "+locked+" entr"+(locked===1?"y":"ies")+(failed>0?" ("+failed+" failed)":"."),"ok");
      await load();
    }finally{setLocking(false);}
  };

  const onConfirmUnlock=async()=>{
    if(!unlockFor)return;
    const row=hoursByUser[unlockFor.userId];
    if(!row||!row.id)return;
    const fresh=String(unlockFor.pin||"").trim();
    if(!/^\d{4,12}$/.test(fresh)){pop("Enter the row owner's PIN (4-12 digits).","warn");return;}
    setUnlockFor(p=>({...p,busy:true}));
    try{
      await unlockStaffHours(fresh,row.id);
      pop("Entry unlocked.","ok");
      setUnlockFor(null);
      await load();
    }catch(e){
      pop("Unlock failed: "+sS(e&&e.message),"err");
      setUnlockFor(p=>({...p,busy:false}));
    }
  };

  if(!allowed){
    return <div style={{minHeight:"100vh",background:T.bg,color:T.text,padding:"40px 18px",fontFamily:"system-ui"}}>
      <div style={{maxWidth:600,margin:"0 auto",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:14}}>🚫</div>
        <div style={{fontSize:16,fontWeight:"bold",color:T.white,marginBottom:8}}>Access denied</div>
        <div style={{fontSize:12,color:T.muted,marginBottom:20}}>The bulk hours editor is restricted to owner and manager roles.</div>
        <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"10px 18px"})} onClick={()=>navigate("/staff")}>← Back to Staff Tiles</button>
      </div>
    </div>;
  }

  return <div style={{minHeight:"100vh",background:T.bg,color:T.text,padding:"24px 18px",fontFamily:"system-ui"}}>
    <div style={{maxWidth:980,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:18,fontWeight:"bold",color:T.white}}>📅 Bulk hours editor</div>
          <div style={{fontSize:11,color:T.muted,marginTop:4}}>Owner / manager view — log or correct hours for every staff member on a given date.</div>
        </div>
        <button style={c.bsm()} onClick={()=>navigate("/staff")}>← Staff Tiles</button>
      </div>

      {/* Date navigation strip */}
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:14,padding:"10px 12px",background:T.surface,border:"1px solid "+T.border,borderRadius:6}}>
        <button style={c.bsm()} onClick={()=>setOnDate(-1)} disabled={loading}>◀ Day</button>
        <input
          type="date"
          value={selectedDate}
          onChange={e=>setSelectedDate(e.target.value)}
          style={{...c.inp({padding:"6px 8px",fontSize:13}),minWidth:160}}
        />
        <button style={c.bsm()} onClick={()=>setOnDate(1)} disabled={loading}>Day ▶</button>
        <button style={c.bsm()} onClick={()=>setSelectedDate(isoDate(todayMidnight()))} disabled={loading}>Today</button>
        <div style={{flex:1}}/>
        <div style={{fontSize:12,color:T.white}}><strong>{formatDateAU(selectedDate)}</strong></div>
      </div>

      {/* Operator PIN field */}
      <div style={{marginBottom:14}}>
        <F label="Your PIN (4–12 digits) — required for Save / Lock" type="password" value={opPin} onChange={setOpPin} placeholder="••••"/>
      </div>

      {errMsg?<div style={{...c.bnr("block"),marginBottom:12}}>{errMsg}</div>:null}

      {loading?<div style={{fontSize:12,color:T.muted}}>Loading…</div>:users.length===0?<div style={{fontSize:12,color:T.muted,fontStyle:"italic"}}>No staff in this shop.</div>:<div>
        {users.map(u=>{
          const badge=roleBadge(u.role);
          const row=hoursByUser[u.id];
          const ed=edits[u.id]||{start:"",end:"",break:"0",note:""};
          const isChecked=!!checked[u.id];
          const isLocked=!!(row&&row.locked);
          const showUnlock=unlockFor&&unlockFor.userId===u.id;
          const totalMin=row?(()=>{
            if(!row.start_time||!row.end_time)return null;
            const[sh,sm]=String(row.start_time).split(":").map(x=>parseInt(x,10)||0);
            const[eh,em]=String(row.end_time).split(":").map(x=>parseInt(x,10)||0);
            const mins=(eh*60+em)-(sh*60+sm)-(parseInt(row.break_minutes,10)||0);
            return mins>0?mins:0;
          })():null;
          const totalLabel=totalMin!=null?(Math.floor(totalMin/60)+"h "+(totalMin%60)+"m"):null;
          return <div key={u.id} style={{...c.card({padding:12}),marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <input
                type="checkbox"
                checked={isChecked}
                disabled={isLocked&&!showUnlock}
                onChange={e=>setChecked(p=>({...p,[u.id]:e.target.checked}))}
                style={{width:18,height:18,cursor:(isLocked&&!showUnlock)?"not-allowed":"pointer"}}
              />
              <div style={{flex:1,minWidth:180}}>
                <div style={{fontSize:13,color:T.white,fontWeight:"bold"}}>{userLabel(u)}</div>
                <div style={{fontSize:10,color:T.muted}}>
                  <span style={{color:badge.color}}>{badge.label}</span>
                  {u.job_title?" · "+sS(u.job_title):""}
                </div>
              </div>
              <div style={{fontSize:11,color:T.muted,minWidth:140,textAlign:"right"}}>
                {row?(totalLabel?"Logged: "+totalLabel:"Logged: (no times)"):"— no entry —"}
              </div>
              {isLocked?<span style={{fontSize:10,color:T.gold,border:"1px solid "+T.gold,borderRadius:3,padding:"2px 6px"}} title={row.locked_at?formatDateTimeAU(row.locked_at):""}>🔒 LOCKED{row.locked_at?" · "+formatDateTimeAU(row.locked_at):""}</span>:null}
              {isLocked&&!showUnlock?<button type="button" style={c.bsm()} onClick={()=>setUnlockFor({userId:u.id,pin:"",busy:false})}>Unlock</button>:null}
            </div>

            {isChecked&&!isLocked?<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 2fr",gap:8,marginTop:10,paddingTop:10,borderTop:"1px solid "+T.border+"55"}}>
              <F label="Start" type="time" value={ed.start} onChange={v=>updateEdit(u.id,{start:v})}/>
              <F label="End"   type="time" value={ed.end}   onChange={v=>updateEdit(u.id,{end:v})}/>
              <F label="Break (min)" type="number" value={ed.break} onChange={v=>updateEdit(u.id,{break:v})}/>
              <F label="Note"  value={ed.note} onChange={v=>updateEdit(u.id,{note:v})} placeholder="optional"/>
            </div>:null}

            {showUnlock?<div style={{...c.card({padding:10}),marginTop:10,borderColor:T.red||T.border,background:T.warn||T.surface}}>
              <div style={{fontSize:11,color:T.red||T.gold,fontWeight:"bold",marginBottom:6}}>⚠ Hours locked in for accounting. Contact the accountant before modifying the timesheet.</div>
              <div style={{fontSize:11,color:T.muted,marginBottom:6}}>Unlocking <strong>{userLabel(u)}</strong> for {formatDateAU(selectedDate)} requires <strong>{userLabel(u)}'s</strong> per-staff PIN — your operator PIN is not used here.</div>
              <F label="Row owner's PIN (4–12 digits)" type="password" value={unlockFor.pin} onChange={v=>setUnlockFor(p=>({...p,pin:v}))} placeholder="••••"/>
              <div style={{display:"flex",gap:8,marginTop:6}}>
                <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={onConfirmUnlock} disabled={unlockFor.busy||!unlockFor.pin}>{unlockFor.busy?"…":"Confirm unlock"}</button>
                <button style={c.bsm()} onClick={()=>setUnlockFor(null)} disabled={unlockFor.busy}>Cancel</button>
              </div>
            </div>:null}
          </div>;
        })}
      </div>}

      <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap",position:"sticky",bottom:14,background:T.bg,padding:"10px 0"}}>
        <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"10px 18px"})} onClick={onSaveSelected} disabled={saving||locking||loading||!opPin}>{saving?"Saving…":"💾 Save selected"}</button>
        <button style={c.bsm(T.goldBg,T.gold)} onClick={onLockSelected} disabled={saving||locking||loading||!opPin}>{locking?"Locking…":"🔒 Lock selected"}</button>
        <button style={c.bsm()} onClick={load} disabled={saving||locking||loading}>↻ Reload</button>
        <div style={{flex:1}}/>
        <button style={c.bsm()} onClick={()=>{
          const next={};
          users.forEach(u=>{next[u.id]=true;});
          setChecked(next);
        }}>Tick all</button>
        <button style={c.bsm()} onClick={()=>setChecked({})}>Untick all</button>
      </div>
    </div>

    <Toast msg={toast}/>
  </div>;
}
