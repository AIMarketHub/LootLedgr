// LootLedger — EOD (End of Day Report) modal.
//
// Day-end summary card: transaction count, buy total, sell total,
// net, plus a TTR-pending banner when applicable.
//
// Phase 3.5-A-2 (2026-05-09) — adds a "Staff hours today" sub-
// section. Operator (or self) selects which users worked today
// and types start/end/break per user. Each save calls
// upsert_staff_hours via the SECURITY DEFINER RPC; PIN required.
// Cross-user writes require owner/manager role server-side.
//
// Phase 3.5-A-2.5 (2026-05-09) — adds duplicate-day confirmation
// (per-row window.confirm with existing/new diff before
// overwriting) plus lock-for-processing UI:
//   - "🔒 Lock today's hours for processing" section button
//     locks every checked-in row with the operator's PIN.
//   - Per-row 🔒 badge + inline Unlock panel (requires the
//     ROW OWNER's PIN, not the caller's — surfaces the
//     "contact accountant" warning).
//
// `todayTxData` is computed at the App.tsx level (a useMemo over
// txList filtered to today's date) and passed in as a prop.

import React,{useState,useEffect,useCallback} from "react";
import {T,c} from "../theme.js";
import {sN,sS,fmtAUD,todayStr} from "../lib/utils.js";
import Modal from "../components/ui/Modal.jsx";
import {F} from "../components/ui";
import {useAuth} from "../components/AuthProvider.jsx";
import {supabase,listStaffHours,upsertStaffHours,lockStaffHours,unlockStaffHours} from "../lib/auth/saas.js";

// Display label for a user row (mirrors the helper in Staff.jsx).
function userLabel(u){
  if(!u)return "(unknown)";
  const fn=sS(u.first_name||"");
  const ln=sS(u.family_name||"");
  const full=(fn+" "+ln).trim();
  return full||sS(u.email)||"(no name)";
}

// "HH:MM" display for a server time string ("13:45:00" → "13:45").
function fmtT(t){return t?String(t).slice(0,5):"—";}

// Build the multi-line text for the duplicate-day confirm. window.
// confirm renders newlines; this is intentionally plain text rather
// than a React modal because it must block the save loop and
// accept/reject sequentially per user.
function diffPromptText(label,date,existing,next){
  return "Hours already logged for "+label+" on "+date+".\n\n"
    +"Existing:\n"
    +"  Start "+fmtT(existing.start_time)+"  End "+fmtT(existing.end_time)
    +"  Break "+sN(existing.break_minutes)+"m\n"
    +(existing.note?"  Note: "+sS(existing.note)+"\n":"")
    +"\nNew:\n"
    +"  Start "+(next.start||"—")+"  End "+(next.end||"—")
    +"  Break "+(parseInt(next.break,10)||0)+"m\n"
    +(next.note?"  Note: "+next.note+"\n":"")
    +"\nClick OK to overwrite, Cancel to skip this row.";
}

