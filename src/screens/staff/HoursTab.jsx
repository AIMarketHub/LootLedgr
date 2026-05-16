// LootLedger — Staff workspace Hours tab.
// Phase 5.2 Commit 1 (2026-05-15) — relocated from EOD modal.
// Fix-forward 2026-05-16 — restored regressed features from
// the old Staff.jsx + EOD.jsx surfaces:
//   - 14-day rolling window (was 7).
//   - Previous/next-week arrows (arbitrary back-navigation).
//   - Quick-jump dropdown for the last 4 weeks (this week / last
//     week / 2-3-4 weeks ago) anchored on the rightmost date.
//   - Section-level "Lock hours" button using the cached session
//     PIN + confirm modal.
//   - Per-row inline Unlock panel that REQUIRES fresh PIN entry
//     (re-prompt; not cached) and surfaces the "contact
//     accountant" warning.
//   - Locked-at timestamp display next to the 🔒 badge.
//   - Duplicate-day overwrite confirmation (window.confirm with
//     existing-vs-new diff).
//
// PIN posture for the three actions:
//   Save  — uses cached session PIN (verified at tile click).
//   Lock  — uses cached session PIN + confirm modal.
//   Unlock— REQUIRES fresh PIN entry (destructive, may affect
//           data already in payroll / accountant reports). Cached
//           session PIN is intentionally NOT used.
//
// Audit: every save/lock/unlock writes an audit_log row server-
// side via the existing RPCs (migrations 0014 / 0015). No client-
// side audit writes needed.
//
// Bug fixes from Commit 1 still in force:
//   (a) localStorage draft persistence on close.
//   (b) Toast on save with saved/failed/skipped breakdown.

import React,{useEffect,useState,useCallback,useMemo} from "react";
import {T,c} from "../../theme.js";
import {sS,sN,formatDateAU,formatDateTimeAU} from "../../lib/utils.js";
import {F} from "../../components/ui";
import {listStaffHours,upsertStaffHours,lockStaffHours,unlockStaffHours} from "../../lib/auth/saas.js";

const DAY_MS=24*3600*1000;
const WINDOW_DAYS=14;
const DRAFT_KEY=(userId)=>"gf_staff_hours_draft_v1_"+userId;

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

function shiftDays(date,delta){
  const d=new Date(date.getTime()+delta*DAY_MS);
  d.setHours(0,0,0,0);
  return d;
}

// Build the WINDOW_DAYS-long array of ISO dates ending on
// anchorDate (newest first).
function windowDates(anchorDate){
  const out=[];
  for(let i=0;i<WINDOW_DAYS;i++){
    out.push(isoDate(shiftDays(anchorDate,-i)));
  }
  return out;
}

function blankRow(){
  return{start:"",end:"",break:"0",note:"",existing_id:null,existing_row:null,locked:false,locked_at:null};
}

function rowFromDb(h){
  return{
    start:h.start_time?String(h.start_time).slice(0,5):"",
    end:h.end_time?String(h.end_time).slice(0,5):"",
    break:String(h.break_minutes||0),
    note:sS(h.note),
    existing_id:h.id,
    existing_row:h,
    locked:!!h.locked,
    locked_at:h.locked_at||null,
  };
}

function rowChangedFromDb(row){
  if(!row.existing_row){
    return!!(row.start||row.end||(row.note&&row.note.trim())||(parseInt(row.break,10)||0)>0);
  }
  const dbStart=row.existing_row.start_time?String(row.existing_row.start_time).slice(0,5):"";
  const dbEnd=row.existing_row.end_time?String(row.existing_row.end_time).slice(0,5):"";
  const dbBreak=String(row.existing_row.break_minutes||0);
  const dbNote=sS(row.existing_row.note);
  return row.start!==dbStart||row.end!==dbEnd||row.break!==dbBreak||row.note!==dbNote;
}

// window.confirm-friendly multi-line diff for the duplicate-day
// overwrite prompt. Mirrors the helper in the legacy Staff.jsx /
// EOD surfaces so the wording is familiar.
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

