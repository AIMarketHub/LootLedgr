// LootLedger — Platform Admin / Shops dashboard.
// Phase 5.2-PRE-2 v2 (2026-05-11). Ported from
// src/screens/admin/AdminPanel.jsx (which stays in the
// repo, just unwired from the shop-subdomain Router routes).
// Differences vs AdminPanel:
//   - Page header / nav / sign-out stripped (PlatformShell
//     provides all of that).
//   - activate/deactivate toggle now also writes
//     `subscription_plan` (Phase 5.5 will refine):
//       active true                       → 'monthly_99aud'
//       active false + trial in future    → 'trial'
//       active false + trial expired      → 'cancelled'
//     The `platform_exempt` plan (e.g. Daylesford) is
//     written by the migration; the toggle does NOT
//     overwrite an explicit exempt assignment unless the
//     toggle is fired by an admin who knows what they're
//     doing.

import React,{useEffect,useState,useMemo} from "react";
import {supabase} from "../../lib/auth/saas.js";
import {useAuth} from "../../components/AuthProvider.jsx";
import {formatDateAU} from "../../lib/utils.js";
import {translateAuthError} from "../../lib/auth/errorMessages.js";

const fmtLong=iso=>iso?formatDateAU(iso):"—";

const styles={
  h1:{fontSize:22,margin:"0 0 16px",fontWeight:"bold"},
  metricsRow:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",gap:10,marginBottom:18},
  metric:{background:"#fff",border:"1px solid #ddd",borderRadius:6,padding:"12px 14px"},
  metricLabel:{fontSize:11,color:"#666",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4},
  metricValue:{fontSize:20,fontWeight:"bold",color:"#222"},
  filter:{width:"100%",padding:"10px 12px",border:"1px solid #ccc",borderRadius:4,fontSize:14,marginBottom:14,boxSizing:"border-box",fontFamily:"inherit"},
  table:{width:"100%",background:"#fff",border:"1px solid #ddd",borderRadius:6,borderCollapse:"separate",borderSpacing:0,fontSize:13},
  th:{padding:"10px 12px",textAlign:"left",fontSize:11,letterSpacing:"0.05em",textTransform:"uppercase",color:"#666",borderBottom:"1px solid #ddd",background:"#fafafa"},
  td:{padding:"10px 12px",borderBottom:"1px solid #eee",verticalAlign:"top"},
  badge:(ok)=>({display:"inline-block",padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:ok?"#1a6b2a":"#7a3838",background:ok?"#dff5e3":"#fadcdc",border:"1px solid "+(ok?"#bce6c4":"#f0bdbd")}),
  planBadge:(plan)=>{
    const map={
      platform_exempt:["#1a6b2a","#dff5e3","#bce6c4"],
      trial:["#7a5e1a","#fdf3d2","#ecd790"],
      monthly_99aud:["#1a3b6b","#d2e0f5","#a8c2e6"],
      cancelled:["#7a3838","#fadcdc","#f0bdbd"],
    };
    const v=map[plan]||["#666","#f4f4f4","#ddd"];
    return{display:"inline-block",padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:v[0],background:v[1],border:"1px solid "+v[2]};
  },
  btnActivate:{padding:"6px 12px",background:"#1a6b2a",color:"#fff",border:"none",borderRadius:4,fontSize:12,cursor:"pointer",fontFamily:"inherit"},
  btnDeactivate:{padding:"6px 12px",background:"#fff",color:"#7a3838",border:"1px solid #c88",borderRadius:4,fontSize:12,cursor:"pointer",fontFamily:"inherit"},
  err:{padding:"10px 12px",background:"#fee",border:"1px solid #fcc",borderRadius:4,color:"#933",fontSize:13,marginBottom:14},
};

