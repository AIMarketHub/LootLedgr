// LootLedger — EOD (End of Day Report) modal.
//
// Day-end summary card: transaction count, buy total, sell total,
// net, plus a TTR-pending banner when applicable.
//
// Phase 5.2 Commit 1 (2026-05-15):
//   - Staff hours sub-section RELOCATED to /staff/profile → Hours
//     tab (Dashboard → 🗂 Workspace). EOD now shows a one-line
//     note pointing there. Removal authorized by the spec; the
//     hours feature is moving, not deleted.
//   - Send-to-accountant body upgraded from a flat text dump to:
//       * Rich HTML (tabled report) for html_body.
//       * Plain-text fallback for text_body.
//       * TSV block at the bottom of the plain-text for Excel
//         paste — staff can copy-paste straight into the
//         accountant's spreadsheet.
//   - New "📋 Add Invoice" button (next to Download Accounting /
//     Send to accountant) that opens the Invoice Manager form
//     inline so dealers can capture an invoice as part of the
//     EOD wrap-up.
//
// `todayTxData` is computed at the App.tsx level (a useMemo over
// txList filtered to today's date) and passed in as a prop.

import React,{useState} from "react";
import {T,c} from "../theme.js";
import {sN,sS,fmtAUD,todayStr,formatDateAU} from "../lib/utils.js";
import Modal from "../components/ui/Modal.jsx";
import {F} from "../components/ui";
import {useAuth} from "../components/AuthProvider.jsx";
import {sendEmail} from "../lib/email.js";
import InvoiceForm from "../screens/accounting/InvoiceForm.jsx";

// ────────────────────────────────────────────────────────────────
// Body builders — text + HTML + TSV
// ────────────────────────────────────────────────────────────────
// All three operate on the same {shopName, dateLabel, note, txs,
// tot} input so they stay aligned. Defensive against missing
// fields on tx records — older saved tx shapes may lack some
// fields, so every aggregation guards with sN / sS / Array.isArray.

function paymentBreakdown(txs){
  const buckets={};
  (txs||[]).forEach(t=>{
    const key=sS(t.payment||"unspecified").toLowerCase();
    if(!buckets[key])buckets[key]={count:0,buy:0,sell:0};
    buckets[key].count++;
    buckets[key].buy+=sN(t.buyTotal);
    buckets[key].sell+=sN(t.sellTotal);
  });
  return Object.keys(buckets).sort().map(k=>({key:k,...buckets[k]}));
}

function itemTypeBreakdown(txs){
  const buckets={};
  (txs||[]).forEach(t=>{
    const items=Array.isArray(t.items)?t.items:[];
    items.forEach(it=>{
      if(!it)return;
      const ttype=sS(it.product&&it.product.type||it.type||"other").toLowerCase();
      const mode=sS(it.mode||"buy").toLowerCase();
      const k=ttype+"::"+mode;
      if(!buckets[k])buckets[k]={type:ttype,mode,count:0,total:0};
      buckets[k].count++;
      buckets[k].total+=sN(it.price);
    });
  });
  return Object.values(buckets).sort((a,b)=>a.type.localeCompare(b.type)||a.mode.localeCompare(b.mode));
}

function complianceRow(txs){
  const ttrPending=(txs||[]).filter(t=>t&&t.ttrStatus==="PENDING").length;
  const tfsBlocked=(txs||[]).filter(t=>t&&(t.tfsConfirmedBlock||t.tfsBlocked)).length;
  const tfsOverride=(txs||[]).filter(t=>t&&(t.tfsOverrideApplied||t.tfsOverride)).length;
  const clientIds=new Set();
  (txs||[]).forEach(t=>{
    const id=t&&(t.clientId||(t.client&&t.client.id));
    if(id)clientIds.add(id);
  });
  return{ttrPending,tfsBlocked,tfsOverride,uniqueClients:clientIds.size};
}