function readDraft(userId){
  try{
    const raw=localStorage.getItem(DRAFT_KEY(userId));
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    return parsed&&typeof parsed==="object"?parsed:null;
  }catch(_){return null;}
}

function writeDraft(userId,grid){
  try{
    const slim={};
    Object.keys(grid).forEach(date=>{
      const r=grid[date];
      slim[date]={start:r.start,end:r.end,break:r.break,note:r.note};
    });
    localStorage.setItem(DRAFT_KEY(userId),JSON.stringify(slim));
  }catch(_){}
}

function clearDraft(userId){
  try{localStorage.removeItem(DRAFT_KEY(userId));}catch(_){}
}

// Quick-jump dropdown options for the last 4 weeks. Each option
// sets viewEnd to today minus N*7 days. The window is then
// re-rendered as the WINDOW_DAYS-long span ending on viewEnd.
const QUICK_JUMP=[
  {value:0,label:"This week"},
  {value:1,label:"Last week"},
  {value:2,label:"2 weeks ago"},
  {value:3,label:"3 weeks ago"},
  {value:4,label:"4 weeks ago"},
];

function quickJumpForViewEnd(viewEnd){
  const todayIso=isoDate(todayMidnight());
  const todayMs=new Date(todayIso+"T00:00:00").getTime();
  const veIso=isoDate(viewEnd);
  const veMs=new Date(veIso+"T00:00:00").getTime();
  const weeks=Math.round((todayMs-veMs)/(7*DAY_MS));
  if(weeks>=0&&weeks<=4)return weeks;
  return -1; // outside dropdown range; render the dropdown blank
}

