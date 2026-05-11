// LootLedger — Platform Admin / Impersonate (stub).
// Phase 5.2-PRE-2 v2 (2026-05-11). Placeholder. Real
// impersonation is dangerous — it needs explicit audit
// trail, time-limited tokens, and a bright-red banner the
// operator can't dismiss. Out of scope for this commit;
// will land carefully in a Phase 5.X follow-up after the
// audit_log integration is bulletproof.

import React from "react";

const styles={
  h1:{fontSize:22,margin:"0 0 16px",fontWeight:"bold"},
  badge:{display:"inline-block",padding:"3px 10px",borderRadius:10,fontSize:11,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:"#7a5800",background:"#fff8e1",border:"1px solid #f0d76a",marginBottom:14},
  card:{background:"#fff",border:"1px solid #ddd",borderRadius:6,padding:16,marginBottom:14},
  desc:{fontSize:14,color:"#444",lineHeight:1.6,margin:"0 0 10px"},
};

export default function Impersonate(){
  return <>
    <h1 style={styles.h1}>Impersonate</h1>
    <span style={styles.badge}>Phase 5.X — under construction</span>
    <div style={styles.card}>
      <p style={styles.desc}>Sign in as another user on a shop subdomain to debug an issue with their account. Coming in a Phase 5.X follow-up.</p>
      <p style={styles.desc}>Requires careful integration with audit_log (every impersonation action must be tagged with the platform admin who initiated it), a time-limited session, and an undismissable banner so the operator never forgets they're acting as someone else. Shipping this carelessly creates real legal exposure — won't land until the safeguards are in place.</p>
    </div>
  </>;
}
