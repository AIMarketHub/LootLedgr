// LootLedger — TFS Screening Log audit-surface panel.
// TFS Commit 4 (2026-05-06). Renders inside the Settings modal's
// "📋 TFS Screening Log" accordion section. Read-only view onto
// the tfs_screen_log table — every screening event recorded by
// the matcher: HIGH/MEDIUM staff decisions (block / override),
// the LOW-severity audit sweep at finalize, and any future
// screening surfaces that hit sb.logTfsScreen.
//
// Why this is a separate file: the Settings modal is already
// 900+ lines and the panel needs its own state (filters,
// pagination, row-detail modal). Inlining would cost readability
// and produce the same accessibility / focus-management bugs as
// inlining any other multi-component surface.
//
// Admin gating: rendered only when admin===true (the Settings
// section reads useAuth().admin and conditionally mounts this
// panel). RLS at the database level is the load-bearing guard;
// the UI gate is just so non-admins don't see an unhelpful empty
// pane.
//
// Filter shape: status === one of
//   "all"          (no filter — every event)
//   "matched"      (matched=true, regardless of decision)
//   "not_matched"  (matched=false — diagnostic only; the matcher
//                   currently doesn't write these but the column
//                   allows for future use)
//   "blocked"      (confirmed_match=true — staff refused the tx)
//   "overridden"   (override_applied=true — staff continued)
//
// Date range filters with `from` and `to` (HTML date inputs).
// Empty `from` defaults to 30 days ago to bound the query
// reasonably; empty `to` means "now".
//
// Pagination: 50 rows per page, server-side via offset/limit.
// "Next" disabled when the latest page returned <50 rows
// (signal that we hit the tail).

import React,{useState,useEffect,useCallback} from "react";
import {T,c} from "../theme.js";
import Modal from "../components/ui/Modal.jsx";
import {sb} from "../lib/storage.js";
import {sS,fmtDate,formatDateTimeAU} from "../lib/utils.js";

const PAGE_SIZE=50;

// "Confirmed match" column rendering — three states + Pending:
//   confirmed_match===true   → "🛑 Blocked" (red)
//   confirmed_match===false  → "↪ Overridden" (orange)
//   confirmed_match==null    → "—"            (muted; LOW-severity
//                                              audit sweeps land
//                                              here, plus events
//                                              without a decision)
function ConfirmedCell({row}){
  if(row.confirmed_match===true)return <span style={c.badge(T.red)}>🛑 BLOCKED</span>;
  if(row.confirmed_match===false)return <span style={c.badge(T.orange)}>↪ OVERRIDDEN</span>;
  return <span style={{color:T.muted,fontSize:11}}>—</span>;
}

const fmtDateTime=iso=>iso?formatDateTimeAU(iso):"—";

function defaultFromISO(){
  const d=new Date();
  d.setDate(d.getDate()-30);
  return d.toISOString().slice(0,10);
}

