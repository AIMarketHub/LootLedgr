// LootLedger — Platform Admin / TFS list management.
// Phase 5.2-PRE-2 v2 (2026-05-11). Ported from
// src/screens/admin/TfsListAdmin.jsx. The page header / nav
// / sign-out is stripped (PlatformShell provides those);
// the body is otherwise the same: DFAT warning, current
// metadata card, file picker, parse, confirm-replace,
// progress bar.
//
// Behaviour identical: replaces the global tfs_list +
// tfs_list_metadata singleton, refreshes the local
// IndexedDB cache so this admin's session has the new
// data immediately. Other shops sync on next app boot.

import React,{useEffect,useState,useRef} from "react";
import {supabase} from "../../lib/auth/saas.js";
import {useAuth} from "../../components/AuthProvider.jsx";
import {parseDfatExcel} from "../../lib/tfs/parser.js";
import {replaceTfsCache} from "../../lib/tfs/storage.js";
import {formatDateTimeAU} from "../../lib/utils.js";
import {translateAuthError} from "../../lib/auth/errorMessages.js";

const fmtLong=iso=>iso?formatDateTimeAU(iso):"—";
function daysSince(iso){if(!iso)return null;const d=new Date(iso).getTime();if(isNaN(d))return null;return Math.floor((Date.now()-d)/(24*3600*1000));}

const styles={
  h1:{fontSize:22,margin:"0 0 16px",fontWeight:"bold"},
  link:{color:"#c9a84c",fontWeight:600,textDecoration:"none"},
  card:{background:"#fff",border:"1px solid #ddd",borderRadius:6,padding:16,marginBottom:14},
  cardTitle:{fontSize:11,letterSpacing:"0.06em",textTransform:"uppercase",color:"#666",fontWeight:"bold",marginBottom:10},
  meta:{fontSize:13,lineHeight:1.7,color:"#222"},
  metaLabel:{display:"inline-block",minWidth:160,color:"#666",fontSize:12},
  fileRow:{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:10},
  fileBtn:{padding:"8px 14px",background:"#c9a84c",color:"#222",border:"none",borderRadius:4,fontSize:13,fontWeight:"bold",cursor:"pointer",fontFamily:"inherit"},
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

export default function Tfs(){
  const{user}=useAuth();
  const fileInputRef=useRef(null);

  const[meta,setMeta]=useState(null);
  const[loading,setLoading]=useState(true);
  const[err,setErr]=useState("");
  const[ok,setOk]=useState("");

  const[phase,setPhase]=useState("idle");
  const[selectedFile,setSelectedFile]=useState(null);
  const[parsed,setParsed]=useState(null);
  const[insertProgress,setInsertProgress]=useState(0);

  const loadMeta=async()=>{
    setLoading(true);
    setErr("");
    const{data,error}=await supabase.from("tfs_list_metadata").select("*").eq("id",1).maybeSingle();
    if(error)setErr(translateAuthError(error.message));
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
      const okConfirm=window.confirm(
        "REPLACE the entire TFS list with "+parsed.records.length+" records from "+(selectedFile&&selectedFile.name||"the uploaded file")+"?\n\n"+
        "This wipes the existing list and inserts the new one. The previous list is not retained.\n\n"+
        "Every shop's screening cache will refresh from this on next app boot."
      );
      if(!okConfirm)return;
    }
    setErr("");setOk("");setPhase("inserting");setInsertProgress(0);

    try{
      const del=await supabase.from("tfs_list").delete().gt("id",0);
      if(del.error)throw new Error("Delete: "+translateAuthError(del.error.message));

      const BATCH=500;
      const records=parsed.records;
      for(let i=0;i<records.length;i+=BATCH){
        const slice=records.slice(i,i+BATCH);
        const ins=await supabase.from("tfs_list").insert(slice);
        if(ins.error)throw new Error("Insert at row "+i+": "+translateAuthError(ins.error.message));
        setInsertProgress(Math.round(((i+slice.length)/records.length)*100));
      }

      const metaPatch={
        id:1,
        last_updated_at:new Date().toISOString(),
        last_updated_by:(user&&user.id)||null,
        record_count:records.length,
        source_filename:selectedFile&&selectedFile.name||null,
      };
      const up=await supabase.from("tfs_list_metadata").upsert(metaPatch);
      if(up.error)throw new Error("Metadata upsert: "+translateAuthError(up.error.message));

      try{
        const PAGE=1000;
        let from=0;
        const all=[];
        while(true){
          const r=await supabase.from("tfs_list").select("*").order("id",{ascending:true}).range(from,from+PAGE-1);
          if(r.error)throw new Error("Re-fetch: "+translateAuthError(r.error.message));
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
      }catch(_){}

      setOk("Successfully replaced TFS list with "+records.length+" records.");
      setPhase("done");
      setSelectedFile(null);
      setParsed(null);
      if(fileInputRef.current)fileInputRef.current.value="";
      await loadMeta();
    }catch(e){
      setErr("Insert failed: "+translateAuthError(e.message||String(e))+" — the list is now in an inconsistent state. Re-upload to recover.");
      setPhase("ready");
    }
  };

  const ageDays=meta&&daysSince(meta.last_updated_at);
  const stale=ageDays!=null&&ageDays>35;

  return <>
    <h1 style={styles.h1}>TFS Consolidated List</h1>

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
  </>;
}
