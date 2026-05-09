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
// `todayTxData` is computed at the App.tsx level (a useMemo over
// txList filtered to today's date) and passed in as a prop.

import React,{useState,useEffect,useCallback} from "react";
import {T,c} from "../theme.js";
import {sN,sS,fmtAUD,todayStr} from "../lib/utils.js";
import Modal from "../components/ui/Modal.jsx";
import {F} from "../components/ui";
import {useAuth} from "../components/AuthProvider.jsx";
import {supabase,listStaffHours,upsertStaffHours} from "../lib/auth/saas.js";

// Display label for a user row (mirrors the helper in Staff.jsx).
function userLabel(u){
  if(!u)return "(unknown)";
  const fn=sS(u.first_name||"");
  const ln=sS(u.family_name||"");
  const full=(fn+" "+ln).trim();
  return full||sS(u.email)||"(no name)";
}

export default function EOD({todayTxData,dlAccounting,setShowEOD,pop}){
  const auth=useAuth();
  const role=(auth&&auth.role)||null;
  const callerCanWriteOthers=role==="owner"||role==="manager";
  const today=todayStr();

  // Hours sub-section state.
  const[hoursPin,setHoursPin]=useState("");
  const[usersInShop,setUsersInShop]=useState([]);
  const[perUser,setPerUser]=useState({}); // {[user_id]:{checked,start,end,break,note,existing_id}}
  const[loadingHours,setLoadingHours]=useState(true);
  const[savingHours,setSavingHours]=useState(false);

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
        }:{checked:false,start:"",end:"",break:"0",note:"",existing_id:null};
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
    let saved=0,failed=0;
    try{
      for(const u of usersInShop){
        const row=perUser[u.id];
        if(!row||!row.checked)continue;
        // RPC enforces self vs cross-user role rules; this UI gate
        // mirrors that for clearer error messages on the staff path.
        if(u.id!==auth.user.id&&!callerCanWriteOthers){
          continue; // staff trying to save for someone else — skip
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
        pop&&pop("Saved "+saved+" staff hour entr"+(saved===1?"y":"ies")+(failed>0?" ("+failed+" failed)":"."),"ok");
        await refreshHours();
        setHoursPin("");
      }else if(failed===0){
        pop&&pop("Nothing checked to save.","warn");
      }
    }finally{setSavingHours(false);}
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
          {loadingHours?<div style={{fontSize:11,color:T.muted,marginTop:8}}>Loading staff…</div>:usersInShop.length===0?<div style={{fontSize:11,color:T.muted,marginTop:8}}>No staff in this shop.</div>:usersInShop.map(u=>{
            const row=perUser[u.id]||{checked:false,start:"",end:"",break:"0",note:""};
            const isMe=auth.user.id===u.id;
            const canEditThis=isMe||callerCanWriteOthers;
            return <div key={u.id} style={{padding:"10px 0",borderBottom:"1px solid "+T.border+"33",opacity:canEditThis?1:0.5}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:canEditThis?"pointer":"not-allowed",fontSize:12}}>
                <input type="checkbox" checked={!!row.checked} disabled={!canEditThis} onChange={e=>updatePerUser(u.id,{checked:e.target.checked})}/>
                <span style={{color:T.white}}>{userLabel(u)}{isMe?" (you)":""}</span>
                <span style={{fontSize:10,color:T.muted}}>{sS(u.role).toUpperCase()}</span>
              </label>
              {row.checked&&canEditThis&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 2fr",gap:8,marginTop:6}}>
                <F label="Start" type="time" value={row.start} onChange={v=>updatePerUser(u.id,{start:v})}/>
                <F label="End" type="time" value={row.end} onChange={v=>updatePerUser(u.id,{end:v})}/>
                <F label="Break (min)" type="number" value={row.break} onChange={v=>updatePerUser(u.id,{break:v})}/>
                <F label="Note" value={row.note} onChange={v=>updatePerUser(u.id,{note:v})} placeholder="optional"/>
              </div>}
            </div>;
          })}
          <div style={{marginTop:10}}>
            <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={onSaveHours} disabled={savingHours||loadingHours||!hoursPin}>{savingHours?"Saving…":"Save staff hours"}</button>
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