export default function TfsScreenLogPanel(){
  const[from,setFrom]=useState(defaultFromISO());
  const[to,setTo]=useState("");
  const[status,setStatus]=useState("all");
  const[rows,setRows]=useState([]);
  const[page,setPage]=useState(0);
  const[loading,setLoading]=useState(false);
  const[err,setErr]=useState("");
  const[selected,setSelected]=useState(null);

  const load=useCallback(async()=>{
    setLoading(true);
    setErr("");
    try{
      const sinceISO=from?new Date(from+"T00:00:00").toISOString():null;
      const r=await sb.loadTfsScreenLog({
        limit:PAGE_SIZE,
        offset:page*PAGE_SIZE,
        sinceISO,
        status:status==="all"?null:status,
      });
      // Client-side `to` filter — sbFetch's URL builder doesn't
      // expose a clean lte; for the small page size this is a
      // negligible cost compared to the server round-trip.
      let filtered=r;
      if(to){
        const cutoff=new Date(to+"T23:59:59").getTime();
        filtered=r.filter(x=>x.created_at&&new Date(x.created_at).getTime()<=cutoff);
      }
      setRows(filtered);
    }catch(e){
      setErr(sS(e&&e.message)||"Load failed.");
      setRows([]);
    }finally{setLoading(false);}
  },[from,to,status,page]);

  // Reset to page 0 whenever filters change so we don't paginate
  // off the end of a smaller filtered set.
  useEffect(()=>{setPage(0);},[from,to,status]);
  useEffect(()=>{load();},[load]);

  const atTail=rows.length<PAGE_SIZE;

  return <div>
    <div style={{fontSize:11,color:T.muted,marginBottom:12,lineHeight:1.5}}>
      Audit log of every TFS sanctions screening event. Retained 7 years per AML/CTF Act record-keeping. Read-only.
    </div>

    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12,alignItems:"flex-end"}}>
      <div style={{flex:"1 1 140px",minWidth:120}}>
        <label style={c.lbl}>From</label>
        <input style={c.inp()} type="date" value={from} onChange={e=>setFrom(e.target.value)}/>
      </div>
      <div style={{flex:"1 1 140px",minWidth:120}}>
        <label style={c.lbl}>To</label>
        <input style={c.inp()} type="date" value={to} onChange={e=>setTo(e.target.value)}/>
      </div>
      <div style={{flex:"1 1 180px",minWidth:140}}>
        <label style={c.lbl}>Status</label>
        <select style={{...c.sel(),width:"100%"}} value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="all">All events</option>
          <option value="matched">Match found</option>
          <option value="not_matched">No match</option>
          <option value="blocked">Blocked (confirmed match)</option>
          <option value="overridden">Overridden</option>
        </select>
      </div>
      <button style={c.bsm()} onClick={load} disabled={loading}>{loading?"Loading…":"↺ Refresh"}</button>
    </div>

    {err&&<div style={{...c.bnr("block"),marginBottom:10}}>Error: {err}</div>}

    {!loading&&rows.length===0&&!err&&<div style={{...c.card({padding:18}),textAlign:"center",color:T.muted,fontSize:12}}>No screening events match these filters.</div>}

    {rows.length>0&&<div style={{...c.card({padding:0,overflow:"hidden"}),marginBottom:10}}>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead>
            <tr>
              {["When","Customer","Match Ref","Outcome","Override Reason","Staff",""].map(h=>
                <th key={h} style={c.th}>{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row,i)=>(
              <tr key={row.id||i} style={{background:i%2?"#ffffff04":"transparent",cursor:"pointer"}} onClick={()=>setSelected(row)}>
                <td style={c.td()}>{fmtDateTime(row.created_at)}</td>
                <td style={c.td({color:T.white})}>
                  {sS(row.customer_name)||"—"}
                  {row.customer_dob&&<div style={{fontSize:10,color:T.muted}}>DOB {sS(row.customer_dob)}</div>}
                </td>
                <td style={c.td()}>{sS(row.match_reference)||"—"}</td>
                <td style={c.td()}><ConfirmedCell row={row}/></td>
                <td style={c.td({color:T.muted})}>
                  {row.override_reason?sS(row.override_reason).slice(0,100)+(sS(row.override_reason).length>100?"…":""):"—"}
                </td>
                <td style={c.td()}>{sS(row.staff)||"—"}</td>
                <td style={c.td()}>
                  <button style={c.bsm()} onClick={e=>{e.stopPropagation();setSelected(row);}}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>}

    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,fontSize:11,color:T.muted}}>
      <div>Page {page+1}{rows.length===PAGE_SIZE?"":" (last)"}</div>
      <div style={{display:"flex",gap:8}}>
        <button style={c.bsm()} onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0||loading}>← Prev</button>
        <button style={c.bsm()} onClick={()=>setPage(p=>p+1)} disabled={atTail||loading}>Next →</button>
      </div>
    </div>

    {selected&&<Modal title="TFS Screening Event" onClose={()=>setSelected(null)}>
      <div style={{display:"grid",gridTemplateColumns:"140px 1fr",gap:"6px 12px",fontSize:12,marginBottom:14}}>
        <div style={{color:T.muted}}>Date / time</div><div>{fmtDateTime(selected.created_at)}</div>
        <div style={{color:T.muted}}>Customer</div><div style={{color:T.white,fontWeight:"bold"}}>{sS(selected.customer_name)||"—"}</div>
        <div style={{color:T.muted}}>DOB</div><div>{sS(selected.customer_dob)||"—"}</div>
        <div style={{color:T.muted}}>Citizenship</div><div>{sS(selected.customer_citizenship)||"—"}</div>
        <div style={{color:T.muted}}>Matched?</div><div>{selected.matched?"Yes":"No"}</div>
        <div style={{color:T.muted}}>Match reference</div><div style={{fontFamily:"monospace"}}>{sS(selected.match_reference)||"—"}</div>
        <div style={{color:T.muted}}>Outcome</div><div><ConfirmedCell row={selected}/></div>
        <div style={{color:T.muted}}>Override applied?</div><div>{selected.override_applied?"Yes":"No"}</div>
        <div style={{color:T.muted}}>Staff</div><div>{sS(selected.staff)||"—"}</div>
        <div style={{color:T.muted}}>Linked tx id</div><div style={{fontFamily:"monospace"}}>{sS(selected.tx_id)||"—"}</div>
        <div style={{color:T.muted}}>Linked client id</div><div style={{fontFamily:"monospace",fontSize:10}}>{sS(selected.client_id)||"—"}</div>
        <div style={{color:T.muted}}>Retained until</div><div>{fmtDate(selected.delete_after)||"—"}</div>
      </div>
      {selected.override_reason&&<div>
        <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:6,letterSpacing:"0.05em"}}>OVERRIDE REASON</div>
        <div style={{...c.card({padding:12}),background:T.surface,fontSize:12,whiteSpace:"pre-wrap"}}>{sS(selected.override_reason)}</div>
      </div>}
    </Modal>}
  </div>;
}
