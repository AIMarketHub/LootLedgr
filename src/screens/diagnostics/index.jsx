// LootLedger — Phase 5.2-A diagnostics screen.
// Route: /admin/diagnostics. Wrapped in <RequireAdmin> by Router.jsx.
//
// Shows two sections of test rows:
//   1. Hardware (5 rows): printer, scale, scanner, signature pad,
//      cash drawer. Each row has a "Test now" button that calls
//      the driver's diagnose() and renders the result inline
//      (✓ pass / ✗ fail / ⏳ running) with mode badge + last
//      timestamp + expandable raw-result panel.
//   2. Provider stubs (5 rows): Square / Xero / MYOB / QuickBooks
//      Online / SMTP2GO. Disabled placeholders showing
//      "Not configured (Phase 5.2-X)" — replaced by live tests
//      when each implementing sub-phase lands.
//
// "Run all tests" button at the top kicks off all 5 hardware
// rows sequentially with a 500ms gap, surfaces progress in the
// TestModal, and reports a final tally.
//
// Coexists with the older src/modals/ApiDiagnostics modal until
// the post-Phase-5.2 cleanup commit (see
// project_deferred_items.md "Phase 5.2 cleanup deferred").

import React,{useState} from "react";
import {Link,useNavigate} from "react-router-dom";
import {useAuth} from "../../components/AuthProvider.jsx";
import Logo from "../../components/Logo.jsx";
import {DEVICES as HW_DEVICES,getDriver as getHwDriver} from "../../lib/hardware/index.js";
import HardwareRow from "./HardwareRow.jsx";
import TestModal from "./TestModal.jsx";

const HW_LABELS={printer:"Receipt printer",scale:"Scale",scanner:"Scanner",signature:"Signature pad",cashDrawer:"Cash drawer"};

const PROVIDER_STUBS=[
  {id:"square",label:"Square (Inventory + Catalog)",subPhase:"5.2-B"},
  {id:"xero",label:"Xero (Bills)",subPhase:"5.2-C"},
  {id:"myob",label:"MYOB (Bills)",subPhase:"5.2-G"},
  {id:"quickbooks",label:"QuickBooks Online (Bills)",subPhase:"5.2-H"},
  {id:"smtp2go",label:"SMTP2GO (Email)",subPhase:"5.2-E"},
];

const styles={
  page:{minHeight:"100vh",background:"#f5f5f5",color:"#222",fontFamily:"system-ui, -apple-system, Segoe UI, Roboto, sans-serif",padding:"24px 16px"},
  shell:{maxWidth:1100,margin:"0 auto"},
  h1:{fontSize:22,margin:"0 0 12px",fontWeight:"bold"},
  h2:{fontSize:13,margin:"24px 0 10px",fontWeight:"bold",letterSpacing:"0.06em",textTransform:"uppercase",color:"#666"},
  topbar:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:14,flexWrap:"wrap"},
  link:{color:"#c9a84c",fontWeight:600,textDecoration:"none",fontSize:12},
  controls:{display:"flex",gap:8,alignItems:"center",marginBottom:14,flexWrap:"wrap"},
  btnRun:{padding:"10px 18px",background:"#1a6b2a",color:"#fff",border:"none",borderRadius:5,fontSize:13,cursor:"pointer",fontFamily:"inherit",fontWeight:600},
  btnRunDisabled:{padding:"10px 18px",background:"#bbb",color:"#fff",border:"none",borderRadius:5,fontSize:13,cursor:"not-allowed",fontFamily:"inherit",fontWeight:600},
  table:{background:"#fff",border:"1px solid #ddd",borderRadius:6,overflow:"hidden"},
  tally:{fontSize:13,color:"#333",fontWeight:600},
  tallyPass:{color:"#1a6b2a"},
  tallyFail:{color:"#7a3838"},
};

export default function Diagnostics(){
  const{user,isPlatformAdmin}=useAuth();
  const nav=useNavigate();
  const[running,setRunning]=useState(false);
  const[progress,setProgress]=useState({current:null,completed:0,total:0});
  const[showProgress,setShowProgress]=useState(false);
  const[tally,setTally]=useState(null);
  // Bumped after a "Run all" sweep so HardwareRow remounts and
  // re-renders with fresh last-result state. Individual "Test now"
  // clicks already update that row's local state directly.
  const[runCounter,setRunCounter]=useState(0);

  const runAll=async()=>{
    setRunning(true);setShowProgress(true);setTally(null);
    let pass=0,fail=0;
    for(let i=0;i<HW_DEVICES.length;i++){
      const d=HW_DEVICES[i];
      setProgress({current:d,completed:i,total:HW_DEVICES.length});
      try{
        const r=await getHwDriver(d).diagnose();
        if(r&&r.ok)pass++;else fail++;
      }catch(e){fail++;}
      if(i<HW_DEVICES.length-1)await new Promise(res=>setTimeout(res,500));
    }
    setProgress({current:null,completed:HW_DEVICES.length,total:HW_DEVICES.length});
    setTally({pass:pass,fail:fail});
    setRunning(false);
    setRunCounter(c=>c+1);
  };

  return <div style={styles.page}>
    <div style={styles.shell}>
      <div style={styles.topbar}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <Logo height={40}/>
          <h1 style={styles.h1}>Diagnostics</h1>
        </div>
        <div style={{fontSize:12,color:"#666"}}>
          Signed in as <strong>{user&&user.email}</strong> ·{" "}
          {isPlatformAdmin&&<><a style={styles.link} href="https://admin.lootledger.au">Platform admin ↗</a> ·{" "}</>}
          <button onClick={()=>nav("/app")} style={{background:"none",border:"none",color:"#c9a84c",fontWeight:600,cursor:"pointer",padding:0,fontFamily:"inherit",fontSize:12}}>Back to app</button>
        </div>
      </div>

      <div style={styles.controls}>
        <button style={running?styles.btnRunDisabled:styles.btnRun} onClick={runAll} disabled={running}>{running?"Running…":"▶ Run all tests"}</button>
        {tally&&!running&&<span style={styles.tally}><span style={styles.tallyPass}>✓ {tally.pass}</span> · <span style={styles.tallyFail}>✗ {tally.fail}</span> of {HW_DEVICES.length} hardware tests</span>}
      </div>

      <h2 style={styles.h2}>Hardware ({HW_DEVICES.length} rows)</h2>
      <div style={styles.table}>
        {HW_DEVICES.map(d=>(
          <HardwareRow
            key={d+":"+runCounter}
            device={d}
            label={HW_LABELS[d]||d}
          />
        ))}
      </div>

      <h2 style={styles.h2}>Providers ({PROVIDER_STUBS.length} stubs — wired by their implementing sub-phase)</h2>
      <div style={styles.table}>
        {PROVIDER_STUBS.map(p=>(
          <HardwareRow
            key={p.id}
            device={p.id}
            label={p.label}
            disabled
            disabledReason={"Not configured (Phase "+p.subPhase+")"}
          />
        ))}
      </div>
    </div>

    {showProgress&&<TestModal progress={progress} tally={tally} running={running} onClose={()=>{setShowProgress(false);setTally(null);}}/>}
  </div>;
}
