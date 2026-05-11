// LootLedger — Platform Admin / Aged Audit (stub).
// Phase 5.2-PRE-2 v2 (2026-05-11). Placeholder for the
// compliance-escalation tool that surfaces audit_log
// events older than X days that haven't been resolved.

import React from "react";
import {Link} from "react-router-dom";

const styles={
  h1:{fontSize:22,margin:"0 0 16px",fontWeight:"bold"},
  badge:{display:"inline-block",padding:"3px 10px",borderRadius:10,fontSize:11,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:"#7a5800",background:"#fff8e1",border:"1px solid #f0d76a",marginBottom:14},
  card:{background:"#fff",border:"1px solid #ddd",borderRadius:6,padding:16,marginBottom:14},
  desc:{fontSize:14,color:"#444",lineHeight:1.6,margin:"0 0 10px"},
  link:{color:"#c9a84c",fontWeight:600,textDecoration:"none"},
};

export default function AgedAudit(){
  return <>
    <h1 style={styles.h1}>Aged Audit Review</h1>
    <span style={styles.badge}>Phase 5.X — under construction</span>
    <div style={styles.card}>
      <p style={styles.desc}>Surface flagged <code>audit_log</code> events older than X days that haven't been resolved (TFS overrides, structuring overrides, blacklist overrides, etc). Compliance-escalation tool — gives the platform admin a queue of "things that should have been actioned weeks ago."</p>
      <p style={styles.desc}>Coming in a Phase 5.X follow-up. For now, the <Link to="/audit" style={styles.link}>Audit Log</Link> page lets you filter by date range manually.</p>
    </div>
  </>;
}
