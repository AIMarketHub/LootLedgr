// LootLedger — Terms of Service PDF/HTML export.
// Mirrors src/modals/PrivacyPolicyPdf.jsx with paths swapped to
// legal/termsOfServiceDefaults + cover-page wording reframed.
//
// Two outputs: 🖨 Print (browser print → Save as PDF) and
// ⬇ Download HTML (self-contained file). Filename:
//   Terms-of-Service-v{version}-{shopName}-{date}.html

import React from "react";
import {T,c} from "../theme.js";
import {Modal} from "../components/ui";
import {sS,formatDateLong} from "../lib/utils.js";
import {SECTION_TITLES,SECTION_FIELDS,FIELD_META} from "../lib/legal/termsOfServiceDefaults.js";
import Logo from "../components/Logo.jsx";

// See AmlProgramPdf for the rationale on keeping fmtDateTime local.
const fmtLong=iso=>iso?formatDateLong(iso):"—";
function fmtDateTime(iso){if(!iso)return "—";try{return new Date(iso).toLocaleString("en-AU",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"});}catch(_){return sS(iso);}}
function safeShopName(name){return sS(name).replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"shop";}

export function TermsOfServiceRender({version,shopName}){
  if(!version)return null;
  const data=version.data||{};
  const sections=Object.keys(SECTION_TITLES);
  const dashed={border:0,borderTop:"1px dashed #000",margin:"16px 0"};
  const sectionStyle={pageBreakInside:"avoid",breakInside:"avoid",marginBottom:18};
  return <div className="receipt-print-area" style={{
    fontFamily:"Georgia, 'Times New Roman', serif",
    color:"#000",
    background:"#fff",
    padding:"24px",
    maxWidth:"800px",
    margin:"0 auto",
    fontSize:"12px",
    lineHeight:1.55,
  }}>
    <div style={{textAlign:"center",padding:"40px 0",pageBreakAfter:"always"}}>
      {/* Cover header logo — DARK variant on white printable
          surface. Custom shop uploads override via Logo component. */}
      <div style={{display:"flex",justifyContent:"center",marginBottom:24}}>
        <Logo height={80}/>
      </div>
      <div style={{fontSize:14,letterSpacing:"0.2em",color:"#666",marginBottom:24}}>TERMS OF SERVICE</div>
      <h1 style={{fontSize:28,margin:"0 0 8px",fontWeight:"bold"}}>{sS(shopName)||sS(data["s1.serviceProviderName"])||"LootLedger"}</h1>
      {data["s1.serviceProviderAbn"]&&<div style={{fontSize:13,marginBottom:6}}>ABN: {sS(data["s1.serviceProviderAbn"])}</div>}
      <div style={{margin:"32px 0",fontSize:14}}>
        <div><strong>Version {sS(version.version)}</strong></div>
        <div style={{marginTop:6}}>Effective: {fmtLong(data["s14.policyEffectiveDate"]||version.approvedAt)}</div>
        <div style={{marginTop:6}}>Approved: {fmtLong(version.approvedAt)}</div>
        {version.approvedBy&&<div style={{marginTop:6}}>Approved by: {sS(version.approvedBy)}</div>}
      </div>
      <div style={{fontSize:11,color:"#666",marginTop:24,padding:"12px",border:"1px solid #ccc"}}>
        These Terms of Service govern Your access to and use of the Service identified above. By using the Service, You agree to be bound by these Terms. Where any provision conflicts with non-excludable rights under the Australian Consumer Law, those rights prevail (see Section 14). Generated from LootLedger on {fmtDateTime(new Date().toISOString())}.
      </div>
    </div>

    {sections.map(sk=>(
      <section key={sk} style={sectionStyle}>
        <h2 style={{fontSize:16,fontWeight:"bold",margin:"0 0 12px",paddingBottom:6,borderBottom:"2px solid #000"}}>{SECTION_TITLES[sk]}</h2>
        {SECTION_FIELDS[sk].map(fk=>{
          const meta=FIELD_META[fk]||{label:fk};
          const v=data[fk];
          let display;
          if(meta.type==="checkbox")display=v?"☑ Yes":"☐ No";
          else if(v==null||String(v).trim()==="")display="—";
          else display=String(v);
          const isLong=meta.type==="textarea"||(typeof display==="string"&&display.length>80);
          return <div key={fk} style={{marginBottom:isLong?12:6,pageBreakInside:"avoid",breakInside:"avoid"}}>
            <div style={{fontSize:11,color:"#444",fontWeight:"bold",marginBottom:isLong?4:0,letterSpacing:"0.02em"}}>{meta.label}{!isLong&&": "}</div>
            <div style={{fontSize:12,color:"#000",whiteSpace:"pre-wrap",lineHeight:1.55}}>{display}</div>
          </div>;
        })}
      </section>
    ))}

    <hr style={dashed}/>
    <footer style={{textAlign:"center",fontSize:10,color:"#666",marginTop:24}}>
      <div>End of document. Australian Consumer Law non-excludable consumer guarantees apply regardless of these Terms (see Section 14).</div>
      <div>Generated {fmtDateTime(new Date().toISOString())} from LootLedger.</div>
    </footer>
  </div>;
}

function downloadFile(content,filename,mime){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([content],{type:mime||"text/plain"}));
  a.download=filename;
  a.click();
}

export default function TermsOfServicePdf({settings,pop,onClose}){
  const prog=(settings&&settings.termsOfService)||{currentVersion:null,versions:[]};
  const versions=Array.isArray(prog.versions)?prog.versions:[];
  const current=prog.currentVersion?versions.find(v=>v.version===prog.currentVersion):null;
  const shopName=current?.data?.["s1.serviceProviderName"]||settings?.businessName||"LootLedger";

  if(!current){
    return <Modal title="📄 Terms of Service — Export" onClose={onClose}>
      <div style={{...c.bnr("warn"),marginBottom:14}}>No approved version yet. Save &amp; Approve a version from the form first, then return here to export.</div>
      <button style={c.bsm()} onClick={onClose}>Close</button>
    </Modal>;
  }

  const onPrint=()=>{try{window.print();}catch(_){}};

  const onDownloadHtml=()=>{
    const node=document.querySelector(".receipt-print-area");
    if(!node){pop&&pop("Render unavailable — refresh and try again.","err");return;}
    const today=new Date().toISOString().slice(0,10);
    const filename="Terms-of-Service-v"+sS(current.version)+"-"+safeShopName(shopName)+"-"+today+".html";
    const html=
      '<!DOCTYPE html><html lang="en-AU"><head><meta charset="utf-8">'+
      '<title>Terms of Service v'+sS(current.version)+' — '+sS(shopName)+'</title>'+
      '<style>body{margin:0;background:#fff;color:#000;font-family:Georgia,"Times New Roman",serif}'+
      '@page{margin:1.5cm}'+
      'h1,h2{page-break-after:avoid}'+
      'section{page-break-inside:avoid}'+
      '</style></head><body>'+node.outerHTML+'</body></html>';
    downloadFile(html,filename,"text/html");
    pop&&pop("Downloaded "+filename,"ok");
  };

  return <Modal title={"📄 Terms of Service v"+sS(current.version)+" — Export"} onClose={onClose} wide>
    <div style={{...c.bnr("info"),marginBottom:14}}>
      Preview below. <strong>🖨 Print</strong> opens the browser print dialog (choose <em>Save as PDF</em> for a PDF). <strong>⬇ Download HTML</strong> saves a self-contained file you can open and print on any device.
    </div>
    <TermsOfServiceRender version={current} shopName={shopName}/>
    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:14,position:"sticky",bottom:0,padding:"12px 0",background:T.bg,borderTop:"1px solid "+T.border}}>
      <button style={c.btn(T.gold,T.bg)} onClick={onPrint}>🖨 Print</button>
      <button style={c.bsm(T.goldBg,T.gold)} onClick={onDownloadHtml}>⬇ Download HTML</button>
      <button style={c.bsm()} onClick={onClose}>Close</button>
    </div>
  </Modal>;
}
