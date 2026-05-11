// LootLedger — Platform Admin / Cross-shop audit log viewer.
// Phase 5.2-PRE-2 v2 (2026-05-11). Filter + paginate the
// audit_log table across all shops. RLS in 0021 permits
// platform admins to read every shop's rows.
//
// Filters:
//   - Shop (dropdown — all shops + "All shops")
//   - Event type (dropdown — distinct values from current
//     load + a fixed seed list of known types)
//   - Actor email/name substring (text)
//   - Date range (from / to ISO date)
//
// Pagination: 50 rows per page, ORDER BY created_at DESC.
// JSON payload column is collapsible per row.

import React,{useEffect,useState,useMemo} from "react";
import {supabase} from "../../lib/auth/saas.js";

const PAGE_SIZE=50;
const KNOWN_EVENT_TYPES=[
  "admin_pin_gate_passed","admin_pin_gate_failed",
  "tfs_override","blacklist_override","structuring_override",
  "ttr_filed","smr_filed","police_notice_logged",
  "legal_doc_approved","legal_doc_drafted",
  "client_archived","client_restored","client_deleted",
  "staff_invited","staff_role_changed","staff_removed",
  "settings_changed","staff_hours_locked","staff_hours_unlocked",
  "legacy_import",
];

const fmtTs=iso=>{
  if(!iso)return"—";
  const d=new Date(iso);
  if(isNaN(d.getTime()))return"—";
  const pad=n=>String(n).padStart(2,"0");
  return pad(d.getDate())+"-"+pad(d.getMonth()+1)+"-"+d.getFullYear()+" "+pad(d.getHours())+":"+pad(d.getMinutes());
};

const styles={
  h1:{fontSize:22,margin:"0 0 16px",fontWeight:"bold"},
  filterRow:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",gap:10,marginBottom:14,padding:14,background:"#fff",border:"1px solid #ddd",borderRadius:6},
  filterField:{display:"flex",flexDirection:"column",gap:4},
  filterLabel:{fontSize:10,color:"#666",letterSpacing:"0.06em",textTransform:"uppercase",fontWeight:"bold"},
  input:{padding:"6px 10px",border:"1px solid #ccc",borderRadius:4,fontSize:13,fontFamily:"inherit"},
  table:{width:"100%",background:"#fff",border:"1px solid #ddd",borderRadius:6,borderCollapse:"separate",borderSpacing:0,fontSize:12},
  th:{padding:"8px 10px",textAlign:"left",fontSize:10,letterSpacing:"0.05em",textTransform:"uppercase",color:"#666",borderBottom:"1px solid #ddd",background:"#fafafa"},
  td:{padding:"7px 10px",borderBottom:"1px solid #eee",verticalAlign:"top"},
  expandBtn:{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"#888",padding:2},
  pre:{background:"#fafafa",border:"1px solid #ddd",borderRadius:4,padding:"8px 10px",fontFamily:"monospace",fontSize:11,overflow:"auto",maxHeight:300,whiteSpace:"pre-wrap",wordBreak:"break-word",margin:0},
  err:{padding:"10px 12px",background:"#fee",border:"1px solid #fcc",borderRadius:4,color:"#933",fontSize:13,marginBottom:14},
  pager:{display:"flex",gap:10,alignItems:"center",justifyContent:"flex-end",marginTop:14,fontSize:12,color:"#666"},
  pagerBtn:{padding:"5px 12px",background:"#fff",border:"1px solid #ccc",borderRadius:4,fontSize:12,cursor:"pointer",fontFamily:"inherit"},
  pagerBtnDisabled:{padding:"5px 12px",background:"#f4f4f4",border:"1px solid #ddd",borderRadius:4,fontSize:12,cursor:"not-allowed",fontFamily:"inherit",color:"#aaa"},
};

