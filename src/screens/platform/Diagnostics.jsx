// LootLedger — Platform Admin / Cross-shop Diagnostics view.
// Phase 5.2-PRE-2 v2 (2026-05-11). Read-only view of
// hardware_log entries across every shop on the platform +
// per-shop provider configuration status.
//
// NOT a replacement for the per-machine hardware testing on
// shop subdomains ({shop}.lootledger.au/admin/diagnostics).
// That page tests the LIVE hardware drivers on the calling
// machine. This cross-shop view shows the audit trail of
// what each shop has been doing.
//
// Provider configuration: currently all stubs (5.2-B/C/G/H/E
// haven't shipped). The table will populate as each provider
// sub-phase lands.

import React,{useEffect,useState} from "react";
import {sbFetch} from "../../lib/storage.js";
import {supabase} from "../../lib/auth/saas.js";

const fmtTs=iso=>{
  if(!iso)return"—";
  const d=new Date(iso);
  if(isNaN(d.getTime()))return"—";
  const pad=n=>String(n).padStart(2,"0");
  return pad(d.getDate())+"-"+pad(d.getMonth()+1)+" "+pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds());
};

const styles={
  h1:{fontSize:22,margin:"0 0 16px",fontWeight:"bold"},
  h2:{fontSize:13,margin:"24px 0 10px",fontWeight:"bold",letterSpacing:"0.06em",textTransform:"uppercase",color:"#666"},
  note:{padding:"10px 12px",background:"#f0f4ff",border:"1px solid #c8d8f0",borderRadius:4,color:"#1a3b6b",fontSize:12,marginBottom:14,lineHeight:1.5},
  table:{width:"100%",background:"#fff",border:"1px solid #ddd",borderRadius:6,borderCollapse:"separate",borderSpacing:0,fontSize:12},
  th:{padding:"8px 10px",textAlign:"left",fontSize:10,letterSpacing:"0.05em",textTransform:"uppercase",color:"#666",borderBottom:"1px solid #ddd",background:"#fafafa"},
  td:{padding:"7px 10px",borderBottom:"1px solid #eee",verticalAlign:"top"},
  modeBadge:(mode)=>({display:"inline-block",padding:"1px 6px",borderRadius:8,fontSize:9,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:mode==="live"?"#1a6b2a":"#7a5e1a",background:mode==="live"?"#dff5e3":"#fdf3d2",border:"1px solid "+(mode==="live"?"#bce6c4":"#ecd790")}),
  okBadge:(ok)=>({color:ok?"#1a6b2a":"#7a3838",fontWeight:"bold"}),
  err:{padding:"10px 12px",background:"#fee",border:"1px solid #fcc",borderRadius:4,color:"#933",fontSize:13,marginBottom:14},
  stubBadge:{display:"inline-block",padding:"1px 6px",borderRadius:8,fontSize:9,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:"#888",background:"#f4f4f4",border:"1px solid #ddd"},
};

const PROVIDERS=[
  {key:"square",label:"Square (Inventory + Catalog)",subPhase:"5.2-B"},
  {key:"xero",label:"Xero (Bills)",subPhase:"5.2-C"},
  {key:"myob",label:"MYOB (Bills)",subPhase:"5.2-G"},
  {key:"quickbooks",label:"QuickBooks Online (Bills)",subPhase:"5.2-H"},
  {key:"smtp2go",label:"SMTP2GO (Email)",subPhase:"5.2-E"},
];

export default function Diagnostics(){
  const[entries,setEntries]=useState([]);
  const[shops,setShops]=useState([]);
  const[loading,setLoading]=useState(true);
  const[err,setErr]=useState("");

  useEffect(()=>{
    let cancelled=false;
    Promise.all([
      sbFetch("hardware_log?select=*&order=created_at.desc&limit=100"),
      supabase.from("shops").select("id, business_name, subdomain"),
    ]).then(([logs,shopsRes])=>{
      if(cancelled)return;
      if(!logs||logs.__sbError){
        setErr("Could not load hardware_log (HTTP "+((logs&&logs.__sbError)||"error")+")");
        setEntries([]);
      }else{
        setEntries(Array.isArray(logs)?logs:[]);
      }
      if(shopsRes&&!shopsRes.error)setShops(shopsRes.data||[]);
      setLoading(false);
    }).catch(e=>{
      if(cancelled)return;
      setErr("Could not load diagnostics: "+(e&&e.message||"unknown"));
      setLoading(false);
    });
    return()=>{cancelled=true;};
  },[]);

  const shopName=shop_id=>{
    const s=shops.find(x=>String(x.id)===String(shop_id));
    return s?s.business_name:shop_id;
  };

  return <>
    <h1 style={styles.h1}>Diagnostics — Cross-shop</h1>

    <div style={styles.note}>
      For per-machine hardware testing (printer / scale / scanner / signature pad / cash drawer), go to{" "}
      <code>{"{shop}"}.lootledger.au/admin/diagnostics</code> on the machine you want to test.
      This page is read-only audit trail across all shops.
    </div>

    {err&&<div style={styles.err}>{err}</div>}

    <h2 style={styles.h2}>Recent hardware log ({entries.length} of last 100)</h2>
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>Time</th>
          <th style={styles.th}>Shop</th>
          <th style={styles.th}>Device</th>
          <th style={styles.th}>Command</th>
          <th style={styles.th}>Mode</th>
          <th style={styles.th}>OK</th>
          <th style={styles.th}>Latency</th>
          <th style={styles.th}>Error</th>
        </tr>
      </thead>
      <tbody>
        {loading&&<tr><td colSpan={8} style={{...styles.td,textAlign:"center",color:"#888"}}>Loading…</td></tr>}
        {!loading&&entries.length===0&&!err&&<tr><td colSpan={8} style={{...styles.td,textAlign:"center",color:"#888"}}>No hardware events recorded yet.</td></tr>}
        {entries.map(e=>(
          <tr key={e.id}>
            <td style={styles.td}>{fmtTs(e.created_at)}</td>
            <td style={styles.td}>{shopName(e.shop_id)}</td>
            <td style={styles.td}>{e.device_type}</td>
            <td style={styles.td}>{e.command}</td>
            <td style={styles.td}><span style={styles.modeBadge(e.mode)}>{e.mode}</span></td>
            <td style={styles.td}><span style={styles.okBadge(e.succeeded)}>{e.succeeded?"✓":"✗"}</span></td>
            <td style={styles.td}>{e.latency_ms!=null?(e.latency_ms+" ms"):"—"}</td>
            <td style={{...styles.td,color:"#7a3838",fontSize:11}}>{e.error||"—"}</td>
          </tr>
        ))}
      </tbody>
    </table>

    <h2 style={styles.h2}>Provider configuration status ({PROVIDERS.length} providers × {shops.length} shops)</h2>
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>Provider</th>
          {shops.map(s=>(<th key={s.id} style={styles.th}>{s.business_name}</th>))}
        </tr>
      </thead>
      <tbody>
        {PROVIDERS.map(p=>(
          <tr key={p.key}>
            <td style={styles.td}><strong>{p.label}</strong></td>
            {shops.map(s=>(
              <td key={s.id} style={styles.td}>
                <span style={styles.stubBadge}>Not configured ({p.subPhase})</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </>;
}
