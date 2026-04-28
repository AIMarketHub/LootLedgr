// LootLedger — NewTx screen.
// Mechanically extracted from src/App.tsx during Phase 2 step 9b
// (briefing §7.3). No semantic changes; markup preserved verbatim.
//
// The 6-step compliance transaction flow:
//   step 1 — Basket    (catalog or quick-item entry, basket table)
//   step 2 — Compliance (flags, KYC form when triggered, SMR flag)
//   step 3 — Client    (privacy ack, declaration, ID, signature)
//   step 4 — Staff     (ID-sighted, KYC checks, 168hr hold + storage)
//   step 5 — Payment   (cash/EFTPOS/card/bank/crypto + record-in)
//   step 6 — Done      (summary + finalize)
//
// This is the largest extraction in Phase 2 (briefing §7.3 step 9b
// flags it explicitly; "take it slow"). All state and callbacks
// flow in via props from App.tsx — the component is pure render.
//
// The basket-table renderer (formerly the App.tsx-local
// `basketTable` const) lives inside this component since it's only
// used here. The basket-row inline-edit state (adjId / adjVal)
// stays in App.tsx for now (per "only add, never remove") and
// flows through props; a future cleanup could lift it into
// NewTx-local state.

import React from "react";
import {T,c} from "../theme.js";
import {F,SF,HoldTimer} from "../components/ui";
import {ID_OPTIONS} from "../lib/constants.js";
import {sN,sS,uid,fmtAUD,fmtScaleWeight,addHours,nowISO} from "../lib/utils.js";
import {checkPhotoSize} from "../lib/storage.js";
import {PRIVACY_NOTICE,THRESH} from "../lib/compliance/index.js";
import {sendEftpos,sendSquareSell,sendShopifySell,sendSquareBuy,sendShopifyBuy} from "../lib/integrations.js";

