// LootLedger — external integrations.
// Mechanically extracted from src/App.tsx during Phase 2 step 5
// (briefing §7.3). No semantic changes; bodies preserved verbatim.
//
// The original implementations were component methods that closed
// over `settings` (and, in two places, `pop` for inline toast
// updates). The extraction makes those dependencies explicit:
//   - `settings` is the first argument of every exported function.
//   - sendEftpos takes an optional `onProgress(msg)` callback in
//     place of the inline `pop("Payment sent to terminal…")` call.
//   - pushIntegrations returns an array of result messages instead
//     of popping internally; the caller pops the joined string.
//   - sendSquareSell now returns the same { ok, msg, level } result
//     shape as the others (it previously popped directly). Caller
//     pops the message with the supplied level. The `level` field
//     preserves the original warn/err distinction (warn for config
//     issues, err for runtime / API failures).
//
// === TIPPING-OFF RE-AUDIT (briefing §9 Gap 5, 2026-04-28) ===
// Re-walked every payload in this module after extraction. None of
// the following carries SMR / TTR / structuring / suspicious flags
// or any other internal compliance state that could leak to a
// counterparty:
//   - Square sell  (online checkout payment-link order line items)
//   - Square buy   (vendor purchase order + payment, metadata is
//                   transaction_type/invoice/supplier — no flags)
//   - Shopify sell (order with tags="loot-ledgr-sale")
//   - Shopify buy  (draft_order with tags="vendor-purchase,
//                   loot-ledgr"; note_attributes are
//                   transaction_type/invoice/supplier)
//   - Generic webhookUrl (event/invoice/items/total/payment/net)
//   - Square Terminal EFTPOS (amount + device_id only)
//   - Linkly / PC-EFTPOS (TxnType + AmtPurchase + TxnRef only)
//   - Duress SMS providers (Textbelt / webhook / Twilio / sms: URI)
//     — webhook payload is type=DURESS_ALERT + message + business
//     metadata; no transaction or compliance fields.
// Confirmed clean. Re-run this audit on any new external integration
// that lands in this module.

import {sN,sS,uid,nowISO} from "./utils.js";

export async function sendSquareSell(settings,sells){
  if(!settings.squareToken||!settings.squareLoc)return{ok:false,level:"warn",msg:"Configure Square in Settings."};
  if(!(sells&&sells.length))return{ok:false,level:"warn",msg:"No sell items."};
  try{const r=await fetch("https://connect.squareup.com/v2/online-checkout/payment-links",{method:"POST",headers:{"Content-Type":"application/json","Square-Version":"2024-11-20","Authorization":"Bearer "+settings.squareToken},body:JSON.stringify({idempotency_key:uid(),checkout_options:{redirect_url:settings.squareRedirect||window.location.href},order:{location_id:settings.squareLoc,line_items:sells.map(i=>({name:("[SALE] "+sS(i.product&&i.product.label)).slice(0,500),quantity:"1",base_price_money:{amount:Math.round(sN(i.price)*100),currency:"AUD"}}))}})});const d=await r.json();if(d.payment_link&&d.payment_link.url){window.open(d.payment_link.url,"_blank");return{ok:true,level:"ok",msg:"Square checkout opened."};}return{ok:false,level:"err",msg:"Square error: "+sS(d.errors&&d.errors[0]&&d.errors[0].detail||"Unknown")};}catch(e){return{ok:false,level:"err",msg:"Square sell: "+e.message};}
}

export async function sendSquareBuy(settings,invNo,buyItems,totalAmt,clientName,payMethod){
  if(!settings.squareToken||!settings.squareLoc)return{ok:false,msg:"Square not configured"};
  try{
    const hdrs={"Content-Type":"application/json","Square-Version":"2024-11-20","Authorization":"Bearer "+settings.squareToken};
    const _or=await fetch("https://connect.squareup.com/v2/orders",{method:"POST",headers:hdrs,body:JSON.stringify({idempotency_key:"buy-"+invNo,order:{location_id:settings.squareLoc,reference_id:"LL-BUY-"+invNo,note:"VENDOR PURCHASE | Loot #"+invNo+" | "+sS(clientName||"Walk-in"),line_items:(buyItems||[]).map(i=>({name:("[PURCHASE] "+sS(i.product&&i.product.label)).slice(0,500),quantity:"1",note:sS(i.note),base_price_money:{amount:Math.round(sN(i.price)*100),currency:"AUD"}})),metadata:{transaction_type:"vendor_purchase",invoice:invNo,supplier:sS(clientName)}}})});const od=await _or.json();
    if(!od.order)return{ok:false,msg:"Square order error: "+sS(od.errors&&od.errors[0]&&od.errors[0].detail)};
    const srcId=payMethod==="cash"?"CASH":"EXTERNAL";
    const pd=await(await fetch("https://connect.squareup.com/v2/payments",{method:"POST",headers:hdrs,body:JSON.stringify({idempotency_key:"pay-"+invNo,source_id:srcId,order_id:od.order.id,location_id:settings.squareLoc,amount_money:{amount:Math.round(sN(totalAmt)*100),currency:"AUD"},note:"Vendor purchase #"+invNo,external_details:srcId==="EXTERNAL"?{type:"OTHER",source:"Loot Ledger"}:undefined})})).json();
    if(pd.payment&&(pd.payment.status==="COMPLETED"||pd.payment.status==="APPROVED"))return{ok:true,msg:"Square vendor expense recorded"};
    return{ok:false,msg:"Square payment error: "+sS(pd.errors&&pd.errors[0]&&pd.errors[0].detail)};
  }catch(e){return{ok:false,msg:"Square buy: "+e.message};}
}

