// LootLedger — diagnostics "Run all tests" progress modal.
// Phase 5.2-A. Pops up when the operator clicks "Run all tests"
// on the diagnostics page. Shows a progress bar, the device
// currently being tested, and a final pass/fail tally when the
// sweep completes. Closeable once not running.

import React from "react";

const HW_LABELS={printer:"Receipt printer",scale:"Scale",scanner:"Scanner",signature:"Signature pad",cashDrawer:"Cash drawer"};

const styles={
  backdrop:{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999},
  card:{background:"#fff",borderRadius:8,padding:24,minWidth:360,maxWidth:480,boxShadow:"0 10px 40px rgba(0,0,0,0.3)",fontFamily:"system-ui, -apple-system, Segoe UI, Roboto, sans-serif"},
  title:{margin:"0 0 16px",fontSize:16,fontWeight:"bold",color:"#222"},
  bar:{width:"100%",height:8,background:"#eee",borderRadius:4,overflow:"hidden",marginBottom:12},
  fill:(pct)=>({width:pct+"%",height:"100%",background:"#1a6b2a",transition:"width 0.3s ease"}),
  current:{fontSize:13,color:"#444",marginBottom:8},
  tally:{fontSize:14,color:"#222",fontWeight:600,padding:"12px 0"},
  tallyPass:{color:"#1a6b2a"},
  tallyFail:{color:"#7a3838"},
  btn:{padding:"8px 16px",background:"#1a6b2a",color:"#fff",border:"none",borderRadius:4,fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:600},
  btnDisabled:{padding:"8px 16px",background:"#bbb",color:"#fff",border:"none",borderRadius:4,fontSize:13,cursor:"not-allowed",fontFamily:"inherit",fontWeight:600},
};

export default function TestModal({progress,tally,running,onClose}){
  const pct=progress&&progress.total?Math.round((progress.completed/progress.total)*100):0;
  const currentLabel=progress&&progress.current?(HW_LABELS[progress.current]||progress.current):null;

  return <div style={styles.backdrop} onClick={running?null:onClose}>
    <div style={styles.card} onClick={e=>e.stopPropagation()}>
      <h2 style={styles.title}>{running?"Running diagnostics…":"Diagnostics complete"}</h2>
      <div style={styles.bar}><div style={styles.fill(pct)}/></div>
      {running&&currentLabel&&<div style={styles.current}>Testing: <strong>{currentLabel}</strong> ({progress.completed+1} of {progress.total})</div>}
      {!running&&tally&&<div style={styles.tally}>
        <span style={styles.tallyPass}>✓ {tally.pass} passed</span>
        {" · "}
        <span style={styles.tallyFail}>✗ {tally.fail} failed</span>
        {" · "}
        {tally.pass+tally.fail} total
      </div>}
      <div style={{display:"flex",justifyContent:"flex-end",marginTop:12}}>
        <button style={running?styles.btnDisabled:styles.btn} onClick={onClose} disabled={running}>{running?"…":"Close"}</button>
      </div>
    </div>
  </div>;
}
