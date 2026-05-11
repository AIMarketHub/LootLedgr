// LootLedger — Platform Admin / Shop Creation (stub).
// Phase 5.2-PRE-2 v2 (2026-05-11). Placeholder for an
// operator-driven shop-creation wizard. For now dealers
// self-signup at lootledger.au/signup.

import React from "react";

const styles={
  h1:{fontSize:22,margin:"0 0 16px",fontWeight:"bold"},
  badge:{display:"inline-block",padding:"3px 10px",borderRadius:10,fontSize:11,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:"#7a5800",background:"#fff8e1",border:"1px solid #f0d76a",marginBottom:14},
  card:{background:"#fff",border:"1px solid #ddd",borderRadius:6,padding:16,marginBottom:14},
  desc:{fontSize:14,color:"#444",lineHeight:1.6,margin:"0 0 10px"},
  link:{color:"#c9a84c",fontWeight:600,textDecoration:"none"},
};

export default function ShopCreate(){
  return <>
    <h1 style={styles.h1}>Shop Creation</h1>
    <span style={styles.badge}>Phase 5.X — under construction</span>
    <div style={styles.card}>
      <p style={styles.desc}>Create a new shop on behalf of a dealer (e.g. for an in-person onboarding where the operator walks through the setup with the dealer present). Will hit the existing <code>signup_shop</code> RPC under the hood.</p>
      <p style={styles.desc}>For now, dealers can self-signup at <a href="https://lootledger.au/signup" target="_blank" rel="noreferrer" style={styles.link}>lootledger.au/signup</a>.</p>
    </div>
  </>;
}