export async function sendShopifySell(settings,invNo,sellItems,clientName){
  if(!settings.shopifyDomain||!settings.shopifyToken)return{ok:false,msg:"Shopify not configured"};
  try{const _sr=await fetch("https://"+settings.shopifyDomain+"/admin/api/2024-01/orders.json",{method:"POST",headers:{"Content-Type":"application/json","X-Shopify-Access-Token":settings.shopifyToken},body:JSON.stringify({order:{financial_status:"paid",tags:"loot-ledgr-sale",note:"Loot #"+invNo+(clientName?" | "+clientName:""),line_items:(sellItems||[]).map(i=>({title:sS(i.product&&i.product.label).slice(0,500),quantity:1,price:sN(i.price).toFixed(2)}))}})}); const d=await _sr.json();return d.order?{ok:true,msg:"Shopify sale "+sS(d.order.name)+" created"}:{ok:false,msg:"Shopify sell: "+JSON.stringify(d.errors||d)};}catch(e){return{ok:false,msg:"Shopify sell: "+e.message};}
}

export async function sendShopifyBuy(settings,invNo,buyItems,totalAmt,clientName,payMethod){
  if(!settings.shopifyDomain||!settings.shopifyToken)return{ok:false,msg:"Shopify not configured"};
  try{const _dr=await fetch("https://"+settings.shopifyDomain+"/admin/api/2024-01/draft_orders.json",{method:"POST",headers:{"Content-Type":"application/json","X-Shopify-Access-Token":settings.shopifyToken},body:JSON.stringify({draft_order:{tags:"vendor-purchase,loot-ledgr",note:"VENDOR PURCHASE | Loot #"+invNo+" | "+sS(clientName||"Walk-in"),note_attributes:[{name:"transaction_type",value:"vendor_purchase"},{name:"invoice",value:invNo},{name:"supplier",value:sS(clientName)}],line_items:(buyItems||[]).map(i=>({title:("[PURCHASE] "+sS(i.product&&i.product.label)).slice(0,500),price:sN(i.price).toFixed(2),quantity:1,requires_shipping:false}))}})}); const dd=await _dr.json();if(!dd.draft_order)return{ok:false,msg:"Shopify draft: "+JSON.stringify(dd.errors||dd)};await fetch("https://"+settings.shopifyDomain+"/admin/api/2024-01/draft_orders/"+dd.draft_order.id+"/complete.json",{method:"PUT",headers:{"Content-Type":"application/json","X-Shopify-Access-Token":settings.shopifyToken}});return{ok:true,msg:"Shopify vendor "+sS(dd.draft_order.name)};}catch(e){return{ok:false,msg:"Shopify buy: "+e.message};}
}