export default function NewTx({
  // step / item state
  txStep,setTxStep,
  txItems,setTxItems,
  txPay,setTxPay,
  txNo,
  buyTotal,sellTotal,net,
  // compliance + identity
  compliance,
  kycDone,setKycDone,
  privAck,setPrivAck,
  idSighted,setIdSighted,
  photo,setPhoto,
  itemPhotos,setItemPhotos,
  client,setClient,
  staff,setStaff,
  // basket inline edit
  adjId,setAdjId,adjVal,setAdjVal,
  // add-item form (catalog mode)
  addId,setAddId,
  addQty,setAddQty,
  addCustom,setAddCustom,
  addNote,setAddNote,
  addMode,setAddMode,
  addProd,addUnit,addQtyN,addCalc,
  // add-item form (quick mode)
  quickMode,setQuickMode,
  qf,setQF,
  qmMode,setQMMode,
  // ambient
  catalog,settings,scaleStatus,scaleLive,fileRef,
  // helpers
  handleAddItem,handleToCompliance,handleToClient,
  resetTx,finalize,
  pop,
  // navigation
  setShowFlag,setShowCat,setScreen,
}){
  const fmtSW=r=>fmtScaleWeight(r,settings.scaleUnit||"g");
  const basketTable = txItems.length > 0 ? (
    <div style={c.card({padding:0,overflow:"hidden",marginBottom:14})}>
      <div style={c.shead(true)}>Basket — {txItems.length} item(s)</div>
      <table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr>{["Mode","Item","Price","📷","Hold","Flags",""].map(h=><th key={h} style={c.th}>{h}</th>)}</tr></thead>
        <tbody>
          {txItems.map((it,i)=>(
            <tr key={it.id} style={{background:i%2?"#ffffff04":"transparent"}}>
              <td style={c.td()}><span style={c.badge(it.mode==="buy"?T.green:T.gold)}>{it.mode.toUpperCase()}</span>{it.isQuick&&<span style={{...c.badge(T.blue,T.blueBg),marginLeft:4,fontSize:9}}>Q</span>}</td>
              <td style={c.td({color:T.white})}>{it.product&&it.product.label}{it.note&&<div style={{fontSize:10,color:T.muted}}>{it.note}</div>}</td>
              <td style={c.td()}>
                <div style={{fontWeight:"bold",color:it.mode==="buy"?T.green:T.gold}}>{fmtAUD(it.price)}</div>
                {adjId===it.id ?
                  <div style={{display:"flex",gap:4,marginTop:3,alignItems:"center"}}>
                    <input style={c.inp({width:68,padding:"3px 7px",fontSize:11})} type="number" value={adjVal} onChange={e=>setAdjVal(e.target.value)} autoFocus/>
                    <button style={c.bsm(T.greenBg,T.green)} onClick={()=>{const v=Math.max(0,sN(adjVal));if(!v){pop("Enter valid price.","warn");return;}setTxItems(p=>p.map(x=>x.id===adjId?{...x,price:v,negotiated:true}:x));setAdjId(null);setAdjVal("");}}>✓</button>
                    <button style={c.bsm()} onClick={()=>setAdjId(null)}>✕</button>
                  </div> :
                  <button style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:9,padding:"2px 4px"}} onClick={()=>{setAdjId(it.id);setAdjVal(String(it.price));}}>✎</button>}
              </td>
              <td style={c.td()}>
                {itemPhotos[it.id] ?
                  <button style={c.bsm(T.redBg,T.red)} onClick={()=>setItemPhotos(p=>{const n={...p};delete n[it.id];return n;})}>🗑</button> :
                  <label style={{...c.bsm(T.border,T.muted),display:"inline-block",cursor:"pointer",padding:"5px 9px",fontSize:11}}>📷<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{display:"none"}} onChange={e=>{const f=e.target.files&&e.target.files[0];if(!f)return;const iid=it.id;const r=new FileReader();r.onload=ev=>checkPhotoSize(ev.target.result,d=>setItemPhotos(p=>({...p,[iid]:d})));r.readAsDataURL(f);e.target.value="";}}/></label>}
              </td>
              <td style={c.td()}>{it.holdUntil?<HoldTimer holdUntil={it.holdUntil} policeHold={false}/>:<span style={{color:T.muted}}>—</span>}</td>
              <td style={c.td()}>
                <div style={{display:"flex",gap:4}}>
                  <button title="Suspicious" style={c.bsm(it.suspicious?T.orangeBg:T.border,it.suspicious?T.orange:T.muted)} onClick={()=>setTxItems(p=>p.map(x=>x.id===it.id?{...x,suspicious:!x.suspicious}:x))}>🚩</button>
                  {it.mode==="buy"&&<button title="Police hold" style={c.bsm(it.policeHold?T.redBg:T.border,it.policeHold?T.red:T.muted)} onClick={()=>setTxItems(p=>p.map(x=>x.id===it.id?{...x,policeHold:!x.policeHold}:x))}>🚔</button>}
                </div>
              </td>
              <td style={c.td()}><button style={c.bsm(T.redBg,T.red)} onClick={()=>setTxItems(p=>p.filter(x=>x.id!==it.id))}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{padding:"10px 14px",background:T.surface,display:"flex",justifyContent:"flex-end",gap:16,flexWrap:"wrap"}}>
        {buyTotal>0&&<span>Buy: <strong style={{color:T.green}}>{fmtAUD(buyTotal)}</strong></span>}
        {sellTotal>0&&<span>Sell: <strong style={{color:T.gold}}>{fmtAUD(sellTotal)}</strong></span>}
        <span>Net: <strong style={{color:net>=0?T.gold:T.green}}>{net>=0?"Client pays "+fmtAUD(net):"We pay "+fmtAUD(-net)}</strong></span>
      </div>
    </div>
  ) : null;

  return <div>
    <div style={{display:"flex",alignItems:"center",flexWrap:"wrap",gap:4,marginBottom:18}}>
      {["Basket","Compliance","Client","Staff","Payment","Done"].map((s,i)=>{const done=txStep>i+1,active=txStep===i+1;return <div key={s} style={{display:"flex",alignItems:"center"}}><div style={{padding:"5px 12px",borderRadius:4,fontSize:10,fontWeight:"bold",letterSpacing:"0.08em",background:active?T.gold:done?T.greenBg:T.surface,color:active?T.bg:done?T.green:T.muted,border:"1px solid "+(active?T.gold:done?T.green:T.border)}}>{done?"✓ ":""}{s}</div>{i<5&&<div style={{width:12,height:1,background:T.border}}/>}</div>;})}
    </div>
    {scaleStatus==="connected"&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:7,background:T.surface,border:"1px solid "+(scaleLive?T.gold:T.border),marginBottom:12}}><span style={{fontSize:16}}>⚖</span><span style={{fontSize:10,color:T.muted,flex:1}}>Scale</span><span style={{fontSize:16,fontWeight:"bold",color:scaleLive?T.gold:T.muted}}>{scaleLive?fmtSW(scaleLive):"Place item on scale…"}</span>{scaleLive&&<span style={{fontSize:9,color:T.gold}}>● LIVE</span>}</div>}

    {txStep===1&&(
      <div>
        <div style={{marginBottom:14}}><div style={{fontSize:13,fontWeight:"bold",color:T.white}}>Invoice #<span style={{color:T.gold}}>{txNo}</span></div></div>
        <div style={c.card({padding:16,marginBottom:14})}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:"bold",color:T.white,letterSpacing:"0.08em"}}>ADD ITEM TO BASKET</div>
            <div style={{display:"flex",gap:6}}>
              <button style={c.bsm(!quickMode?T.gold:T.border,!quickMode?T.bg:T.text)} onClick={()=>setQuickMode(false)}>Catalog</button>
              <button style={c.bsm(quickMode?T.blue:T.border,quickMode?T.bg:T.text)} onClick={()=>setQuickMode(true)}>⚡ Quick</button>
              {!quickMode&&<button style={c.bsm(T.border,T.muted)} onClick={()=>setShowCat(true)}>✎ Edit</button>}
            </div>
          </div>
          {!quickMode&&(
            <div style={c.g2(10)}>
              <div>
                <label style={c.lbl}>Mode</label>
                <div style={{display:"flex",gap:8}}>{["buy","sell"].map(m=><button key={m} style={c.btn(addMode===m?(m==="buy"?T.green:T.gold):T.border,addMode===m?T.bg:T.text,{padding:"6px 16px",fontSize:11})} onClick={()=>setAddMode(m)}>{m.toUpperCase()}</button>)}</div>
              </div>
              <div>
                <label style={c.lbl}>Product</label>
                {(catalog||[]).filter(p=>p.active).length===0 && <div style={c.bnr("warn")}>No products yet. Go to Prices then Edit Catalog.</div>}
                {(catalog||[]).filter(p=>p.active).length>0 && <select style={{...c.sel(),width:"100%"}} value={addId} onChange={e=>setAddId(e.target.value)}>
                    <option value="">— Select a product —</option>
                    {["Gold","Silver","Other"].map(cat=><optgroup key={cat} label={"── "+cat+" ──"}>{(catalog||[]).filter(p=>p.cat===cat&&p.active).map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>)}
                  </select>}
              </div>
              <div>
                <label style={c.lbl}>{addProd&&addProd.unit==="pc"?"Quantity":addProd&&addProd.unit==="oz"?"Weight (oz)":"Weight (g)"}{scaleStatus==="connected"&&scaleLive&&<span style={{color:T.gold,fontSize:9,marginLeft:4}}>⚖ LIVE</span>}</label>
                <div style={{display:"flex",gap:6}}>
                  <input style={{...c.inp(),flex:1}} type="number" placeholder="0" value={addQty} onChange={e=>setAddQty(e.target.value)}/>
                  {scaleStatus==="connected"&&scaleLive&&addProd&&<button style={c.bsm(T.goldBg,T.gold)} onClick={()=>{const g=scaleLive.g;setAddQty(addProd.unit==="oz"?(g/28.3495).toFixed(3):g.toFixed(3));}}>⚖ {fmtSW(scaleLive)}</button>}
                </div>
                {addProd&&addQtyN>0&&addUnit!=null&&<div style={{fontSize:12,color:addMode==="buy"?T.green:T.gold,marginTop:4,fontWeight:"bold"}}>{fmtAUD(addUnit)}/{addProd.unit} → <strong style={{fontSize:14}}>{fmtAUD(addCalc)}</strong></div>}
              </div>
              {addUnit==null&&<div>
                <label style={c.lbl}>Custom Price ($)</label>
                <input style={c.inp()} type="number" placeholder="Enter price" value={addCustom} onChange={e=>setAddCustom(e.target.value)}/>
              </div>}
              <div>
                <label style={c.lbl}>Note / Description</label>
                <input style={c.inp()} type="text" placeholder="Markings, condition, hallmarks…" value={addNote} onChange={e=>setAddNote(e.target.value)}/>
              </div>
            </div>
          )}
          {quickMode&&(
            <div>
              <div style={{...c.bnr("info"),marginBottom:10}}>⚡ <strong>Quick Item</strong> — for unlisted items. Enter details manually.</div>
              <div style={c.g2(10)}>
                <div><label style={c.lbl}>Mode</label><div style={{display:"flex",gap:8}}>{["buy","sell"].map(m=><button key={m} style={c.btn(qmMode===m?(m==="buy"?T.green:T.gold):T.border,qmMode===m?T.bg:T.text,{padding:"7px 14px"})} onClick={()=>setQMMode(m)}>{m.toUpperCase()}</button>)}</div></div>
                <div><label style={c.lbl}>Description *</label><input style={c.inp()} type="text" placeholder="e.g. Gold bracelet" value={qf.label} onChange={e=>setQF(p=>({...p,label:e.target.value}))}/></div>
                <div><label style={c.lbl}>Metal</label><select style={{...c.sel(),width:"100%"}} value={qf.cat} onChange={e=>setQF(p=>({...p,cat:e.target.value}))}><option value="Gold">Gold</option><option value="Silver">Silver</option><option value="Other">Other</option></select></div>
                <div><label style={c.lbl}>Type</label><select style={{...c.sel(),width:"100%"}} value={qf.type} onChange={e=>setQF(p=>({...p,type:e.target.value}))}><option value="scrap">Scrap / Jewellery ($10k)</option><option value="bullion">Bullion ($5k)</option></select></div>
                <div><label style={c.lbl}>Unit</label><select style={{...c.sel(),width:"100%"}} value={qf.unit} onChange={e=>setQF(p=>({...p,unit:e.target.value}))}><option value="g">Grams</option><option value="oz">Troy oz</option><option value="pc">Piece</option></select></div>
                {qf.cat==="Gold"&&<div><label style={c.lbl}>Carat</label><input style={c.inp()} type="number" placeholder="e.g. 18" value={qf.carat} onChange={e=>setQF(p=>({...p,carat:e.target.value,purity:""}))}/></div>}
                {qf.cat==="Silver"&&<div><label style={c.lbl}>Purity (0–1)</label><input style={c.inp()} type="number" step="0.001" placeholder="e.g. 0.925" value={qf.purity} onChange={e=>setQF(p=>({...p,purity:e.target.value,carat:""}))}/></div>}
                <div>
                  <label style={c.lbl}>Weight / Qty {scaleStatus==="connected"&&scaleLive&&<span style={{color:T.gold,fontSize:9,marginLeft:4}}>⚖ LIVE</span>}</label>
                  <div style={{display:"flex",gap:6}}>
                    <input style={{...c.inp(),flex:1}} type="number" placeholder="0.00" value={qf.qty} onChange={e=>setQF(p=>({...p,qty:e.target.value}))}/>
                    {scaleStatus==="connected"&&scaleLive&&<button style={c.bsm(T.goldBg,T.gold)} onClick={()=>setQF(p=>({...p,qty:scaleLive.g.toFixed(3)}))}>⚖ {fmtSW(scaleLive)}</button>}
                  </div>
                </div>
                <div><label style={c.lbl}>Price ($) *</label><input style={c.inp()} type="number" placeholder="0.00" value={qf.price} onChange={e=>setQF(p=>({...p,price:e.target.value}))}/></div>
                <div><label style={c.lbl}>Note</label><input style={c.inp()} type="text" placeholder="Condition, markings…" value={qf.note} onChange={e=>setQF(p=>({...p,note:e.target.value}))}/></div>
              </div>
              <button style={c.btn(qmMode==="buy"?T.green:T.gold,T.bg,{marginTop:10})} onClick={()=>{if(!qf.label){pop("Description required.","warn");return;}const price=Math.max(0,sN(qf.price));if(!price){pop("Enter a valid price.","warn");return;}setTxItems(p=>[...p,{id:uid(),mode:qmMode,product:{isQuick:true,label:qf.label,cat:qf.cat,type:qf.type,unit:qf.unit,purity:qf.purity?parseFloat(qf.purity):null,carat:qf.carat?parseFloat(qf.carat):null},qty:sN(qf.qty)||1,price,purity:qf.purity||null,carat:qf.carat||null,weight_g:qf.unit==="g"?sN(qf.qty)||null:null,note:qf.note,isQuick:true,holdUntil:qmMode==="buy"?addHours(nowISO(),THRESH.HOLD_HOURS):null,policeHold:false,suspicious:false}]);setQuickMode(false);setQF({label:"",cat:"Gold",type:"scrap",unit:"g",price:"",qty:"",note:"",purity:"",carat:""});pop("Quick item added.","ok");}}>⚡ Add Quick Item</button>
            </div>
          )}
          {(catalog||[]).filter(p=>p.active).length>0&&!quickMode&&<button style={c.btn(addMode==="buy"?T.green:T.gold,T.bg,{marginTop:10})} onClick={handleAddItem}>＋ Add to Basket</button>}
        </div>
        {basketTable}
        <div style={{display:"flex",gap:10}}>
          <button style={c.btn(T.gold)} onClick={handleToCompliance}>Next: Compliance →</button>
          <button style={c.bsm()} onClick={resetTx}>Reset</button>
        </div>
      </div>
    )}

    {txStep===2&&(
      <div>
        <div style={{fontSize:14,fontWeight:"bold",color:T.white,marginBottom:14}}>Compliance Check</div>
        {compliance.flags.map(f=><div key={f.key} style={c.bnr(f.level)}>{f.msg}</div>)}
        {compliance.requiresKYC&&!kycDone&&(
          <div style={c.card({padding:18,marginTop:14,borderColor:T.red+"55"})}>
            <div style={{fontSize:12,fontWeight:"bold",color:T.red,marginBottom:14}}>🔴 AUSTRAC KYC/CDD — All fields mandatory</div>
            <div style={c.g2(10)}>
              <F label="Full Legal Name" required value={client.fullName} onChange={v=>setClient(p=>({...p,fullName:v}))}/>
              <F label="Date of Birth" required type="date" value={client.dob} onChange={v=>setClient(p=>({...p,dob:v}))}/>
              <F label="Residential Address" required value={client.address} onChange={v=>setClient(p=>({...p,address:v}))}/>
              <F label="Phone" value={client.phone} onChange={v=>setClient(p=>({...p,phone:v}))}/>
              <SF label="ID Type" required value={client.idType} onChange={v=>setClient(p=>({...p,idType:v}))} options={ID_OPTIONS}/>
              <F label="ID Number" required value={client.idNumber} onChange={v=>setClient(p=>({...p,idNumber:v}))}/>
              <F label="Issuing State" value={client.idState} onChange={v=>setClient(p=>({...p,idState:v}))}/>
              <F label="ID Expiry" type="date" value={client.idExpiry} onChange={v=>setClient(p=>({...p,idExpiry:v}))}/>
            </div>
            {compliance.flags.some(f=>f.key==="ttr")&&<F label="Source of Funds" required value={client.sourceOfFunds} onChange={v=>setClient(p=>({...p,sourceOfFunds:v}))}/>}
            {compliance.flags.some(f=>f.key==="ttr")&&<F label="Source of Wealth" required value={client.sourceOfWealth} onChange={v=>setClient(p=>({...p,sourceOfWealth:v}))} placeholder="e.g. business income, savings, inheritance"/>}
            <div style={{...c.g2(12),marginTop:8}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12}}><input type="checkbox" checked={!!staff.pepCheck} onChange={e=>setStaff(p=>({...p,pepCheck:e.target.checked}))}/>PEP Check — Seller is NOT a PEP</label>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12}}><input type="checkbox" checked={!!staff.tfsCheck} onChange={e=>setStaff(p=>({...p,tfsCheck:e.target.checked}))}/>TFS Check — NOT on Sanctions List (dfat.gov.au)</label>
            </div>
            <div style={{marginTop:10}}>
              <label style={c.lbl}>Risk Rating</label>
              <select style={c.sel()} value={staff.riskRating||""} onChange={e=>setStaff(p=>({...p,riskRating:e.target.value}))}><option value="">— Select —</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
            </div>
            <button style={c.btn(T.green,T.bg,{marginTop:14})} onClick={()=>{if(!client.fullName||!client.dob||!client.idType||!client.idNumber){pop("Fill all required KYC fields.","err");return;}if(!staff.pepCheck||!staff.tfsCheck){pop("Complete PEP and TFS checks.","err");return;}if(!staff.riskRating){pop("Assign risk rating.","err");return;}setKycDone(true);pop("KYC completed.","ok");}}>✓ Mark KYC Complete</button>
          </div>
        )}
        {(kycDone||!compliance.requiresKYC)&&<div style={{...c.bnr("info"),marginTop:8}}>✓ Compliance check passed.</div>}
        <div style={{display:"flex",gap:10,marginTop:10}}>
          <button style={c.bsm(T.redBg,T.red)} onClick={()=>setShowFlag(true)}>🚩 Flag SMR (internal)</button>
          <span style={{fontSize:10,color:T.muted}}>Never disclose to customer — tipping off is a criminal offence.</span>
        </div>
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button style={c.btn(T.gold)} onClick={handleToClient}>Next: Client Form →</button>
          <button style={c.bsm()} onClick={()=>setTxStep(1)}>← Back</button>
        </div>
      </div>
    )}

    {txStep===3&&(
      <div>
        <div style={{fontSize:14,fontWeight:"bold",color:T.white,marginBottom:6}}>Client Declaration Form</div>
        <div style={{fontSize:11,color:T.muted,marginBottom:14}}>Invoice #{txNo} — retained for 7 years.</div>
        <div style={c.card({padding:14,marginBottom:14})}>
          <div style={{fontSize:11,color:T.blue,fontWeight:"bold",marginBottom:8}}>PRIVACY NOTICE</div>
          <pre style={{fontSize:10,color:T.muted,whiteSpace:"pre-wrap",fontFamily:T.ff,margin:0}}>{PRIVACY_NOTICE(settings.businessName,settings.abn)}</pre>
          <label style={{display:"flex",alignItems:"center",gap:8,marginTop:10,cursor:"pointer",fontSize:12}}><input type="checkbox" checked={privAck} onChange={e=>setPrivAck(e.target.checked)}/><strong>I HAVE READ AND UNDERSTOOD THIS NOTICE — PROCEED</strong></label>
        </div>
        <div style={c.card({padding:16,marginBottom:14})}>
          <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:12}}>SECTION 1 — TRANSACTION</div>
          <div style={c.g2(10)}>
            <F label="Date" value={new Date().toLocaleDateString("en-AU")} readOnly/>
            <F label="Contract No" value={txNo} readOnly/>
          </div>
          <div style={{marginBottom:12}}>
            <label style={c.lbl}>I am selling</label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{["Bullion (bars/coins)","Scrap / Jewellery","Mixed"].map(opt=><button key={opt} style={c.btn(client.selling===opt?T.gold:T.border,client.selling===opt?T.bg:T.text,{padding:"7px 14px",fontSize:11})} onClick={()=>setClient(p=>({...p,selling:opt}))}>{opt}</button>)}</div>
          </div>
          <div>
            <label style={c.lbl}>I wish to be paid by</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{[{v:"cash",l:"Cash (under $2,000)"},{v:"card",l:"Card"},{v:"bank",l:"Bank Transfer"},...(settings.cryptoEnabled?[{v:"crypto",l:"Cryptocurrency"}]:[])].map(opt=><button key={opt.v} style={c.btn(txPay===opt.v?T.gold:T.border,txPay===opt.v?T.bg:T.text,{padding:"7px 14px",fontSize:11})} onClick={()=>setTxPay(opt.v)}>{opt.l}</button>)}</div>
          </div>
        </div>
        <div style={c.card({padding:16,marginBottom:14})}>
          <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:12}}>SECTION 2 — ITEMS I AM SELLING</div>
          {(txItems||[]).filter(i=>i.mode==="buy").map((it,i)=>(
            <div key={it.id} style={{borderBottom:"1px solid "+T.border+"44",paddingBottom:8,marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,color:T.white,fontWeight:"bold"}}>{sS(it.product&&it.product.label)}</span><span style={{color:T.green,fontWeight:"bold"}}>{fmtAUD(it.price)}</span></div>
              <div style={{fontSize:11,color:T.muted,marginTop:2}}>{it.product&&it.product.cat} · {it.product&&it.product.carat?it.product.carat+"ct":it.product&&it.product.purity?(sN(it.product.purity)*100).toFixed(1)+"%":"—"}{it.note&&" · "+it.note}</div>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0"}}><span style={{fontSize:12,fontWeight:"bold"}}>TOTAL</span><span style={{fontSize:14,fontWeight:"bold",color:T.green}}>{fmtAUD(buyTotal)}</span></div>
          <F label="Notes (condition, markings, how acquired)" value={client.itemNotes} onChange={v=>setClient(p=>({...p,itemNotes:v}))}/>
        </div>
        <div style={c.card({padding:16,marginBottom:14})}>
          <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:12}}>SECTION 3 — MY DETAILS</div>
          <div style={c.g2(10)}>
            <F label="Full Legal Name" required value={client.fullName} onChange={v=>setClient(p=>({...p,fullName:v}))}/>
            <F label="Date of Birth" required type="date" value={client.dob} onChange={v=>setClient(p=>({...p,dob:v}))}/>
            <F label="Phone Number" value={client.phone} onChange={v=>setClient(p=>({...p,phone:v}))}/>
            <F label="Residential Address" required value={client.address} onChange={v=>setClient(p=>({...p,address:v}))}/>
          </div>
        </div>
        <div style={c.card({padding:16,marginBottom:14})}>
          <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:12}}>SECTION 4 — IDENTIFICATION</div>
          <div style={c.g2(10)}>
            <SF label="ID Type" required value={client.idType} onChange={v=>setClient(p=>({...p,idType:v}))} options={ID_OPTIONS}/>
            <F label="ID Number" required value={client.idNumber} onChange={v=>setClient(p=>({...p,idNumber:v}))}/>
            <F label="Issuing State / Country" value={client.idState} onChange={v=>setClient(p=>({...p,idState:v}))}/>
            <F label="Expiry Date" type="date" value={client.idExpiry} onChange={v=>setClient(p=>({...p,idExpiry:v}))}/>
          </div>
          <div style={{marginTop:8}}>
            <label style={c.lbl}>ID Document Photo</label>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <button style={c.btn(T.border,T.text,{padding:"8px 14px",fontSize:12})} onClick={()=>fileRef.current&&fileRef.current.click()}>📷 Capture / Upload ID</button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" style={{display:"none"}} onChange={e=>{const f=e.target.files&&e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>checkPhotoSize(ev.target.result,d=>setPhoto(d));r.readAsDataURL(f);e.target.value="";}}/>
              {photo&&<span style={c.badge(T.green)}>✓ Photo captured</span>}
            </div>
            {photo&&<img src={photo} alt="ID" style={{marginTop:8,maxWidth:200,borderRadius:6,border:"1px solid "+T.border}}/>}
          </div>
        </div>
        <div style={c.card({padding:14,marginBottom:14})}>
          <div style={{fontSize:11,color:T.text,lineHeight:1.7,marginBottom:10}}><strong>DECLARATION:</strong> I declare that all information provided is true and correct, that I am the lawful owner of the items being sold, and that I am not selling on behalf of anyone else.</div>
          <F label="Client Signature (type full name)" required value={client.signature} onChange={v=>setClient(p=>({...p,signature:v}))}/>
          <F label="Date" type="date" required value={client.signatureDate||new Date().toISOString().slice(0,10)} onChange={v=>setClient(p=>({...p,signatureDate:v}))}/>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button style={c.btn(T.gold)} onClick={()=>{if(!privAck){pop("Client must acknowledge Privacy Notice.","err");return;}if(!client.signature){pop("Client signature required.","err");return;}setTxStep(4);}}>Next: Staff Section →</button>
          <button style={c.bsm()} onClick={()=>setTxStep(2)}>← Back</button>
        </div>
      </div>
    )}

    {txStep===4&&(
      <div>
        <div style={{fontSize:14,fontWeight:"bold",color:T.white,marginBottom:6}}>Staff Compliance Section</div>
        <div style={c.card({padding:16,marginBottom:14})}>
          <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:12}}>SECTION 5 — ID VERIFICATION</div>
          <div style={c.g2(10)}>
            <F label="Staff Member Name" required value={staff.staffName} onChange={v=>setStaff(p=>({...p,staffName:v}))}/>
            <F label="Date / Time" value={new Date().toLocaleString("en-AU")} readOnly/>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,marginTop:8}}>
            <input type="checkbox" checked={idSighted} onChange={e=>setIdSighted(e.target.checked)}/>
            <strong style={{color:T.orange}}>✓ I confirm I have physically sighted the identification document presented</strong>
          </label>
        </div>
        {compliance.requiresKYC&&(
          <div style={c.card({padding:16,marginBottom:14})}>
            <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:12}}>SECTION 6 — KYC CHECKS <span style={{color:T.red}}>★ REQUIRED</span></div>
            {kycDone&&<div style={c.bnr("info")}>✓ KYC completed in Compliance step.</div>}
            <SF label="PEP Check" required value={staff.pepResult} onChange={v=>setStaff(p=>({...p,pepResult:v}))} options={[{value:"",label:"— Select —"},{value:"no",label:"No — Not a PEP"},{value:"yes",label:"PEP — refer to compliance officer"}]}/>
            <SF label="TFS Check — dfat.gov.au/sanctions" required value={staff.tfsResult} onChange={v=>setStaff(p=>({...p,tfsResult:v}))} options={[{value:"",label:"— Select —"},{value:"clear",label:"Clear — not on list"},{value:"match",label:"MATCH — escalate immediately"}]}/>
            <SF label="Risk Rating" required value={staff.riskRating} onChange={v=>setStaff(p=>({...p,riskRating:v}))} options={[{value:"",label:"— Select —"},{value:"low",label:"Low"},{value:"medium",label:"Medium"},{value:"high",label:"High"}]}/>
          </div>
        )}
        <div style={c.card({padding:16,marginBottom:14})}>
          <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:12}}>SECTION 7 — 168-HOUR SAFETY HOLD</div>
          <div style={c.bnr("warn")}>Automatic 168-hour Safety Hold applies to all bought items.</div>
          <div style={c.g2(10)}>
            <div><div style={c.lbl}>Hold Start</div><div style={{fontSize:12,color:T.white}}>{new Date().toLocaleString("en-AU")}</div></div>
            <div><div style={c.lbl}>Hold Expiry (+168 hrs)</div><div style={{fontSize:12,color:T.orange}}>{new Date(Date.now()+168*3600000).toLocaleString("en-AU")}</div></div>
          </div>
          <F label="Storage Location (bay / safe / tray)" required value={staff.storageLocation} onChange={v=>setStaff(p=>({...p,storageLocation:v}))} placeholder="e.g. Safe A, Tray 3"/>
        </div>
        <div style={{display:"flex",gap:10}}>
          <button style={c.btn(T.green,T.bg)} onClick={()=>setTxStep(5)}>Next: Payment →</button>
          <button style={c.bsm()} onClick={()=>setTxStep(3)}>← Back</button>
        </div>
      </div>
    )}

    {txStep===5&&(
      <div>
        <div style={{fontSize:13,fontWeight:"bold",color:T.white,marginBottom:14}}>Payment</div>
        <div style={c.card({padding:16,marginBottom:14})}>
          <label style={c.lbl}>Payment Method</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>
            {[{v:"cash",icon:"💵",label:"Cash"},{v:"eftpos",icon:"🖥",label:"EFTPOS"},{v:"card",icon:"💳",label:"Card Online"},{v:"bank",icon:"🏦",label:"Bank EFT"},...(settings.cryptoEnabled?[{v:"crypto",icon:"₿",label:"Crypto"}]:[])].map(opt=>(
              <button key={opt.v} onClick={()=>setTxPay(opt.v)} style={{...c.btn(txPay===opt.v?T.gold:T.border,txPay===opt.v?T.bg:T.text,{padding:"12px 16px",minWidth:80,display:"flex",flexDirection:"column",alignItems:"center",gap:3,textTransform:"none",letterSpacing:0,fontSize:11})}}>
                <span style={{fontSize:24}}>{opt.icon}</span><span style={{fontWeight:"bold"}}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{...c.card({padding:14}),marginBottom:14,textAlign:"center"}}>
          <div style={{fontSize:11,color:T.muted,marginBottom:4}}>{net>=0?"Amount to collect from client":"Amount to pay client"}</div>
          <div style={{fontSize:28,fontWeight:"bold",color:net>=0?T.gold:T.green}}>{fmtAUD(Math.abs(net))}</div>
        </div>
        {txPay==="eftpos"&&net>0&&<div style={c.card({padding:16,marginBottom:10})}>
          <div style={{fontSize:11,fontWeight:"bold",color:T.green,marginBottom:8}}>🖥 EFTPOS Terminal</div>
          <button style={{...c.btn(T.green,T.bg),width:"100%"}} onClick={async()=>{pop("Sending "+fmtAUD(net)+" to terminal…","ok");const r=await sendEftpos(settings,net,m=>pop(m,"ok"));pop(r.msg,r.ok?"ok":"err");}}>🖥 Send {fmtAUD(net)} to Terminal</button>
          <button style={{...c.bsm(T.border,T.muted),marginTop:8,width:"100%"}} onClick={()=>pop("Manual EFTPOS confirmed.","ok")}>✓ Confirm Manually</button>
        </div>}
        {txPay==="cash"&&net>=0&&<div style={c.card({padding:16,marginBottom:10})}><div style={c.bnr("info")}>💵 Collect {fmtAUD(net)} cash from client.</div><button style={{...c.btn(T.green,T.bg),marginTop:10,width:"100%"}} onClick={()=>pop("Cash received.","ok")}>✓ Cash Received</button></div>}
        {txPay==="card"&&net>=0&&<div style={c.card({padding:16,marginBottom:10})}>
          <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:8}}>💳 Card — Online Checkout</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button style={{...c.btn(T.gold,T.bg),flex:1}} onClick={async()=>{if(!settings.squareToken){pop("Square not configured.","warn");return;}try{const r=await sendSquareSell(settings,(txItems||[]).filter(i=>i.mode==="sell"));pop(r.msg,r.level||(r.ok?"ok":"err"));}catch(e){pop("Square: "+e.message,"err");}}}>⬡ Square Checkout</button>
            <button style={{...c.btn(T.border,T.text),flex:1}} onClick={async()=>{if(!settings.shopifyDomain){pop("Shopify not configured.","warn");return;}try{const r=await sendShopifySell(settings,txNo,(txItems||[]).filter(i=>i.mode==="sell"),client.fullName);pop(r.ok?"✓ "+r.msg:"✗ "+r.msg,r.ok?"ok":"err");}catch(e){pop("Shopify: "+e.message,"err");}}}>🛍 Shopify Order</button>
          </div>
          <button style={{...c.bsm(T.border,T.muted),marginTop:8,width:"100%"}} onClick={()=>pop("Card payment confirmed.","ok")}>✓ Confirm Manually</button>
        </div>}
        {txPay==="bank"&&net>=0&&<div style={c.card({padding:16,marginBottom:10})}><div style={c.bnr("info")}>🏦 Client transfers {fmtAUD(net)} to your account.</div><button style={{...c.btn(T.green,T.bg),marginTop:10,width:"100%"}} onClick={()=>pop("Bank transfer noted.","ok")}>✓ Transfer Noted</button></div>}
        {txPay==="crypto"&&net>=0&&<div style={c.card({padding:16,marginBottom:10})}>
          <div style={{fontSize:11,fontWeight:"bold",color:T.orange,marginBottom:8}}>₿ Crypto Payment</div>
          {(()=>{const COINS=[{k:"BTC",l:"Bitcoin",w:settings.walletBTC},{k:"ETH",l:"Ethereum",w:settings.walletETH},{k:"BNB",l:"Binance",w:settings.walletBNB},{k:"XRP",l:"Ripple",w:settings.walletXRP},{k:"SOL",l:"Solana",w:settings.walletSOL}].filter(x=>x.w);if(!COINS.length)return <div style={c.bnr("warn")}>No wallets configured in Settings.</div>;return COINS.map(coin=><div key={coin.k} style={{...c.card({padding:10}),marginBottom:6}}><div style={{fontWeight:"bold",color:T.gold,fontSize:11,marginBottom:4}}>{coin.k} — {coin.l}</div><div style={{fontFamily:"monospace",fontSize:10,background:T.surface,padding:"6px 8px",borderRadius:4,wordBreak:"break-all",marginBottom:6}}>{coin.w}</div><button style={c.bsm(T.goldBg,T.gold)} onClick={()=>{navigator.clipboard&&navigator.clipboard.writeText(coin.w);pop(coin.k+" copied.","ok");}}>📋 Copy</button></div>);})()}
          <button style={{...c.btn(T.green,T.bg),marginTop:8,width:"100%"}} onClick={()=>pop("Crypto received.","ok")}>✓ Crypto Received</button>
        </div>}
        {net<0&&<div style={c.card({padding:16,marginBottom:10})}><div style={c.bnr("warn")}>We pay client {fmtAUD(-net)} by {sS(txPay).toUpperCase()}.</div>{txPay==="eftpos"&&<button style={{...c.btn(T.green,T.bg),marginTop:8,width:"100%"}} onClick={async()=>{const r=await sendEftpos(settings,-net,m=>pop(m,"ok"));pop(r.msg,r.ok?"ok":"err");}}>🖥 Refund via Terminal</button>}<button style={{...c.btn(T.green,T.bg),marginTop:8,width:"100%"}} onClick={()=>pop("Client paid.","ok")}>✓ Client Paid</button></div>}
        {net===0&&<div style={c.bnr("info")}>⚖ Zero balance — no payment needed.</div>}
        <div style={c.card({padding:12,marginBottom:14})}>
          <div style={{fontSize:10,color:T.muted,marginBottom:8}}>RECORD IN</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button style={c.bsm(settings.squareToken?T.goldBg:T.surface,settings.squareToken?T.gold:T.muted)} onClick={async()=>{if(!settings.squareToken){pop("Square not configured.","warn");return;}const buys=(txItems||[]).filter(i=>i.mode==="buy"),sells=(txItems||[]).filter(i=>i.mode==="sell");if(buys.length)try{const r=await sendSquareBuy(settings,txNo,buys,buyTotal,client.fullName,txPay);pop(r.ok?"✓ "+r.msg:"✗ "+r.msg,r.ok?"ok":"err");}catch(e){pop("Square: "+e.message,"err");}if(sells.length)try{const r=await sendSquareSell(settings,sells);pop(r.msg,r.level||(r.ok?"ok":"err"));}catch(e){pop("Square sell: "+e.message,"err");}}}>⬡ Square</button>
            <button style={c.bsm(settings.shopifyDomain?T.goldBg:T.surface,settings.shopifyDomain?T.gold:T.muted)} onClick={async()=>{if(!settings.shopifyDomain){pop("Shopify not configured.","warn");return;}const buys=(txItems||[]).filter(i=>i.mode==="buy"),sells=(txItems||[]).filter(i=>i.mode==="sell");if(buys.length)try{const r=await sendShopifyBuy(settings,txNo,buys,buyTotal,client.fullName,txPay);pop(r.ok?"✓ "+r.msg:"✗ "+r.msg,r.ok?"ok":"err");}catch(e){pop("Shopify: "+e.message,"err");}if(sells.length)try{const r=await sendShopifySell(settings,txNo,sells,client.fullName);pop(r.ok?"✓ "+r.msg:"✗ "+r.msg,r.ok?"ok":"err");}catch(e){pop("Shopify: "+e.message,"err");}}}>🛍 Shopify</button>
            <button style={c.bsm(settings.xeroToken?T.goldBg:T.surface,settings.xeroToken?T.gold:T.muted)} onClick={()=>pop("Xero: configure webhook in Settings.","warn")}>📒 Xero</button>
          </div>
        </div>
        <button style={{...c.btn(T.gold,T.bg),width:"100%"}} onClick={()=>setTxStep(6)}>Next: Finalise →</button>
      </div>
    )}

    {txStep===6&&(
      <div>
        <div style={c.card({padding:16,marginBottom:14,borderLeft:"4px solid "+T.gold})}>
          <div style={{fontSize:12,fontWeight:"bold",color:T.gold,marginBottom:12}}>📋 TRANSACTION SUMMARY</div>
          <div style={c.g2(10)}>
            <div><div style={c.lbl}>Invoice #</div><div style={{color:T.gold,fontWeight:"bold",fontSize:14}}>{txNo}</div></div>
            <div><div style={c.lbl}>Client</div><div style={{color:T.white}}>{client.fullName}</div></div>
            <div><div style={c.lbl}>Payment</div><div style={{textTransform:"uppercase"}}>{txPay}</div></div>
            {buyTotal>0&&<div><div style={c.lbl}>Buy Total</div><div style={{color:T.green,fontWeight:"bold"}}>{fmtAUD(buyTotal)}</div></div>}
            {sellTotal>0&&<div><div style={c.lbl}>Sell Total</div><div style={{color:T.gold,fontWeight:"bold"}}>{fmtAUD(sellTotal)}</div></div>}
            <div><div style={c.lbl}>Net</div><div style={{fontWeight:"bold",color:net>=0?T.gold:T.green,fontSize:16}}>{net>=0?"Client pays "+fmtAUD(net):"We pay "+fmtAUD(-net)}</div></div>
          </div>
          {compliance.flags.some(f=>f.key==="ttr")&&<div style={{...c.bnr("block"),marginTop:10}}>🔴 TTR required — file with AUSTRAC Online within 10 business days.</div>}
        </div>
        <button style={{...c.btn(T.green,T.bg),width:"100%",fontSize:15,padding:"16px",marginBottom:10}} onClick={finalize}>✓ Complete Transaction</button>
        <div style={{display:"flex",gap:10}}>
          <button style={{...c.bsm(T.border,T.muted),flex:1}} onClick={()=>setTxStep(5)}>← Back to Payment</button>
          <button style={{...c.bsm(T.border,T.muted),flex:1}} onClick={()=>{resetTx();setScreen("dashboard");}}>✕ Cancel</button>
        </div>
      </div>
    )}
  </div>;
}