export default function AuditLog(){
  const[shops,setShops]=useState([]);
  const[rows,setRows]=useState([]);
  const[total,setTotal]=useState(null);
  const[page,setPage]=useState(0);
  const[loading,setLoading]=useState(false);
  const[err,setErr]=useState("");
  const[expandedId,setExpandedId]=useState(null);

  const[fShop,setFShop]=useState("");
  const[fEvent,setFEvent]=useState("");
  const[fActor,setFActor]=useState("");
  const[fFrom,setFFrom]=useState("");
  const[fTo,setFTo]=useState("");

  useEffect(()=>{
    supabase.from("shops").select("id, business_name").then(r=>{
      if(!r.error)setShops(r.data||[]);
    });
  },[]);

  useEffect(()=>{
    let cancelled=false;
    setLoading(true);
    setErr("");
    let q=supabase.from("audit_log")
      .select("*",{count:"exact"})
      .order("created_at",{ascending:false})
      .range(page*PAGE_SIZE,page*PAGE_SIZE+PAGE_SIZE-1);
    if(fShop)q=q.eq("shop_id",fShop);
    if(fEvent)q=q.eq("event_type",fEvent);
    if(fActor)q=q.ilike("actor_label","%"+fActor+"%");
    if(fFrom)q=q.gte("created_at",new Date(fFrom).toISOString());
    if(fTo){
      const to=new Date(fTo);
      to.setHours(23,59,59,999);
      q=q.lte("created_at",to.toISOString());
    }
    q.then(r=>{
      if(cancelled)return;
      if(r.error){setErr(r.error.message||"audit_log query failed");setRows([]);setTotal(null);}
      else{setRows(r.data||[]);setTotal(r.count!=null?r.count:null);}
      setLoading(false);
    });
    return()=>{cancelled=true;};
  },[page,fShop,fEvent,fActor,fFrom,fTo]);

  const eventTypes=useMemo(()=>{
    const seen=new Set(KNOWN_EVENT_TYPES);
    rows.forEach(r=>{if(r.event_type)seen.add(r.event_type);});
    return Array.from(seen).sort();
  },[rows]);

  const shopName=id=>{
    if(!id)return"—";
    const s=shops.find(x=>String(x.id)===String(id));
    return s?s.business_name:id;
  };

  const lastPage=total!=null?Math.max(0,Math.ceil(total/PAGE_SIZE)-1):null;

  return <>
    <h1 style={styles.h1}>Audit Log — Cross-shop</h1>

    <div style={styles.filterRow}>
      <div style={styles.filterField}>
        <label style={styles.filterLabel}>Shop</label>
        <select style={styles.input} value={fShop} onChange={e=>{setPage(0);setFShop(e.target.value);}}>
          <option value="">All shops</option>
          {shops.map(s=>(<option key={s.id} value={s.id}>{s.business_name}</option>))}
        </select>
      </div>
      <div style={styles.filterField}>
        <label style={styles.filterLabel}>Event type</label>
        <select style={styles.input} value={fEvent} onChange={e=>{setPage(0);setFEvent(e.target.value);}}>
          <option value="">All types</option>
          {eventTypes.map(t=>(<option key={t} value={t}>{t}</option>))}
        </select>
      </div>
      <div style={styles.filterField}>
        <label style={styles.filterLabel}>Actor (substring)</label>
        <input style={styles.input} type="text" value={fActor} onChange={e=>{setPage(0);setFActor(e.target.value);}} placeholder="email or name…"/>
      </div>
      <div style={styles.filterField}>
        <label style={styles.filterLabel}>From</label>
        <input style={styles.input} type="date" value={fFrom} onChange={e=>{setPage(0);setFFrom(e.target.value);}}/>
      </div>
      <div style={styles.filterField}>
        <label style={styles.filterLabel}>To</label>
        <input style={styles.input} type="date" value={fTo} onChange={e=>{setPage(0);setFTo(e.target.value);}}/>
      </div>
    </div>

    {err&&<div style={styles.err}>{err}</div>}

    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>Time</th>
          <th style={styles.th}>Shop</th>
          <th style={styles.th}>Actor</th>
          <th style={styles.th}>Event</th>
          <th style={styles.th}>Target</th>
          <th style={styles.th}>Reason</th>
          <th style={styles.th}></th>
        </tr>
      </thead>
      <tbody>
        {loading&&<tr><td colSpan={7} style={{...styles.td,textAlign:"center",color:"#888"}}>Loading…</td></tr>}
        {!loading&&rows.length===0&&!err&&<tr><td colSpan={7} style={{...styles.td,textAlign:"center",color:"#888"}}>No matching audit_log entries.</td></tr>}
        {rows.map(r=>(
          <React.Fragment key={r.id}>
            <tr>
              <td style={styles.td}>{fmtTs(r.created_at)}</td>
              <td style={styles.td}>{shopName(r.shop_id)}</td>
              <td style={styles.td}>{r.actor_label||(r.actor?String(r.actor).slice(0,8)+"…":"—")}</td>
              <td style={styles.td}><code style={{fontSize:11}}>{r.event_type}</code></td>
              <td style={styles.td}>{r.target_table?r.target_table+":"+(r.target_id||"—"):"—"}</td>
              <td style={styles.td}>{r.reason||"—"}</td>
              <td style={styles.td}>
                <button style={styles.expandBtn} onClick={()=>setExpandedId(expandedId===r.id?null:r.id)} title="Toggle payload JSON">{expandedId===r.id?"▲":"▾"}</button>
              </td>
            </tr>
            {expandedId===r.id&&<tr><td colSpan={7} style={{...styles.td,background:"#fafafa"}}>
              <pre style={styles.pre}>{JSON.stringify(r.payload||{},null,2)}</pre>
            </td></tr>}
          </React.Fragment>
        ))}
      </tbody>
    </table>

    <div style={styles.pager}>
      <button style={page>0?styles.pagerBtn:styles.pagerBtnDisabled} onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}>← Previous</button>
      <span>Page {page+1}{total!=null?(" of "+(lastPage+1)):""}{total!=null?(" · "+total+" total"):""}</span>
      <button style={(lastPage==null||page<lastPage)?styles.pagerBtn:styles.pagerBtnDisabled} onClick={()=>setPage(p=>p+1)} disabled={lastPage!=null&&page>=lastPage}>Next →</button>
    </div>
  </>;
}