export async function sendEftpos(settings,amountAUD,onProgress){
  const provider=settings.eftposProvider||"none";
  if(provider==="square"){if(!settings.squareToken||!settings.squareTerminalId)return{ok:false,msg:"Square terminal not configured."};try{const r=await(await fetch("https://connect.squareup.com/v2/terminals/checkouts",{method:"POST",headers:{"Content-Type":"application/json","Square-Version":"2024-11-20","Authorization":"Bearer "+settings.squareToken},body:JSON.stringify({idempotency_key:uid(),checkout:{amount_money:{amount:Math.round(sN(amountAUD)*100),currency:"AUD"},device_options:{device_id:settings.squareTerminalId,skip_receipt_screen:false},payment_options:{autocomplete:true}}})})).json();if(r.checkout&&r.checkout.id){if(typeof onProgress==="function")onProgress("Payment sent to terminal…");await new Promise(res=>setTimeout(res,8000));const sd=await(await fetch("https://connect.squareup.com/v2/terminals/checkouts/"+r.checkout.id,{headers:{"Authorization":"Bearer "+settings.squareToken,"Square-Version":"2024-11-20"}})).json();if(sd.checkout&&sd.checkout.status==="COMPLETED")return{ok:true,msg:"EFTPOS approved"};if(sd.checkout&&sd.checkout.status==="CANCELED")return{ok:false,msg:"Payment cancelled on terminal"};return{ok:false,msg:"Terminal status: "+sS(sd.checkout&&sd.checkout.status)};}return{ok:false,msg:"Square terminal error: "+sS(r.errors&&r.errors[0]&&r.errors[0].detail)};}catch(e){return{ok:false,msg:"Square terminal: "+e.message};}}
  if(provider==="linkly"){const base=settings.linklyBaseUrl||"http://localhost:4242";try{const r=await(await fetch(base+"/api/v1/transaction",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({TxnType:"P",AmtPurchase:Math.round(sN(amountAUD)*100),AmtCash:0,TxnRef:uid().slice(0,16),CurrencyCode:"AUD",CutReceipt:"0",PurchaseAnalysisData:{}})})).json();const rp=r.Response||r;if(rp.Success||rp.ResponseCode==="00")return{ok:true,msg:"EFTPOS approved. Auth: "+sS(rp.AuthCode||"—")};return{ok:false,msg:"EFTPOS declined: "+sS(rp.ResponseText||rp.ResponseCode)};}catch(e){return{ok:false,msg:e.message&&e.message.includes("fetch")?"Cannot reach Linkly. Is PC-EFTPOS running?":"Linkly: "+e.message};}}
  return{ok:false,msg:"No EFTPOS provider configured in Settings → Integrations."};
}

export async function sendDuressSMS(settings,contact,msg){
  const p=settings.smsProvider||"sms_uri";
  const jP=(url,b)=>fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
  if(p==="textbelt"){try{const d=await(await jP("https://textbelt.com/text",{phone:contact,message:msg,key:settings.textbeltKey||"textbelt"})).json();return d.success?{ok:true,msg:"Sent via Textbelt"}:{ok:false,msg:"Textbelt: "+sS(d.error||"quota exceeded")};}catch(e){return{ok:false,msg:"Textbelt: "+e.message};}}
  if(p==="webhook"){if(!settings.duressWebhookUrl)return{ok:false,msg:"Webhook URL not configured"};try{const r=await jP(settings.duressWebhookUrl,{type:"DURESS_ALERT",message:msg,contact,contacts:[contact],address:sS(settings.address),business:sS(settings.businessName),timestamp:nowISO()});return r.ok?{ok:true,msg:"Sent via webhook"}:{ok:false,msg:"Webhook error: "+r.status};}catch(e){return{ok:false,msg:"Webhook: "+e.message};}}
  if(p==="twilio_fn"){if(!settings.twilioFnUrl)return{ok:false,msg:"Twilio Function URL not configured"};try{const r=await fetch(settings.twilioFnUrl,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"contact="+encodeURIComponent(contact)+"&message="+encodeURIComponent(msg)});const d=await r.json().catch(()=>({}));return d.sent||r.ok?{ok:true,msg:"Sent via Twilio"}:{ok:false,msg:"Twilio error"};}catch(e){return{ok:false,msg:"Twilio: "+e.message};}}
  window.open("sms:"+contact+"?body="+encodeURIComponent(msg));return{ok:true,msg:"SMS app opened for "+contact};
}

export async function pushIntegrations(settings,tx){
  const msgs=[],buys=(tx.items||[]).filter(i=>i.mode==="buy"),sells=(tx.items||[]).filter(i=>i.mode==="sell");
  if(settings.squareToken&&settings.squareLoc&&buys.length&&tx.buyTotal>0){const r=await sendSquareBuy(settings,tx.id,buys,tx.buyTotal,tx.client&&tx.client.fullName,tx.payment);msgs.push("Square: "+(r.ok?"✓ "+r.msg:"✗ "+r.msg));}
  if(settings.shopifyDomain&&settings.shopifyToken){if(buys.length&&tx.buyTotal>0){const r=await sendShopifyBuy(settings,tx.id,buys,tx.buyTotal,tx.client&&tx.client.fullName,tx.payment);msgs.push("Shopify: "+(r.ok?"✓ "+r.msg:"✗ "+r.msg));}if(sells.length&&tx.sellTotal>0){const r=await sendShopifySell(settings,tx.id,sells,tx.client&&tx.client.fullName);msgs.push("Shopify: "+(r.ok?"✓ "+r.msg:"✗ "+r.msg));}}
  if(settings.webhookUrl){try{await fetch(settings.webhookUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:"transaction",invoice:tx.id,date:tx.date,buy:{items:buys.map(i=>({label:sS(i.product&&i.product.label),price:i.price})),total:tx.buyTotal},sell:{items:sells.map(i=>({label:sS(i.product&&i.product.label),price:i.price})),total:tx.sellTotal},payment:tx.payment,net:tx.net})});msgs.push("Webhook: ✓ pushed");}catch(e){msgs.push("Webhook: ✗ "+e.message);}}
  return msgs;
}
