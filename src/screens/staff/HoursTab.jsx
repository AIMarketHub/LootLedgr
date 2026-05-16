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
import {supabase,listStaffHours,upsertStaffHours,lockStaffHours,unlockStaffHours} from "../../lib/auth/saas.js";
import {useAuth} from "../../components/AuthProvider.jsx";
import {sendEmail} from "../../lib/email.js";
import {weekDates,weekStartMonday,compareWeek,attentionCount,discrepanciesHtmlSection} from "../../lib/timesheet_compare.js";

const DAY_MS=24*3600*1000;
const WINDOW_DAYS=14;
const DRAFT_KEY=(userId)=>"gf_staff_hours_draft_v1_"+userId;

function escapeHtml(s){
  return String(s==null?"":s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

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

export default function HoursTab({userId,shopId,pin,pop,userLabel}){
  const auth=useAuth();
  const[viewEnd,setViewEnd]=useState(()=>todayMidnight());
  const[grid,setGrid]=useState({});
  const[loading,setLoading]=useState(true);
  const[saving,setSaving]=useState(false);
  const[locking,setLocking]=useState(false);
  const[sendingTimesheet,setSendingTimesheet]=useState(false);
  const[errMsg,setErrMsg]=useState("");
  // Inline unlock panel: {date, pin, busy} or null. Fresh PIN
  // entry per the spec — session PIN intentionally NOT used.
  const[unlockFor,setUnlockFor]=useState(null);
  // Comparison engine: audit rows + computed discrepancies for
  // the week containing viewEnd.
  const[comparison,setComparison]=useState({rows:[],loaded:false});
  const[comparisonOpen,setComparisonOpen]=useState(false);
  // Send-timesheet confirm panel.
  const[sendConfirm,setSendConfirm]=useState(null); // {weekStart, weekRows, comparison} or null

  const dates=useMemo(()=>windowDates(viewEnd),[viewEnd]);
  const todayIso=isoDate(todayMidnight());
  const atToday=isoDate(viewEnd)===todayIso;
  const accountantEmail=(auth&&auth.shop&&auth.shop.accountant_email)||"";
  const shopName=sS((auth&&auth.shop&&auth.shop.business_name)||"Shop");
  const staffName=String(userLabel||"").trim()||sS((auth&&auth.userRecord&&((auth.userRecord.first_name||"")+" "+(auth.userRecord.family_name||"")).trim())||(auth&&auth.user&&auth.user.email)||"staff");

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
    // Force-flush focused time input. <input type="time"> doesn't
    // always fire onChange until blur — clicking Save while the
    // input is still focused can leave React state empty. Blur +
    // microtask wait lets the pending onChange run before we read
    // the grid below.
    if(typeof document!=="undefined"&&document.activeElement&&document.activeElement.blur)document.activeElement.blur();
    await new Promise(r=>setTimeout(r,0));

    if(!pin){pop&&pop("Session PIN missing. Return to Staff Tiles and re-enter.","warn");return;}
    const candidates=dates.filter(d=>{
      const row=grid[d];
      if(!row||row.locked)return false;
      return rowChangedFromDb(row);
    });
    if(candidates.length===0){
      pop&&pop("No changes to save.","info");
      return;
    }
    setSaving(true);
    let saved=0,failed=0,skippedUserDeclined=0;
    try{
      for(const d of candidates){
        const row=grid[d];
        // Duplicate-day overwrite confirmation — only when an
        // existing DB row is being overwritten. New inserts
        // skip the prompt.
        if(row.existing_id&&row.existing_row){
          const ok=typeof window!=="undefined"&&window.confirm
            ?window.confirm(diffPromptText(d,row.existing_row,row))
            :true;
          if(!ok){skippedUserDeclined++;continue;}
        }
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

  // ── Comparison engine: load audit rows for the week containing
  // viewEnd, run compareWeek, store results for the panel + the
  // timesheet email send. Recomputes when viewEnd changes.
  const loadComparison=useCallback(async()=>{
    if(!userId||!shopId){setComparison({rows:[],loaded:true});return;}
    const wDates=weekDates(viewEnd);
    const fromIso=wDates[0];
    const toIso=wDates[wDates.length-1];
    try{
      // Pull staff_hours for the week (used to constrain audits).
      const weekHours=(await listStaffHours(shopId,fromIso,toIso))
        .filter(r=>r.user_id===userId);
      // Pull audit rows for the week. audit_log RLS is shop-scoped
      // (current_shop_id()), so this returns shop-wide rows; the
      // compareWeek engine filters by payload.target_user_id.
      const audits=await supabase.from("audit_log")
        .select("id, actor, event_type, target_table, target_id, payload, created_at")
        .eq("shop_id",shopId)
        .in("event_type",["staff_hours_created","staff_hours_updated"])
        .gte("created_at",fromIso+"T00:00:00")
        .lt("created_at",toIso+"T23:59:59.999")
        .order("created_at",{ascending:true});
      const auditRows=Array.isArray(audits.data)?audits.data:[];
      const rows=compareWeek({weekDate:viewEnd,userId,staffHoursRows:weekHours,auditRows});
      setComparison({rows,loaded:true});
    }catch(e){
      // Non-fatal — the panel just won't render. Surface to console
      // so future investigations have a breadcrumb.
      console.warn("[HoursTab] comparison load failed",e);
      setComparison({rows:[],loaded:true});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[userId,shopId,viewEnd]);

  useEffect(()=>{loadComparison();},[loadComparison]);

  // ── Weekly timesheet send. Builds plain + rich-HTML payload,
  // includes the comparison section (per the spec), sends via
  // sendEmail, records the submission in timesheet_submissions.
  const buildTimesheetBodies=(weekStart,weekHours,comparisonRows)=>{
    const wDates=weekDates(weekStart);
    const weekStartIso=wDates[0];
    const weekEndIso=wDates[wDates.length-1];

    // Per-day rows. Sum total minutes to give a weekly total.
    let totalMinutes=0;
    const dayRows=wDates.map(d=>{
      const row=weekHours.find(h=>h.work_date===d);
      const start=row&&row.start_time?String(row.start_time).slice(0,5):"";
      const end=row&&row.end_time?String(row.end_time).slice(0,5):"";
      const breakM=row?Number(row.break_minutes)||0:0;
      let dayMin=0;
      if(start&&end){
        const[sh,sm]=start.split(":").map(Number);
        const[eh,em]=end.split(":").map(Number);
        dayMin=Math.max(0,(eh*60+em)-(sh*60+sm)-breakM);
      }
      totalMinutes+=dayMin;
      return{date:d,start,end,break:breakM,note:row?sS(row.note):"",dayMin};
    });
    const totalH=Math.floor(totalMinutes/60);
    const totalM=totalMinutes%60;
    const totalLabel=totalH+"h "+totalM+"m";

    // Plain-text body.
    const txt=[];
    txt.push("Weekly timesheet — "+staffName);
    txt.push("Week of "+formatDateAU(weekStartIso)+" to "+formatDateAU(weekEndIso));
    txt.push("Shop: "+shopName);
    txt.push("");
    dayRows.forEach(r=>{
      const wd=new Date(r.date+"T00:00:00").toLocaleDateString("en-AU",{weekday:"short"});
      const dh=Math.floor(r.dayMin/60), dm=r.dayMin%60;
      txt.push(wd+" "+formatDateAU(r.date)+":  "+(r.start||"—")+" → "+(r.end||"—")+"  break "+r.break+"m  ("+dh+"h "+dm+"m)"+(r.note?"  // "+r.note:""));
    });
    txt.push("");
    txt.push("Weekly total: "+totalLabel);
    const att=attentionCount(comparisonRows);
    if(att>0){
      txt.push("");
      txt.push("Discrepancy report:");
      comparisonRows.filter(r=>r.status==="differs"||r.status==="admin_only").forEach(r=>{
        const selfStr=r.self?(r.self.start+"-"+r.self.end+" break "+r.self.break+"m"):"—";
        const adminStr=r.admin?(r.admin.start+"-"+r.admin.end+" break "+r.admin.break+"m"):"—";
        txt.push("  "+r.weekday+" "+r.date+": staff="+selfStr+" | admin="+adminStr+" ("+r.message+")");
      });
    }else{
      txt.push("");
      txt.push("No discrepancies between staff-typed entries and admin-typed entries this week.");
    }

    // HTML body.
    const html=[];
    html.push('<div style="font-family:Arial,sans-serif;color:#222;font-size:13px;max-width:680px">');
    html.push('<h2 style="font-size:18px;color:#222;margin:0 0 4px 0">Weekly timesheet</h2>');
    html.push('<div style="font-size:13px;color:#555;margin-bottom:14px">'+escapeHtml(staffName)+' — '+escapeHtml(shopName)+'<br>Week of '+escapeHtml(formatDateAU(weekStartIso))+' to '+escapeHtml(formatDateAU(weekEndIso))+'</div>');
    html.push('<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px">');
    html.push('<tr><th style="background:#f5f5f5;border:1px solid #ddd;padding:6px 8px;text-align:left">Day</th><th style="background:#f5f5f5;border:1px solid #ddd;padding:6px 8px;text-align:left">Date</th><th style="background:#f5f5f5;border:1px solid #ddd;padding:6px 8px;text-align:left">Start</th><th style="background:#f5f5f5;border:1px solid #ddd;padding:6px 8px;text-align:left">End</th><th style="background:#f5f5f5;border:1px solid #ddd;padding:6px 8px;text-align:right">Break</th><th style="background:#f5f5f5;border:1px solid #ddd;padding:6px 8px;text-align:right">Total</th><th style="background:#f5f5f5;border:1px solid #ddd;padding:6px 8px;text-align:left">Note</th></tr>');
    dayRows.forEach(r=>{
      const wd=new Date(r.date+"T00:00:00").toLocaleDateString("en-AU",{weekday:"short"});
      const dh=Math.floor(r.dayMin/60), dm=r.dayMin%60;
      html.push('<tr>'
        +'<td style="border:1px solid #ddd;padding:6px 8px"><strong>'+escapeHtml(wd)+'</strong></td>'
        +'<td style="border:1px solid #ddd;padding:6px 8px">'+escapeHtml(formatDateAU(r.date))+'</td>'
        +'<td style="border:1px solid #ddd;padding:6px 8px;font-family:monospace">'+escapeHtml(r.start||"—")+'</td>'
        +'<td style="border:1px solid #ddd;padding:6px 8px;font-family:monospace">'+escapeHtml(r.end||"—")+'</td>'
        +'<td style="border:1px solid #ddd;padding:6px 8px;text-align:right">'+r.break+'m</td>'
        +'<td style="border:1px solid #ddd;padding:6px 8px;text-align:right">'+dh+'h '+dm+'m</td>'
        +'<td style="border:1px solid #ddd;padding:6px 8px;color:#666">'+escapeHtml(r.note)+'</td>'
        +'</tr>');
    });
    html.push('<tr><td colspan="5" style="border:1px solid #ddd;padding:6px 8px;text-align:right;font-weight:bold">Weekly total</td><td colspan="2" style="border:1px solid #ddd;padding:6px 8px;text-align:right;font-weight:bold">'+escapeHtml(totalLabel)+'</td></tr>');
    html.push('</table>');
    html.push(discrepanciesHtmlSection(comparisonRows));
    html.push('</div>');

    return{text:txt.join("\n"),html:html.join("\n"),weekStartIso,weekEndIso,totalLabel,dayRows};
  };

  const openSendConfirm=()=>{
    if(!accountantEmail){pop&&pop("No accountant email set. Owner can set it in Settings → 💼 Accounting.","warn");return;}
    const weekStart=weekStartMonday(viewEnd);
    const wDates=weekDates(viewEnd);
    const weekRows=wDates.map(d=>{
      const row=grid[d];
      if(!row||!row.existing_id)return null;
      return{
        work_date:d,
        start_time:row.existing_row&&row.existing_row.start_time||null,
        end_time:row.existing_row&&row.existing_row.end_time||null,
        break_minutes:row.existing_row&&row.existing_row.break_minutes||0,
        note:row.existing_row&&row.existing_row.note||null,
        locked:!!row.locked,
      };
    }).filter(Boolean);
    if(weekRows.length===0){pop&&pop("No hours logged this week.","warn");return;}
    const built=buildTimesheetBodies(weekStart,weekRows,comparison.rows||[]);
    setSendConfirm({weekStart:isoDate(weekStart),weekRowsSnapshot:weekRows,built});
  };

  const onConfirmSendTimesheet=async()=>{
    if(!sendConfirm)return;
    setSendingTimesheet(true);
    const built=sendConfirm.built;
    const subject="["+shopName+"] Weekly timesheet — "+staffName+" — week of "+formatDateAU(built.weekStartIso);
    const r=await sendEmail({
      to:accountantEmail,
      subject,
      body:built.text,
      htmlBody:built.html,
      replyTo:(auth&&auth.user&&auth.user.email)||null,
      template:"weekly_timesheet",
    });
    if(!r||!r.ok){
      setSendingTimesheet(false);
      pop&&pop("Send failed: "+sS((r&&r.error)||"unknown"),"err");
      return;
    }
    // Record the submission. Best-effort — surface failures but
    // don't unwind the (successful) email send.
    try{
      const{error}=await supabase.from("timesheet_submissions").insert({
        user_id:userId,
        shop_id:shopId,
        week_start_date:sendConfirm.weekStart,
        hours_snapshot:sendConfirm.weekRowsSnapshot,
        discrepancies:comparison.rows||[],
        sent_to_email:accountantEmail,
        email_log_id:r.id||null,
      });
      if(error){
        // Unique-index violation if the same week is submitted
        // twice — surface as info rather than error since the
        // email did go through.
        if(String(error.message||"").toLowerCase().includes("duplicate")){
          pop&&pop("Email sent. Submission record already exists for this week.","ok");
        }else{
          pop&&pop("Email sent. Submission record failed: "+sS(error.message),"warn");
        }
      }else{
        pop&&pop("Timesheet sent to "+accountantEmail+".","ok");
      }
    }catch(e){
      pop&&pop("Email sent. Submission record exception: "+sS(e&&e.message),"warn");
    }
    setSendingTimesheet(false);
    setSendConfirm(null);
  };

  const currentJump=quickJumpForViewEnd(viewEnd);
  const compAttention=attentionCount(comparison.rows||[]);

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

    {/* Comparison panel — staff edits vs admin edits per day for
        the week containing viewEnd. Collapsed by default. */}
    {comparison.loaded?<div style={{marginBottom:14,padding:"10px 12px",background:T.surface,border:"1px solid "+T.border,borderRadius:6}}>
      <div onClick={()=>setComparisonOpen(o=>!o)} style={{cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontSize:12,color:T.white,fontWeight:"bold"}}>
          📊 Daily vs Weekly comparison{" "}
          <span style={{fontWeight:"normal",color:compAttention>0?T.red:T.green}}>
            ({compAttention>0?compAttention+" need"+(compAttention===1?"s":"")+" attention":"all match"})
          </span>
        </div>
        <span style={{fontSize:14,color:T.muted}}>{comparisonOpen?"▾":"▸"}</span>
      </div>
      {comparisonOpen?<div style={{marginTop:10}}>
        <div style={{fontSize:10,color:T.muted,marginBottom:8,lineHeight:1.4}}>
          Compares your typed entries (Profile → Hours) against the admin-typed entries (Bulk Hours Editor) for the week of <strong style={{color:T.text}}>{formatDateAU(weekDates(viewEnd)[0])}</strong>.
        </div>
        {(comparison.rows||[]).map(r=>{
          const colour=r.status==="differs"?T.red:r.status==="admin_only"?T.gold:r.status==="match"?T.green:T.muted;
          return <div key={r.date} style={{padding:"6px 0",borderBottom:"1px solid "+T.border+"22",fontSize:11,color:T.text}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:6,flexWrap:"wrap"}}>
              <span><strong>{r.weekday}</strong> {formatDateAU(r.date)}</span>
              <span style={{color:colour,fontWeight:"bold"}}>{r.status==="match"?"✓ Match":r.status==="differs"?"⚠ Differs":r.status==="admin_only"?"➜ Admin only":r.status==="self_only"?"☆ Staff only":"— no entry"}</span>
            </div>
            {(r.self||r.admin)?<div style={{fontSize:10,color:T.muted,marginTop:2,fontFamily:"monospace"}}>
              staff: {r.self?(r.self.start+"–"+r.self.end+" b"+r.self.break+"m"):"—"} · admin: {r.admin?(r.admin.start+"–"+r.admin.end+" b"+r.admin.break+"m"):"—"}
            </div>:null}
          </div>;
        })}
      </div>:null}
    </div>:null}

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
      <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"10px 18px"})} onClick={onSave} disabled={saving||locking||loading}>{saving?"Saving…":"💾 Save changed rows"}</button>
      <button style={c.bsm(T.goldBg,T.gold)} onClick={onLockAll} disabled={saving||locking||loading||!pin}>{locking?"Locking…":"🔒 Lock hours in this view"}</button>
      <button style={c.bsm()} onClick={load} disabled={saving||locking||loading}>↻ Reload from DB</button>
      <div style={{flex:1}}/>
      <button
        style={c.bsm(T.goldBg,T.gold)}
        onClick={openSendConfirm}
        disabled={saving||locking||loading||sendingTimesheet||!accountantEmail}
        title={!accountantEmail?"No accountant email configured. Owner sets it in Settings → 💼 Accounting.":"Send this week's hours to the accountant"}
      >📤 Send weekly timesheet</button>
    </div>

    {/* Send-timesheet confirm panel — shows the payload + the
        comparison so the staff can sanity-check before firing. */}
    {sendConfirm?<div style={{position:"fixed",inset:0,background:"#000000e0",zIndex:2200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>!sendingTimesheet&&setSendConfirm(null)}>
      <div style={{...c.card({padding:20}),maxWidth:680,width:"100%",maxHeight:"90vh",overflow:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:14,fontWeight:"bold",color:T.white,marginBottom:6}}>📤 Send weekly timesheet</div>
        <div style={{fontSize:11,color:T.muted,marginBottom:12,lineHeight:1.5}}>
          To: <strong style={{color:T.white}}>{accountantEmail}</strong><br/>
          Subject: <strong style={{color:T.white}}>[{shopName}] Weekly timesheet — {staffName} — week of {formatDateAU(sendConfirm.built.weekStartIso)}</strong>
        </div>
        <div style={{marginBottom:10}}>
          <label style={c.lbl}>Plain-text preview</label>
          <pre style={{background:T.surface,border:"1px solid "+T.border,padding:"8px 10px",fontSize:11,overflow:"auto",maxHeight:280,whiteSpace:"pre-wrap",margin:0,fontFamily:"monospace",color:T.text}}>{sendConfirm.built.text}</pre>
        </div>
        <div style={{fontSize:10,color:T.muted,marginBottom:10}}>
          A rich HTML version (with the discrepancy table) is sent in parallel.
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button style={c.bsm()} onClick={()=>setSendConfirm(null)} disabled={sendingTimesheet}>Cancel</button>
          <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"10px 18px"})} onClick={onConfirmSendTimesheet} disabled={sendingTimesheet}>{sendingTimesheet?"Sending…":"📤 Send"}</button>
        </div>
      </div>
    </div>:null}
    {!pin?<div style={{fontSize:11,color:T.red,marginTop:10}}>⚠ Session PIN not found. Return to Staff Tiles and re-enter your PIN before saving or locking.</div>:null}
  </div>;
}
