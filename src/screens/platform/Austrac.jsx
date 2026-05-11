// LootLedger — Platform Admin / AUSTRAC Reporting Status (stub).
// Phase 5.2-PRE-2 v2 (2026-05-11). Placeholder. Cross-shop
// view of TTR / SMR submission status will land in a
// Phase 5.X follow-up once the per-shop reporting flow
// stabilises (currently each shop tracks its own).

import React from "react";

const styles={
  h1:{fontSize:22,margin:"0 0 16px",fontWeight:"bold"},
  badge:{display:"inline-block",padding:"3px 10px",borderRadius:10,fontSize:11,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:"#7a5800",background:"#fff8e1",border:"1px solid #f0d76a",marginBottom:14},
  card:{background:"#fff",border:"1px solid #ddd",borderRadius:6,padding:16,marginBottom:14},
  desc:{fontSize:14,color:"#444",lineHeight:1.6,margin:"0 0 10px"},
};

export default function Austrac(){
  return <>
    <h1 style={styles.h1}>AUSTRAC Reporting Status</h1>
    <span style={styles.badge}>Phase 5.X — under construction</span>
    <div style={styles.card}>
      <p style={styles.desc}>Cross-shop view of TTR (Threshold Transaction Reports) and SMR (Suspicious Matter Reports) submission status. Flag shops with overdue TTRs (10-day window from transaction date) before AUSTRAC does.</p>
      <p style={styles.desc}>Coming in a Phase 5.X follow-up. For now, each shop's reporting status lives on its own subdomain — TTR/SMR tooling is a per-shop responsibility.</p>
    </div>
  </>;
}
