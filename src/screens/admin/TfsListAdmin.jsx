// LootLedger — TFS list admin upload UI.
// Sits at /admin/tfs (gated by RequireAdmin in Router.jsx).
//
// Flow:
//   1. Show current metadata (when last refreshed, by whom, count).
//   2. Admin selects an .xlsx file from DFAT and clicks Parse.
//   3. parseDfatExcel validates the column structure and returns
//      records + stats. Stats are surfaced for sanity checking
//      before the destructive insert.
//   4. Admin clicks Confirm. We:
//        a. Wipe tfs_list (DELETE WHERE TRUE).
//        b. Bulk insert in batches of 500 (well under PostgREST's
//           per-request row limit; chosen for memory headroom and
//           progress granularity).
//        c. Upsert tfs_list_metadata singleton with the new
//           timestamp + count + source filename.
//        d. Replace the local IndexedDB cache so this admin's
//           browser gets the fresh data immediately (other shops
//           will pick it up via syncTfsCache on next app boot).
//   5. Show success / error.
//
// Style mirrors AdminPanel.jsx — light theme, system-ui, bordered
// table chrome — so the admin surface feels consistent.

import React,{useEffect,useState,useRef} from "react";
import {Link,useNavigate} from "react-router-dom";
import {supabase,signOut} from "../../lib/auth/saas.js";
import {useAuth} from "../../components/AuthProvider.jsx";
import {parseDfatExcel} from "../../lib/tfs/parser.js";
import {replaceTfsCache} from "../../lib/tfs/storage.js";

