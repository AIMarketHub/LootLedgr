// LootLedger — read-only legal-document viewer.
// Used by:
//   • Signup screen (clickwrap link clicks before account exists)
//   • Settings → Account section (View ToS / View Privacy links)
//   • RequireLegalAcceptance gate (re-acceptance modal renders both
//     docs inline)
//
// The behaviour:
//   • If a current approved version exists in settings, render that.
//   • If no current approved version exists, render the in-app
//     default template text. The synthesized version object carries
//     version="default" so the consumer (signup checkbox, gate) can
//     stamp the user's acceptance with the literal string "default".
//
// This is the canonical way to "show me what this user is agreeing
// to" — reused by every surface that needs a read-only render.

import React from "react";
import {T,c} from "../theme.js";
import {Modal} from "../components/ui";
import {PrivacyPolicyRender} from "./PrivacyPolicyPdf.jsx";
import {TermsOfServiceRender} from "./TermsOfServicePdf.jsx";
import {buildDefaults as buildPrivacyDefaults} from "../lib/legal/privacyPolicyDefaults.js";
import {buildDefaults as buildTosDefaults} from "../lib/legal/termsOfServiceDefaults.js";

// Build a synthetic version object that the existing *Render
// components can consume. version="default" + null approval
// metadata signals to the cover page that this is the in-app
// default template, not a published approved version.
function syntheticDefault(kind,settings){
  const data=kind==="tos"?buildTosDefaults(settings||{}):buildPrivacyDefaults(settings||{});
  return{
    version:"default",
    savedAt:null,
    savedBy:null,
    approvedAt:null,
    approvedBy:null,
    data,
  };
}

// Pick the version to render for the requested kind. When the
// shop's settings carry an approved currentVersion, render that;
// otherwise synthesize a default.
export function getDisplayVersion(kind,settings){
  const key=kind==="tos"?"termsOfService":"privacyPolicy";
  const prog=(settings&&settings[key])||{};
  const versions=Array.isArray(prog.versions)?prog.versions:[];
  const current=prog.currentVersion?versions.find(v=>v.version===prog.currentVersion):null;
  if(current)return current;
  return syntheticDefault(kind,settings);
}

export default function LegalDocsViewer({kind,settings,onClose}){
  const version=getDisplayVersion(kind,settings);
  const shopName=(settings&&settings.businessName)||"LootLedger";
  const title=kind==="tos"?"📜 Terms of Service":"🔒 Privacy Policy";
  const isDefault=version.version==="default";
  return <Modal title={title+(isDefault?" — Default template":" v"+version.version)} onClose={onClose} wide>
    {isDefault&&<div style={{...c.bnr("info"),marginBottom:14,fontSize:11,lineHeight:1.5}}>
      This is the default in-app template. The shop has not yet approved a customised version. Once a customised version is approved, that version will appear here instead.
    </div>}
    {kind==="tos"
      ?<TermsOfServiceRender version={version} shopName={shopName}/>
      :<PrivacyPolicyRender version={version} shopName={shopName}/>}
    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:14,position:"sticky",bottom:0,padding:"12px 0",background:T.bg,borderTop:"1px solid "+T.border}}>
      <button style={c.bsm()} onClick={onClose}>Close</button>
    </div>
  </Modal>;
}
