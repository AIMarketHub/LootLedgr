// LootLedger — RequireLegalAcceptance gate.
// Pre-launch (2026-05-06). Sits between RequireAuth and the App,
// inside Router.jsx. After auth + trial gates pass, this gate
// compares the signed-in user's stamped acceptance versions
// against the shop's current approved Terms of Service and
// Privacy Policy. If either is out of sync, it blocks the app
// behind a re-acceptance modal until the user re-accepts.
//
// The gate is best-effort:
//   • If the settings fetch fails (e.g. RLS hiccup, network),
//     the gate fails open — the user gets through to the app
//     rather than being locked out by a transient error. Failing
//     closed would risk locking out a legitimate user during an
//     outage.
//   • If neither doc has any approved version yet (current is
//     null on both), the gate is a no-op — there's nothing for
//     the user to accept beyond what they already accepted at
//     signup.
//   • If a doc's currentVersion equals the user's accepted
//     version, that doc is treated as in-sync.
//   • If the user has no stamped version at all (accepted_at is
//     null — applies to legacy rows pre-migration 0005, or to
//     the dev test shop) AND a current version exists, the gate
//     prompts. This is the catch-up path for pre-migration users.

import React,{useEffect,useState,useCallback} from "react";
import {useAuth} from "./AuthProvider.jsx";
import {getCurrentLegalDocumentVersions,recordLegalAcceptance} from "../lib/auth/saas.js";
import {sb} from "../lib/storage.js";
import LegalDocsViewer from "../modals/LegalDocsViewer.jsx";

const styles={
  scrim:{position:"fixed",inset:0,background:"#000000e0",zIndex:1500,display:"flex",alignItems:"center",justifyContent:"center",padding:16,fontFamily:"system-ui"},
  card:{background:"#0d1410",color:"#e8e3d8",border:"1px solid #2a3530",borderRadius:8,padding:24,maxWidth:520,width:"100%",boxShadow:"0 12px 36px #000c"},
  h:{fontSize:18,fontWeight:"bold",color:"#e8d18a",marginBottom:8},
  sub:{fontSize:12,color:"#9aa39e",marginBottom:18,lineHeight:1.5},
  row:{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14},
  link:{background:"none",border:"none",color:"#e8d18a",fontSize:12,textDecoration:"underline",cursor:"pointer",padding:0},
  ack:{display:"flex",alignItems:"flex-start",gap:8,fontSize:12,marginBottom:18,cursor:"pointer",lineHeight:1.5,color:"#e8e3d8"},
  primary:{background:"#e8d18a",color:"#0d1410",border:"none",borderRadius:6,padding:"10px 18px",fontSize:13,fontWeight:"bold",cursor:"pointer"},
  primaryDisabled:{background:"#3a3a35",color:"#666",border:"none",borderRadius:6,padding:"10px 18px",fontSize:13,cursor:"not-allowed"},
  loading:{padding:"40vh 24px 0",textAlign:"center",color:"#9aa39e",fontFamily:"system-ui"},
  err:{padding:"40vh 24px 0",textAlign:"center",color:"#e8d18a",fontFamily:"system-ui"},
};

export default function RequireLegalAcceptance({children}){
  const{userRecord,refresh,loading:authLoading}=useAuth();
  const[checked,setChecked]=useState(false);
  const[currentVersions,setCurrentVersions]=useState({termsVersion:null,privacyVersion:null});
  const[settingsForViewer,setSettingsForViewer]=useState(null);
  const[viewerKind,setViewerKind]=useState(null);
  const[ack,setAck]=useState(false);
  const[saving,setSaving]=useState(false);
  const[err,setErr]=useState("");

  const probe=useCallback(async()=>{
    try{
      const[v,s]=await Promise.all([
        getCurrentLegalDocumentVersions(),
        // Fetch settings for the viewer to render the actual
        // current-version data. The viewer renders the user's
        // shop's customised versions, not the in-app defaults.
        sb.loadSettings().catch(()=>null),
      ]);
      setCurrentVersions(v||{termsVersion:null,privacyVersion:null});
      setSettingsForViewer(s||{});
    }catch(_){
      // Failure is fail-open — let the user through with default
      // versions assumed in-sync. The next session refresh will
      // try again.
      setCurrentVersions({termsVersion:null,privacyVersion:null});
      setSettingsForViewer({});
    }finally{
      setChecked(true);
    }
  },[]);

  useEffect(()=>{
    if(authLoading||!userRecord){setChecked(false);return;}
    probe();
  },[authLoading,userRecord,probe]);

  if(authLoading||!checked){
    return <div style={styles.loading}>Loading…</div>;
  }

  // Decide whether the gate should fire. Re-evaluated every render
  // because currentVersions / userRecord may change after a
  // re-acceptance.
  const tosOutOfSync=!!currentVersions.termsVersion&&currentVersions.termsVersion!==(userRecord&&userRecord.terms_version_accepted);
  const privacyOutOfSync=!!currentVersions.privacyVersion&&currentVersions.privacyVersion!==(userRecord&&userRecord.privacy_policy_version_accepted);

  if(!tosOutOfSync&&!privacyOutOfSync)return children;

  const onAccept=async()=>{
    setErr("");
    if(!ack)return;
    setSaving(true);
    const r=await recordLegalAcceptance({
      termsVersion:tosOutOfSync?currentVersions.termsVersion:undefined,
      privacyPolicyVersion:privacyOutOfSync?currentVersions.privacyVersion:undefined,
    });
    setSaving(false);
    if(!r.ok){setErr(r.error||"Could not record acceptance.");return;}
    // Re-pull the auth context so userRecord carries the new
    // accepted versions; the gate then becomes a no-op.
    await refresh();
  };

  // Build a friendly summary of what's being accepted.
  const docList=[];
  if(tosOutOfSync)docList.push({kind:"tos",label:"Terms of Service",version:currentVersions.termsVersion});
  if(privacyOutOfSync)docList.push({kind:"privacy",label:"Privacy Policy",version:currentVersions.privacyVersion});

  return <>
    <div style={styles.scrim}>
      <div style={styles.card}>
        <div style={styles.h}>📋 Updated terms — your acceptance required</div>
        <div style={styles.sub}>
          The {docList.length===2?"following documents have":"following document has"} changed since you last accepted.
          You need to read and accept the current version{docList.length===2?"s":""} to continue using the app.
        </div>
        <div style={styles.row}>
          {docList.map(d=>(
            <button key={d.kind} style={styles.link} onClick={()=>setViewerKind(d.kind)}>
              📄 View {d.label} (v{d.version})
            </button>
          ))}
        </div>
        <label style={styles.ack}>
          <input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} style={{marginTop:3}}/>
          <span>I have read and agree to the current version{docList.length===2?"s":""} of the {docList.map(d=>d.label).join(" and ")}.</span>
        </label>
        {err&&<div style={{color:"#d97766",fontSize:11,marginBottom:10}}>{err}</div>}
        <button style={ack&&!saving?styles.primary:styles.primaryDisabled} onClick={onAccept} disabled={!ack||saving}>{saving?"Saving…":"Accept and continue"}</button>
      </div>
    </div>
    {viewerKind&&<LegalDocsViewer kind={viewerKind} settings={settingsForViewer} onClose={()=>setViewerKind(null)}/>}
  </>;
}
