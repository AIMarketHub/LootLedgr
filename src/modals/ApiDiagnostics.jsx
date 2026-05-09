// LootLedger — API & Diagnostics modal.
// Mechanically extracted from src/App.tsx during Phase 2 step 10b
// (briefing §7.3). No semantic changes; markup preserved verbatim.
//
// Top half: per-integration "Test Connection" buttons (Square,
// Shopify, Xero, generic webhook, spot-price API). Each fires a
// minimal probe call and pops the result. The Square / Shopify /
// Xero probes are inline here rather than going through
// integrations.js because they're connectivity tests, not
// transactional pushes — different shape and no shared logic.
//
// Bottom half: live spot/prices JSON for copy-out, plus
// Accounting CSV / TX CSV download shortcuts.
//
// Last API error is surfaced as a dismissable banner at the bottom
// of the test grid.

import React from "react";
import {T,c} from "../theme.js";
import {sS,nowISO,todayStr} from "../lib/utils.js";
import {Modal} from "../components/ui";

export default function ApiDiagnostics({
  settings,
  spotStatus,spotSource,apiError,setApiError,forceResumeAPI,
  exportPayload,dlAccounting,dlFile,txList,pop,
  setShowApi,
}){
  return <Modal title="⇄ API & Diagnostics" onClose={()=>setShowApi(false)} wide>
    <div style={{marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:"bold",color:T.white,marginBottom:12}}>Integration Tests</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{...c.card({padding:12}),display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <div>
            <div style={{fontWeight:"bold",color:T.white,fontSize:12}}>⬡ Square</div>
            <div style={{fontSize:11,color:T.muted}}>{settings.squareToken?"Key configured":"Not configured"}</div>
          </div>
          <button style={c.btn(settings.squareToken?T.gold:T.border,settings.squareToken?T.bg:T.muted,{fontSize:11,padding:"8px 14px"})} onClick={async()=>{
            if(!settings.squareToken||!settings.squareLoc){pop("Square: no token or location ID configured.","warn");return;}
            pop("Testing Square connection…","ok");
            try{
              const r=await fetch("https://connect.squareup.com/v2/locations/"+settings.squareLoc,{headers:{"Authorization":"Bearer "+settings.squareToken,"Square-Version":"2024-11-20","Content-Type":"application/json"}});
              const d=await r.json();
              if(r.ok&&d.location)pop("✓ Square OK — "+sS(d.location.name||d.location.id),"ok");
              else pop("Square error "+r.status+": "+sS((d.errors&&d.errors[0]&&d.errors[0].detail)||JSON.stringify(d).slice(0,80)),"warn");
            }catch(e){pop("Square fetch failed: "+e.message,"warn");}
          }}>Test Connection</button>
        </div>
        <div style={{...c.card({padding:12}),display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <div>
            <div style={{fontWeight:"bold",color:T.white,fontSize:12}}>🛍 Shopify</div>
            <div style={{fontSize:11,color:T.muted}}>{settings.shopifyDomain?"Domain: "+settings.shopifyDomain:"Not configured"}</div>
          </div>
          <button style={c.btn(settings.shopifyDomain?T.gold:T.border,settings.shopifyDomain?T.bg:T.muted,{fontSize:11,padding:"8px 14px"})} onClick={async()=>{
            if(!settings.shopifyDomain||!settings.shopifyToken){pop("Shopify: no domain or token configured.","warn");return;}
            pop("Testing Shopify connection…","ok");
            try{
              const r=await fetch("https://"+settings.shopifyDomain+"/admin/api/2024-01/shop.json",{headers:{"X-Shopify-Access-Token":settings.shopifyToken,"Content-Type":"application/json"}});
              const d=await r.json();
              if(r.ok&&d.shop)pop("✓ Shopify OK — "+sS(d.shop.name||d.shop.domain),"ok");
              else pop("Shopify error "+r.status+": "+sS((d.errors)||JSON.stringify(d).slice(0,80)),"warn");
            }catch(e){pop("Shopify fetch failed: "+e.message,"warn");}
          }}>Test Connection</button>
        </div>
        <div style={{...c.card({padding:12}),display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <div>
            <div style={{fontWeight:"bold",color:T.white,fontSize:12}}>📒 Xero</div>
            <div style={{fontSize:11,color:T.muted}}>{settings.xeroToken?"Token configured":"Not configured — webhook only"}</div>
          </div>
          <button style={c.btn(settings.xeroToken?T.gold:T.border,settings.xeroToken?T.bg:T.muted,{fontSize:11,padding:"8px 14px"})} onClick={async()=>{
            if(!settings.xeroToken||!settings.xeroTenantId){pop("Xero: configure token and tenant ID in Settings → Integrations.","warn");return;}
            pop("Testing Xero connection…","ok");
            try{
              const r=await fetch("https://api.xero.com/api.xro/2.0/Organisation",{headers:{"Authorization":"Bearer "+settings.xeroToken,"Xero-tenant-id":settings.xeroTenantId,"Accept":"application/json"}});
              const d=await r.json();
              if(r.ok&&d.Organisations&&d.Organisations[0])pop("✓ Xero OK — "+sS(d.Organisations[0].Name),"ok");
              else pop("Xero error "+r.status+": "+JSON.stringify(d).slice(0,80),"warn");
            }catch(e){pop("Xero fetch failed: "+e.message,"warn");}
          }}>Test Connection</button>
        </div>
        <div style={{...c.card({padding:12}),display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <div>
            <div style={{fontWeight:"bold",color:T.white,fontSize:12}}>🌐 Webhook</div>
            <div style={{fontSize:11,color:T.muted}}>{settings.webhookUrl?settings.webhookUrl.slice(0,40)+"…":"Not configured"}</div>
          </div>
          <button style={c.btn(settings.webhookUrl?T.gold:T.border,settings.webhookUrl?T.bg:T.muted,{fontSize:11,padding:"8px 14px"})} onClick={async()=>{
            if(!settings.webhookUrl){pop("Webhook: no URL configured in Settings → Integrations.","warn");return;}
            pop("Testing webhook…","ok");
            try{
              const r=await fetch(settings.webhookUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({event:"test",source:"lootledgr",timestamp:nowISO()})});
              if(r.ok)pop("✓ Webhook responded "+r.status,"ok");
              else pop("Webhook error "+r.status,"warn");
            }catch(e){pop("Webhook fetch failed: "+e.message,"warn");}
          }}>Send Test</button>
        </div>
        <div style={{...c.card({padding:12}),display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <div>
            <div style={{fontWeight:"bold",color:T.white,fontSize:12}}>📡 Spot Price API</div>
            <div style={{fontSize:11,color:T.muted}}>Status: <span style={{color:spotStatus==="live"?T.readyGreen:spotStatus==="manual"?T.gold:T.orange}}>{spotStatus}</span>{spotSource?" — "+spotSource:""}</div>
          </div>
          <button style={c.btn(T.gold,T.bg,{fontSize:11,padding:"8px 14px"})} onClick={forceResumeAPI}>↺ Refresh Prices</button>
        </div>
        {apiError&&<div style={{background:"#2a0a0a",border:"1px solid #cc3333",borderRadius:6,padding:"10px 14px",fontSize:12,color:"#ff6666",wordBreak:"break-word"}}><strong>Last API Error:</strong> {apiError}<button style={{marginLeft:10,background:"none",border:"none",color:"#ff6666",cursor:"pointer",fontSize:11}} onClick={()=>setApiError("")}>✕</button></div>}
      </div>
    </div>
    <div style={{borderTop:"1px solid "+T.border,paddingTop:14,marginBottom:14}}>
      <div style={{fontSize:12,fontWeight:"bold",color:T.white,marginBottom:8}}>Current Prices (JSON)</div>
      <pre style={{fontSize:10,fontFamily:"monospace",background:T.surface,padding:12,borderRadius:6,overflowX:"auto",color:T.text,maxHeight:160,overflow:"auto"}}>{JSON.stringify(exportPayload(),null,2)}</pre>
      <button style={c.bsm(T.goldBg,T.gold)} onClick={()=>{navigator.clipboard&&navigator.clipboard.writeText(JSON.stringify(exportPayload(),null,2));pop("Copied to clipboard.","ok");}}>📋 Copy JSON</button>
    </div>
    <div style={{borderTop:"1px solid "+T.border,paddingTop:14}}>
      <div style={{fontSize:12,fontWeight:"bold",color:T.white,marginBottom:8}}>Downloads</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button style={c.btn(T.gold,T.bg)} onClick={dlAccounting}>📊 Accounting (XLSX)</button>
        <button style={c.bsm(T.border,T.muted)} onClick={()=>{const rows=[["Invoice","Date","Client","Buy","Sell","Net","Payment","KYC","TTR","SMR"]];(txList||[]).forEach(t=>rows.push([sS(t.id),sS(t.date&&t.date.slice(0,10)),sS(t.client&&t.client.fullName),sS(t.buyTotal),sS(t.sellTotal),sS(t.net),sS(t.payment),t.kycDone?"YES":"",t.ttrRequired?"YES":"",t.smrFlagged?"YES":""]));const Q='"';const esc=v=>Q+sS(v).replace(/"/g,Q+Q)+Q;dlFile(rows.map(r=>r.map(esc).join(",")).join("\n"),"lootledger-tx-"+todayStr()+".csv","text/csv");pop("TX CSV exported.","ok");}}>⬇ TX CSV</button>
      </div>
    </div>
  </Modal>;
}
