// LootLedger — Platform Admin / Security (stub).
// Phase 5.2-PRE-2 v2 (2026-05-11). Placeholder until a
// dedicated security log surface is built. For now,
// Supabase Studio's Auth Logs is the source of truth.

import React from "react";

const SUPABASE_URL=import.meta.env.VITE_SUPABASE_URL||"";
const REF=SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\.co/);
const STUDIO_AUTH_LOGS=REF?("https://supabase.com/dashboard/project/"+REF[1]+"/logs/auth-logs"):null;

const styles={
  h1:{fontSize:22,margin:"0 0 16px",fontWeight:"bold"},
  badge:{display:"inline-block",padding:"3px 10px",borderRadius:10,fontSize:11,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:"#7a5800",background:"#fff8e1",border:"1px solid #f0d76a",marginBottom:14},
  card:{background:"#fff",border:"1px solid #ddd",borderRadius:6,padding:16,marginBottom:14},
  desc:{fontSize:14,color:"#444",lineHeight:1.6,margin:"0 0 10px"},
  link:{color:"#c9a84c",fontWeight:600,textDecoration:"none"},
};

export default function Security(){
  return <>
    <h1 style={styles.h1}>Security</h1>
    <span style={styles.badge}>Phase 5.X — under construction</span>
    <div style={styles.card}>
      <p style={styles.desc}>Failed-login monitor, suspicious-activity log, locked-out accounts, and brute-force detection across every shop. Coming in a Phase 5.X follow-up.</p>
      <p style={styles.desc}>For now, Supabase Studio's Auth Logs has the raw events.{" "}
        {STUDIO_AUTH_LOGS&&<a href={STUDIO_AUTH_LOGS} target="_blank" rel="noreferrer" style={styles.link}>Open Auth Logs →</a>}
      </p>
    </div>
  </>;
}