function fmtLong(iso){if(!iso)return "—";try{return new Date(iso).toLocaleString("en-AU",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"});}catch(_){return String(iso);}}
function daysSince(iso){if(!iso)return null;const d=new Date(iso).getTime();if(isNaN(d))return null;return Math.floor((Date.now()-d)/(24*3600*1000));}

const styles={
  page:{minHeight:"100vh",background:"#f5f5f5",color:"#222",fontFamily:"system-ui, -apple-system, Segoe UI, Roboto, sans-serif",padding:"24px 16px"},
  shell:{maxWidth:900,margin:"0 auto"},
  topbar:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:14,flexWrap:"wrap"},
  h1:{fontSize:22,margin:"0 0 12px",fontWeight:"bold"},
  link:{color:"#c9a84c",fontWeight:600,textDecoration:"none"},
  card:{background:"#fff",border:"1px solid #ddd",borderRadius:6,padding:16,marginBottom:14},
  cardTitle:{fontSize:11,letterSpacing:"0.06em",textTransform:"uppercase",color:"#666",fontWeight:"bold",marginBottom:10},
  meta:{fontSize:13,lineHeight:1.7,color:"#222"},
  metaLabel:{display:"inline-block",minWidth:160,color:"#666",fontSize:12},
  fileRow:{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:10},
  fileBtn:{padding:"8px 14px",background:"#c9a84c",color:"#222",border:"none",borderRadius:4,fontSize:13,fontWeight:"bold",cursor:"pointer",fontFamily:"inherit"},
  fileBtnAlt:{padding:"8px 14px",background:"#fff",color:"#666",border:"1px solid #ccc",borderRadius:4,fontSize:13,cursor:"pointer",fontFamily:"inherit"},
  primary:{padding:"10px 18px",background:"#1a6b2a",color:"#fff",border:"none",borderRadius:4,fontSize:13,fontWeight:"bold",cursor:"pointer",fontFamily:"inherit"},
  primaryDisabled:{padding:"10px 18px",background:"#aaa",color:"#fff",border:"none",borderRadius:4,fontSize:13,fontWeight:"bold",cursor:"not-allowed",fontFamily:"inherit"},
  warn:{padding:"10px 12px",background:"#fff8e1",border:"1px solid #f0d76a",borderRadius:4,color:"#7a5800",fontSize:12,marginBottom:10,lineHeight:1.5},
  err:{padding:"10px 12px",background:"#fee",border:"1px solid #fcc",borderRadius:4,color:"#933",fontSize:12,marginBottom:10,lineHeight:1.5},
  ok:{padding:"10px 12px",background:"#dff5e3",border:"1px solid #bce6c4",borderRadius:4,color:"#1a6b2a",fontSize:12,marginBottom:10,lineHeight:1.5},
  statRow:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(140px, 1fr))",gap:10,margin:"10px 0"},
  stat:{background:"#fafafa",border:"1px solid #eee",borderRadius:4,padding:"10px 12px"},
  statLabel:{fontSize:11,color:"#666",letterSpacing:"0.05em",textTransform:"uppercase",marginBottom:4},
  statValue:{fontSize:18,fontWeight:"bold",color:"#222"},
  progress:{height:8,background:"#eee",borderRadius:4,overflow:"hidden",marginTop:8},
  progressFill:{height:"100%",background:"#c9a84c",transition:"width 200ms ease"},
};

export default function TfsListAdmin(){
  const{user,refresh}=useAuth();
  const nav=useNavigate();
  const fileInputRef=useRef(null);

  const[meta,setMeta]=useState(null);
  const[loading,setLoading]=useState(true);
  const[err,setErr]=useState("");
  const[ok,setOk]=useState("");

  // Upload state machine: idle → parsing → ready → inserting → done.
  const[phase,setPhase]=useState("idle");
  const[selectedFile,setSelectedFile]=useState(null);
  const[parsed,setParsed]=useState(null); // {records, stats}
  const[insertProgress,setInsertProgress]=useState(0);

  const loadMeta=async()=>{
    setLoading(true);
    setErr("");
    const{data,error}=await supabase.from("tfs_list_metadata").select("*").eq("id",1).maybeSingle();
    if(error)setErr(error.message);
    else setMeta(data||null);
    setLoading(false);
  };
  useEffect(()=>{loadMeta();},[]);

  const onChooseFile=e=>{
    const f=e.target.files&&e.target.files[0];
    if(!f)return;
    setErr("");setOk("");setParsed(null);setPhase("idle");setInsertProgress(0);
    setSelectedFile(f);
  };

  const onParse=async()=>{
    if(!selectedFile){setErr("Choose a file first.");return;}
    setErr("");setOk("");setParsed(null);
    setPhase("parsing");
    try{
      const buf=await selectedFile.arrayBuffer();
      const result=parseDfatExcel(buf);
      setParsed(result);
      setPhase("ready");
    }catch(e){
      setErr("Parse failed: "+(e.message||String(e)));
      setPhase("idle");
    }
  };

  const onConfirm=async()=>{
    if(!parsed||!parsed.records||!parsed.records.length){setErr("Nothing to insert. Re-parse first.");return;}
    if(typeof window!=="undefined"&&window.confirm){
      const ok=window.confirm(
        "REPLACE the entire TFS list with "+parsed.records.length+" records from "+(selectedFile&&selectedFile.name||"the uploaded file")+"?\n\n"+
        "This wipes the existing list and inserts the new one. The previous list is not retained.\n\n"+
        "Every shop's screening cache will refresh from this on next app boot."
      );
      if(!ok)return;
    }
    setErr("");setOk("");setPhase("inserting");setInsertProgress(0);

    try{
      // Step 1 — wipe the current list. We use a TRUE filter
      // because PostgREST requires a filter clause on DELETE.
      // (gt.0 against the bigserial id matches every row.)
      const del=await supabase.from("tfs_list").delete().gt("id",0);
      if(del.error)throw new Error("Delete: "+del.error.message);

      // Step 2 — bulk insert in batches of 500.
      const BATCH=500;
      const records=parsed.records;
      for(let i=0;i<records.length;i+=BATCH){
        const slice=records.slice(i,i+BATCH);
        const ins=await supabase.from("tfs_list").insert(slice);
        if(ins.error)throw new Error("Insert at row "+i+": "+ins.error.message);
        setInsertProgress(Math.round(((i+slice.length)/records.length)*100));
      }

      // Step 3 — upsert the metadata singleton.
      const metaPatch={
        id:1,
        last_updated_at:new Date().toISOString(),
        last_updated_by:(user&&user.id)||null,
        record_count:records.length,
        source_filename:selectedFile&&selectedFile.name||null,
      };
      const up=await supabase.from("tfs_list_metadata").upsert(metaPatch);
      if(up.error)throw new Error("Metadata upsert: "+up.error.message);

      // Step 4 — refresh the local IndexedDB cache so this admin's
      // own session has the new data immediately. Other shops will
      // sync on their next app boot via syncTfsCache.
      try{
        // Re-fetch the inserted rows so the cache holds the
        // server-assigned bigserial ids.
        const PAGE=1000;
        let from=0;
        const all=[];
        while(true){
          const r=await supabase.from("tfs_list").select("*").order("id",{ascending:true}).range(from,from+PAGE-1);
          if(r.error)throw new Error("Re-fetch: "+r.error.message);
          if(!r.data||!r.data.length)break;
          all.push(...r.data);
          if(r.data.length<PAGE)break;
          from+=PAGE;
        }
        await replaceTfsCache(all,{
          last_updated_at:metaPatch.last_updated_at,
          record_count:metaPatch.record_count,
          source_filename:metaPatch.source_filename,
        });
      }catch(_){
        // Non-fatal — admin's local cache will refresh on next boot.
      }

      setOk("Successfully replaced TFS list with "+records.length+" records.");
      setPhase("done");
      setSelectedFile(null);
      setParsed(null);
      if(fileInputRef.current)fileInputRef.current.value="";
      await loadMeta();
    }catch(e){
      setErr("Insert failed: "+(e.message||String(e))+" — the list is now in an inconsistent state. Re-upload to recover.");
      setPhase("ready");
    }
  };

  const onSignOut=async()=>{
    await signOut();
    await refresh();
    nav("/login",{replace:true});
  };

  const ageDays=meta&&daysSince(meta.last_updated_at);
  const stale=ageDays!=null&&ageDays>35;

  return <div style={styles.page}>
    <div style={styles.shell}>
      <div style={styles.topbar}>
        <h1 style={styles.h1}>Admin — TFS Consolidated List</h1>
        <div style={{fontSize:12,color:"#666"}}>
          Signed in as <strong>{user&&user.email}</strong> ·{" "}
          <Link to="/admin" style={styles.link}>← Back to admin</Link> ·{" "}
          <Link to="/app" style={styles.link}>Back to app</Link> ·{" "}
          <button onClick={onSignOut} style={{background:"none",border:"none",color:"#c9a84c",fontWeight:600,cursor:"pointer",padding:0,fontFamily:"inherit",fontSize:12}}>Sign out</button>
        </div>
      </div>

      <div style={styles.warn}>
        <strong>This screen replaces the global DFAT TFS list for every shop.</strong> Source the file from {" "}
        <a href="https://www.dfat.gov.au/international-relations/security/sanctions/consolidated-list" target="_blank" rel="noopener noreferrer" style={styles.link}>dfat.gov.au — sanctions consolidated list</a>.
        Re-upload at least once a month so dealers have a current list. The current list is referenced under sanctions law; out-of-date data exposes every shop on the platform to compliance risk.
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>📋 Current list metadata</div>
        {loading?<div style={styles.meta}>Loading…</div>:meta?<div style={styles.meta}>
          <div><span style={styles.metaLabel}>Last refreshed:</span> <strong>{fmtLong(meta.last_updated_at)}</strong>{ageDays!=null?" — "+ageDays+" days ago":""}</div>
          <div><span style={styles.metaLabel}>Record count:</span> <strong>{meta.record_count}</strong></div>
          {meta.source_filename&&<div><span style={styles.metaLabel}>Source file:</span> {meta.source_filename}</div>}
          {stale&&<div style={{...styles.warn,marginTop:10,marginBottom:0}}>⚠ The list is more than 35 days old. Please re-upload the latest DFAT file.</div>}
        </div>:<div style={{...styles.warn,marginBottom:0}}>No list uploaded yet — every screen result will indicate "list not available".</div>}
      </div>

      <div style={styles.card}>
        <div style={styles.cardTitle}>⬆ Upload new DFAT list (.xlsx)</div>
        <div style={styles.fileRow}>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={onChooseFile} disabled={phase==="parsing"||phase==="inserting"} style={{fontSize:12}}/>
          <button style={selectedFile&&phase!=="parsing"&&phase!=="inserting"?styles.fileBtn:styles.primaryDisabled} onClick={onParse} disabled={!selectedFile||phase==="parsing"||phase==="inserting"}>
            {phase==="parsing"?"Parsing…":"Parse"}
          </button>
          {selectedFile&&<span style={{fontSize:12,color:"#666"}}>{selectedFile.name} ({Math.round(selectedFile.size/1024)} KB)</span>}
        </div>

        {err&&<div style={styles.err}>{err}</div>}
        {ok&&<div style={styles.ok}>{ok}</div>}

        {parsed&&<div>
          <div style={styles.statRow}>
            <div style={styles.stat}><div style={styles.statLabel}>Total</div><div style={styles.statValue}>{parsed.stats.total}</div></div>
            <div style={styles.stat}><div style={styles.statLabel}>Individual</div><div style={styles.statValue}>{parsed.stats.individual}</div></div>
            <div style={styles.stat}><div style={styles.statLabel}>Entity</div><div style={styles.statValue}>{parsed.stats.entity}</div></div>
            <div style={styles.stat}><div style={styles.statLabel}>Vessel</div><div style={styles.statValue}>{parsed.stats.vessel}</div></div>
          </div>
          <div style={styles.statRow}>
            <div style={styles.stat}><div style={styles.statLabel}>Primary names</div><div style={styles.statValue}>{parsed.stats.primaryName}</div></div>
            <div style={styles.stat}><div style={styles.statLabel}>Aliases</div><div style={styles.statValue}>{parsed.stats.alias}</div></div>
            <div style={styles.stat}><div style={styles.statLabel}>Original script</div><div style={styles.statValue}>{parsed.stats.originalScript}</div></div>
          </div>
          {phase==="ready"&&<div style={{marginTop:10}}>
            <button style={styles.primary} onClick={onConfirm}>Confirm — replace list with these {parsed.stats.total} records</button>
          </div>}
          {phase==="inserting"&&<div>
            <div style={{fontSize:12,color:"#666",marginTop:10}}>Inserting… {insertProgress}%</div>
            <div style={styles.progress}><div style={{...styles.progressFill,width:insertProgress+"%"}}/></div>
          </div>}
        </div>}
      </div>
    </div>
  </div>;
}