export default function HoursTab({userId,shopId,pin,pop}){
  const[viewEnd,setViewEnd]=useState(()=>todayMidnight());
  const[grid,setGrid]=useState({});
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[locking,setLocking]=useState(false);
  const[errMsg,setErrMsg]=useState("");
  // Inline unlock panel: {date, pin, busy} or null. Fresh PIN
  // entry per the spec — session PIN intentionally NOT used.
  const[unlockFor,setUnlockFor]=useState(null);

  const dates=useMemo(()=>windowDates(viewEnd),[viewEnd]);
  const todayIso=isoDate(todayMidnight());
  const atToday=isoDate(viewEnd)===todayIso;

  const load=useCallback(async()=>{
    if(!userId||!shopId)return;
    setLoading(true);
    setErrMsg("");
    try{
      const fromDate=dates[dates.length-1];
      const toDate=dates[0];
      const rows=await listStaffHours(shopId,fromDate,toDate);
      const ownRows=(rows||[]).filter(r=>r.user_id===userId);
      const next={};
      dates.forEach(d=>{
        const hit=ownRows.find(r=>r.work_date===d);
        next[d]=hit?rowFromDb(hit):blankRow();
      });
      // Layer the localStorage draft on top — preserves typed
      // edits across navigate-away / refresh.
      const draft=readDraft(userId);
      if(draft){
        Object.keys(draft).forEach(d=>{
          if(next[d]&&!next[d].locked){
            next[d]={
              ...next[d],
              start:draft[d].start||next[d].start,
              end:draft[d].end||next[d].end,
              break:draft[d].break||next[d].break,
              note:typeof draft[d].note==="string"?draft[d].note:next[d].note,
            };
          }
        });
      }
      setGrid(next);
    }catch(e){
      setErrMsg("Could not load hours: "+sS(e&&e.message));
    }finally{
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[userId,shopId,viewEnd]);

  useEffect(()=>{load();},[load]);

  const updateCell=(date,patch)=>{
    setGrid(g=>{
      const nextRow={...(g[date]||blankRow()),...patch};
      const nextGrid={...g,[date]:nextRow};
      writeDraft(userId,nextGrid);
      return nextGrid;
    });
  };

  const onPrevWeek=()=>setViewEnd(d=>shiftDays(d,-7));
  const onNextWeek=()=>{
    const next=shiftDays(viewEnd,7);
    if(next.getTime()>todayMidnight().getTime())return;
    setViewEnd(next);
  };
  const onQuickJump=(weeksAgo)=>{
    const w=parseInt(weeksAgo,10);
    if(!isFinite(w))return;
    setViewEnd(shiftDays(todayMidnight(),-w*7));
  };

  const onSave=async()=>{
    // ── DIAGNOSTIC LOGS (2026-05-16) — to be removed after USER
    // confirms the silent-save bug is identified.
    console.log("[HoursTab.onSave] CLICK received. state:",{
      pinPresent:!!pin,
      gridDates:Object.keys(grid),
      dates,
      saving, locking, loading,
    });

    // Force-flush focused time input. <input type="time"> doesn't
    // always fire onChange until blur — clicking Save while the
    // input is still focused can leave React state empty. Blur +
    // microtask wait lets the pending onChange run before we read
    // the grid below.
    if(typeof document!=="undefined"&&document.activeElement&&document.activeElement.blur)document.activeElement.blur();
    await new Promise(r=>setTimeout(r,0));
    console.log("[HoursTab.onSave] post-flush, grid sample:",dates.slice(0,3).map(d=>({date:d,row:grid[d]})));

    if(!pin){
      console.log("[HoursTab.onSave] no session PIN; bailing");
      pop&&pop("Session PIN missing. Return to Staff Tiles and re-enter.","warn");return;
    }
    const candidates=dates.filter(d=>{
      const row=grid[d];
      if(!row||row.locked)return false;
      return rowChangedFromDb(row);
    });
    console.log("[HoursTab.onSave] changed candidates:",candidates);
    if(candidates.length===0){
      console.log("[HoursTab.onSave] no candidates; toast info + bail");
      pop&&pop("No changes to save.","info");
      return;
    }
    setSaving(true);
    let saved=0,failed=0,skippedUserDeclined=0;
    try{
      for(const d of candidates){
        const row=grid[d];
        console.log("[HoursTab.onSave] processing date:",d,"row:",row);
        // Duplicate-day overwrite confirmation — only when an
        // existing DB row is being overwritten. New inserts
        // skip the prompt.
        if(row.existing_id&&row.existing_row){
          const ok=typeof window!=="undefined"&&window.confirm
            ?window.confirm(diffPromptText(d,row.existing_row,row))
            :true;
          if(!ok){
            console.log("[HoursTab.onSave] overwrite declined:",d);
            skippedUserDeclined++;continue;
          }
        }
        try{
          console.log("[HoursTab.onSave] calling upsertStaffHours for",d);
          await upsertStaffHours({
            pin,
            userId,
            workDate:d,
            startTime:row.start||null,
            endTime:row.end||null,
            breakMinutes:parseInt(row.break,10)||0,
            note:row.note||"",
          });
          console.log("[HoursTab.onSave] upsert OK for",d);
          saved++;
        }catch(e){
          console.error("[HoursTab.onSave] upsert threw for",d,e);
          failed++;
          pop&&pop("Save failed for "+formatDateAU(d)+": "+sS(e&&e.message),"err");
        }
      }
      console.log("[HoursTab.onSave] loop done. counts:",{saved,failed,skippedUserDeclined});
      if(saved>0){
        const extras=[];
        if(failed>0)extras.push(failed+" failed");
        if(skippedUserDeclined>0)extras.push(skippedUserDeclined+" skipped");
        pop&&pop("Hours saved ("+saved+" day"+(saved===1?"":"s")+(extras.length?", "+extras.join(", "):"")+").","ok");
        clearDraft(userId);
        await load();
      }else if(skippedUserDeclined>0&&failed===0){
        pop&&pop("All overwrites declined.","warn");
      }else if(failed>0){
        pop&&pop("All saves failed. Check PIN and try again.","err");
      }
    }finally{setSaving(false);}
  };

  // Section-level lock — locks every saved, unlocked row in the
  // current view. Uses the cached session PIN (no re-prompt) +
  // confirm modal (window.confirm).
  const onLockAll=async()=>{
    if(!pin){pop&&pop("Session PIN missing. Return to Staff Tiles and re-enter.","warn");return;}
    const lockable=dates
      .map(d=>({date:d,row:grid[d]}))
      .filter(x=>x.row&&x.row.existing_id&&!x.row.locked);
    if(lockable.length===0){pop&&pop("No unlocked saved entries to lock in this view.","warn");return;}
    const confirmMsg="Lock "+lockable.length+" entr"+(lockable.length===1?"y":"ies")
      +" in this 14-day view? Once locked they cannot be edited or deleted without your PIN. Unlock requires fresh PIN entry + an accountant warning.";
    if(typeof window!=="undefined"&&window.confirm&&!window.confirm(confirmMsg))return;
    setLocking(true);
    let locked=0,failed=0;
    try{
      for(const{date,row} of lockable){
        try{
          await lockStaffHours(pin,row.existing_id);
          locked++;
        }catch(e){
          failed++;
          pop&&pop("Lock failed for "+formatDateAU(date)+": "+sS(e&&e.message),"err");
        }
      }
      if(locked>0)pop&&pop("Locked "+locked+" entr"+(locked===1?"y":"ies")+(failed>0?" ("+failed+" failed)":"."),"ok");
      await load();
    }finally{setLocking(false);}
  };

  const onConfirmUnlock=async()=>{
    if(!unlockFor)return;
    const row=grid[unlockFor.date];
    if(!row||!row.existing_id)return;
    const fresh=String(unlockFor.pin||"").trim();
    if(!/^\d{4,12}$/.test(fresh)){pop&&pop("Enter your 4-12 digit PIN.","warn");return;}
    setUnlockFor(p=>({...p,busy:true}));
    try{
      await unlockStaffHours(fresh,row.existing_id);
      pop&&pop("Entry unlocked.","ok");
      setUnlockFor(null);
      await load();
    }catch(e){
      pop&&pop("Unlock failed: "+sS(e&&e.message),"err");
      setUnlockFor(p=>({...p,busy:false}));
    }
  };

  const currentJump=quickJumpForViewEnd(viewEnd);

  return <div>
    <div style={{fontSize:11,color:T.muted,marginBottom:10,lineHeight:1.5}}>
      14-day rolling view. Edits auto-save to this device while you type; click <strong>Save changed rows</strong> to push to the database.
      Lock seals saved rows; Unlock requires fresh PIN entry.
    </div>

    {/* Date navigation strip */}
    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:14,padding:"10px 12px",background:T.surface,border:"1px solid "+T.border,borderRadius:6}}>
      <button style={c.bsm()} onClick={onPrevWeek} disabled={loading} title="Back one week">◀ Prev week</button>
      <div style={{fontSize:12,color:T.white,minWidth:200,textAlign:"center"}}>
        <strong>{formatDateAU(dates[dates.length-1])}</strong> → <strong>{formatDateAU(dates[0])}</strong>
      </div>
      <button style={c.bsm()} onClick={onNextWeek} disabled={loading||atToday} title={atToday?"Already at the latest week":"Forward one week"}>Next week ▶</button>
      <div style={{flex:1,minWidth:140}}>
        <select
          value={currentJump>=0?String(currentJump):""}
          onChange={e=>onQuickJump(e.target.value)}
          style={{...c.inp({padding:"6px 8px",fontSize:12}),width:"100%"}}
        >
          <option value="" disabled>Quick jump…</option>
          {QUICK_JUMP.map(o=><option key={o.value} value={String(o.value)}>{o.label}</option>)}
        </select>
      </div>
    </div>

    {errMsg?<div style={{...c.bnr("block"),marginBottom:12}}>{errMsg}</div>:null}
    {loading?<div style={{fontSize:11,color:T.muted}}>Loading…</div>:<div>
      {dates.map(d=>{
        const row=grid[d]||blankRow();
        const changed=rowChangedFromDb(row);
        const showUnlock=unlockFor&&unlockFor.date===d;
        return <div key={d} style={{padding:"10px 0",borderBottom:"1px solid "+T.border+"33"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
            <div style={{fontSize:12,fontWeight:"bold",color:T.white,minWidth:140}}>{formatDateAU(d)}</div>
            {row.locked?<span style={{fontSize:10,color:T.gold,border:"1px solid "+T.gold,borderRadius:3,padding:"2px 6px"}} title={row.locked_at?formatDateTimeAU(row.locked_at):""}>🔒 LOCKED{row.locked_at?" · "+formatDateTimeAU(row.locked_at):""}</span>:null}
            {changed&&!row.locked?<span style={{fontSize:10,color:T.gold}}>● unsaved</span>:null}
            {row.locked&&!showUnlock?<button type="button" style={c.bsm()} onClick={()=>setUnlockFor({date:d,pin:"",busy:false})}>Unlock</button>:null}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 2fr",gap:8,opacity:row.locked?0.6:1}}>
            <F label="Start" type="time" value={row.start} onChange={v=>!row.locked&&updateCell(d,{start:v})}/>
            <F label="End"   type="time" value={row.end}   onChange={v=>!row.locked&&updateCell(d,{end:v})}/>
            <F label="Break (min)" type="number" value={row.break} onChange={v=>!row.locked&&updateCell(d,{break:v})}/>
            <F label="Note"  value={row.note} onChange={v=>!row.locked&&updateCell(d,{note:v})} placeholder="optional"/>
          </div>
          {showUnlock?<div style={{...c.card({padding:10}),marginTop:8,borderColor:T.red||T.border,background:T.warn||T.surface}}>
            <div style={{fontSize:11,color:T.red||T.gold,fontWeight:"bold",marginBottom:6}}>⚠ Hours locked in for accounting. Contact the accountant before modifying the timesheet.</div>
            <div style={{fontSize:11,color:T.muted,marginBottom:6}}>Unlocking <strong>{formatDateAU(d)}</strong> requires a fresh PIN entry — your cached session PIN is not used here.</div>
            <F label="Your PIN (4–12 digits)" type="password" value={unlockFor.pin} onChange={v=>setUnlockFor(p=>({...p,pin:v}))} placeholder="••••"/>
            <div style={{display:"flex",gap:8,marginTop:6}}>
              <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={onConfirmUnlock} disabled={unlockFor.busy||!unlockFor.pin}>{unlockFor.busy?"…":"Confirm unlock"}</button>
              <button style={c.bsm()} onClick={()=>setUnlockFor(null)} disabled={unlockFor.busy}>Cancel</button>
            </div>
          </div>:null}
        </div>;
      })}
    </div>}
    <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap"}}>
      {/* DIAGNOSTIC 2026-05-16 — Save button NOT disabled. Handler
          logs disabled-conditions and toasts if preconditions
          fail. Lets us see in F12 whether clicks reach the
          handler at all. */}
      <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"10px 18px"})} onClick={()=>{
        console.log("[HoursTab.SaveButton] click event reached handler. disabled-conditions:",{saving,locking,loading});
        if(saving||locking||loading){pop&&pop("Wait for current operation to finish.","warn");return;}
        onSave();
      }}>{saving?"Saving…":"💾 Save changed rows"}</button>
      <button style={c.bsm(T.goldBg,T.gold)} onClick={onLockAll} disabled={saving||locking||loading||!pin}>{locking?"Locking…":"🔒 Lock hours in this view"}</button>
      <button style={c.bsm()} onClick={load} disabled={saving||locking||loading}>↻ Reload from DB</button>
    </div>
    {!pin?<div style={{fontSize:11,color:T.red,marginTop:10}}>⚠ Session PIN not found. Return to Staff Tiles and re-enter your PIN before saving or locking.</div>:null}
  </div>;
}
