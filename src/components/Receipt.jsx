// LootLedger — Receipt component.
// Phase 2.7 follow-up (2026-04-30) — replaces the legacy
// makeReceiptFn .txt rendering with a properly formatted HTML
// receipt that can be printed via window.print() or downloaded as
// HTML. Used in three places:
//
//   1. NewTx Done step — rendered in a `.receipt-print-only` div
//      so the print stylesheet (src/index.css @media print) shows
//      ONLY the receipt when window.print() fires from the
//      Complete-Transaction → Print path.
//   2. History receipt modal — rendered as the modal body; same
//      print stylesheet supports a Print button there too.
//   3. History receipt modal Download — grabs this component's
//      live DOM via document.querySelector('.receipt-print-area')
//      and wraps it in a minimal HTML document for download as
//      `receipt-<id>.html`. Customers can open in any browser to
//      print or save as PDF themselves.
//
// Inline styles only — the receipt must look right when its DOM
// is extracted and wrapped in a fresh HTML document with no app
// stylesheet in scope. Light theme is intentional (white paper,
// black ink); the dark-themed app modal sits underneath but the
// receipt itself reads as a printable artifact.
//
// Privacy: idNumber is redacted to last-4 only. The full record
// stays in the persistent client table; the customer-facing
// receipt should not carry the unredacted ID per the briefing's
// minimum-disclosure principle.

import React from "react";

function fmt2(n){return Number(n||0).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtAUD(n){return n==null||isNaN(n)?"—":"$"+fmt2(n);}
function fmtDateTime(iso){if(!iso)return "—";try{return new Date(iso).toLocaleString("en-AU");}catch(_){return "—";}}
function redactIdNumber(num){const s=String(num==null?"":num);return s.length<=4?s:"****"+s.slice(-4);}

export default function Receipt({tx,settings}){
  if(!tx)return null;
  const s=settings||{};
  const items=Array.isArray(tx.items)?tx.items:[];
  const cli=tx.client||{};
  const stf=tx.staff||{};
  const dashed={border:0,borderTop:"1px dashed #000",margin:"12px 0"};
  return <div className="receipt-print-area" style={{
    fontFamily:'"Courier New",Consolas,monospace',
    color:"#000",
    background:"#fff",
    padding:"20px",
    maxWidth:"600px",
    margin:"0 auto",
    fontSize:"12px",
    lineHeight:1.4,
  }}>
    <header style={{textAlign:"center",marginBottom:14}}>
      {s.logoImg&&<img src={s.logoImg} alt="" style={{maxWidth:80,maxHeight:80,display:"block",margin:"0 auto 8px",borderRadius:"50%"}}/>}
      <h1 style={{fontSize:18,margin:"0 0 4px",fontWeight:"bold"}}>{s.businessName||"LootLedger"}</h1>
      {s.abn&&<div>ABN: {s.abn}</div>}
      {s.dealerLicenceNo&&<div>Dealer Licence: {s.dealerLicenceNo}</div>}
      {s.address&&<div>{s.address}</div>}
      {s.phone&&<div>Ph: {s.phone}</div>}
    </header>
    <hr style={dashed}/>
    <section style={{marginBottom:10}}>
      <div><strong>Transaction #:</strong> {tx.id}</div>
      <div><strong>Date:</strong> {fmtDateTime(tx.date)}</div>
      {cli.fullName&&<div><strong>Client:</strong> {cli.fullName}</div>}
      {cli.idType&&<div><strong>ID:</strong> {String(cli.idType).toUpperCase()} ending {redactIdNumber(cli.idNumber)}</div>}
      {(stf.staffName||stf.name)&&<div><strong>Operator:</strong> {stf.staffName||stf.name}</div>}
    </section>
    <hr style={dashed}/>
    <section style={{marginBottom:10}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
        <thead>
          <tr style={{borderBottom:"1px solid #000"}}>
            <th style={{textAlign:"left",padding:"4px 0"}}>Item</th>
            <th style={{textAlign:"right",padding:"4px 0"}}>Qty</th>
            <th style={{textAlign:"left",padding:"4px 0"}}>Mode</th>
            <th style={{textAlign:"right",padding:"4px 0"}}>Price</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it,i)=>(
            <tr key={i} style={{borderBottom:"1px dotted #aaa"}}>
              <td style={{padding:"4px 0"}}>{(it.product&&it.product.label)||(it.product&&it.product.cat)||"(unlabelled)"}</td>
              <td style={{textAlign:"right",padding:"4px 0"}}>{it.qty}{it.weight_g?" g":""}</td>
              <td style={{padding:"4px 0"}}>{String(it.mode||"").toUpperCase()}</td>
              <td style={{textAlign:"right",padding:"4px 0"}}>{fmtAUD(it.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
    <hr style={dashed}/>
    <section style={{marginBottom:10}}>
      {Number(tx.buyTotal||0)>0&&<div>Buy Total: {fmtAUD(tx.buyTotal)}</div>}
      {Number(tx.sellTotal||0)>0&&<div>Sell Total: {fmtAUD(tx.sellTotal)}</div>}
      <div style={{marginTop:6,fontSize:14}}><strong>{Number(tx.net||0)>=0?"Client pays":"We pay"}: {fmtAUD(Math.abs(Number(tx.net||0)))}</strong></div>
      <div>Payment: {String(tx.payment||"").toUpperCase()}</div>
    </section>
    {tx.ttrRequired&&<div style={{padding:"6px 8px",border:"2px solid #000",fontWeight:"bold",margin:"10px 0",textAlign:"center"}}>TTR REQUIRED — filed with AUSTRAC</div>}
    <hr style={dashed}/>
    <section style={{marginTop:20,marginBottom:14}}>
      <div style={{marginBottom:30}}>
        <div>Client signature: ___________________________</div>
        <div style={{marginTop:8}}>Date: ___________________________</div>
      </div>
      <div>
        <div>Staff signature: ___________________________</div>
        <div style={{marginTop:8}}>Date: ___________________________</div>
      </div>
    </section>
    <footer style={{textAlign:"center",fontSize:10,color:"#666",marginTop:20}}>
      <div>Retain for tax records — 7 years.</div>
      <div>Generated {new Date().toLocaleString("en-AU")}</div>
    </footer>
  </div>;
}
