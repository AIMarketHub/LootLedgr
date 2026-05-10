// LootLedger — single diagnostics row.
// Phase 5.2-A. Renders one device's status + mode + last test
// result + "Test now" button + expandable raw-result panel.
// Used twice on the diagnostics page: once for hardware drivers
// (live tests) and once for provider stubs (disabled, shows the
// implementing sub-phase as a placeholder).

import React,{useState} from "react";
import {getDriver as getHwDriver} from "../../lib/hardware/index.js";

const styles={
  row:{display:"grid",gridTemplateColumns:"1fr 110px 100px 130px 110px 30px",alignItems:"center",gap:10,padding:"12px 14px",borderBottom:"1px solid #eee",background:"#fff",fontSize:13},
  rowLast:{borderBottom:"none"},
  name:{fontWeight:600,color:"#222"},
  modeBadge:(mode)=>({display:"inline-block",padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:mode==="live"?"#1a6b2a":"#7a5e1a",background:mode==="live"?"#dff5e3":"#fdf3d2",border:"1px solid "+(mode==="live"?"#bce6c4":"#ecd790")}),
  modeBadgeStub:{display:"inline-block",padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:"#888",background:"#f4f4f4",border:"1px solid #ddd"},
  statusOk:{color:"#1a6b2a",fontWeight:"bold"},
  statusFail:{color:"#7a3838",fontWeight:"bold"},
  statusRun:{color:"#7a5e1a"},
  statusIdle:{color:"#888"},
  ts:{fontSize:11,color:"#888"},
  btn:{padding:"6px 12px",background:"#fff",color:"#333",border:"1px solid #c9a84c",borderRadius:4,fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:600},
  btnDisabled:{padding:"6px 12px",background:"#f4f4f4",color:"#aaa",border:"1px solid #ddd",borderRadius:4,fontSize:12,cursor:"not-allowed",fontFamily:"inherit"},
  expand:{background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#888",padding:4},
  details:{padding:"10px 14px 14px 14px",background:"#fafafa",borderBottom:"1px solid #eee",fontSize:12,color:"#444"},
  pre:{background:"#fff",border:"1px solid #ddd",borderRadius:4,padding:"10px 12px",fontFamily:"monospace",fontSize:11,overflow:"auto",maxHeight:200,whiteSpace:"pre-wrap",wordBreak:"break-word"},
  errorText:{color:"#7a3838",fontWeight:"bold",marginBottom:6},
};

function fmtTs(d){
  if(!d)return"—";
  const dt=d instanceof Date?d:new Date(d);
  if(isNaN(dt.getTime()))return"—";
  const pad=n=>String(n).padStart(2,"0");
  return pad(dt.getHours())+":"+pad(dt.getMinutes())+":"+pad(dt.getSeconds());
}

export default function HardwareRow({device,label,disabled,disabledReason}){
  const driver=disabled?null:getHwDriver(device);
  const [status,setStatus]=useState("idle");  // idle | running | pass | fail
  const [lastResult,setLastResult]=useState(null);
  const [lastAt,setLastAt]=useState(null);
  const [expanded,setExpanded]=useState(false);

  const runTest=async()=>{
    if(!driver||disabled)return;
    setStatus("running");
    try{
      const r=await driver.diagnose();
      setLastResult(r);
      setLastAt(new Date());
      setStatus(r&&r.ok?"pass":"fail");
    }catch(e){
      setLastResult({ok:false,error:(e&&e.message)||"diagnose threw"});
      setLastAt(new Date());
      setStatus("fail");
    }
  };

  const mode=disabled?null:(driver?driver.getMode():"mock");
  const statusIcon=
    status==="running"?<span style={styles.statusRun}>⏳ running</span>
    :status==="pass"?<span style={styles.statusOk}>✓ pass</span>
    :status==="fail"?<span style={styles.statusFail}>✗ fail</span>
    :<span style={styles.statusIdle}>—</span>;

  return <>
    <div style={styles.row}>
      <span style={styles.name}>{label}</span>
      <span>{disabled?<span style={styles.modeBadgeStub}>STUB</span>:<span style={styles.modeBadge(mode)}>{mode}</span>}</span>
      <span>{disabled?<span style={styles.statusIdle}>—</span>:statusIcon}</span>
      <span style={styles.ts}>{disabled?(disabledReason||""):("Last run: "+fmtTs(lastAt))}</span>
      <span>
        {disabled
          ?<button style={styles.btnDisabled} disabled title={disabledReason||"Not yet implemented"}>Test now</button>
          :<button style={styles.btn} onClick={runTest} disabled={status==="running"}>{status==="running"?"…":"Test now"}</button>}
      </span>
      <span>
        {!disabled&&lastResult&&<button style={styles.expand} onClick={()=>setExpanded(e=>!e)} title={expanded?"Collapse":"Expand details"}>{expanded?"▲":"▾"}</button>}
      </span>
    </div>
    {expanded&&lastResult&&<div style={styles.details}>
      {lastResult.error&&<div style={styles.errorText}>Error: {String(lastResult.error)}</div>}
      <div style={{marginBottom:6}}><strong>Mode:</strong> {lastResult.mode||"—"} · <strong>Latency:</strong> {lastResult.latencyMs!=null?(lastResult.latencyMs+" ms"):"—"}</div>
      {lastResult.details&&<div style={{marginBottom:6}}><strong>Details:</strong> {lastResult.details}</div>}
      <pre style={styles.pre}>{JSON.stringify(lastResult,null,2)}</pre>
    </div>}
  </>;
}
