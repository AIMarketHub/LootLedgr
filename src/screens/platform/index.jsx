// LootLedger — Platform Admin shops dashboard.
// Phase 5.2-PRE-2 (2026-05-11). MVP scope per Section 20.5
// of the architecture spec: read-only listing of all shops
// on the platform.
//
// Mounted at https://admin.lootledger.au/ under
// RequirePlatformAdmin (Router.jsx admin-mode branch).
//
// Light-theme admin pattern matching AdminPanel.jsx /
// Diagnostics — same page shell colours, same nav rhythm,
// same table styling. Reuses Logo + signOut + formatDateAU
// + sbFetch.
//
// Future (deferred, see Section 20.5 b–f): cross-shop search,
// platform health metrics, subscription management UI,
// cross-shop user management, TFS list management migration.

import React,{useEffect,useState} from "react";
import {useAuth} from "../../components/AuthProvider.jsx";
import {sbFetch} from "../../lib/storage.js";
import {signOut} from "../../lib/auth/saas.js";
import {formatDateAU} from "../../lib/utils.js";
import Logo from "../../components/Logo.jsx";

const styles={
  page:{minHeight:"100vh",background:"#f5f5f5",color:"#222",fontFamily:"system-ui, -apple-system, Segoe UI, Roboto, sans-serif",padding:"24px 16px"},
  shell:{maxWidth:1200,margin:"0 auto"},
  topbar:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:14,flexWrap:"wrap"},
  h1:{fontSize:22,margin:"0 0 12px",fontWeight:"bold"},
  h2:{fontSize:13,margin:"24px 0 10px",fontWeight:"bold",letterSpacing:"0.06em",textTransform:"uppercase",color:"#666"},
  link:{color:"#c9a84c",fontWeight:600,textDecoration:"none",fontSize:12},
  table:{width:"100%",background:"#fff",border:"1px solid #ddd",borderRadius:6,borderCollapse:"separate",borderSpacing:0,fontSize:13},
  th:{padding:"10px 12px",textAlign:"left",fontSize:11,letterSpacing:"0.05em",textTransform:"uppercase",color:"#666",borderBottom:"1px solid #ddd",background:"#fafafa"},
  td:{padding:"10px 12px",borderBottom:"1px solid #eee",verticalAlign:"top"},
  shopLink:{color:"#1a3b6b",fontWeight:600,textDecoration:"none"},
  err:{padding:"10px 12px",background:"#fee",border:"1px solid #fcc",borderRadius:4,color:"#933",fontSize:13,marginBottom:14},
  signOutBtn:{background:"none",border:"none",color:"#c9a84c",fontWeight:600,cursor:"pointer",padding:0,fontFamily:"inherit",fontSize:12},
};

const PLAN_BADGE={
  platform_exempt:{fg:"#1a6b2a",bg:"#dff5e3",bd:"#bce6c4"},
  trial:          {fg:"#7a5e1a",bg:"#fdf3d2",bd:"#ecd790"},
  monthly_99aud:  {fg:"#1a3b6b",bg:"#d2e0f5",bd:"#a8c2e6"},
  cancelled:      {fg:"#7a3838",bg:"#fadcdc",bd:"#f0bdbd"},
};

function planBadgeStyle(plan){
  const p=PLAN_BADGE[plan]||{fg:"#666",bg:"#f4f4f4",bd:"#ddd"};
  return{display:"inline-block",padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:p.fg,background:p.bg,border:"1px solid "+p.bd};
}

function fmtDate(iso){return iso?formatDateAU(iso):"—";}

export default function PlatformShopsDashboard(){
  const{user}=useAuth();
  const[shops,setShops]=useState([]);
  const[loading,setLoading]=useState(true);
  const[err,setErr]=useState("");

  useEffect(()=>{
    let cancelled=false;
    sbFetch("shops?select=*&order=created_at.asc")
      .then(r=>{
        if(cancelled)return;
        if(!r||r.__sbError){
          setErr("Could not load shops list (HTTP "+((r&&r.__sbError)||"error")+")");
          setShops([]);
        }else{
          setShops(Array.isArray(r)?r:[]);
        }
        setLoading(false);
      })
      .catch(e=>{
        if(cancelled)return;
        setErr("Could not load shops list: "+((e&&e.message)||"unknown"));
        setShops([]);
        setLoading(false);
      });
    return()=>{cancelled=true;};
  },[]);

  const onSignOut=async()=>{
    try{await signOut();}catch(e){}
    window.location.replace("https://lootledger.au/login");
  };

  return <div style={styles.page}>
    <div style={styles.shell}>
      <div style={styles.topbar}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <Logo height={40}/>
          <h1 style={styles.h1}>Platform Admin — Shops Dashboard</h1>
        </div>
        <div style={{fontSize:12,color:"#666"}}>
          Signed in as <strong>{user&&user.email}</strong> ·{" "}
          <button onClick={onSignOut} style={styles.signOutBtn}>Sign out</button>
        </div>
      </div>

      {err&&<div style={styles.err}>{err}</div>}

      <h2 style={styles.h2}>All shops ({shops.length})</h2>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Business</th>
            <th style={styles.th}>Subdomain</th>
            <th style={styles.th}>Plan</th>
            <th style={styles.th}>Trial start</th>
            <th style={styles.th}>Created</th>
          </tr>
        </thead>
        <tbody>
          {loading&&<tr><td colSpan={5} style={{...styles.td,textAlign:"center",color:"#888"}}>Loading…</td></tr>}
          {!loading&&shops.length===0&&!err&&<tr><td colSpan={5} style={{...styles.td,textAlign:"center",color:"#888"}}>No shops on platform yet.</td></tr>}
          {shops.map(s=>(
            <tr key={s.id}>
              <td style={styles.td}><strong>{s.business_name||"—"}</strong></td>
              <td style={styles.td}>
                {s.subdomain
                  ?<a style={styles.shopLink} href={"https://"+s.subdomain+".lootledger.au"} target="_blank" rel="noreferrer">{s.subdomain}.lootledger.au ↗</a>
                  :<span style={{color:"#888"}}>—</span>}
              </td>
              <td style={styles.td}><span style={planBadgeStyle(s.subscription_plan)}>{s.subscription_plan||"unknown"}</span></td>
              <td style={styles.td}>{fmtDate(s.trial_starts_at)}</td>
              <td style={styles.td}>{fmtDate(s.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>;
}