// Short locked-at label, e.g. "Locked Thu 09 May 16:42".
function fmtLockedAt(iso){
  if(!iso)return "Locked";
  const d=new Date(iso);
  if(isNaN(d.getTime()))return "Locked";
  return "Locked "+d.toLocaleString("en-AU",{weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
}

export default function EOD({todayTxData,dlAccounting,setShowEOD,pop}){
  const auth=useAuth();
  const role=(auth&&auth.role)||null;
  const callerCanWriteOthers=role==="owner"||role==="manager";
  const today=todayStr();

  // Hours sub-section state.
  const[hoursPin,setHoursPin]=useState("");
  const[usersInShop,setUsersInShop]=useState([]);
  // perUser: {[user_id]: {checked, start, end, break, note,
  //                       existing_id, locked, locked_at, locked_by}}
  const[perUser,setPerUser]=useState({});
  const[loadingHours,setLoadingHours]=useState(true);
  const[savingHours,setSavingHours]=useState(false);
  const[lockingAll,setLockingAll]=useState(false);
  // Inline unlock panel state, keyed by user_id of the locked row
  // currently being unlocked. {userId, pin, busy} or null.
  const[unlockFor,setUnlockFor]=useState(null);

  const refreshHours=useCallback(async()=>{
    if(!auth||!auth.shop||!auth.shop.id)return;
    setLoadingHours(true);
    try{
      const[usersRes,hoursRows]=await Promise.all([
        supabase.from("users")
          .select("id, role, first_name, family_name, email")
          .eq("shop_id",auth.shop.id)
          .order("role",{ascending:true}),
        listStaffHours(String(auth.shop.id),today,today),
      ]);
      const users=Array.isArray(usersRes.data)?usersRes.data:[];
      setUsersInShop(users);
      const next={};
      for(const u of users){
        const existing=hoursRows.find(h=>h.user_id===u.id);
        next[u.id]=existing?{
          checked:true,
          start:existing.start_time?String(existing.start_time).slice(0,5):"",
          end:existing.end_time?String(existing.end_time).slice(0,5):"",
          break:String(existing.break_minutes||0),
          note:sS(existing.note),
          existing_id:existing.id,
          existing_row:existing,
          locked:!!existing.locked,
          locked_at:existing.locked_at||null,
          locked_by:existing.locked_by||null,
        }:{checked:false,start:"",end:"",break:"0",note:"",existing_id:null,existing_row:null,locked:false,locked_at:null,locked_by:null};
      }
      setPerUser(next);
    }catch(e){
      pop&&pop("Could not load staff hours: "+sS(e&&e.message),"err");
    }finally{setLoadingHours(false);}
  },[auth&&auth.shop&&auth.shop.id,today,pop]);

  useEffect(()=>{refreshHours();},[refreshHours]);

  const updatePerUser=(userId,patch)=>{
    setPerUser(p=>({...p,[userId]:{...(p[userId]||{}),...patch}}));
  };

  const onSaveHours=async()=>{
    const pin=String(hoursPin||"").trim();
    if(!/^\d{4,12}$/.test(pin)){pop&&pop("Enter your 4-12 digit per-staff PIN.","warn");return;}
    setSavingHours(true);
    let saved=0,failed=0,skippedLocked=0,skippedUserDeclined=0;
    try{
      for(const u of usersInShop){
        const row=perUser[u.id];
        if(!row||!row.checked)continue;
        // RPC enforces self vs cross-user role rules; this UI gate
        // mirrors that for clearer error messages on the staff path.
        if(u.id!==auth.user.id&&!callerCanWriteOthers){
          continue; // staff trying to save for someone else — skip
        }
        // 3.5-A-2.5 — locked rows can't be overwritten. Server
        // would refuse anyway; skip with a count for the toast.
        if(row.locked){skippedLocked++;continue;}
        // 3.5-A-2.5 — duplicate-day confirmation. Only when the
        // user already has a stored row; pure inserts go straight
        // through.
        if(row.existing_id&&row.existing_row){
          const ok=typeof window!=="undefined"&&window.confirm
            ?window.confirm(diffPromptText(userLabel(u),today,row.existing_row,row))
            :true;
          if(!ok){skippedUserDeclined++;continue;}
        }
        try{
          await upsertStaffHours({
            pin,
            userId:u.id,
            workDate:today,
            startTime:row.start||null,
            endTime:row.end||null,
            breakMinutes:parseInt(row.break,10)||0,
            note:row.note||"",
          });
          saved++;
        }catch(e){
          failed++;
          pop&&pop("Save failed for "+userLabel(u)+": "+sS(e&&e.message),"err");
        }
      }
      if(saved>0){
        const extras=[];
        if(failed>0)extras.push(failed+" failed");
        if(skippedLocked>0)extras.push(skippedLocked+" locked");
        if(skippedUserDeclined>0)extras.push(skippedUserDeclined+" skipped");
        pop&&pop("Saved "+saved+" staff hour entr"+(saved===1?"y":"ies")+(extras.length?" ("+extras.join(", ")+")":"."),"ok");
        await refreshHours();
        setHoursPin("");
      }else if(failed===0&&skippedLocked===0&&skippedUserDeclined===0){
        pop&&pop("Nothing checked to save.","warn");
      }else if(skippedLocked>0&&failed===0&&saved===0){
        pop&&pop("All checked rows are locked. Unlock first or skip.","warn");
      }
    }finally{setSavingHours(false);}
  };

  // 3.5-A-2.5 — section-level lock button. Locks every existing
  // row that's still unlocked using the operator's PIN (caller PIN
  // is what lock_staff_hours expects). Confirms first.
  const onLockAll=async()=>{
    const pin=String(hoursPin||"").trim();
    if(!/^\d{4,12}$/.test(pin)){pop&&pop("Enter your 4-12 digit per-staff PIN.","warn");return;}
    const lockable=usersInShop
      .map(u=>({u,row:perUser[u.id]}))
      .filter(x=>x.row&&x.row.existing_id&&!x.row.locked);
    if(lockable.length===0){pop&&pop("No unlocked saved entries to lock.","warn");return;}
    const confirmMsg="Lock "+lockable.length+" entr"+(lockable.length===1?"y":"ies")
      +" for today? Once locked they cannot be edited or deleted without the row owner's PIN.";
    if(typeof window!=="undefined"&&window.confirm&&!window.confirm(confirmMsg))return;
    setLockingAll(true);
    let locked=0,failed=0;
    try{
      for(const{u,row} of lockable){
        try{
          await lockStaffHours(pin,row.existing_id);
          locked++;
        }catch(e){
          failed++;
          pop&&pop("Lock failed for "+userLabel(u)+": "+sS(e&&e.message),"err");
        }
      }
      if(locked>0)pop&&pop("Locked "+locked+" entr"+(locked===1?"y":"ies")+(failed>0?" ("+failed+" failed)":"."),"ok");
      await refreshHours();
    }finally{setLockingAll(false);}
  };

  // Inline-unlock confirm. Uses the ROW OWNER's PIN (typed into
  // the panel), not hoursPin. lockable callers — anyone in the
  // shop, but only the row owner knows the right PIN.
  const onConfirmUnlock=async()=>{
    if(!unlockFor)return;
    const row=perUser[unlockFor.userId];
    if(!row||!row.existing_id)return;
    const pin=String(unlockFor.pin||"").trim();
    if(!/^\d{4,12}$/.test(pin)){pop&&pop("Enter the row owner's 4-12 digit PIN.","warn");return;}
    setUnlockFor(p=>({...p,busy:true}));
    try{
      await unlockStaffHours(pin,row.existing_id);
      pop&&pop("Entry unlocked.","ok");
      setUnlockFor(null);
      await refreshHours();
    }catch(e){
      pop&&pop("Unlock failed: "+sS(e&&e.message),"err");
      setUnlockFor(p=>({...p,busy:false}));
    }
  };

  return <Modal title="📋 End of Day Report" onClose={()=>setShowEOD(false)}>
    {(()=>{
      const txs=todayTxData;
      const tot={buy:txs.reduce((s,t)=>s+sN(t.buyTotal),0),sell:txs.reduce((s,t)=>s+sN(t.sellTotal),0)};
      return <div>
        <div style={{fontSize:13,fontWeight:"bold",color:T.white,marginBottom:4}}>{new Date().toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"})}</div>
        <div style={c.g2(10)}>
          <div style={c.card({padding:12})}><div style={c.lbl}>Transactions</div><div style={{fontSize:24,fontWeight:"bold",color:T.white}}>{txs.length}</div></div>
          <div style={c.card({padding:12})}><div style={c.lbl}>Buy Total</div><div style={{fontSize:20,fontWeight:"bold",color:T.green}}>{fmtAUD(tot.buy)}</div></div>
          <div style={c.card({padding:12})}><div style={c.lbl}>Sell Total</div><div style={{fontSize:20,fontWeight:"bold",color:T.gold}}>{fmtAUD(tot.sell)}</div></div>
          <div style={c.card({padding:12})}><div style={c.lbl}>Net</div><div style={{fontSize:20,fontWeight:"bold",color:T.white}}>{fmtAUD(tot.sell-tot.buy)}</div></div>
        </div>
        {txs.filter(t=>t.ttrStatus==="PENDING").length>0&&<div style={{...c.bnr("block"),marginTop:10}}>🔴 {txs.filter(t=>t.ttrStatus==="PENDING").length} TTR(s) pending — file with AUSTRAC Online today.</div>}

        {/* Phase 3.5-A-2 — Staff hours today sub-section. */}
        {auth&&auth.user&&<div style={{...c.card({padding:14}),marginTop:14}}>
          <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,letterSpacing:"0.05em",textTransform:"uppercase"}}>Staff Hours Today</div>
          <div style={{fontSize:11,color:T.muted,marginBottom:10}}>{callerCanWriteOthers?"Tick each user who worked today, fill their hours, then Save. Your PIN authorises the save.":"Tick yourself, fill your hours, then Save. Owner/manager can record other staff."}</div>
          <F label="Your per-staff PIN (4–12 digits)" type="password" value={hoursPin} onChange={setHoursPin} placeholder="••••"/>
          {loadingHours?<div style={{fontSize:11,color:T.muted,marginTop:8}}>Loading…</div>:usersInShop.length===0?<div style={{fontSize:11,color:T.muted,marginTop:8}}>No staff in this shop.</div>:usersInShop.map(u=>{
            const row=perUser[u.id]||{checked:false,start:"",end:"",break:"0",note:"",locked:false};
            const isMe=auth.user.id===u.id;
            const canEditThis=isMe||callerCanWriteOthers;
            const isLocked=!!row.locked;
            const showUnlockPanel=unlockFor&&unlockFor.userId===u.id;
            return <div key={u.id} style={{padding:"10px 0",borderBottom:"1px solid "+T.border+"33",opacity:canEditThis?1:0.5}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:canEditThis?"pointer":"not-allowed",fontSize:12,flexWrap:"wrap"}}>
                <input type="checkbox" checked={!!row.checked} disabled={!canEditThis||isLocked} onChange={e=>updatePerUser(u.id,{checked:e.target.checked})}/>
                <span style={{color:T.white}}>{userLabel(u)}{isMe?" (you)":""}</span>
                <span style={{fontSize:10,color:T.muted}}>{sS(u.role).toUpperCase()}</span>
                {isLocked&&<span style={{fontSize:10,color:T.gold,background:T.goldBg||"transparent",border:"1px solid "+T.gold,borderRadius:3,padding:"2px 6px"}}>🔒 {fmtLockedAt(row.locked_at)}</span>}
                {isLocked&&!showUnlockPanel&&<button type="button" style={c.bsm()} onClick={()=>setUnlockFor({userId:u.id,pin:"",busy:false})}>Unlock</button>}
              </label>
              {row.checked&&canEditThis&&!isLocked&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 2fr",gap:8,marginTop:6}}>
                <F label="Start" type="time" value={row.start} onChange={v=>updatePerUser(u.id,{start:v})}/>
                <F label="End" type="time" value={row.end} onChange={v=>updatePerUser(u.id,{end:v})}/>
                <F label="Break (min)" type="number" value={row.break} onChange={v=>updatePerUser(u.id,{break:v})}/>
                <F label="Note" value={row.note} onChange={v=>updatePerUser(u.id,{note:v})} placeholder="optional"/>
              </div>}
              {isLocked&&!showUnlockPanel&&<div style={{fontSize:11,color:T.muted,marginTop:6,paddingLeft:24}}>
                Start {fmtT(row.existing_row&&row.existing_row.start_time)} · End {fmtT(row.existing_row&&row.existing_row.end_time)} · Break {sN(row.existing_row&&row.existing_row.break_minutes)}m{row.existing_row&&row.existing_row.note?" · "+sS(row.existing_row.note):""}
              </div>}
              {showUnlockPanel&&<div style={{...c.card({padding:10}),marginTop:8,background:T.warn||T.surface,borderColor:T.red||T.border}}>
                <div style={{fontSize:11,color:T.red||T.gold,fontWeight:"bold",marginBottom:6}}>⚠ Hours locked in for accounting. Contact the accountant before modifying the timesheet.</div>
                <div style={{fontSize:11,color:T.muted,marginBottom:6}}>Unlocking <strong>{userLabel(u)}</strong> for {today} requires their per-staff PIN.</div>
                <F label="Row owner's PIN (4–12 digits)" type="password" value={unlockFor.pin} onChange={v=>setUnlockFor(p=>({...p,pin:v}))} placeholder="••••"/>
                <div style={{display:"flex",gap:8,marginTop:6}}>
                  <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={onConfirmUnlock} disabled={unlockFor.busy||!unlockFor.pin}>{unlockFor.busy?"…":"Confirm unlock"}</button>
                  <button style={c.bsm()} onClick={()=>setUnlockFor(null)} disabled={unlockFor.busy}>Cancel</button>
                </div>
              </div>}
            </div>;
          })}
          <div style={{display:"flex",gap:10,marginTop:10,flexWrap:"wrap"}}>
            <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={onSaveHours} disabled={savingHours||loadingHours||!hoursPin}>{savingHours?"Saving…":"Save staff hours"}</button>
            <button style={c.bsm()} onClick={onLockAll} disabled={lockingAll||loadingHours||!hoursPin}>{lockingAll?"Locking…":"🔒 Lock today's hours for processing"}</button>
          </div>
        </div>}

        <div style={{display:"flex",gap:10,marginTop:14}}>
          <button style={c.btn(T.gold,T.bg)} onClick={()=>{dlAccounting();setShowEOD(false);}}>📊 Download Accounting</button>
          <button style={c.bsm()} onClick={()=>setShowEOD(false)}>Close</button>
        </div>
      </div>;
    })()}
  </Modal>;
}
