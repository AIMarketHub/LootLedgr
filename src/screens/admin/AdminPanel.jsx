// LootLedger — Admin panel.
// Stage 1.A SaaS foundation. Lists every shops row visible to
// the calling user (admins see all; non-admins see only their
// own shop and would have been bounced by RequireAdmin anyway).
// Per-shop activate / deactivate toggles flip
// subscription_active and stamp activated_at / activated_by.
//
// Live filter on business name and email. Read-only metrics
// strip across the top: total shops, active subs, trials
// expiring within 7 days.
//
// The activate/deactivate writes happen via the regular Supabase
// JS client; RLS policy "shops_update" gates them on
// current_is_admin(). RequireAdmin already verified the calling
// user is in the admins table, so the round-trip succeeds.

import React,{useEffect,useState,useMemo} from "react";
import {Link,useNavigate} from "react-router-dom";
import {supabase,signOut} from "../../lib/auth/saas.js";
import {useAuth} from "../../components/AuthProvider.jsx";

function fmtLong(iso){if(!iso)return "—";try{return new Date(iso).toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"});}catch(_){return String(iso);}}

const styles={
  page:{minHeight:"100vh",background:"#f5f5f5",color:"#222",fontFamily:"system-ui, -apple-system, Segoe UI, Roboto, sans-serif",padding:"24px 16px"},
  shell:{maxWidth:1100,margin:"0 auto"},
  h1:{fontSize:22,margin:"0 0 12px",fontWeight:"bold"},
  metricsRow:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",gap:10,marginBottom:18},
  metric:{background:"#fff",border:"1px solid #ddd",borderRadius:6,padding:"12px 14px"},
  metricLabel:{fontSize:11,color:"#666",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:4},
  metricValue:{fontSize:20,fontWeight:"bold",color:"#222"},
  filter:{width:"100%",padding:"10px 12px",border:"1px solid #ccc",borderRadius:4,fontSize:14,marginBottom:14,boxSizing:"border-box",fontFamily:"inherit"},
  table:{width:"100%",background:"#fff",border:"1px solid #ddd",borderRadius:6,borderCollapse:"separate",borderSpacing:0,fontSize:13},
  th:{padding:"10px 12px",textAlign:"left",fontSize:11,letterSpacing:"0.05em",textTransform:"uppercase",color:"#666",borderBottom:"1px solid #ddd",background:"#fafafa"},
  td:{padding:"10px 12px",borderBottom:"1px solid #eee",verticalAlign:"top"},
  badge:(ok)=>({display:"inline-block",padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:ok?"#1a6b2a":"#7a3838",background:ok?"#dff5e3":"#fadcdc",border:"1px solid "+(ok?"#bce6c4":"#f0bdbd")}),
  btnActivate:{padding:"6px 12px",background:"#1a6b2a",color:"#fff",border:"none",borderRadius:4,fontSize:12,cursor:"pointer",fontFamily:"inherit"},
  btnDeactivate:{padding:"6px 12px",background:"#fff",color:"#7a3838",border:"1px solid #c88",borderRadius:4,fontSize:12,cursor:"pointer",fontFamily:"inherit"},
  topbar:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:14,flexWrap:"wrap"},
  link:{color:"#c9a84c",fontWeight:600,textDecoration:"none"},
};

export default function AdminPanel(){
  const{user,refresh}=useAuth();
  const[shops,setShops]=useState([]);
  const[loading,setLoading]=useState(true);
  const[err,setErr]=useState("");
  const[filter,setFilter]=useState("");
  const[busyId,setBusyId]=useState(null);
  const nav=useNavigate();

  const load=async()=>{
    setLoading(true);
    setErr("");
    const{data,error}=await supabase.from("shops").select("*").order("created_at",{ascending:false});
    if(error){setErr(error.message);setShops([]);}
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
    const patch=active
      ?{subscription_active:true,subscription_activated_at:new Date().toISOString(),subscription_activated_by:(user&&user.email)||"unknown"}
      :{subscription_active:false};
    const{error}=await supabase.from("shops").update(patch).eq("id",shop.id);
    setBusyId(null);
    if(error){setErr(error.message);return;}
    await load();
  };

  const onSignOut=async()=>{
    await signOut();
    await refresh();
    nav("/login",{replace:true});
  };

  return <div style={styles.page}>
    <div style={styles.shell}>
      <div style={styles.topbar}>
        <h1 style={styles.h1}>Admin — All shops</h1>
        <div style={{fontSize:12,color:"#666"}}>
          Signed in as <strong>{user&&user.email}</strong> ·{" "}
          <Link to="/admin/tfs" style={styles.link}>TFS list</Link> ·{" "}
          <Link to="/app" style={styles.link}>Back to app</Link> ·{" "}
          <button onClick={onSignOut} style={{background:"none",border:"none",color:"#c9a84c",fontWeight:600,cursor:"pointer",padding:0,fontFamily:"inherit",fontSize:12}}>Sign out</button>
        </div>
      </div>

      <div style={styles.metricsRow}>
        <div style={styles.metric}><div style={styles.metricLabel}>Total shops</div><div style={styles.metricValue}>{metrics.total}</div></div>
        <div style={styles.metric}><div style={styles.metricLabel}>Active subs</div><div style={styles.metricValue}>{metrics.active}</div></div>
        <div style={styles.metric}><div style={styles.metricLabel}>Trial expiring ≤ 7 days</div><div style={styles.metricValue}>{metrics.expiringSoon}</div></div>
        <div style={styles.metric}><div style={styles.metricLabel}>Trial expired (locked)</div><div style={styles.metricValue}>{metrics.expired}</div></div>
      </div>

      <input style={styles.filter} type="text" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter by business name, slug, or ABN…"/>

      {err&&<div style={{padding:"10px 12px",background:"#fee",border:"1px solid #fcc",borderRadius:4,color:"#933",fontSize:13,marginBottom:14}}>{err}</div>}

      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Business</th>
            <th style={styles.th}>Slug</th>
            <th style={styles.th}>ABN</th>
            <th style={styles.th}>Trial ends</th>
            <th style={styles.th}>Status</th>
            <th style={styles.th}>Action</th>
          </tr>
        </thead>
        <tbody>
          {loading&&<tr><td colSpan={6} style={{...styles.td,textAlign:"center",color:"#888"}}>Loading…</td></tr>}
          {!loading&&filtered.length===0&&<tr><td colSpan={6} style={{...styles.td,textAlign:"center",color:"#888"}}>No shops match the filter.</td></tr>}
          {filtered.map(s=>{
            const active=!!s.subscription_active;
            const inTrial=!active&&s.trial_ends_at&&new Date(s.trial_ends_at).getTime()>Date.now();
            const expired=!active&&!inTrial;
            return <tr key={s.id}>
              <td style={styles.td}><strong>{s.business_name}</strong></td>
              <td style={styles.td}><code style={{background:"#f4f3ec",padding:"2px 6px",borderRadius:3,fontSize:12}}>{s.slug}</code></td>
              <td style={styles.td}>{s.abn||"—"}</td>
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
    </div>
  </div>;
}
