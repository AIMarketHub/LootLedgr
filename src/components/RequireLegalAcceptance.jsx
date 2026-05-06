// LootLedger — RequireLegalAcceptance gate.
// Pre-launch (2026-05-06; Stage 1.D fix 2026-05-06). Sits between
// RequireAuth and the App, inside Router.jsx. After auth + trial
// gates pass, this gate enforces clickwrap acceptance of the
// current Terms of Service + Privacy Policy.
//
// Gate fires (block + show acceptance modal) when ANY of:
//   (a) user's terms_version_accepted is NULL/empty (never accepted
//       ToS — applies to pre-migration rows and the dev shop)
//   (b) user's privacy_policy_version_accepted is NULL/empty (same,
//       for Privacy Policy)
//   (c) shop's settings.termsOfService.currentVersion exists AND
//       user's accepted version ≠ shop's currentVersion (mismatch
//       after the dealer approved an updated version)
//   (d) same as (c) but for privacyPolicy
//
// Gate does NOT fire when:
//   • user has accepted both docs at any version AND shop has not
//     approved a customised version (user accepted "default" and
//     that's still what would be presented)
//   • user has accepted both docs AND user's versions match shop's
//     current versions
//
// Modal copy distinguishes two scenarios:
//   • First-time acceptance (no stamp yet on user row):
//       "To continue, you must agree to our [docs]."
//   • Version-update re-acceptance (user has accepted a previous
//     version, shop now has a newer one):
//       "Our [docs] [has|have] been updated. Please review and re-
//        accept to continue."
//   When both signals apply (one doc first-time + other doc
//   version-mismatch), the modal uses a generic combined copy.
//
// On Accept, stamp:
//   • users.terms_version_accepted = shop's current version, or
//     "default" if shop has no currentVersion
//   • users.privacy_policy_version_accepted = same logic
//   • users.terms_accepted_at = now()
//
// Fail-open posture for the settings fetch: if loadSettings errors
// (RLS hiccup, network outage), we still let the user through if
// they've already accepted SOMETHING. This avoids locking out a
// legitimate user during a transient outage. A user with no stamp
// at all still gets prompted (the first-time branch doesn't depend
// on settings — we can stamp "default" without knowing the shop's
// current version).

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
};

