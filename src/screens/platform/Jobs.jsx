// LootLedger — Platform Admin / Background Jobs (stub).
// Phase 5.2-PRE-2 v2 (2026-05-11). Placeholder until the
// async-job-queue infrastructure lands. The provider sub-
// phases (5.2-B Square, 5.2-C/G/H accounting, 5.2-E SMTP2GO)
// will introduce retryable background work that this page
// will surface.

import React from "react";

const styles={
  h1:{fontSize:22,margin:"0 0 16px",fontWeight:"bold"},
  badge:{display:"inline-block",padding:"3px 10px",borderRadius:10,fontSize:11,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:"#7a5800",background:"#fff8e1",border:"1px solid #f0d76a",marginBottom:14},
  card:{background:"#fff",border:"1px solid #ddd",borderRadius:6,padding:16,marginBottom:14},
  desc:{fontSize:14,color:"#444",lineHeight:1.6,margin:"0 0 10px"},
};

export default function Jobs(){
  return <>
    <h1 style={styles.h1}>Background Jobs</h1>
    <span style={styles.badge}>Phase 5.X — under construction</span>
    <div style={styles.card}>
      <p style={styles.desc}>View and retry failed background jobs: SMTP2GO email sends, Square inventory sync, accounting provider pushes (Xero / MYOB / QuickBooks).</p>
      <p style={styles.desc}>Lands after the provider sub-phases ship (5.2-B / C / G / H / E). Each will write to a shared <code>provider_sync_log</code> table (per Adjustment 17) — this page will read from there.</p>
    </div>
  </>;
}
