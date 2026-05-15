// LootLedger — Staff workspace Hours tab.
// Phase 5.2 Commit 1 (2026-05-15). Relocated from the EOD modal.
//
// Per-user, last-7-day hours grid. Each row binds start / end /
// break / note inputs to local state; the grid auto-saves to
// localStorage on every keystroke so closing the profile mid-edit
// doesn't lose data. The "Save changed rows" button walks the
// grid, calls upsertStaffHours for each row whose values differ
// from the DB row, then clears the localStorage draft for the
// saved rows.
//
// PIN: the verified PIN was captured at tile click time and lives
// in sessionStorage under SESSION_PIN_KEY (see StaffTiles.jsx).
// Passed in via the prop here; the RPC re-validates it on every
// call so an expired session degrades into a friendly toast rather
// than data corruption.
//
// Bug fixes vs the old EOD location:
//   (a) Persistence on close — localStorage draft survives navigate-
//       away. On mount, draft is preferred over the DB row when
//       newer (we don't track timestamps that fine; the draft is
//       used as the source of truth if any of its non-empty fields
//       differ from the DB row).
//   (b) Save Changed Rows — actually fires upsertStaffHours and
//       emits a toast.

import React,{useEffect,useState,useCallback} from "react";
import {T,c} from "../../theme.js";
import {sS,sN,formatDateAU} from "../../lib/utils.js";
import {F} from "../../components/ui";
import {listStaffHours,upsertStaffHours} from "../../lib/auth/saas.js";

const DAY_MS=24*3600*1000;
const DRAFT_KEY=(userId)=>"gf_staff_hours_draft_v1_"+userId;

function isoDate(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const dd=String(d.getDate()).padStart(2,"0");
  return y+"-"+m+"-"+dd;
}

function last7Days(){
  const out=[];
  const today=new Date();
  today.setHours(0,0,0,0);
  for(let i=0;i<7;i++){
    const d=new Date(today.getTime()-i*DAY_MS);
    out.push(isoDate(d));
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

export default function HoursTab({userId,shopId,pin,pop}){
  const[grid,setGrid]=useState({});
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[errMsg,setErrMsg]=useState("");

  const dates=last7Days();

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
      // Layer the draft on top — any field the user has typed since
      // last save replaces what came from the DB.
      const draft=readDraft(userId);
      if(draft){
        Object.keys(draft).forEach(d=>{
          if(next[d]){
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
  },[userId,shopId]);

  useEffect(()=>{load();},[load]);

  const updateCell=(date,patch)=>{
    setGrid(g=>{
      const nextRow={...(g[date]||blankRow()),...patch};
      const nextGrid={...g,[date]:nextRow};
      writeDraft(userId,nextGrid);
      return nextGrid;
    });
  };

  const onSave=async()=>{
    if(!pin){pop&&pop("Session PIN missing. Return to Staff Tiles and re-enter.","warn");return;}
    const toSave=dates.filter(d=>{
      const row=grid[d];
      if(!row||row.locked)return false;
      return rowChangedFromDb(row);
    });
    if(toSave.length===0){
      pop&&pop("No changes to save.","info");
      return;
    }
    setSaving(true);
    let saved=0,failed=0;
    try{
      for(const d of toSave){
        const row=grid[d];
        try{
          await upsertStaffHours({
            pin,
            userId,
            workDate:d,
            startTime:row.start||null,
            endTime:row.end||null,
            breakMinutes:parseInt(row.break,10)||0,
            note:row.note||"",
          });
          saved++;
        }catch(e){
          failed++;
          pop&&pop("Save failed for "+formatDateAU(d)+": "+sS(e&&e.message),"err");
        }
      }
      if(saved>0){
        pop&&pop("Hours saved ("+saved+" day"+(saved===1?"":"s")+(failed>0?", "+failed+" failed":"")+").","ok");
        clearDraft(userId);
        await load();
      }else if(failed>0){
        pop&&pop("All saves failed. Check PIN and try again.","err");
      }
    }finally{setSaving(false);}
  };

  return <div>
    <div style={{fontSize:11,color:T.muted,marginBottom:10,lineHeight:1.5}}>
      Last 7 days. Edits auto-save to this device while you type; click <strong>Save changed rows</strong> to push to the database.
      Locked rows are read-only — unlock via the EOD modal (Dashboard → 📋 EOD → row Unlock).
    </div>
    {errMsg?<div style={{...c.bnr("block"),marginBottom:12}}>{errMsg}</div>:null}
    {loading?<div style={{fontSize:11,color:T.muted}}>Loading…</div>:<div>
      {dates.map(d=>{
        const row=grid[d]||blankRow();
        const changed=rowChangedFromDb(row);
        return <div key={d} style={{padding:"10px 0",borderBottom:"1px solid "+T.border+"33"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6,flexWrap:"wrap"}}>
            <div style={{fontSize:12,fontWeight:"bold",color:T.white,minWidth:140}}>{formatDateAU(d)}</div>
            {row.locked?<span style={{fontSize:10,color:T.gold,border:"1px solid "+T.gold,borderRadius:3,padding:"2px 6px"}}>🔒 LOCKED</span>:null}
            {changed&&!row.locked?<span style={{fontSize:10,color:T.gold}}>● unsaved</span>:null}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 2fr",gap:8,opacity:row.locked?0.6:1}}>
            <F label="Start" type="time" value={row.start} onChange={v=>!row.locked&&updateCell(d,{start:v})}/>
            <F label="End"   type="time" value={row.end}   onChange={v=>!row.locked&&updateCell(d,{end:v})}/>
            <F label="Break (min)" type="number" value={row.break} onChange={v=>!row.locked&&updateCell(d,{break:v})}/>
            <F label="Note"  value={row.note} onChange={v=>!row.locked&&updateCell(d,{note:v})} placeholder="optional"/>
          </div>
        </div>;
      })}
    </div>}
    <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap"}}>
      <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"10px 18px"})} onClick={onSave} disabled={saving||loading}>{saving?"Saving…":"💾 Save changed rows"}</button>
      <button style={c.bsm()} onClick={load} disabled={saving||loading}>↻ Reload from DB</button>
    </div>
    {!pin?<div style={{fontSize:11,color:T.red,marginTop:10}}>⚠ Session PIN not found. Return to Staff Tiles and re-enter your PIN before saving.</div>:null}
  </div>;
}