function itemsRows(txs){
  const out=[];
  (txs||[]).forEach((t,txIdx)=>{
    const items=Array.isArray(t.items)?t.items:[];
    items.forEach(it=>{
      if(!it)return;
      const label=sS(it.label||(it.product&&it.product.label)||"(no label)");
      const mode=sS(it.mode||"buy");
      const qty=sN(it.qty)||1;
      const total=sN(it.price);
      const unit=qty>0?total/qty:total;
      out.push({txIdx:txIdx+1,label,mode,qty,unit,total});
    });
  });
  return out;
}

function buildText({shopName,dateLabel,note,txs,tot}){
  const lines=[];
  if(note&&note.trim())lines.push(note.trim(),"");
  lines.push("End of Day Report — "+dateLabel);
  lines.push("Shop: "+shopName);
  lines.push("");
  lines.push("SUMMARY");
  lines.push("  Transactions: "+(txs||[]).length);
  lines.push("  Buy Total:    "+fmtAUD(tot.buy));
  lines.push("  Sell Total:   "+fmtAUD(tot.sell));
  lines.push("  Net:          "+fmtAUD(tot.sell-tot.buy));

  const comp=complianceRow(txs);
  if(comp.ttrPending||comp.tfsBlocked||comp.tfsOverride||comp.uniqueClients){
    lines.push("");
    lines.push("COMPLIANCE");
    lines.push("  TTR pending:    "+comp.ttrPending);
    lines.push("  TFS blocked:    "+comp.tfsBlocked);
    lines.push("  TFS override:   "+comp.tfsOverride);
    lines.push("  Unique clients: "+comp.uniqueClients);
  }

  const pay=paymentBreakdown(txs);
  if(pay.length){
    lines.push("");
    lines.push("PAYMENT METHODS");
    pay.forEach(p=>{
      lines.push("  "+p.key.padEnd(12)+" "+String(p.count).padStart(3)+"  buy "+fmtAUD(p.buy)+"  sell "+fmtAUD(p.sell));
    });
  }

  const it=itemTypeBreakdown(txs);
  if(it.length){
    lines.push("");
    lines.push("ITEM TYPES");
    it.forEach(r=>{
      lines.push("  "+(r.type+" / "+r.mode).padEnd(20)+" "+String(r.count).padStart(3)+"  "+fmtAUD(r.total));
    });
  }

  const items=itemsRows(txs);
  if(items.length){
    lines.push("");
    lines.push("ITEMS");
    items.forEach(r=>{
      lines.push("  Tx#"+r.txIdx+"  "+r.mode.toUpperCase().padEnd(5)+"  "+r.label+"  qty "+r.qty+"  "+fmtAUD(r.total));
    });
  }

  // TSV block — for Excel paste. Tab-separated, no smart quoting
  // (titles are dealer-controlled and won't contain tabs).
  const tsv=[];
  tsv.push("");
  tsv.push("------------------------------------------------------------");
  tsv.push("👇 COPY THE BLOCK BELOW AND PASTE INTO EXCEL — cells auto-populate");
  tsv.push("------------------------------------------------------------");
  tsv.push("");
  tsv.push(["Section","Key","Count","Buy AUD","Sell AUD","Total AUD"].join("\t"));
  tsv.push(["Summary","Transactions",(txs||[]).length,"","",""].join("\t"));
  tsv.push(["Summary","Buy total","",tot.buy.toFixed(2),"",""].join("\t"));
  tsv.push(["Summary","Sell total","","",tot.sell.toFixed(2),""].join("\t"));
  tsv.push(["Summary","Net","","","",(tot.sell-tot.buy).toFixed(2)].join("\t"));
  tsv.push(["Compliance","TTR pending",comp.ttrPending,"","",""].join("\t"));
  tsv.push(["Compliance","TFS blocked",comp.tfsBlocked,"","",""].join("\t"));
  tsv.push(["Compliance","TFS override",comp.tfsOverride,"","",""].join("\t"));
  tsv.push(["Compliance","Unique clients",comp.uniqueClients,"","",""].join("\t"));
  pay.forEach(p=>{
    tsv.push(["Payment",p.key,p.count,p.buy.toFixed(2),p.sell.toFixed(2),""].join("\t"));
  });
  it.forEach(r=>{
    tsv.push(["ItemType",r.type+" / "+r.mode,r.count,"","",r.total.toFixed(2)].join("\t"));
  });
  items.forEach(r=>{
    tsv.push(["Item",r.label+" (tx#"+r.txIdx+", "+r.mode+")",r.qty,"","",r.total.toFixed(2)].join("\t"));
  });
  lines.push(tsv.join("\n"));

  lines.push("");
  lines.push("--");
  lines.push(shopName);
  return lines.join("\n");
}