// Stage 1.D follow-up — pretty-print version label in the gate's
// View buttons. Mirrors legalVersionLabel in Settings.jsx (kept
// in sync by hand; the helper is small enough that a shared lib
// import isn't worth the wiring).
//
// Returns null when no useful label can be produced — caller hides
// the parens. In the gate context, version="default" almost always
// means "first-time acceptance, no prior acceptedAt", which routes
// through the null branch and gives a clean "View Terms of
// Service" with no version label.
function versionLabel(version,acceptedAt){
  if(!version)return null;
  if(version==="default"){
    if(!acceptedAt)return null;
    const d=new Date(acceptedAt);
    if(isNaN(d.getTime()))return null;
    const dd=String(d.getDate()).padStart(2,"0");
    const mm=String(d.getMonth()+1).padStart(2,"0");
    const yy=d.getFullYear();
    return "version "+dd+"."+mm+"."+yy;
  }
  return "v"+version;
}

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
        // current-version data when one exists. The viewer falls
        // back to the in-app default template otherwise.
        sb.loadSettings().catch(()=>null),
      ]);
      setCurrentVersions(v||{termsVersion:null,privacyVersion:null});
      setSettingsForViewer(s||{});
    }catch(_){
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

  // Resolve the current state for each document. userTosAccepted /
  // userPrivacyAccepted are coerced to null on empty string so
  // (!userTosAccepted) cleanly catches both null and "".
  const userTosAccepted=(userRecord&&userRecord.terms_version_accepted)||null;
  const userPrivacyAccepted=(userRecord&&userRecord.privacy_policy_version_accepted)||null;
  const shopTosCurrent=currentVersions.termsVersion;
  const shopPrivacyCurrent=currentVersions.privacyVersion;

  // First-time = user has never accepted (NULL / empty stamp).
  // Mismatch  = shop's current version differs from user's accepted.
  // Either condition triggers the gate; both never apply at once
  // for the same doc (a first-time user can't have a mismatch).
  const tosFirstTime=!userTosAccepted;
  const privacyFirstTime=!userPrivacyAccepted;
  const tosMismatch=!!shopTosCurrent&&shopTosCurrent!==userTosAccepted;
  const privacyMismatch=!!shopPrivacyCurrent&&shopPrivacyCurrent!==userPrivacyAccepted;
  const tosNeedsAcceptance=tosFirstTime||tosMismatch;
  const privacyNeedsAcceptance=privacyFirstTime||privacyMismatch;

  if(!tosNeedsAcceptance&&!privacyNeedsAcceptance)return children;

  // What to stamp when the user clicks Accept. If the shop has
  // approved a customised version, stamp that version string;
  // otherwise stamp the literal "default" sentinel.
  const tosStampVersion=shopTosCurrent||"default";
  const privacyStampVersion=shopPrivacyCurrent||"default";

  const onAccept=async()=>{
    setErr("");
    if(!ack)return;
    setSaving(true);
    const r=await recordLegalAcceptance({
      termsVersion:tosNeedsAcceptance?tosStampVersion:undefined,
      privacyPolicyVersion:privacyNeedsAcceptance?privacyStampVersion:undefined,
    });
    setSaving(false);
    if(!r.ok){setErr(r.error||"Could not record acceptance.");return;}
    // Re-pull the auth context so userRecord carries the new
    // accepted versions; the gate re-evaluates and becomes a no-op.
    // Settings → Account reads from the same userRecord and updates
    // the same way.
    await refresh();
  };

  // Build the per-doc list with first-time/mismatch annotations
  // for the modal copy below.
  const docList=[];
  if(tosNeedsAcceptance)docList.push({kind:"tos",label:"Terms of Service",version:tosStampVersion,firstTime:tosFirstTime});
  if(privacyNeedsAcceptance)docList.push({kind:"privacy",label:"Privacy Policy",version:privacyStampVersion,firstTime:privacyFirstTime});
  const labelsJoined=docList.map(d=>d.label).join(" and ");
  const allFirstTime=docList.every(d=>d.firstTime);
  const allUpdates=docList.every(d=>!d.firstTime);

  // Two distinct copy paths per spec; mixed case (one first-time,
  // one mismatch) gets a sensible combined message.
  const headline=allFirstTime?"📋 Acceptance required":"📋 Updated terms — your acceptance required";
  const body=allFirstTime
    ?"To continue, you must agree to our "+labelsJoined+"."
    :allUpdates
      ?"Our "+labelsJoined+(docList.length===1?" has":" have")+" been updated. Please review and re-accept to continue."
      :"To continue, you must accept the latest version"+(docList.length===1?"":"s")+" of our "+labelsJoined+".";

  return <>
    <div style={styles.scrim}>
      <div style={styles.card}>
        <div style={styles.h}>{headline}</div>
        <div style={styles.sub}>{body}</div>
        <div style={styles.row}>
          {docList.map(d=>{
            // userRecord.terms_accepted_at is the single shared
            // acceptance timestamp (migration 0005). When the
            // version-to-stamp is "default" (first-time accept),
            // there's no prior acceptedAt → versionLabel returns
            // null → the parenthetical is omitted, leaving a
            // clean "📄 View Terms of Service".
            const lbl=versionLabel(d.version,userRecord&&userRecord.terms_accepted_at);
            return <button key={d.kind} style={styles.link} onClick={()=>setViewerKind(d.kind)}>
              📄 View {d.label}{lbl?" ("+lbl+")":""}
            </button>;
          })}
        </div>
        <label style={styles.ack}>
          <input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} style={{marginTop:3}}/>
          <span>I have read and agree to the {labelsJoined}.</span>
        </label>
        {err&&<div style={{color:"#d97766",fontSize:11,marginBottom:10}}>{err}</div>}
        <button style={ack&&!saving?styles.primary:styles.primaryDisabled} onClick={onAccept} disabled={!ack||saving}>{saving?"Saving…":"Accept and continue"}</button>
      </div>
    </div>
    {viewerKind&&<LegalDocsViewer kind={viewerKind} settings={settingsForViewer} onClose={()=>setViewerKind(null)}/>}
  </>;
}
