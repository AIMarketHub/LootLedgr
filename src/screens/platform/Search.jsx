// LootLedger — Platform Admin / Search (stub).
// Phase 5.2-PRE-2 v2 (2026-05-11). Placeholder until the
// cross-shop search backend lands in a Phase 5.X follow-up.

import React from "react";

const styles={
  h1:{fontSize:22,margin:"0 0 16px",fontWeight:"bold"},
  badge:{display:"inline-block",padding:"3px 10px",borderRadius:10,fontSize:11,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:"#7a5800",background:"#fff8e1",border:"1px solid #f0d76a",marginBottom:14},
  card:{background:"#fff",border:"1px solid #ddd",borderRadius:6,padding:16,marginBottom:14},
  desc:{fontSize:14,color:"#444",lineHeight:1.6,margin:"0 0 10px"},
};

export default function Search(){
  return <>
    <h1 style={styles.h1}>Search</h1>
    <span style={styles.badge}>Phase 5.X — under construction</span>
    <div style={styles.card}>
      <p style={styles.desc}>Search clients, transactions, and buys across every shop on the platform — primarily for support tickets where someone reports an issue with a specific record but doesn't know which shop it belongs to.</p>
      <p style={styles.desc}>Coming in a Phase 5.X follow-up after the per-shop full-text search index is in place.</p>
    </div>
  </>;
}