function htmlEscape(s){
  return String(s==null?"":s)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function buildHtml({shopName,dateLabel,note,txs,tot}){
  const comp=complianceRow(txs);
  const pay=paymentBreakdown(txs);
  const it=itemTypeBreakdown(txs);
  const items=itemsRows(txs);

  const tableStyle="border-collapse:collapse;width:100%;margin:8px 0 16px 0;font-family:Arial,sans-serif;font-size:13px";
  const thStyle="background:#f5f5f5;border:1px solid #ddd;padding:6px 10px;text-align:left;color:#333";
  const tdStyle="border:1px solid #ddd;padding:6px 10px;color:#222";
  const tdNumStyle="border:1px solid #ddd;padding:6px 10px;color:#222;text-align:right";
  const sectionTitle="font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#222;margin:18px 0 4px 0;border-bottom:2px solid #c89a2f;padding-bottom:4px";

  const lines=[];
  lines.push("<div style=\"font-family:Arial,sans-serif;color:#222;max-width:680px\">");

  if(note&&note.trim()){
    lines.push("<div style=\"background:#fef9e7;border:1px solid #f5d76e;padding:10px 12px;margin-bottom:14px;border-radius:4px;white-space:pre-wrap\">"+htmlEscape(note.trim())+"</div>");
  }

  lines.push("<h2 style=\"font-size:18px;color:#222;margin:0 0 4px 0\">End of Day Report</h2>");
  lines.push("<div style=\"font-size:13px;color:#555;margin-bottom:14px\">"+htmlEscape(shopName)+" — "+htmlEscape(dateLabel)+"</div>");

  // SUMMARY table.
  lines.push("<div style=\""+sectionTitle+"\">Summary</div>");
  lines.push("<table style=\""+tableStyle+"\">");
  lines.push("<tr><th style=\""+thStyle+"\">Metric</th><th style=\""+thStyle+";text-align:right\">Value</th></tr>");
  lines.push("<tr><td style=\""+tdStyle+"\">Transactions</td><td style=\""+tdNumStyle+"\">"+(txs||[]).length+"</td></tr>");
  lines.push("<tr><td style=\""+tdStyle+"\">Buy Total</td><td style=\""+tdNumStyle+"\">"+htmlEscape(fmtAUD(tot.buy))+"</td></tr>");
  lines.push("<tr><td style=\""+tdStyle+"\">Sell Total</td><td style=\""+tdNumStyle+"\">"+htmlEscape(fmtAUD(tot.sell))+"</td></tr>");
  lines.push("<tr><td style=\""+tdStyle+";font-weight:bold\">Net</td><td style=\""+tdNumStyle+";font-weight:bold\">"+htmlEscape(fmtAUD(tot.sell-tot.buy))+"</td></tr>");
  lines.push("</table>");

  // COMPLIANCE.
  if(comp.ttrPending||comp.tfsBlocked||comp.tfsOverride||comp.uniqueClients){
    lines.push("<div style=\""+sectionTitle+"\">Compliance</div>");
    lines.push("<table style=\""+tableStyle+"\">");
    lines.push("<tr><th style=\""+thStyle+"\">Check</th><th style=\""+thStyle+";text-align:right\">Count</th></tr>");
    lines.push("<tr><td style=\""+tdStyle+"\">TTR pending</td><td style=\""+tdNumStyle+(comp.ttrPending>0?";color:#c00;font-weight:bold":"")+"\">"+comp.ttrPending+"</td></tr>");
    lines.push("<tr><td style=\""+tdStyle+"\">TFS blocked</td><td style=\""+tdNumStyle+"\">"+comp.tfsBlocked+"</td></tr>");
    lines.push("<tr><td style=\""+tdStyle+"\">TFS override applied</td><td style=\""+tdNumStyle+"\">"+comp.tfsOverride+"</td></tr>");
    lines.push("<tr><td style=\""+tdStyle+"\">Unique clients</td><td style=\""+tdNumStyle+"\">"+comp.uniqueClients+"</td></tr>");
    lines.push("</table>");
  }

  // PAYMENT METHODS.
  if(pay.length){
    lines.push("<div style=\""+sectionTitle+"\">Payment Methods</div>");
    lines.push("<table style=\""+tableStyle+"\">");
    lines.push("<tr><th style=\""+thStyle+"\">Method</th><th style=\""+thStyle+";text-align:right\">Count</th><th style=\""+thStyle+";text-align:right\">Buy</th><th style=\""+thStyle+";text-align:right\">Sell</th></tr>");
    pay.forEach(p=>{
      lines.push("<tr>"
        +"<td style=\""+tdStyle+"\">"+htmlEscape(p.key)+"</td>"
        +"<td style=\""+tdNumStyle+"\">"+p.count+"</td>"
        +"<td style=\""+tdNumStyle+"\">"+htmlEscape(fmtAUD(p.buy))+"</td>"
        +"<td style=\""+tdNumStyle+"\">"+htmlEscape(fmtAUD(p.sell))+"</td>"
        +"</tr>");
    });
    lines.push("</table>");
  }

  // ITEM TYPES.
  if(it.length){
    lines.push("<div style=\""+sectionTitle+"\">Item Types</div>");
    lines.push("<table style=\""+tableStyle+"\">");
    lines.push("<tr><th style=\""+thStyle+"\">Type</th><th style=\""+thStyle+"\">Mode</th><th style=\""+thStyle+";text-align:right\">Count</th><th style=\""+thStyle+";text-align:right\">Total</th></tr>");
    it.forEach(r=>{
      lines.push("<tr>"
        +"<td style=\""+tdStyle+"\">"+htmlEscape(r.type)+"</td>"
        +"<td style=\""+tdStyle+"\">"+htmlEscape(r.mode)+"</td>"
        +"<td style=\""+tdNumStyle+"\">"+r.count+"</td>"
        +"<td style=\""+tdNumStyle+"\">"+htmlEscape(fmtAUD(r.total))+"</td>"
        +"</tr>");
    });
    lines.push("</table>");
  }

  // ITEMS.
  if(items.length){
    lines.push("<div style=\""+sectionTitle+"\">Items</div>");
    lines.push("<table style=\""+tableStyle+"\">");
    lines.push("<tr><th style=\""+thStyle+"\">Tx#</th><th style=\""+thStyle+"\">Mode</th><th style=\""+thStyle+"\">Label</th><th style=\""+thStyle+";text-align:right\">Qty</th><th style=\""+thStyle+";text-align:right\">Unit</th><th style=\""+thStyle+";text-align:right\">Total</th></tr>");
    items.forEach(r=>{
      lines.push("<tr>"
        +"<td style=\""+tdStyle+"\">"+r.txIdx+"</td>"
        +"<td style=\""+tdStyle+"\">"+htmlEscape(r.mode)+"</td>"
        +"<td style=\""+tdStyle+"\">"+htmlEscape(r.label)+"</td>"
        +"<td style=\""+tdNumStyle+"\">"+r.qty+"</td>"
        +"<td style=\""+tdNumStyle+"\">"+htmlEscape(fmtAUD(r.unit))+"</td>"
        +"<td style=\""+tdNumStyle+"\">"+htmlEscape(fmtAUD(r.total))+"</td>"
        +"</tr>");
    });
    lines.push("</table>");
  }

  lines.push("<div style=\"font-size:11px;color:#888;margin-top:18px;padding-top:10px;border-top:1px solid #eee\">"
    +"Tip: a tab-separated copy of this report is included at the bottom of the plain-text version for direct Excel paste."
    +"</div>");

  lines.push("<div style=\"font-size:12px;color:#666;margin-top:14px\">— "+htmlEscape(shopName)+"</div>");
  lines.push("</div>");
  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────
// Modal
// ────────────────────────────────────────────────────────────────
export default function EOD({todayTxData,dlAccounting,setShowEOD,pop}){
  const auth=useAuth();
  const today=todayStr();

  // Phase 5.2-E — Send-to-accountant inline panel state.
  const[acctSendOpen,setAcctSendOpen]=useState(false);
  const[acctSendSubject,setAcctSendSubject]=useState("");
  const[acctSendNote,setAcctSendNote]=useState("");
  const[acctSendBusy,setAcctSendBusy]=useState(false);

  // Phase 5.2 Commit 1 — Add Invoice nested form.
  const[invoiceOpen,setInvoiceOpen]=useState(false);

  return <Modal title="📋 End of Day Report" onClose={()=>setShowEOD(false)}>
    {(()=>{
      const txs=todayTxData;
      const tot={buy:txs.reduce((s,t)=>s+sN(t.buyTotal),0),sell:txs.reduce((s,t)=>s+sN(t.sellTotal),0)};
      const shopName=sS((auth&&auth.shop&&auth.shop.business_name)||"Shop");
      const dateLabel=formatDateAU(today);
      const accountantEmail=(auth&&auth.shop&&auth.shop.accountant_email)||"";
      const accountantName=(auth&&auth.shop&&auth.shop.accountant_name)||"";

      const openSend=()=>{
        if(!accountantEmail){pop&&pop("Set accountant email in Settings → 💼 Accounting first.","warn");return;}
        setAcctSendSubject("["+shopName+"] End of day report — "+dateLabel);
        setAcctSendNote("");
        setAcctSendOpen(true);
      };
      const send=async()=>{
        if(!accountantEmail)return;
        setAcctSendBusy(true);
        const ctx={shopName,dateLabel,note:acctSendNote,txs,tot};
        const r=await sendEmail({
          to:accountantEmail,
          subject:acctSendSubject,
          body:buildText(ctx),
          htmlBody:buildHtml(ctx),
          replyTo:(auth&&auth.user&&auth.user.email)||null,
          template:"accountant_send_eod",
        });
        setAcctSendBusy(false);
        if(r&&r.ok){
          if(pop)pop("Email sent to "+sS(accountantName||accountantEmail)+".","ok");
          setAcctSendOpen(false);
        }else{
          if(pop)pop("Send failed: "+sS((r&&r.error)||"unknown"),"err");
        }
      };

      return <div>
        <div style={{fontSize:13,fontWeight:"bold",color:T.white,marginBottom:4}}>{new Date().toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long"})}</div>
        <div style={c.g2(10)}>
          <div style={c.card({padding:12})}><div style={c.lbl}>Transactions</div><div style={{fontSize:24,fontWeight:"bold",color:T.white}}>{txs.length}</div></div>
          <div style={c.card({padding:12})}><div style={c.lbl}>Buy Total</div><div style={{fontSize:20,fontWeight:"bold",color:T.green}}>{fmtAUD(tot.buy)}</div></div>
          <div style={c.card({padding:12})}><div style={c.lbl}>Sell Total</div><div style={{fontSize:20,fontWeight:"bold",color:T.gold}}>{fmtAUD(tot.sell)}</div></div>
          <div style={c.card({padding:12})}><div style={c.lbl}>Net</div><div style={{fontSize:20,fontWeight:"bold",color:T.white}}>{fmtAUD(tot.sell-tot.buy)}</div></div>
        </div>
        {txs.filter(t=>t.ttrStatus==="PENDING").length>0&&<div style={{...c.bnr("block"),marginTop:10}}>🔴 {txs.filter(t=>t.ttrStatus==="PENDING").length} TTR(s) pending — file with AUSTRAC Online today.</div>}

        {/* Phase 5.2 Commit 1 — staff hours UI moved to /staff. */}
        <div style={{...c.card({padding:14}),marginTop:14,borderColor:T.gold}}>
          <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:6,letterSpacing:"0.05em",textTransform:"uppercase"}}>Staff Hours</div>
          <div style={{fontSize:11,color:T.muted,lineHeight:1.5}}>
            Staff hours have moved to your staff profile. Open <strong style={{color:T.white}}>Dashboard → 🗂 Workspace → your tile → Hours</strong> to log or review hours.
          </div>
        </div>

        {/* Send-to-accountant panel + Add Invoice nested form. */}
        {acctSendOpen&&<div style={{...c.card({padding:14}),marginTop:14,borderColor:T.gold}}>
          <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,letterSpacing:"0.05em",textTransform:"uppercase"}}>📧 Send EOD to accountant</div>
          <div style={{marginBottom:8,fontSize:11,color:T.muted}}>
            Sending to <strong style={{color:T.white}}>{sS(accountantName||accountantEmail)}</strong>
            {accountantName&&accountantEmail?" <"+sS(accountantEmail)+">":""}
          </div>
          <F label="Subject" value={acctSendSubject} onChange={v=>setAcctSendSubject(v)}/>
          <div style={{marginTop:8}}>
            <label style={c.lbl}>Note (optional, prepended to body)</label>
            <textarea style={{...c.inp(),minHeight:60,resize:"vertical",fontFamily:"inherit"}} value={acctSendNote} onChange={e=>setAcctSendNote(e.target.value)} placeholder="Any context to include…"/>
          </div>
          <div style={{marginTop:8}}>
            <label style={c.lbl}>Plain-text preview (HTML body sent in parallel)</label>
            <pre style={{background:T.surface,border:"1px solid "+T.border,padding:"8px 10px",fontSize:11,overflow:"auto",maxHeight:220,whiteSpace:"pre-wrap",margin:0,fontFamily:"monospace",color:T.text}}>{buildText({shopName,dateLabel,note:acctSendNote,txs,tot})}</pre>
          </div>
          <div style={{display:"flex",gap:10,marginTop:10,justifyContent:"flex-end"}}>
            <button style={c.bsm()} onClick={()=>setAcctSendOpen(false)} disabled={acctSendBusy}>Cancel</button>
            <button style={c.btn(T.green,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={send} disabled={acctSendBusy||!acctSendSubject.trim()}>{acctSendBusy?"Sending…":"📧 Send"}</button>
          </div>
        </div>}

        {invoiceOpen&&<div style={{...c.card({padding:0}),marginTop:14,borderColor:T.gold}}>
          <InvoiceForm
            shopId={(auth&&auth.shop&&String(auth.shop.id))||null}
            userId={(auth&&auth.user&&auth.user.id)||null}
            existing={null}
            onSaved={()=>setInvoiceOpen(false)}
            onCancel={()=>setInvoiceOpen(false)}
            pop={pop}
          />
        </div>}

        <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap"}}>
          <button style={c.btn(T.gold,T.bg)} onClick={()=>{dlAccounting();setShowEOD(false);}}>📊 Download Accounting</button>
          {accountantEmail
            ?<button style={c.bsm(T.goldBg,T.gold)} onClick={openSend} disabled={acctSendOpen}>📧 Send to accountant</button>
            :<button style={c.bsm(T.border,T.muted,{cursor:"not-allowed"})} disabled title="Set accountant email in Settings → 💼 Accounting first.">📧 Send to accountant</button>}
          <button style={c.bsm(T.goldBg,T.gold)} onClick={()=>setInvoiceOpen(o=>!o)}>📋 {invoiceOpen?"Close invoice":"Add Invoice"}</button>
          <button style={c.bsm()} onClick={()=>setShowEOD(false)}>Close</button>
        </div>
      </div>;
    })()}
  </Modal>;
}