export default function Shops(){
  const{user}=useAuth();
  const[shops,setShops]=useState([]);
  const[loading,setLoading]=useState(true);
  const[err,setErr]=useState("");
  const[filter,setFilter]=useState("");
  const[busyId,setBusyId]=useState(null);

  const load=async()=>{
    setLoading(true);
    setErr("");
    const{data,error}=await supabase.from("shops").select("*").order("created_at",{ascending:false});
    if(error){setErr(translateAuthError(error.message));setShops([]);}
    else setShops(data||[]);
    setLoading(false);
  };
  useEffect(()=>{load();},[]);

  const filtered=useMemo(()=>{
    const q=filter.trim().toLowerCase();
    if(!q)return shops;
    return shops.filter(s=>(
      String(s.business_name||"").toLowerCase().includes(q)||
      String(s.slug||"").toLowerCase().includes(q)||
      String(s.subdomain||"").toLowerCase().includes(q)||
      String(s.abn||"").toLowerCase().includes(q)
    ));
  },[shops,filter]);

  const metrics=useMemo(()=>{
    const total=shops.length;
    const active=shops.filter(s=>s.subscription_active).length;
    const now=Date.now();
    const sevenDays=now+7*24*3600*1000;
    const expiringSoon=shops.filter(s=>!s.subscription_active&&s.trial_ends_at&&new Date(s.trial_ends_at).getTime()>now&&new Date(s.trial_ends_at).getTime()<=sevenDays).length;
    const expired=shops.filter(s=>!s.subscription_active&&s.trial_ends_at&&new Date(s.trial_ends_at).getTime()<=now).length;
    return{total,active,expiringSoon,expired};
  },[shops]);

  const setSub=async(shop,active)=>{
    setBusyId(shop.id);
    let plan;
    if(active){
      plan="monthly_99aud";
    }else{
      const trialFuture=shop.trial_ends_at&&new Date(shop.trial_ends_at).getTime()>Date.now();
      plan=trialFuture?"trial":"cancelled";
    }
    const patch=active
      ?{subscription_active:true,subscription_activated_at:new Date().toISOString(),subscription_activated_by:(user&&user.email)||"unknown",subscription_plan:plan}
      :{subscription_active:false,subscription_plan:plan};
    const{error}=await supabase.from("shops").update(patch).eq("id",shop.id);
    setBusyId(null);
    if(error){setErr(translateAuthError(error.message));return;}
    await load();
  };

  return <>
    <h1 style={styles.h1}>Shops</h1>

    <div style={styles.metricsRow}>
      <div style={styles.metric}><div style={styles.metricLabel}>Total shops</div><div style={styles.metricValue}>{metrics.total}</div></div>
      <div style={styles.metric}><div style={styles.metricLabel}>Active subs</div><div style={styles.metricValue}>{metrics.active}</div></div>
      <div style={styles.metric}><div style={styles.metricLabel}>Trial expiring ≤ 7 days</div><div style={styles.metricValue}>{metrics.expiringSoon}</div></div>
      <div style={styles.metric}><div style={styles.metricLabel}>Trial expired (locked)</div><div style={styles.metricValue}>{metrics.expired}</div></div>
    </div>

    <input style={styles.filter} type="text" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter by business name, slug, subdomain, or ABN…"/>

    {err&&<div style={styles.err}>{err}</div>}

    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>Business</th>
          <th style={styles.th}>Subdomain</th>
          <th style={styles.th}>ABN</th>
          <th style={styles.th}>Plan</th>
          <th style={styles.th}>Trial ends</th>
          <th style={styles.th}>Status</th>
          <th style={styles.th}>Action</th>
        </tr>
      </thead>
      <tbody>
        {loading&&<tr><td colSpan={7} style={{...styles.td,textAlign:"center",color:"#888"}}>Loading…</td></tr>}
        {!loading&&filtered.length===0&&<tr><td colSpan={7} style={{...styles.td,textAlign:"center",color:"#888"}}>No shops match the filter.</td></tr>}
        {filtered.map(s=>{
          const active=!!s.subscription_active;
          const inTrial=!active&&s.trial_ends_at&&new Date(s.trial_ends_at).getTime()>Date.now();
          const expired=!active&&!inTrial;
          return <tr key={s.id}>
            <td style={styles.td}><strong>{s.business_name}</strong></td>
            <td style={styles.td}>
              {s.subdomain
                ?<a href={"https://"+s.subdomain+".lootledger.au"} target="_blank" rel="noreferrer" style={{color:"#1a3b6b",fontWeight:600,textDecoration:"none"}}>{s.subdomain}.lootledger.au ↗</a>
                :<span style={{color:"#888"}}>—</span>}
            </td>
            <td style={styles.td}>{s.abn||"—"}</td>
            <td style={styles.td}><span style={styles.planBadge(s.subscription_plan)}>{s.subscription_plan||"unknown"}</span></td>
            <td style={styles.td}>{fmtLong(s.trial_ends_at)}</td>
            <td style={styles.td}>
              <span style={styles.badge(active)}>{active?"Subscribed":expired?"Expired":"In trial"}</span>
              {active&&s.subscription_activated_at&&<div style={{fontSize:10,color:"#888",marginTop:3}}>since {fmtLong(s.subscription_activated_at)}</div>}
            </td>
            <td style={styles.td}>
              {active
                ?<button style={styles.btnDeactivate} disabled={busyId===s.id} onClick={()=>setSub(s,false)}>{busyId===s.id?"…":"Deactivate"}</button>
                :<button style={styles.btnActivate} disabled={busyId===s.id} onClick={()=>setSub(s,true)}>{busyId===s.id?"…":"Activate"}</button>}
            </td>
          </tr>;
        })}
      </tbody>
    </table>
  </>;
}
