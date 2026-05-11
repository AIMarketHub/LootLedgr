// LootLedger — Platform Admin / Subscriptions (stub).
// Phase 5.2-PRE-2 v2 (2026-05-11). Placeholder until the
// Stripe + GST invoicing system lands in Phase 5.5. For
// now, the activate/deactivate toggle on the Shops page
// is the only subscription control.

import React from "react";
import {Link} from "react-router-dom";

const styles={
  h1:{fontSize:22,margin:"0 0 16px",fontWeight:"bold"},
  badge:{display:"inline-block",padding:"3px 10px",borderRadius:10,fontSize:11,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:"#7a5800",background:"#fff8e1",border:"1px solid #f0d76a",marginBottom:14},
  card:{background:"#fff",border:"1px solid #ddd",borderRadius:6,padding:16,marginBottom:14},
  desc:{fontSize:14,color:"#444",lineHeight:1.6,margin:"0 0 10px"},
  link:{color:"#c9a84c",fontWeight:600,textDecoration:"none"},
};

export default function Subscriptions(){
  return <>
    <h1 style={styles.h1}>Subscriptions</h1>
    <span style={styles.badge}>Phase 5.5 — under construction</span>
    <div style={styles.card}>
      <p style={styles.desc}>Stripe-backed recurring billing, AU GST invoices, payment-failure handling, cancellation flow, plan-tier management. Full system lands in Phase 5.5 per the locked roadmap.</p>
      <p style={styles.desc}>For now, the activate/deactivate toggle on the <Link to="/shops" style={styles.link}>Shops page</Link> is the only subscription control. It writes <code>subscription_active</code> + <code>subscription_plan</code>; no money moves until Phase 5.5.</p>
    </div>
  </>;
}
