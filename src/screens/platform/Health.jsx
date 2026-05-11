// LootLedger — Platform Admin / Health dashboard.
// Phase 5.2-PRE-2 v2 (2026-05-11). Best-effort
// at-a-glance platform health. Most metrics live
// outside what a client app can reach (Supabase backups,
// Netlify deploys, SSL cert renewal status, active
// session count) so the panel is mostly deep-links to
// the relevant dashboards plus one DB-ping for latency.

import React,{useEffect,useState} from "react";
import {supabase} from "../../lib/auth/saas.js";

const SUPABASE_URL=import.meta.env.VITE_SUPABASE_URL||"";
const SUPABASE_PROJECT_REF_MATCH=SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\.co/);
const STUDIO_HOME=SUPABASE_PROJECT_REF_MATCH?("https://supabase.com/dashboard/project/"+SUPABASE_PROJECT_REF_MATCH[1]):null;

const styles={
  h1:{fontSize:22,margin:"0 0 16px",fontWeight:"bold"},
  grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))",gap:14},
  card:{background:"#fff",border:"1px solid #ddd",borderRadius:6,padding:16},
  cardTitle:{fontSize:11,letterSpacing:"0.06em",textTransform:"uppercase",color:"#666",fontWeight:"bold",marginBottom:10},
  metric:{fontSize:18,fontWeight:"bold",color:"#222",marginBottom:6},
  ok:{color:"#1a6b2a"},
  fail:{color:"#7a3838"},
  desc:{fontSize:12,color:"#444",lineHeight:1.5,marginBottom:8},
  link:{color:"#c9a84c",fontWeight:600,textDecoration:"none",fontSize:12},
  badge:{display:"inline-block",padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:"#7a5800",background:"#fff8e1",border:"1px solid #f0d76a",marginBottom:8},
};

export default function Health(){
  const[dbState,setDbState]=useState({status:"checking",latency:null,error:null});

  useEffect(()=>{
    let cancelled=false;
    const t0=performance.now();
    supabase.from("shops").select("id",{count:"exact",head:true}).then(r=>{
      if(cancelled)return;
      const ms=Math.round(performance.now()-t0);
      if(r.error)setDbState({status:"fail",latency:ms,error:r.error.message||String(r.error)});
      else setDbState({status:"ok",latency:ms,error:null});
    }).catch(e=>{
      if(cancelled)return;
      setDbState({status:"fail",latency:null,error:e&&e.message||"network"});
    });
    return()=>{cancelled=true;};
  },[]);

  return <>
    <h1 style={styles.h1}>Health</h1>
    <span style={styles.badge}>Best-effort dashboard</span>

    <div style={styles.grid}>

      <div style={styles.card}>
        <div style={styles.cardTitle}>🗄 Database (Supabase)</div>
        {dbState.status==="checking"&&<div style={styles.metric}>Pinging…</div>}
        {dbState.status==="ok"&&<>
          <div style={{...styles.metric,...styles.ok}}>✓ OK</div>
          <div style={styles.desc}>Round-trip: <strong>{dbState.latency} ms</strong> against <code>shops</code> count.</div>
        </>}
        {dbState.status==="fail"&&<>
          <div style={{...styles.metric,...styles.fail}}>✗ Failed</div>
          <div style={styles.desc}>Error: {dbState.error}</div>
        </>}
        {STUDIO_HOME&&<a href={STUDIO_HOME} target="_blank" rel="noreferrer" style={styles.link}>Open Supabase Studio →</a>}
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>🌐 Hosting (Netlify)</div>
        <div style={styles.desc}>Production project: <strong>lootledger</strong>. Custom domain: <code>lootledger.au</code> (apex + www + per-shop subdomains + admin).</div>
        <div style={styles.desc}>Latest deploy info, build log, and rollback live in the Netlify dashboard.</div>
        <a href="https://app.netlify.com/" target="_blank" rel="noreferrer" style={styles.link}>Open Netlify dashboard →</a>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>🔐 SSL certificates</div>
        <div style={styles.desc}>Let's Encrypt multi-SAN cert covers <code>lootledger.au</code>, <code>www.lootledger.au</code>, every per-shop subdomain (added as Netlify domain aliases), and <code>admin.lootledger.au</code>.</div>
        <div style={styles.desc}>Auto-renews ~30 days before expiry. Last manually verified: 2026-05-11 (5.2-PRE deploy).</div>
        <a href="https://app.netlify.com/" target="_blank" rel="noreferrer" style={styles.link}>Netlify → Domain management →</a>
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>💾 Backups</div>
        <div style={styles.desc}>Supabase Pro tier daily backups + PITR. Verify retention + restore-test cadence on the project's Backup page.</div>
        {STUDIO_HOME&&<a href={STUDIO_HOME+"/database/backups/scheduled"} target="_blank" rel="noreferrer" style={styles.link}>Supabase → Backups →</a>}
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>👥 Active sessions</div>
        <div style={styles.desc}>Active Supabase auth sessions (counted server-side) live in Supabase Studio. Auth → Users → filter by recent activity.</div>
        {STUDIO_HOME&&<a href={STUDIO_HOME+"/auth/users"} target="_blank" rel="noreferrer" style={styles.link}>Supabase → Auth → Users →</a>}
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>📊 Domain DNS</div>
        <div style={styles.desc}>VentraIP authoritative for <code>lootledger.au</code>. 6 records: apex A, www CNAME, wildcard CNAME, 3 NS records.</div>
        <a href="https://account.ventraip.com.au/" target="_blank" rel="noreferrer" style={styles.link}>VentraIP control panel →</a>
      </div>

    </div>
  </>;
}
