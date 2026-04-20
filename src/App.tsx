// LOOT — Compliance POS . Gold & Precious Metals . Android
// Legal: AML/CTF Act 2006 (Cth), SHD Act 1989 (Vic), Privacy Act 1988 (Cth)
// Square: BUY -> vendor expense (Orders+Payments API) . SELL -> checkout link
// Shopify: BUY -> draft order tagged vendor-purchase . SELL -> completed order
// Compliance: 168h hold, KYC/CDD, TTR, SMR, PEP/TFS, 7yr retention

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";

const DARK={
  bg:"#080c09",surface:"#0e130b",card:"#131a10",cardHi:"#182015",
  border:"#1c2619",borderHi:"#2a3826",
  gold:"#c9a84c",goldLight:"#e8c86a",goldDim:"#7a6520",goldBg:"#1a1500",
  silver:"#8fb5ad",silverDim:"#4a6560",silverBg:"#0a1510",
  green:"#c9a84c",greenDim:"#7a6520",greenBg:"#1a1500",
  orange:"#d4722a",orangeDim:"#7a3a10",orangeBg:"#1a0c04",
  red:"#cc3f3f",redDim:"#5a1a1a",redBg:"#1a0404",
  blue:"#c9a84c",blueBg:"#1a1500",
  text:"#ddd8ce",textDim:"#a09a90",muted:"#5a6055",white:"#f5f0e8",
  ff:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};
const LIGHT={
  bg:"#F5F4F0",surface:"#FFF",card:"#FFF",cardHi:"#F8F7F3",
  border:"rgba(0,0,0,0.12)",borderHi:"rgba(0,0,0,0.22)",
  gold:"#9C7A00",goldLight:"#C9A520",goldDim:"#E8C840",goldBg:"#FEFBEE",
  silver:"#4A7A78",silverDim:"#7AB0AC",silverBg:"#EEF5F4",
  green:"#9C7A00",greenDim:"#C9A520",greenBg:"#FEFBEE",
  orange:"#9A3A00",orangeDim:"#F97316",orangeBg:"#FFF7ED",
  red:"#991B1B",redDim:"#EF4444",redBg:"#FEF2F2",
  blue:"#9C7A00",blueBg:"#FEFBEE",
  text:"#111",textDim:"#3A3A3A",muted:"#737373",white:"#111",
  ff:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
};
var T=LIGHT;

const THRESH = { CASH_WARN:2000, BULLION_CDD:5000, CASH_TTR:10000, HOLD_HOURS:168 };
const TROY_OZ = 31.1035;

// Catalog starts empty — add your own products via the Catalog Editor (Prices tab -> Edit Catalog)
const DEFAULT_CATALOG = [];

const uid = () => Date.now().toString(36).toUpperCase()+Math.random().toString(36).slice(2,5).toUpperCase();
const fmt2 = n => (n==null||isNaN(n)||!isFinite(n))?"—":Number(n).toLocaleString("en-AU",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtAUD = n => (n==null||isNaN(n)||!isFinite(n))?"—":"$"+fmt2(n);
const fmtDate = iso => iso?new Date(iso).toLocaleString("en-AU",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"}):"—";
const addHours = (iso,h) => new Date(new Date(iso).getTime()+h*3600000).toISOString();
const hoursLeft = iso => Math.max(0,(new Date(iso)-Date.now())/3600000);
const fmtHold = iso => { if(!iso) return "—"; const h=hoursLeft(iso); if(h<=0) return "EXPIRED"; return Math.floor(h)+"h "+Math.floor((h%1)*60)+"m"; };
const sevenYrsFrom = iso => addHours(iso,7*365.25*24);
const isExpired7yr = iso => iso&&new Date(iso)<new Date();

const store={
  get:(k,d)=>{try{const v=localStorage.getItem("gf_"+k);return v!=null?JSON.parse(v):d;}catch(e){return d;}},
  set:(k,v)=>{try{localStorage.setItem("gf_"+k,JSON.stringify(v));}catch(e){}},
  del:(k)=>{try{localStorage.removeItem("gf_"+k);}catch(e){}},
};

// -- SUPABASE SYNC LAYER -------------------------------------------------------
// All data still saves to localStorage first (instant, offline-safe).
// Supabase syncs in the background for multi-device sharing.
const SB_URL = "https://uimrnctjkwhhgwewgmzm.supabase.co";
const SB_KEY = "sb_publishable_wgIxqpsjftysrlJuWZPS6g_EmDiaoaR";
const SHOP_ID = "default"; // Plan B: replace with business login ID

const sbFetch = async (path, opts={}) => {
  try {
    const r = await fetch(SB_URL+"/rest/v1/"+path, {
      ...opts,
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer "+SB_KEY,
        "Content-Type": "application/json",
        "Prefer": opts.prefer||"",
        ...opts.headers,
      },
    });
    if(!r.ok) return null;
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  } catch(e) { return null; }
};

const sb = {
  // Transactions
  saveTx: async (tx) => {
    await sbFetch("transactions?on_conflict=id", {
      method:"POST",
      prefer:"resolution=merge-duplicates",
      body: JSON.stringify({id:tx.id, shop_id:SHOP_ID, data:tx, updated_at:new Date().toISOString()}),
    });
  },
  loadTxList: async () => {
    const rows = await sbFetch("transactions?shop_id=eq."+SHOP_ID+"&order=updated_at.desc&limit=500");
    return rows ? rows.map(r=>r.data) : null;
  },
  deleteTx: async (id) => {
    await sbFetch("transactions?id=eq."+id, {method:"DELETE"});
  },
  // Stock
  saveStock: async (item) => {
    await sbFetch("stock?on_conflict=id", {
      method:"POST",
      prefer:"resolution=merge-duplicates",
      body: JSON.stringify({id:item.id, shop_id:SHOP_ID, data:item, updated_at:new Date().toISOString()}),
    });
  },
  loadStock: async () => {
    const rows = await sbFetch("stock?shop_id=eq."+SHOP_ID+"&order=updated_at.desc&limit=2000");
    return rows ? rows.map(r=>r.data) : null;
  },
  deleteStock: async (id) => {
    await sbFetch("stock?id=eq."+id, {method:"DELETE"});
  },
  // Settings
  saveSettings: async (settings) => {
    await sbFetch("settings?on_conflict=shop_id", {
      method:"POST",
      prefer:"resolution=merge-duplicates",
      body: JSON.stringify({shop_id:SHOP_ID, data:settings, updated_at:new Date().toISOString()}),
    });
  },
  loadSettings: async () => {
    const rows = await sbFetch("settings?shop_id=eq."+SHOP_ID+"&limit=1");
    return rows && rows[0] ? rows[0].data : null;
  },
  // Catalog
  saveCatalog: async (catalog) => {
    // Save catalog as a single JSON blob under a fixed ID
    await sbFetch("catalog?on_conflict=id", {
      method:"POST",
      prefer:"resolution=merge-duplicates",
      body: JSON.stringify({id:"catalog_"+SHOP_ID, shop_id:SHOP_ID, data:catalog, updated_at:new Date().toISOString()}),
    });
  },
  loadCatalog: async () => {
    const rows = await sbFetch("catalog?id=eq.catalog_"+SHOP_ID+"&limit=1");
    return rows && rows[0] ? rows[0].data : null;
  },
};
// -----------------------------------------------------------------------------

// Photo handler — no artificial size cap, browser quota is the only limit
const MAX_PHOTO_B64 = Infinity;
const checkPhotoSize = (b64, cb) => { if(b64) cb(b64); };

// -- STARTUP CLEANUP ---------------------------------------------------------
// Version stamp — bump this any time a breaking change is deployed.
// When the stored version doesn't match, ALL localStorage is wiped clean.
const APP_VERSION = "5";
const DEFAULT_LOGO = null; // logo lives in logoLib (seeded by migration)

// Default logo data — seeded into logoLib on first run
const SEED_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%23c9a84c'/%3E%3Ctext x='32' y='40' text-anchor='middle' font-size='28' font-family='serif' fill='%23080c09'%3ELL%3C/text%3E%3C/svg%3E";

function runMigration(){
  try{
    // If version matches, nothing to do
    // Seed default logo into logoLib if not already present
    try{
      const lib = JSON.parse(localStorage.getItem('gf_logoLib')||'[]');
      if(!lib.length){
        const seeded=[{id:'default-logo',data:SEED_LOGO,isLogo:true}];
        localStorage.setItem('gf_logoLib',JSON.stringify(seeded));
        localStorage.setItem('gf_settings',JSON.stringify({...JSON.parse(localStorage.getItem('gf_settings')||'{}'),logoImg:SEED_LOGO}));
      }
    }catch(e){}
    if(localStorage.getItem("gf_version")===APP_VERSION) return;

    // Version mismatch — wipe everything except user data we want to keep
    const keep = {}; // nothing to keep — fresh start

    // Collect every key in localStorage
    const allKeys = [];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k) allKeys.push(k);
    }

    // Delete ALL keys — old prefixes, new prefixes, bare keys, everything
    allKeys.forEach(k=>{
      // Keep nothing from old versions — complete clean slate
      localStorage.removeItem(k);
    });

    // Stamp the new version
    localStorage.setItem("gf_version", APP_VERSION);
  }catch(e){}
}
runMigration();
function peekInv(){
  // Returns what the NEXT invoice number will be — does NOT increment the counter
  const d=new Date(),dd=String(d.getDate()).padStart(2,"0"),
    mm=String(d.getMonth()+1).padStart(2,"0"),yy=String(d.getFullYear()).slice(-2),today=dd+mm+yy;
  const rec=store.get("invday",{d:"",n:0});
  const n=(rec.d===today?rec.n:0)+1;
  return today+n;
}
function makeInv(){
  // Increments the counter and returns the new invoice number — call only when finalising a transaction
  const d=new Date(),dd=String(d.getDate()).padStart(2,"0"),
    mm=String(d.getMonth()+1).padStart(2,"0"),yy=String(d.getFullYear()).slice(-2),today=dd+mm+yy;
  let rec=store.get("invday",{d:"",n:0});
  if(rec.d!==today)rec={d:today,n:0};
  rec.n+=1;store.set("invday",rec);
  return today+rec.n;
}

function calcUnitPrice(p, gSpot, sSpot, mode="buy") {
  if(!p||!gSpot||!sSpot) return null;
  const gPerG=gSpot/TROY_OZ, sPerG=sSpot/TROY_OZ;
  const isG=p.cat==="Gold";
  const perG=isG?gPerG:sPerG, perOz=isG?gSpot:sSpot;
  if(mode==="buy") {
    // Carat-based scrap formula: (spot/24) × carats × buyMult
  if(p.buyMode==="carat"&&p.carat) return (gPerG/24)*p.carat*p.buyMult;
    if(p.buyMult==null) return null;
    if(p.weightG&&p.purity) return perG*p.purity*p.weightG*p.buyMult;
    if(p.unit==="oz") return perOz*(p.purity||1)*p.buyMult;
    return perG*(p.purity||1)*p.buyMult;
  } else {
    if(p.sellMult==null) return null;
    if(p.weightG&&p.purity) return perG*p.purity*p.weightG*p.sellMult;
    if(p.unit==="oz") return perOz*(p.purity||1)*p.sellMult;
    return perG*(p.purity||1)*p.sellMult;
  }
}

function checkCompliance(items, payment, ttrEnabled=true) {
  const isCash=payment==="cash";
  // Only BUY items count toward cash thresholds — we are receiving cash for those
  const buyItems=items.filter(i=>i.mode==="buy");
  const total=buyItems.reduce((s,i)=>s+(Math.abs(i.price)||0),0);
  const bullionCash=isCash?buyItems.filter(i=>i.product&&i.product.type==="bullion").reduce((s,i)=>s+(Math.abs(i.price)||0),0):0;
  const anyCash=isCash?total:0;
  const flags=[];
  flags.push({level:"info",key:"id",msg:"🪪 ID must be sighted for EVERY transaction — Victorian law s.19, no exceptions for gold/silver."});
  if(isCash&&total>=THRESH.CASH_WARN&&bullionCash<THRESH.BULLION_CDD&&anyCash<THRESH.CASH_TTR)
    flags.push({level:"warn",key:"cash_warn",msg:"⚠️ $"+fmt2(total)+" cash — Internal policy: Manager must acknowledge before proceeding."});
  if(bullionCash>=THRESH.BULLION_CDD&&anyCash<THRESH.CASH_TTR)
    flags.push({level:"block",key:"bullion_cdd",msg:"🔴 $"+fmt2(bullionCash)+" in BULLION — AUSTRAC HARD BLOCK: Full KYC/CDD mandatory before proceeding. Cannot be waived."});
  if(ttrEnabled&&anyCash>=THRESH.CASH_TTR)
    flags.push({level:"block",key:"ttr",msg:"🔴 $"+fmt2(anyCash)+" cash — AUSTRAC HARD BLOCK: Full KYC/CDD required + Threshold Transaction Report (TTR) must be filed within 10 business days."});
  return {flags,total,bullionCash,anyCash,requiresKYC:bullionCash>=THRESH.BULLION_CDD||(ttrEnabled&&anyCash>=THRESH.CASH_TTR)};
}

const PRIVACY_NOTICE=(biz,abn)=>"PRIVACY NOTICE — "+(biz||"[Business Name]")+"  ABN "+(abn||"[ABN]")
  +"\n\nWe are collecting your personal information (name, date of birth, address and identification details) to verify your identity as required by:\n• Anti-Money Laundering & Counter-Terrorism Financing Act 2006 (Cth)\n• Second-Hand Dealers & Pawnbrokers Act 1989 (Vic)\n\nThis information will be securely stored and retained for 7 years from the date of your transaction. It may be reported to AUSTRAC if required by law. It may also be disclosed to Victoria Police under the Second-Hand Dealers & Pawnbrokers Act 1989.\n\nYou have the right to access and correct the personal information we hold about you.\n\nBy proceeding, you consent to the collection and use of your personal information for these purposes.";

// -- STYLE UTILS --------------------------------------------------------------
const c = {
  app:   {fontFamily:T.ff,background:T.bg,minHeight:"100vh",color:T.text,WebkitFontSmoothing:"antialiased",paddingBottom:60,boxSizing:"border-box"},
  // φ=1.618 . 1/√8=0.3536 . border-radius φ×6=10 . shadow offset 1/√8×16=6px . blur φ×12=19px . opacity 1/√8÷2=0.177
  card:  (x={})=>({background:T.card,border:"1px solid "+T.border,borderRadius:10,
    boxShadow:"6px 6px 19px rgba(0,0,0,0.18), 3px 3px 0 rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.07)",
    ...x}),
  inp:   (x={})=>({background:T.surface,border:"1px solid "+T.border,borderRadius:6,color:T.text,fontFamily:T.ff,fontSize:13,padding:"9px 12px",outline:"none",width:"100%",boxSizing:"border-box",
    boxShadow:"inset 2px 2px 5px rgba(0,0,0,0.09)",...x}),
  sel:   (x={})=>({background:T.card,border:"1px solid "+T.border,borderRadius:6,color:T.text,fontFamily:T.ff,fontSize:12,padding:"8px 12px",outline:"none",
    boxShadow:"inset 1px 1px 4px rgba(0,0,0,0.07)",...x}),
  btn:   (bg=T.gold,col="#080c09",x={})=>({background:bg,color:col,border:"none",borderRadius:6,padding:"14px 28px",fontFamily:T.ff,fontSize:14,fontWeight:"bold",letterSpacing:"0.08em",textTransform:"uppercase",cursor:"pointer",whiteSpace:"nowrap",...x,
    boxShadow:"4px 4px 14px rgba(0,0,0,0.22), 1px 1px 0 rgba(255,255,255,0.10)"}),
  bsm:   (bg=T.border,col=T.text)=>({background:bg,color:col,border:"none",borderRadius:5,padding:"10px 18px",fontFamily:T.ff,fontSize:13,fontWeight:"600",cursor:"pointer",whiteSpace:"nowrap",
    boxShadow:"3px 3px 10px rgba(0,0,0,0.18)"}),
  lbl:   {fontSize:10,color:T.muted,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:5,display:"block"},
  row:   (g=12)=>({display:"flex",alignItems:"center",gap:g}),
  col:   (g=12)=>({display:"flex",flexDirection:"column",gap:g}),
  g2:    (g=16)=>({display:"grid",gridTemplateColumns:"1fr 1fr",gap:g}),
  g3:    (g=12)=>({display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:g}),
  g4:    (g=13)=>({display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:g}),
  th:    {padding:"8px 12px",fontSize:10,color:T.muted,letterSpacing:"0.1em",textTransform:"uppercase",textAlign:"left",borderBottom:"1px solid "+T.border,background:T.surface,whiteSpace:"nowrap"},
  td:    (x={})=>({padding:"9px 12px",fontSize:12,borderBottom:"1px solid "+T.border+"22",verticalAlign:"middle",...x}),
  dot:   (col)=>({width:10,height:10,borderRadius:"50%",background:col,boxShadow:"0 0 8px "+col+"99",flexShrink:0,display:"inline-block"}),
  badge: (col,bg)=>({display:"inline-block",padding:"2px 7px",borderRadius:4,fontSize:10,fontWeight:"bold",color:col,background:bg||col+"22",letterSpacing:"0.06em"}),
  bnr:   (lv)=>{const m={info:[T.gold,T.goldBg],warn:[T.orange,T.orangeBg],block:[T.red,T.redBg]};const[cl,bg]=m[lv]||m.info;return{background:bg,border:"1px solid "+cl+"55",borderRadius:6,padding:"10px 14px",marginBottom:8,fontSize:12,color:cl,lineHeight:1.6,boxShadow:"2px 2px 8px rgba(0,0,0,0.10)"};},
  shead: (g)=>({padding:"10px 16px",background:g?T.gold+"18":T.silver+"14",borderBottom:"1px solid "+T.border,fontSize:11,fontWeight:"bold",letterSpacing:"0.12em",textTransform:"uppercase",color:g?T.goldLight:T.silver,display:"flex",alignItems:"center",gap:8}),
};

// -- MICRO COMPONENTS --------------------------------------------------------
function HoldTimer({holdUntil,policeHold}){
  const [,tick]=useState(0);
  useEffect(()=>{const t=setInterval(()=>tick(p=>p+1),30000);return()=>clearInterval(t);},[]);
  if(policeHold) return <span style={c.row(5)}><span style={c.dot(T.red)}/><span style={c.badge(T.red)}>POLICE</span></span>;
  if(!holdUntil||hoursLeft(holdUntil)<=0) return <span style={c.row(5)}><span style={c.dot(T.green)}/><span style={c.badge(T.green)}>FREE</span></span>;
  return <span style={c.row(5)}><span style={c.dot(T.orange)}/><span style={{fontSize:11,color:T.orange}}>{fmtHold(holdUntil)}</span></span>;
}

function Modal({title,onClose,wide,children}){
  return(
    <div style={{position:"fixed",inset:0,background:"#000000d0",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:12}}
      onClick={onClose}>
      <div style={{...c.card({padding:24,maxWidth:wide?980:580,width:"100%",maxHeight:"93vh",overflowY:"auto"})}}
        onClick={e=>e.stopPropagation()}>
        <div style={{...c.row(0),justifyContent:"space-between",marginBottom:20}}>
          <span style={{fontSize:15,fontWeight:"bold",color:T.white}}>{title}</span>
          <button style={c.bsm()} onClick={onClose}>✕ Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function F({label,value,onChange,type="text",placeholder,required,readOnly,note,as}){
  return(
    <div style={{marginBottom:14}}>
      <label style={c.lbl}>{label}{required&&<span style={{color:T.red}}> *</span>}</label>
      {as==="textarea"
        ?<textarea style={{...c.inp(),height:80,resize:"vertical"}} value={value||""} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder||""}/>
        :<input style={c.inp({opacity:readOnly?0.6:1})} type={type} value={value||""} readOnly={readOnly} onChange={e=>onChange&&onChange(e.target.value)} placeholder={placeholder||""}/>
      }
      {note&&<div style={{fontSize:10,color:T.muted,marginTop:3}}>{note}</div>}
    </div>
  );
}

function SF({label,value,onChange,options,required}){
  return(
    <div style={{marginBottom:14}}>
      <label style={c.lbl}>{label}{required&&<span style={{color:T.red}}> *</span>}</label>
      <select style={{...c.sel(),width:"100%"}} value={value||""} onChange={e=>onChange(e.target.value)}>
        {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Notif({msg,type,onClose}){
  if(!msg) return null;
  const col=type==="ok"?T.green:type==="warn"?T.orange:T.red;
  return(
    <div style={{position:"fixed",bottom:70,right:16,zIndex:2000,background:T.card,border:"1px solid "+col,borderRadius:8,padding:"12px 18px",fontSize:13,color:col,maxWidth:340,boxShadow:"0 4px 20px #00000080"}}>
      {msg}<button style={{...c.bsm(T.border),marginLeft:12,fontSize:10}} onClick={onClose}>✕</button>
    </div>
  );
}

// ===========================================================================
//  MAIN APP
// ===========================================================================
function TxPhotoManager({selTx,store,setTxList,setSelTx,T,c}){
  const phKey=selTx.photoKey||("photos_"+selTx.id);
  // Read from embedded tx object first, fall back to localStorage
  const localPh=store.get(phKey,{idPhoto:null,itemPhotos:{}});
  const ph={
    idPhoto:selTx.photo||localPh.idPhoto||null,
    itemPhotos:{...localPh.itemPhotos,...(selTx.itemPhotos||{})},
  };
  const imgs=Object.entries(ph.itemPhotos||{});
  const save=(updated)=>{
    store.set(phKey,updated);
    const hasPh=!!(updated.idPhoto||Object.keys(updated.itemPhotos||{}).length);
    setTxList(prev=>prev.map(t=>t.id===selTx.id?{...t,hasPhotos:hasPh,photoKey:phKey}:t));
    setSelTx(prev=>({...prev,hasPhotos:hasPh,photoKey:phKey}));
  };
  return(
    <div>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,color:T.muted,marginBottom:6}}>ID / KYC Photo</div>
        {ph.idPhoto
          ?<div style={{display:"flex",alignItems:"center",gap:10}}>
            <img src={ph.idPhoto} alt="ID" style={{width:80,height:80,objectFit:"cover",borderRadius:6,border:"1px solid "+T.border}}/>
            <button style={c.bsm(T.redBg,T.red)} onClick={()=>save({...ph,idPhoto:null})}>Remove</button>
          </div>
          :<label style={{background:T.surface,border:"1px solid "+T.border,borderRadius:4,padding:"8px 14px",fontSize:12,cursor:"pointer",display:"inline-block",color:T.muted}}>
            Add ID Photo
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{display:"none"}} onChange={e=>{
              const f=e.target.files&&e.target.files[0];if(!f)return;
              const r=new FileReader();r.onload=ev=>checkPhotoSize(ev.target.result,d=>save({...ph,idPhoto:d}));r.readAsDataURL(f);e.target.value="";
            }}/>
          </label>
        }
      </div>
      <div>
        <div style={{fontSize:11,color:T.muted,marginBottom:6}}>Item Photos ({imgs.length})</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:8}}>
          {imgs.map(([key,src])=>(
            <div key={key} style={{position:"relative"}}>
              <img src={src} alt="item" style={{width:72,height:72,objectFit:"cover",borderRadius:6,border:"1px solid "+T.border}}/>
              <button onClick={()=>{const n={...ph,itemPhotos:{...ph.itemPhotos}};delete n.itemPhotos[key];save(n);}}
                style={{position:"absolute",top:-4,right:-4,background:T.red,color:"#fff",border:"none",borderRadius:"50%",width:18,height:18,fontSize:11,cursor:"pointer",padding:0,lineHeight:"18px",textAlign:"center"}}>x</button>
            </div>
          ))}
        </div>
        <label style={{background:T.surface,border:"1px solid "+T.border,borderRadius:4,padding:"8px 14px",fontSize:12,cursor:"pointer",display:"inline-block",color:T.muted}}>
          Add Item Photo
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{display:"none"}} onChange={e=>{
            const f=e.target.files&&e.target.files[0];if(!f)return;
            const r=new FileReader();const k="img_"+Date.now();
            r.onload=ev=>checkPhotoSize(ev.target.result,d=>save({...ph,itemPhotos:{...(ph.itemPhotos||{}),[k]:d}}));
            r.readAsDataURL(f);e.target.value="";
          }}/>
        </label>
      </div>
    </div>
  );
}

// -- AI Agent ghost indicator -------------------------------------------------
// Renders nothing when AI is off. Shows a small pulsing dot when connected.
// Level 1 = blue (listening). Level 2 = amber (autonomous — v2.0).
function AIGhost({settings,label}){
  if(!settings||!settings.aiAgentEnabled) return null;
  const col=settings.aiAgentLevel>=2?"#F59E0B":"#3B82F6";
  return(
    <div title={(settings.aiAgentName||"AI")+" listening — "+label} style={{display:"inline-flex",alignItems:"center",gap:4,opacity:0.55,marginLeft:6}}>
      <span style={{width:6,height:6,borderRadius:"50%",background:col,
        boxShadow:"0 0 6px "+col,
        animation:"none",display:"inline-block"}}/>
      <span style={{fontSize:9,color:col,letterSpacing:"0.06em",fontFamily:"monospace"}}>
        {settings.aiAgentName||"AI"}
      </span>
    </div>
  );
}

// -- StockCard: extracted to avoid block-body map in JSX ----------------------
function StockCard({s,T,c,fmtAUD,fmtDate,calcMelt,frozenSnap,hoursLeft,
  togglePoliceHold,setPinModal,setPinVal,setStock,setEditStockId,setEditStockVal,nowISO,GOLD_P,SILV_P}){
  const mv=calcMelt(s);
  const pl=mv!=null?mv-(s.price||0):null;
  return(
    <div style={{...c.card({padding:14}),marginBottom:10,
      borderLeft:"4px solid "+(s.policeHold?T.red:s.sold?T.muted:hoursLeft(s.holdUntil)>0?T.orange:T.green)}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:"bold",color:T.white,fontSize:13,marginBottom:3}}>
            {s.description||(s.product&&s.product.label)||"—"}
            {s.sold&&<span style={{...c.badge(T.muted),marginLeft:6,fontSize:9}}>SOLD</span>}
          </div>
          <div style={{fontSize:11,color:T.muted,marginBottom:2}}>
            Contract: <span style={{color:T.gold}}>{s.txId}</span> · {fmtDate(s.date)}
          </div>
          <div style={{fontSize:11,color:T.muted,marginBottom:2}}>
            Paid: <span style={{color:T.green,fontWeight:"bold"}}>{fmtAUD(s.price)}</span>
            {s.weight_g&&s.purity?" · "+s.weight_g+"g "+s.purity:""}
            {s.storageLocation?" · 📍 "+s.storageLocation:""}
          </div>
          {mv!=null&&(
            <div style={{fontSize:11,marginBottom:2}}>
              Melt: <span style={{color:T.gold,fontWeight:"bold"}}>{fmtAUD(mv)}</span>
              {pl!=null&&<span style={{color:pl>=0?T.green:T.red,marginLeft:8,fontSize:10}}>{pl>=0?"▲ +":""}{fmtAUD(pl)}</span>}
              {frozenSnap&&<span style={{color:T.muted,fontSize:9}}> ❄</span>}
            </div>
          )}
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4}}>
            <span style={{fontSize:10,color:T.muted}}>GST</span>
            <button style={{...c.bsm(s.gstApplicable===false?T.border:T.goldBg,s.gstApplicable===false?T.muted:T.gold),fontSize:9,padding:"2px 8px"}}
              onClick={()=>setStock(p=>p.map(x=>x.id===s.id?{...x,gstApplicable:x.gstApplicable===false?true:false}:x))}>
              {s.gstApplicable===false?"OFF":"ON"}
            </button>
            <HoldTimer holdUntil={s.holdUntil} policeHold={s.policeHold}/>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:5,flexShrink:0}}>
          <button style={{...c.bsm(T.border,T.muted),padding:"6px 10px",fontSize:11}}
            onClick={()=>{setEditStockId(s.id);setEditStockVal({description:s.description||"",weight_g:s.weight_g||"",purity:s.purity||"",storageLocation:s.storageLocation||"",price:s.price||""});}}>✎</button>
          {!s.policeHold
            ?<button style={{...c.bsm(T.redBg,T.red),padding:"6px 10px",fontSize:11}}
                onClick={()=>togglePoliceHold(s.id,true)}>🚔</button>
            :<button style={{...c.bsm(T.greenBg,T.green),padding:"6px 10px",fontSize:11}}
                onClick={()=>{setPinModal({reason:"Release police hold — manager PIN required.",cb:()=>togglePoliceHold(s.id,false)});setPinVal("");}}>✓</button>
          }
          {!s.policeHold&&hoursLeft(s.holdUntil)<=0&&!s.sold&&(
            <button style={{...c.bsm(T.greenBg,T.green),padding:"6px 10px",fontSize:11}}
              onClick={()=>setStock(p=>p.map(x=>x.id===s.id?{...x,sold:true,soldDate:nowISO()}:x))}>💰</button>
          )}
          <button style={{...c.bsm(T.border,T.muted),padding:"6px 10px",fontSize:11}}
            onClick={()=>setStock(p=>p.filter(x=>x.id!==s.id))}>🗑</button>
        </div>
      </div>
    </div>
  );
}

const STATE_INFO={
  VIC:{name:"Victoria",act:"Second-Hand Dealers and Pawnbrokers Act 1989 (Vic)",
    hold:"7 days",freq:"Weekly (within 3 working days)",
    defaultEmail:settings.policeEmail||"",
    note:"Submit to your local Victoria Police station by email. No central portal."},
  NSW:{name:"New South Wales",act:"Pawnbrokers and Second-hand Dealers Act 1996 (NSW)",
    hold:"14 days",freq:"Within 3 working days of each transaction",
    defaultEmail:"#PBU@police.nsw.gov.au",
    note:"Submit via NSW Police Weblink portal using your dealer licence number, OR email #PBU@police.nsw.gov.au"},
  QLD:{name:"Queensland",act:"Second-hand Dealers and Pawnbrokers Act 2003 (Qld)",
    hold:"Check local conditions",freq:"Regular forwarding to SPIRS database",
    defaultEmail:"SPIRS.Admin@police.qld.gov.au",
    note:"Forward CSV to SPIRS (Stolen Property ID & Recovery System). Police cross-match against stolen property database."},
  SA:{name:"South Australia",act:"Second-hand Dealers and Pawnbrokers Act 1996 (SA)",
    hold:"10 days (3 days if full buyer details recorded)",freq:"Keep on premises — available for inspection at any time",
    defaultEmail:"sapol.leb@police.sa.gov.au",
    note:"SA requires registration (not licensing). Keep records on premises. Email SAPOL Licensing Enforcement Branch for stolen goods reports."},
  WA:{name:"Western Australia",act:"Second-hand Dealers and Pawnbrokers Act 1994 (WA)",
    hold:"3 days minimum",freq:"Available for inspection; submit electronically on request",
    defaultEmail:settings.policeEmail||"",
    note:"Keep records on premises. Submit to local WA Police station on request or by standing arrangement."},
  NT:{name:"Northern Territory",act:"Second-hand Dealers Act (NT)",
    hold:"14 days",freq:"Available for police inspection at any time",
    defaultEmail:settings.policeEmail||"",
    note:"Keep records on premises. Contact local NT Police station. Notify immediately if stolen goods suspected."},
  ACT:{name:"Australian Capital Territory",act:"Second-Hand Dealers Act 1995 (ACT)",
    hold:"7 days",freq:"Available for ACT Policing inspection",
    defaultEmail:settings.policeEmail||"",
    note:"Keep records on premises and available for ACT Policing inspection."},
  TAS:{name:"Tasmania",act:"Second-Hand Dealers Act 1994 (Tas)",
    hold:"7 days",freq:"Available for Tasmania Police inspection",
    defaultEmail:settings.policeEmail||"",
    note:"Keep records on premises. Contact your local Tasmania Police station."},
};

function genPoliceReport(dateFrom,dateTo,suspicious,stateCode,txList,settings){
  const sc=stateCode||settings.state||"VIC";
  const st=STATE_INFO[sc]||STATE_INFO.VIC;
  const txs=txList.filter(t=>{
    if(!t.date) return false;
    if(suspicious) return t.smrFlagged;
    const d=new Date(t.date);
    return d>=dateFrom&&d<=dateTo;
  });
  const dealer=settings.businessName||"[Business Name]";
  const licence=settings.dealerLicenceNo||"[Licence/Registration No]";
  const rows=[
    [st.name.toUpperCase()+" SECONDHAND DEALER TRANSACTION REPORT"],
    ["Governing Act",st.act],
    ["Dealer Name",dealer],
    ["ABN",settings.abn||""],
    ["Dealer Licence / Registration No",licence],
    ["Business Address",settings.address||""],
    ["Phone",settings.phone||""],
    suspicious?["Report Type","IMMEDIATE — SUSPICIOUS ITEM REPORT"]:["Report Type","TRANSACTION REGISTER"],
    ["Period",suspicious?"All SMR-flagged transactions":dateFrom.toLocaleDateString("en-AU")+" to "+dateTo.toLocaleDateString("en-AU")],
    ["Mandatory Hold Period",st.hold],
    ["Submission Instructions",st.note],
    ["Generated",new Date().toLocaleString("en-AU")],
    [],
    ["Contract No","Date","Item Description","Serial / ID Marks",
     "Weight / Qty","Price Paid (AUD)",
     "Client Full Name","Client DOB","Client Address",
     "ID Type","ID Number",
     "KYC Verified","TTR Required","SMR Flagged","Staff Notes"],
  ];
  txs.forEach(tx=>{
    const cl=tx.client||{};
    (tx.items||[]).filter(i=>i.mode==="buy").forEach(it=>{
      const prod=it.product||{};
      rows.push([
        tx.id,
        new Date(tx.date).toLocaleDateString("en-AU"),
        prod.label||(it.note?"Unlisted: "+it.note:"Item"),
        prod.serial||"—",
        it.qty||"1",
        (it.price||0).toFixed(2),
        cl.fullName||"",
        cl.dob||"",
        cl.address||"",
        cl.idType||"",
        cl.idNumber||"",
        tx.kycDone?"YES":"NO",
        tx.ttrRequired?"YES":"NO",
        tx.smrFlagged?"YES":"NO",
        it.note||"",
      ]);
    });
  });
  if(rows.length<=14) rows.push(["(No qualifying buy transactions in this period)"]);
  return rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(",")).join("\n");
}

const DEFAULT_SETTINGS={
businessName:"",abn:"",address:"",phone:"",
staffPin:"1234",
squareToken:"",squareLoc:"",squareRedirect:"",
sheetsId:"",sheetsRange:"Sheet1!A1",sheetsToken:"",
webhookUrl:"",shopifyDomain:"",shopifyToken:"",xeroClientId:"",xeroSecret:"",xeroToken:"",xeroTenantId:"",xeroBuyCode:"310",xeroSellCode:"200",
requirePin:false,sessionTimeout:"never",ttrEnabled:true,
eftposProvider:"none",squareTerminalId:"",linklyBaseUrl:"http://localhost:4242",
aiAgentEnabled:false,aiAgentLevel:1,aiAgentUrl:"",aiAgentName:"Sophiie",
cryptoEnabled:false,
walletBTC:"",walletETH:"",walletBNB:"",walletXRP:"",walletSOL:"",
goldApiKey:"",metalsApiKey:"",metalsDevKey:"",
duressContact1:"",duressContact2:"",duressContact3:"",duressContact4:"",duressContact5:"",
duressContact6:"",duressContact7:"",duressContact8:"",duressContact9:"",duressContact10:"",
smsProvider:"textbelt",
textbeltKey:"textbelt",
duressWebhookUrl:"",
twilioFnUrl:"",
policeEmail:"",           // local station email for police reports
policeStation:"",         // local station name
dealerLicenceNo:"",       // secondhand dealer licence number
logoImg:null,
scaleProtocol:"auto",   // auto | standard | nordic_uart | custom
scaleCustomServiceUUID:"",
scaleCustomCharUUID:"",
scaleUnit:"g",          // g | oz | ozt
scaleFilter:true,       // filter unstable readings
state:"VIC",
goldAlert:null,silverAlert:null,
};

function initTxList(){
  const raw=store.get("txList",[]);
  return (Array.isArray(raw)?raw:[]).map(t=>{
    if(t.photoKey&&(!t.photo)&&(!t.itemPhotos||!Object.keys(t.itemPhotos||{}).length)){
      const ph=store.get(t.photoKey,null);
      if(ph) return{...t,photo:ph.idPhoto||null,itemPhotos:ph.itemPhotos||{}};
    }
    return t;
  });
}

export default function Loot() {
  const [screen,setScreen] = useState("dashboard");
  const [gSpot,setGSpot]   = useState(()=>store.get("gSpot",0));
  const [sSpot,setSSpot]   = useState(()=>store.get("sSpot",0));
  const [catalog,setCatalog]   = useState(()=>store.get("catalog",DEFAULT_CATALOG));
  const [txList,setTxList] = useState(()=>initTxList());
  const [stock,setStock]       = useState(()=>store.get("stock",[]));
  const [settings,setSettings] = useState(()=>store.get("settings",DEFAULT_SETTINGS));

  const [txStep,setTxStep]       = useState(1);
  const [txItems,setTxItems]     = useState([]);
  const [txPay,setTxPay]         = useState("cash");
  const [txNo,setTxNo]           = useState(()=>peekInv());
  const [client,setClient]       = useState({});
  const [staff,setStaff]         = useState({});
  const [kycDone,setKycDone]     = useState(false);
  const [privAck,setPrivAck]     = useState(false);
  const [idSighted,setIdSighted] = useState(false);
  const [photo,setPhoto]         = useState(null);
  const [zoom,setZoom]           = useState(()=>store.get("zoom",100));
  const [simp,setSimp]           = useState(()=>store.get("simp",false));
  const [settingsOpen,setSettingsOpen] = useState({spotfeed:false,appearance:true,business:false,scale:false,security:false,policehelp:false,compliance:false,crypto:false,ai:false,integrations:false,danger:false});
  const toggleSection=k=>setSettingsOpen(p=>({...p,[k]:!p[k]}));
  const [contrast,setContrast]     = useState(()=>store.get("contrast",0));    // -5 to +5
  const [fontSize,setFontSize]     = useState(()=>store.get("fontSize",14));    // 12-36
  const [quickMode,setQuickMode] = useState(false);
  const [qmMode,setQMMode]       = useState("buy");
  const [qf,setQF]               = useState({label:"",cat:"Gold",type:"scrap",unit:"g",price:"",qty:"",note:"",purity:"",carat:""});
  const [adjId,setAdjId]         = useState(null);
  const [adjVal,setAdjVal]       = useState("");
  const [itemPhotos,setItemPhotos] = useState({});
  const [cliSearch,setCliSearch] = useState("");
  const [cliFrom,setCliFrom]     = useState("");
  const [cliTo,setCliTo]         = useState("");
  const [selStockItem,setSelStockItem] = useState(null);
  const [logoLib,setLogoLib]           = useState(()=>store.get("logoLib",[]));
  const [showLogoLib,setShowLogoLib]   = useState(false);
  const [logoPinMode,setLogoPinMode]   = useState(false);
  const [logoPinVal,setLogoPinVal]     = useState("");
  const [logoDragOver,setLogoDragOver] = useState(false);
  const [editStockId,setEditStockId]   = useState(null);
  const [editStockVal,setEditStockVal] = useState({});
  const [voidId,setVoidId]             = useState(null);
  const [receiptTx,setReceiptTx]       = useState(null);
  const [cliNoteId,setCliNoteId]       = useState(null);
  const [cliNoteVal,setCliNoteVal]     = useState("");
  const [vendors,setVendors]           = useState(()=>store.get("vendors",[]));
  const [showVendors,setShowVendors]   = useState(false);
  const [editVendor,setEditVendor]     = useState(null);
  const [vendorForm,setVendorForm]     = useState({});
  const [staffList,setStaffList]       = useState(()=>store.get("staffList",[]));
  const [showStaff,setShowStaff]       = useState(false);
  const [staffForm,setStaffForm]       = useState({});
  const [activeStaff,setActiveStaff]   = useState(()=>store.get("activeStaff",""));
  const [showEOD,setShowEOD]           = useState(false);
  const [frozenSnap,setFrozenSnap]     = useState(()=>store.get("frozenSnap",null));
  const [spotLog,setSpotLog]           = useState(()=>store.get("spotLog",[]));
  const [histFilter,setHistFilter]     = useState("all");
  const [blacklist,setBlacklist]       = useState(()=>store.get("blacklist",[]));
  const [showBackup,setShowBackup]     = useState(false);
  const [showPolice,setShowPolice]     = useState(false);
  const [scaleLive,setScaleLive]       = useState(null);   // current live reading {g, raw, stable}
  const [scaleDevice,setScaleDevice]   = useState(null);   // connected BLE device
  const [scaleStatus,setScaleStatus]   = useState("off");  // off | connecting | connected | error
  const [duressActive,setDuressActive] = useState(false);
  const [appUnlocked,setAppUnlocked] = useState(()=>{
    if(!store.get("settings",{}).requirePin) return true;
    const timeout = store.get("settings",{}).sessionTimeout||"never";
    if(timeout==="never") return !!store.get("sessionActive",false);
    const last = store.get("sessionLast",0);
    const limits = {"1h":3600000,"8h":28800000,"close":0};
    if(timeout==="close") return false;
    return Date.now()-last < (limits[timeout]||Infinity);
  });
  const [appPinInput,setAppPinInput] = useState("");
  const [pinModal,setPinModal]   = useState(null);
  const [pinVal,setPinVal]       = useState("");
  const [flagNote,setFlagNote]   = useState("");
  const [showFlag,setShowFlag]   = useState(false);
  const [showCat,setShowCat]     = useState(false);
  const [showSet,setShowSet]     = useState(false);
  const [showAbout,setShowAbout] = useState(false);
  const [showApi,setShowApi]     = useState(false);
  const [selTx,setSelTx]         = useState(null);
  const [notify,setNotify]       = useState(null);
  const [editProd,setEditProd]   = useState(null);
  const [newProd,setNewProd]     = useState({cat:"Other",sub:"",type:"scrap",unit:"g",purity:"",carat:"",label:"",buyMult:"",sellMult:"",weightG:"",active:true});
  const [addMode,setAddMode]     = useState("buy");
  const [addId,setAddId]         = useState("");
  const [addQty,setAddQty]       = useState("");
  const [addCustom,setAddCustom] = useState("");
  const [addNote,setAddNote]     = useState("");
  const fileRef = useRef();
  const itemFileRef = useRef();
  const stockPhotoRef = useRef();
  const pendingPhotoId = useRef(null);

  T=LIGHT;
  if(contrast!==0){
    const cv=contrast;
    T=Object.assign({},T,{
      border:cv>0?"rgba(0,0,0,"+(0.12+cv*0.075)+")":"rgba(0,0,0,"+(0.12+cv*0.02)+")",
      borderHi:cv>0?"rgba(0,0,0,"+(0.22+cv*0.1)+")":"rgba(0,0,0,"+(0.22+cv*0.02)+")",
      muted:cv>0?"#"+Math.max(0,0x73-cv*18).toString(16).padStart(2,"0").repeat(3):"#737373",
      text:cv>0?"#000":"#"+Math.max(0x11,0x11+Math.round(cv*8)).toString(16).padStart(2,"0").repeat(3),
      card:cv>0?"#fff":"#"+Math.max(0xfa,0xff-Math.abs(cv)*2).toString(16).padStart(2,"0").repeat(3),
      bg:cv>0?"#dedad4":"#"+Math.max(0xee,0xf5-Math.abs(cv)*3).toString(16).padStart(2,"0"),
      gold:cv>0?"#7a5200":"#9C7A00",
    });
  }
  if(simp){
    c.btn=(bg=T.gold,col="#080c09",x={})=>({background:bg,color:col,border:"none",borderRadius:8,padding:"14px 24px",fontFamily:T.ff,fontSize:15,fontWeight:"bold",letterSpacing:"0.06em",textTransform:"uppercase",cursor:"pointer",whiteSpace:"nowrap",...x,boxShadow:"4px 4px 14px rgba(0,0,0,0.22)"});
    c.bsm=(bg=T.border,col=T.text)=>({background:bg,color:col,border:"none",borderRadius:6,padding:"10px 16px",fontFamily:T.ff,fontSize:13,cursor:"pointer",boxShadow:"3px 3px 10px rgba(0,0,0,0.18)"});
    c.inp=(x={})=>({background:"#ffffff08",border:"1px solid "+T.border,borderRadius:8,color:T.text,fontFamily:T.ff,fontSize:15,padding:"13px 14px",outline:"none",width:"100%",boxSizing:"border-box",...x});
    c.lbl={fontSize:12,color:T.muted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6,display:"block"};
  } else {
    c.btn=(bg=T.gold,col="#080c09",x={})=>({background:bg,color:col,border:"none",borderRadius:6,padding:"14px 28px",fontFamily:T.ff,fontSize:14,fontWeight:"bold",letterSpacing:"0.08em",textTransform:"uppercase",cursor:"pointer",whiteSpace:"nowrap",...x,boxShadow:"4px 4px 14px rgba(0,0,0,0.22)"});
    c.bsm=(bg=T.border,col=T.text)=>({background:bg,color:col,border:"none",borderRadius:5,padding:"10px 18px",fontFamily:T.ff,fontSize:13,fontWeight:"600",cursor:"pointer",whiteSpace:"nowrap",boxShadow:"3px 3px 10px rgba(0,0,0,0.18)"});
    c.inp=(x={})=>({background:"#ffffff08",border:"1px solid "+T.border,borderRadius:6,color:T.text,fontFamily:T.ff,fontSize:13,padding:"9px 12px",outline:"none",width:"100%",boxSizing:"border-box",...x});
    c.lbl={fontSize:10,color:T.muted,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:5,display:"block"};
  }
  useEffect(()=>{
    document.body.style.background=T.bg;
    document.body.style.margin="0";
    document.body.style.padding="0";
    document.documentElement.style.background=T.bg;
  },[]);
  useEffect(()=>store.set("zoom",zoom),[zoom]);
  useEffect(()=>store.set("simp",simp),[simp]);
  useEffect(()=>store.set("contrast",contrast),[contrast]);
  useEffect(()=>store.set("fontSize",fontSize),[fontSize]);
  useEffect(()=>{
    (async()=>{
      try {
        const [sbTxList, sbStock, sbSettings, sbCatalog] = await Promise.all([
          sb.loadTxList(),
          sb.loadStock(),
          sb.loadSettings(),
          sb.loadCatalog(),
        ]);
        if(sbTxList&&sbTxList.length>0) setTxList(sbTxList);
        if(sbStock&&sbStock.length>0) setStock(sbStock);
        if(sbSettings&&Object.keys(sbSettings).length>0){
          setSettings(p=>({...p,...sbSettings}));
          if(sbSettings.gSpot) setGSpot(sbSettings.gSpot);
          if(sbSettings.sSpot) setSSpot(sbSettings.sSpot);
        }
        if(sbCatalog&&sbCatalog.length>0) setCatalog(sbCatalog);
      } catch(e) {
        console.log("Supabase offline, using local data");
      }
    })();
  },[]);

  useEffect(()=>{
    if(document.getElementById("gf-fonts"))return;
    const l=document.createElement("link");l.id="gf-fonts";l.rel="stylesheet";
    l.href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(l);
    const s=document.createElement("style");s.id="gf-reset";
    s.textContent="*{box-sizing:border-box}html,body{margin:0;padding:0;background:"+LIGHT.bg+";min-height:100%}";
    document.head.appendChild(s);
  },[]);
  useEffect(()=>{
    let el=document.getElementById("gf-focus");
    if(!el){el=document.createElement("style");el.id="gf-focus";document.head.appendChild(el);}
    el.textContent="input:focus,select:focus,textarea:focus{outline:2px solid "+T.gold+";outline-offset:1px;}";
  },[]);

  useEffect(()=>{
    const scale=fontSize/14; // 14px = 100% baseline
    const weight=fontSize<=14?400:fontSize<=18?500:fontSize<=24?600:700;
    const root=document.getElementById("root");
    if(root){
      root.style.zoom=scale;
      root.style.fontWeight=weight;
    }
    let el=document.getElementById("gf-fontscale");
    if(!el){el=document.createElement("style");el.id="gf-fontscale";document.head.appendChild(el);}
    el.textContent="#root,#root *{font-weight:"+weight+" !important}"+
      "#root strong,#root b,#root th,#root .bold{font-weight:"+Math.min(weight+200,900)+" !important}";
  },[fontSize]);
  useEffect(()=>store.set("gSpot",gSpot),[gSpot]);
  useEffect(()=>store.set("sSpot",sSpot),[sSpot]);
  useEffect(()=>{
    store.set("catalog",catalog);
    sb.saveCatalog(catalog);
  },[catalog]);
  useEffect(()=>{
    const txListLean=txList.map(t=>({...t,photo:null,itemPhotos:{}}));
    store.set("txList",txListLean);
    if(txList.length>0) sb.saveTx(txList[0]);
  },[txList]);
  const prevStockRef = useRef([]);
  useEffect(()=>{
    store.set("stock",stock);
    const prev = prevStockRef.current;
    const prevIds = new Set(prev.map(s=>s.id));
    const currIds = new Set((stock||[]).map(s=>s.id));
    prev.forEach(s=>{ if(!currIds.has(s.id)) sb.deleteStock(s.id); });
    stock.forEach(s=>{
      const old = prev.find(p=>p.id===s.id);
      if(!old||JSON.stringify(old)!==JSON.stringify(s)) sb.saveStock(s);
    });
    prevStockRef.current = stock;
  },[stock]);
  useEffect(()=>{
    store.set("settings",settings); // localStorage: instant, always
    if(sbSettingsTimer.current) clearTimeout(sbSettingsTimer.current);
    sbSettingsTimer.current=setTimeout(()=>sb.saveSettings(settings),2000);
  },[settings]);

  useEffect(()=>{
    store.set("gSpot",gSpot);
    store.set("sSpot",sSpot);
  },[gSpot,sSpot]);

  useEffect(()=>store.set("vendors",vendors),[vendors]);
  useEffect(()=>store.set("logoLib",logoLib),[logoLib]);
  useEffect(()=>{
    if(logoLib.length===0&&typeof SEED_LOGO==="string"&&SEED_LOGO.length>0){
      const entry={id:"default-logo",data:SEED_LOGO,isLogo:true};
      setLogoLib([entry]);
      setSettings(p=>p.logoImg?p:{...p,logoImg:SEED_LOGO});
    }
  },[]);
  useEffect(()=>store.set("staffList",staffList),[staffList]);
  useEffect(()=>store.set("activeStaff",activeStaff),[activeStaff]);
  useEffect(()=>store.set("frozenSnap",frozenSnap),[frozenSnap]);
  useEffect(()=>store.set("spotLog",spotLog),[spotLog]);
  useEffect(()=>store.set("blacklist",blacklist),[blacklist]);

  const [spotStatus,setSpotStatus] = useState("off");
  const [spotSource,setSpotSource] = useState("");
  const manualTs = useRef(store.get("manualSpotTs",0));
  const sbSettingsTimer = useRef(null); // debounce Supabase settings writes
  const MANUAL_TTL = 60*60*1000; // 60 minutes in ms
  const isManualActive = ()=>(Date.now()-manualTs.current)<MANUAL_TTL;

  const setGSpotManual = v=>{setGSpot(v);manualTs.current=Date.now();store.set("manualSpotTs",manualTs.current);setSpotSource("manual");setSpotStatus("manual");};
  const setSSpotManual = v=>{setSSpot(v);manualTs.current=Date.now();store.set("manualSpotTs",manualTs.current);setSpotSource("manual");setSpotStatus("manual");};

  const forceResumeAPI=async()=>{
    const k1=settings.goldApiKey;
    const k2=settings.metalsApiKey;
    const k3=settings.metalsDevKey;
    if(!k1&&!k2&&!k3){
      pop("No API keys — add at least one key in Settings → Spot Feed.","warn");
      return;
    }
    pop("Fetching live prices…","ok");
    const tryFetch=async(url,headers)=>{
      try{const r=await fetch(url,{headers});if(!r.ok)return null;return await r.json();}catch(e){return null;}
    };
    if(k1){
      const [gD,sD]=await Promise.all([
        tryFetch("https://www.goldapi.io/api/XAU/AUD",{"x-access-token":k1,"Content-Type":"application/json"}),
        tryFetch("https://www.goldapi.io/api/XAG/AUD",{"x-access-token":k1,"Content-Type":"application/json"}),
      ]);
      const g=gD&&(gD.price||gD.ask||gD.bid);
      const s=sD&&(sD.price||sD.ask||sD.bid);
      if(g&&s){
        manualTs.current=0;store.set("manualSpotTs",0);
        setGSpot(parseFloat(Number(g).toFixed(2)));
        setSSpot(parseFloat(Number(s).toFixed(2)));
        setSpotStatus("live");setSpotSource("GoldAPI");
        pop("🟢 Live prices from GoldAPI.","ok");return;
      }
    }
    if(k2){
      const d=await tryFetch("https://metals-api.com/api/latest?access_key="+k2+"&base=AUD&symbols=XAU,XAG",{});
      if(d&&d.success&&d.rates){
        const g=d.rates.AUDXAU||(d.rates.XAU?1/d.rates.XAU:null);
        const s=d.rates.AUDXAG||(d.rates.XAG?1/d.rates.XAG:null);
        if(g&&s){
          manualTs.current=0;store.set("manualSpotTs",0);
          setGSpot(parseFloat(Number(g).toFixed(2)));
          setSSpot(parseFloat(Number(s).toFixed(2)));
          setSpotStatus("live");setSpotSource("Metals-API");
          pop("🟢 Live prices from Metals-API.","ok");return;
        }
      }
    }
    if(k3){
      const d=await tryFetch("https://api.metals.dev/v1/latest?api_key="+k3+"&currency=AUD&unit=troy_oz",{});
      if(d&&d.metals&&d.metals.gold&&d.metals.silver){
        manualTs.current=0;store.set("manualSpotTs",0);
        setGSpot(parseFloat(Number(d.metals.gold).toFixed(2)));
        setSSpot(parseFloat(Number(d.metals.silver).toFixed(2)));
        setSpotStatus("live");setSpotSource("Metals.Dev");
        pop("🟢 Live prices from Metals.Dev.","ok");return;
      }
    }
    pop("Could not reach any price API. Check your keys in Settings → Spot Feed.","warn");
  };

  useEffect(()=>{
    const k1=settings.goldApiKey;
    const k2=settings.metalsApiKey;
    const k3=settings.metalsDevKey;
    if(!k1&&!k2&&!k3){setSpotStatus("off");return;}

    const applySpot=(g,s,src)=>{
      setSpotLog(prev=>{const entry={t:nowISO(),g,s,src};return[entry,...prev].slice(0,90);});
      if(isManualActive()) return; // manual override active — ignore API data
      if(spotStatus==="manual") setSpotStatus("stale");
      setGSpot(parseFloat(Number(g).toFixed(2)));
      setSSpot(parseFloat(Number(s).toFixed(2)));
      setSpotStatus("live");
      setSpotSource(src);
      const ga=settings.goldAlert;const sa=settings.silverAlert;
      if(ga&&g>=parseFloat(ga)) pop("⬡ Gold hit your alert: "+fmtAUD(parseFloat(ga)),"ok");
      if(sa&&s>=parseFloat(sa)) pop("◈ Silver hit your alert: "+fmtAUD(parseFloat(sa)),"ok");
    };

    const tryGoldAPI=async()=>{
      if(!k1) return false;
      try{
        const [gR,sR]=await Promise.all([
          fetch("https://www.goldapi.io/api/XAU/AUD",{headers:{"x-access-token":k1,"Content-Type":"application/json"}}),
          fetch("https://www.goldapi.io/api/XAG/AUD",{headers:{"x-access-token":k1,"Content-Type":"application/json"}}),
        ]);
        if(!gR.ok||!sR.ok) return false;
        const [gD,sD]=await Promise.all([gR.json(),sR.json()]);
        const g=gD.price||gD.ask||gD.bid;
        const s=sD.price||sD.ask||sD.bid;
        if(!g||!s) return false;
        applySpot(parseFloat(g),parseFloat(s),"GoldAPI");
        return true;
      }catch(e){return false;}
    };

    const tryMetalsAPI=async()=>{
      if(!k2) return false;
      try{
        const r=await fetch("https://metals-api.com/api/latest?access_key="+k2+"&base=AUD&symbols=XAU,XAG");
        if(!r.ok) return false;
        const d=await r.json();
        if(!d.success||!d.rates) return false;
        const g=d.rates.AUDXAU||( d.rates.XAU ? 1/d.rates.XAU : null);
        const s=d.rates.AUDXAG||( d.rates.XAG ? 1/d.rates.XAG : null);
        if(!g||!s) return false;
        applySpot(parseFloat(g),parseFloat(s),"Metals-API");
        return true;
      }catch(e){return false;}
    };

    const tryMetalsDev=async()=>{
      if(!k3) return false;
      try{
        const r=await fetch("https://api.metals.dev/v1/latest?api_key="+k3+"&currency=AUD&unit=troy_oz");
        if(!r.ok) return false;
        const d=await r.json();
        const g=d.metals&&d.metals.gold;
        const s=d.metals&&d.metals.silver;
        if(!g||!s) return false;
        applySpot(parseFloat(g),parseFloat(s),"Metals.Dev");
        return true;
      }catch(e){return false;}
    };

    const fetchSpot=async()=>{
      if(isManualActive()){setSpotStatus("manual");setSpotSource("manual");return;}
      setSpotStatus("stale");
      const ok=await tryGoldAPI() || await tryMetalsAPI() || await tryMetalsDev();
      if(!ok) setSpotStatus("stale");
    };

    fetchSpot();
    const id=setInterval(fetchSpot,5*60*1000);
    return()=>clearInterval(id);
  },[settings.goldApiKey,settings.metalsApiKey,settings.metalsDevKey]);

  const pop=(msg,type="ok")=>{setNotify({msg,type});setTimeout(()=>setNotify(null),4000);};
  const nowISO=()=>new Date().toISOString();
  const dlFile=(content,filename,mime)=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([content],{type:mime||"text/plain"}));a.download=filename;a.click();};
  const isBlacklistedName=(name)=>name&&blacklist.some(b=>b.name.toLowerCase()===(name||"").toLowerCase());

  const GOLD_P={"24ct":1,"23ct":0.9583,"22ct":0.9167,"21ct":0.875,"20ct":0.8333,"18ct":0.75,"14ct":0.5833,"10ct":0.4167,"9ct":0.375};
  const SILV_P={".999":0.999,".925":0.925,".900":0.9,".835":0.835,".800":0.8,".500":0.5};
  const spotForCalc=()=>frozenSnap?{g:frozenSnap.gSpot,s:frozenSnap.sSpot}:{g:gSpot,s:sSpot};
  const calcMelt=(item)=>{
    const{g,s}=spotForCalc();
    const metal=(item.product&&item.product.cat)||item.metalCat||"";
    const weight=parseFloat(item.weight_g||item.qty||0);
    if(!weight) return null;
    if(metal==="Gold"){
      const purityKey=item.purity||(item.product&&item.product.purity)||"";
      const caratNum=parseFloat(item.carat||(item.product&&item.product.carat)||0);
      const purityNum=parseFloat(item.purity||(item.product&&item.product.purity)||0);
      if(GOLD_P[purityKey]) return weight*(g/31.1035)*GOLD_P[purityKey];
      if(caratNum>0) return weight*(g/31.1035)*(caratNum/24);
      if(purityNum>0&&purityNum<=1) return weight*(g/31.1035)*purityNum;
      return null;
    }
    if(metal==="Silver"){
      const purityKey=item.purity||(item.product&&item.product.purity)||"";
      const purityNum=parseFloat(item.purity||(item.product&&item.product.purity)||0);
      if(SILV_P[purityKey]) return weight*(g/31.1035)*SILV_P[purityKey];
      if(purityNum>0&&purityNum<=1) return weight*(g/31.1035)*purityNum;
      return null;
    }
    return null;
  };

  const makeReceipt=(tx)=>{
    const b=settings.businessName||"The Gold Shop";
    const lines2=["========================================",
      b.toUpperCase(),"ABN: "+(settings.abn||"—"),settings.address||"",
      "========================================",
      "CONTRACT:  "+tx.id,"DATE:      "+new Date(tx.date).toLocaleString("en-AU"),
      "CLIENT:    "+((tx.client&&tx.client.fullName)||"—"),
      "STAFF:     "+(tx.staffName||"—"),
      "----------------------------------------"];
    (tx.items||[]).forEach((it,i)=>{
      lines2.push((i+1)+". "+(it.product&&it.product.label||it.description||"Item").slice(0,30));
      lines2.push("   Mode:"+it.mode.toUpperCase()+" Price:"+fmtAUD(it.price));
      if(it.note) lines2.push("   Note:"+it.note.slice(0,40));
    });
    lines2.push("----------------------------------------");
    if(tx.buyTotal>0) lines2.push("BUY TOTAL:  "+fmtAUD(tx.buyTotal));
    if(tx.sellTotal>0) lines2.push("SELL TOTAL: "+fmtAUD(tx.sellTotal));
    lines2.push("NET:        "+fmtAUD(Math.abs(tx.net||0))+(tx.net>=0?" (client pays)":" (we pay)"));
    lines2.push("PAYMENT:    "+(tx.payment||"").toUpperCase());
    lines2.push("========================================");
    lines2.push("Signature: _____________________________");
    lines2.push("Date:      _____________________________");
    lines2.push("========================================");
    lines2.push("Second-hand dealer: "+b);
    lines2.push("Licensed under the Second-Hand Dealers");
    lines2.push("& Pawnbrokers Act 1989 (Vic)");
    lines2.push("AUSTRAC reporting entity");
    return lines2.join("\n");
  };

  const todayStr=()=>nowISO().slice(0,10);
  const todayTxData=useMemo(()=>txList.filter(t=>t.date&&t.date.slice(0,10)===nowISO().slice(0,10)),[txList]);
  const todayTx=()=>todayTxData;

  const dlAccounting=()=>{
    const spot=spotForCalc();
    const snapNote=frozenSnap?"FROZEN "+frozenSnap.frozenAt+" Au:"+fmtAUD(frozenSnap.gSpot)+"/oz Ag:"+fmtAUD(frozenSnap.sSpot)+"/oz":"LIVE Au:"+fmtAUD(spot.g)+"/oz Ag:"+fmtAUD(spot.s)+"/oz";
    const s1=[["TRANSACTION REGISTER","","","","","","","","","",""],
      ["Spot prices: "+snapNote,"","","","","","","","","",""],
      ["Invoice","Date","Client","Item","Metal","Purity","Weight(g)","Bought($)","Sold($)","Margin($)","GST Treatment","GST Est($)","Status"]];
    txList.forEach(tx=>{
      (tx.items||[]).forEach(it=>{
        const bought=it.mode==="buy"?it.price||0:0;
        const sold=it.mode==="sell"?it.price||0:0;
        const margin=sold-bought;
        const gst=it.gstApplicable===false?"GST-Free":it.gstScheme==="margin"?"Margin Scheme":"Standard 10%";
        const gstEst=it.gstApplicable===false?0:it.gstScheme==="margin"?Math.max(0,margin/11):(sold*0.1);
        s1.push([tx.id,tx.date&&tx.date.slice(0,10),(tx.client&&tx.client.fullName)||"—",
          (it.product&&it.product.label)||it.description||"—",
          (it.product&&it.product.cat)||"—",(it.purity||it.product&&it.product.carat&&it.product.carat+"ct")||"—",
          it.qty||"—",bought||"",sold||"",margin||"",gst,gstEst.toFixed(2),tx.voided?"VOIDED":"OK"]);
      });
    });
    const s2=[["STOCK VALUATION","","","","","","","",""],
      ["Spot used: "+snapNote,"","","","","","","",""],
      ["Item","Invoice #","Metal","Purity","Weight(g)","Bought($)","Melt Value($)","Unrealised P&L($)","GST","Days Held","Status"]];
    (stock||[]).filter(s=>!s.sold).forEach(s=>{
      const mv=calcMelt(s);
      const bought=s.price||0;
      const pl=mv!=null?mv-bought:null;
      const days=s.date?Math.floor((Date.now()-new Date(s.date))/86400000):0;
      s2.push([(s.description||(s.product&&s.product.label)||"—"),s.txId||"—",
        (s.product&&s.product.cat)||s.metalCat||"—",s.purity||"—",s.weight_g||"—",
        bought.toFixed(2),mv!=null?mv.toFixed(2):"—",pl!=null?pl.toFixed(2):"—",
        s.gstApplicable===false?"GST-Free":"Taxable",days,s.policeHold?"POLICE HOLD":hoursLeft(s.holdUntil)>0?"In Hold":"Ready"]);
    });
    const period=frozenSnap?frozenSnap.frozenAt:todayStr();
    let totSales=0,totPurch=0,totMarginGST=0,totStdGST=0;
    txList.forEach(tx=>{(tx.items||[]).forEach(it=>{
      if(it.mode==="sell"&&it.gstApplicable!==false){
        totSales+=it.price||0;
        if(it.gstScheme==="margin") totMarginGST+=Math.max(0,((it.price||0)-(it.boughtAt||0))/11);
        else totStdGST+=(it.price||0)*0.1;
      }
      if(it.mode==="buy") totPurch+=it.price||0;
    });});
    const s3=[["GST SUMMARY",""],["Period to: "+period,""],
      ["Total Sales (excl. GST-free)","$"+totSales.toFixed(2)],
      ["Total Purchases","$"+totPurch.toFixed(2)],
      ["Standard GST on sales (10%)","$"+totStdGST.toFixed(2)],
      ["Margin Scheme GST (margin÷11)","$"+totMarginGST.toFixed(2)],
      ["TOTAL GST PAYABLE (est)","$"+(totStdGST+totMarginGST).toFixed(2)],
      ["",""],["DISCLAIMER: Estimate only. Confirm with registered tax agent.",""]];
    const s4=[["COMPLIANCE LOG","","","","",""],
      ["Invoice","Date","Client","TTR Status","SMR Flagged","KYC Done","Police Hold","Voided"]];
    txList.forEach(tx=>s4.push([tx.id,tx.date&&tx.date.slice(0,10),(tx.client&&tx.client.fullName)||"—",
      tx.ttrStatus||"N/A",tx.smrFlagged?"YES":"",tx.kycDone?"YES":"",
      tx.items&&tx.items.some(i=>i.policeHold)?"YES":"",tx.voided?"YES":""]));
    const DQ=String.fromCharCode(34);
    const escCSV=v=>{
      const s=String(v==null?"":v).replace(/[\r\n]+/g," ");
      return DQ+s.split(DQ).join(DQ+DQ)+DQ;
    };
    const toCSV=rows=>rows.map(r=>r.map(escCSV).join(",")).join("\n");
    const sep=(title)=>"\n\n"+title+"\n"+"-".repeat(title.length)+"\n";
    const full=
      "LOOT LEDGR — ACCOUNTING EXPORT\n"+
      "Business: "+(settings.businessName||"")+"  ABN: "+(settings.abn||"")+"\n"+
      "Exported: "+nowISO().slice(0,10)+"  Spot: "+snapNote+"\n"+
      sep("1. TRANSACTION REGISTER")+toCSV(s1)+
      sep("2. STOCK VALUATION")+toCSV(s2)+
      sep("3. GST SUMMARY")+toCSV(s3)+
      sep("4. COMPLIANCE LOG")+toCSV(s4);
    dlFile(full,"lootledgr-accounting-"+todayStr()+".csv","text/csv");
    pop("Accounting export downloaded.","ok");
  };

  const dlBackup=()=>{
    const snap={version:APP_VERSION,exportedAt:nowISO(),
      txList,stock,catalog,settings:{...settings,logoImg:null},
      vendors,staffList,blacklist,frozenSnap,spotLog};
    dlFile(JSON.stringify(snap,null,2),"lootledgr-backup-"+todayStr()+".json","application/json");
    pop("Backup downloaded.","ok");
  };
  const restoreBackup=(file)=>{
    const r=new FileReader();
    r.onload=ev=>{
      try{
        const d=JSON.parse(ev.target.result);
        if(!d.txList||!d.stock) {pop("Invalid backup file.","err");return;}
        if(d.txList) setTxList(d.txList);
        if(d.stock) setStock(d.stock);
        if(d.catalog) setCatalog(d.catalog);
        if(d.vendors) setVendors(d.vendors);
        if(d.staffList) setStaffList(d.staffList);
        if(d.blacklist) setBlacklist(d.blacklist);
        if(d.frozenSnap) setFrozenSnap(d.frozenSnap);
        pop("Backup restored successfully.","ok");
      }catch(e){pop("Restore failed: "+e.message,"err");}
    };
    r.readAsText(file);
  };

  const compliance = useMemo(()=>checkCompliance(txItems,txPay,settings.ttrEnabled!==false),[txItems,txPay,settings.ttrEnabled]);
  const complianceRef = useRef(compliance);
  useEffect(()=>{complianceRef.current=compliance;},[compliance]);
  const buyTotal  = txItems.filter(i=>i.mode==="buy").reduce((s,i)=>s+(i.price||0),0);
  const sellTotal = txItems.filter(i=>i.mode==="sell").reduce((s,i)=>s+(i.price||0),0);
  const net       = sellTotal - buyTotal;

  const addProd = catalog.find(p=>p.id===addId);
  const addUnit = addProd?calcUnitPrice(addProd,gSpot,sSpot,addMode):null;
  const addQtyN = parseFloat(addQty)||0;
  const addCalc = (addUnit!=null&&addQtyN)?addUnit*addQtyN:(parseFloat(addCustom)||0);

  const handleAddItem=()=>{
    if(!addProd||!addCalc){pop("Enter quantity or price.","warn");return;}
    setTxItems(p=>[...p,{
      id:uid(),mode:addMode,product:addProd,qty:addQtyN||1,
      unitPrice:addUnit,price:addCalc,note:addNote,
      holdUntil:addMode==="buy"?addHours(new Date().toISOString(),THRESH.HOLD_HOURS):null,
      policeHold:false,
    }]);
    setAddQty("");setAddCustom("");setAddNote("");
    pop("Added: "+addProd.label,"ok");
  };

  const handleToCompliance=()=>{
    if(txItems.length===0){pop("Add at least one item.","warn");return;}
    setTxStep(2);
  };

  const submitPin=()=>{
    if(!settings.staffPin){pop("No manager PIN set. Set one in Settings → Business first.","warn");setPinModal(null);return;}
    if(pinVal===settings.staffPin){pinModal&&pinModal.cb&&pinModal.cb();setPinModal(null);setPinVal("");}
    else{pop("Incorrect PIN.","err");setPinVal("");}
  };

  const handleToClient=()=>{
    if(compliance.requiresKYC&&!kycDone){pop("KYC must be completed — AUSTRAC hard block.","err");return;}
    const hasCashWarn=compliance.flags.some(f=>f.key==="cash_warn");
    if(hasCashWarn){setPinModal({reason:"Cash transaction ≥ $2,000 — Manager acknowledgement required.",cb:()=>setTxStep(3)});setPinVal("");}
    else setTxStep(3);
  };

  const finalize=()=>{
    if(!client.fullName||!client.dob||!client.address||!client.idType||!client.idNumber){pop("Client form incomplete.","err");return;}
    if(!idSighted){pop("Staff must confirm ID sighted.","err");return;}
    if(!privAck){pop("Client must acknowledge Privacy Notice.","err");return;}
    const now=nowISO();
    const realInv=makeInv(); // consume the counter NOW — only at actual save
    const phData={idPhoto:compliance.requiresKYC?photo:null,itemPhotos};
    const hasPh=!!(phData.idPhoto||Object.keys(phData.itemPhotos||{}).length>0);
    const photoKey=hasPh?"photos_"+realInv:null;
    if(hasPh)store.set(photoKey,phData);
    const tx={
      id:realInv,date:now,items:txItems,payment:txPay,
      buyTotal,sellTotal,net,client,staff,idSighted,
      photo:phData.idPhoto||null,
      itemPhotos:phData.itemPhotos||{},
      hasPhotos:hasPh,photoKey,kycDone,
      flags:compliance.flags.map(f=>f.key),
      ttrRequired:compliance.flags.some(f=>f.key==="ttr"),
      ttrStatus:compliance.flags.some(f=>f.key==="ttr")?"PENDING":null,
      smrFlagged:!!staff.smrFlagged,deleteAfter:sevenYrsFrom(now),
    };
    const newStock=txItems.filter(i=>i.mode==="buy").map(i=>({
      id:uid(),txId:realInv,date:now,
      product:i.product,qty:i.qty,price:i.price,
      description:i.note||i.product.label,
      purity:i.purity||(i.product&&i.product.purity)||null,
      carat:i.carat||(i.product&&i.product.carat)||null,
      weight_g:i.weight_g||( i.product&&i.product.unit==="g" ? i.qty : null ),
      holdUntil:i.holdUntil,
      policeHold:!!(i.policeHold),
      suspicious:!!(i.suspicious),
      storageLocation:staff.storageLocation||"",
      deleteAfter:sevenYrsFrom(now),
    }));
    setTxList(p=>[tx,...p].slice(0,500)); // cap in-memory list; full history in Supabase
    setStock(p=>[...newStock,...p]);
    setTxNo(peekInv()); // update display to next invoice preview
    setTxStep(6);
    pushIntegrations(tx).catch(()=>{});
  };

  const sendSquareSell=async()=>{
    if(!settings.squareToken||!settings.squareLoc){pop("Configure Square in Settings.","warn");return;}
    const sells=txItems.filter(i=>i.mode==="sell");
    if(!sells.length){pop("No sell items.","warn");return;}
    try{
      const r=await fetch("https://connect.squareup.com/v2/online-checkout/payment-links",{
        method:"POST",
        headers:{"Content-Type":"application/json","Square-Version":"2024-11-20","Authorization":"Bearer "+settings.squareToken},
        body:JSON.stringify({idempotency_key:uid(),
          checkout_options:{redirect_url:settings.squareRedirect||window.location.href},
          order:{location_id:settings.squareLoc,
            line_items:sells.map(i=>({name:("[SALE] "+i.product.label).slice(0,500),quantity:"1",
              base_price_money:{amount:Math.round((i.price||0)*100),currency:"AUD"}}))},
        }),
      });
      const d=await r.json();
      if(d.payment_link&&d.payment_link.url){window.open(d.payment_link.url,"_blank");pop("Square checkout opened.","ok");}
      else pop("Square error: "+((d.errors&&d.errors[0]&&d.errors[0].detail)||"Unknown"),"err");
    }catch(e){pop("Square sell failed: "+e.message,"err");}
  };

  const sendSquareBuy=async(invNo,buyItems,totalAmt,clientName,payMethod)=>{
    if(!settings.squareToken||!settings.squareLoc) return{ok:false,msg:"Square not configured"};
    try{
      const orderR=await fetch("https://connect.squareup.com/v2/orders",{
        method:"POST",
        headers:{"Content-Type":"application/json","Square-Version":"2024-11-20","Authorization":"Bearer "+settings.squareToken},
        body:JSON.stringify({idempotency_key:"buy-"+invNo,order:{
          location_id:settings.squareLoc,
          reference_id:"GF-BUY-"+invNo,
          note:"VENDOR PURCHASE | Loot #"+invNo+" | Supplier: "+(clientName||"Walk-in"),
          line_items:buyItems.map(i=>({
            name:("[PURCHASE] "+i.product.label).slice(0,500),
            quantity:"1",
            note:i.note||"",
            base_price_money:{amount:Math.round((i.price||0)*100),currency:"AUD"},
          })),
          metadata:{transaction_type:"vendor_purchase",invoice:invNo,supplier:clientName||""},
        }}),
      });
      const od=await orderR.json();
      if(!od.order) return{ok:false,msg:"Square order error: "+((od.errors&&od.errors[0]&&od.errors[0].detail)||JSON.stringify(od))};
      const srcId=payMethod==="cash"?"CASH":"EXTERNAL";
      const payR=await fetch("https://connect.squareup.com/v2/payments",{
        method:"POST",
        headers:{"Content-Type":"application/json","Square-Version":"2024-11-20","Authorization":"Bearer "+settings.squareToken},
        body:JSON.stringify({idempotency_key:"pay-"+invNo,
          source_id:srcId,order_id:od.order.id,location_id:settings.squareLoc,
          amount_money:{amount:Math.round(totalAmt*100),currency:"AUD"},
          note:"Vendor purchase #"+invNo,
          external_details:srcId==="EXTERNAL"?{type:"OTHER",source:"Loot Ledgr"}:undefined,
        }),
      });
      const pd=await payR.json();
      if(pd.payment&&(pd.payment.status==="COMPLETED"||pd.payment.status==="APPROVED"))
        return{ok:true,msg:"Square vendor expense recorded"};
      return{ok:false,msg:"Square payment error: "+((pd.errors&&pd.errors[0]&&pd.errors[0].detail)||JSON.stringify(pd))};
    }catch(e){return{ok:false,msg:"Square buy failed: "+e.message};}
  };

  const SCALE_STD_SVC  = "0000181d-0000-1000-8000-00805f9b34fb";
  const SCALE_STD_CHAR = "00002a9d-0000-1000-8000-00805f9b34fb";
  const SCALE_FEAT     = "00002a9e-0000-1000-8000-00805f9b34fb";

  const NUS_SVC   = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
  const NUS_RX    = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
  const NUS_TX    = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

  const parseStdWeight=(dataView)=>{
    const flags=dataView.getUint8(0);
    const raw=dataView.getUint16(1,true); // little-endian
    const isImperial=(flags&0x01)!==0;
    const isStable=(flags&0x04)===0; // bit 2 = time-stamp present; bit 1 = user ID present
    if(isImperial){
      const lbs=raw*0.01;
      return{g:lbs*453.592,raw:lbs.toFixed(3)+" lb",stable:true};
    } else {
      const kg=raw*0.005;
      return{g:kg*1000,raw:kg.toFixed(3)+" kg",stable:true};
    }
  };

  const parseAsciiWeight=(str)=>{
    const s=str.replace(/[\r\n]+/g,"").trim();
    const ohaus=/[A-Z]{2},[A-Z]{2},[+-]?(\d+\.?\d*)\s*([a-zA-Z]+)?/.exec(s);
    if(ohaus){
      const val=parseFloat(ohaus[1]);
      const unit=(ohaus[2]||"g").toLowerCase();
      return toGrams(val,unit);
    }
    const generic=/[+-]?\s*(\d+\.?\d*)\s*([a-zA-Z]+)?/.exec(s);
    if(generic){
      const val=parseFloat(generic[1]);
      const unit=(generic[2]||"g").toLowerCase();
      return toGrams(val,unit);
    }
    return null;
  };

  const toGrams=(val,unit)=>{
    if(!val||isNaN(val)) return null;
    if(unit==="kg"||unit==="kgs") return{g:val*1000,raw:val.toFixed(3)+"kg",stable:true};
    if(unit==="lb"||unit==="lbs") return{g:val*453.592,raw:val.toFixed(3)+"lb",stable:true};
    if(unit==="oz"&&!unit.includes("t")) return{g:val*28.3495,raw:val.toFixed(3)+"oz",stable:true};
    if(unit==="ozt"||unit==="toz"||unit==="t.oz") return{g:val*31.1035,raw:val.toFixed(3)+"ozt",stable:true};
    if(unit==="ct"||unit==="cts") return{g:val*0.2,raw:val.toFixed(2)+"ct",stable:true};
    return{g:val,raw:val.toFixed(3)+"g",stable:true}; // assume grams
  };

  const fmtScaleWeight=(reading)=>{
    if(!reading) return "—";
    const u=settings.scaleUnit||"g";
    if(u==="ozt") return (reading.g/31.1035).toFixed(4)+" ozt";
    if(u==="oz")  return (reading.g/28.3495).toFixed(3)+" oz";
    return (reading.g).toFixed(3)+" g";
  };

  const connectScale=async()=>{
    if(!navigator.bluetooth){
      pop("Web Bluetooth not supported in this browser. Use Chrome or Edge on Android.","err");
      return;
    }
    try{
      setScaleStatus("connecting");
      pop("Opening Bluetooth scanner…","ok");

      const proto=settings.scaleProtocol||"auto";
      const filters=[];
      const optServices=[];

      if(proto==="auto"||proto==="standard"){
        optServices.push(SCALE_STD_SVC);
      }
      if(proto==="auto"||proto==="nordic_uart"){
        optServices.push(NUS_SVC);
      }
      if(proto==="custom"&&settings.scaleCustomServiceUUID){
        optServices.push(settings.scaleCustomServiceUUID.toLowerCase());
      }

      const device=await navigator.bluetooth.requestDevice({
        acceptAllDevices:true,
        optionalServices:optServices.length?optServices:[SCALE_STD_SVC,NUS_SVC],
      });

      device.addEventListener("gattserverdisconnected",()=>{
        setScaleStatus("off");
        setScaleDevice(null);
        setScaleLive(null);
        pop("Scale disconnected.","warn");
      });

      const server=await device.gatt.connect();
      setScaleDevice(device);
      let connected=false;

      if((proto==="auto"||proto==="standard")&&!connected){
        try{
          const svc=await server.getPrimaryService(SCALE_STD_SVC);
          const char=await svc.getCharacteristic(SCALE_STD_CHAR);
          await char.startNotifications();
          char.addEventListener("characteristicvaluechanged",e=>{
            const r=parseStdWeight(e.target.value);
            if(r) setScaleLive(r);
          });
          connected=true;
          pop("Scale connected (Standard BLE Weight Profile).","ok");
        }catch(e){}
      }

      if((proto==="auto"||proto==="nordic_uart")&&!connected){
        try{
          const svc=await server.getPrimaryService(NUS_SVC);
          const tx=await svc.getCharacteristic(NUS_TX);
          await tx.startNotifications();
          let buf="";
          tx.addEventListener("characteristicvaluechanged",e=>{
            const chunk=new TextDecoder().decode(e.target.value);
            buf+=chunk;
            if(buf.includes("\n")||buf.includes("\r")||buf.length>30){
              const r=parseAsciiWeight(buf);
              if(r) setScaleLive(r);
              buf="";
            }
          });
          connected=true;
          pop("Scale connected (Nordic UART / ASCII protocol).","ok");
        }catch(e){}
      }

      if((proto==="custom"||proto==="auto")&&!connected&&settings.scaleCustomServiceUUID){
        try{
          const svc=await server.getPrimaryService(settings.scaleCustomServiceUUID.toLowerCase());
          const char=await svc.getCharacteristic(settings.scaleCustomCharUUID.toLowerCase());
          await char.startNotifications();
          char.addEventListener("characteristicvaluechanged",e=>{
            const txt=new TextDecoder().decode(e.target.value);
            const r=parseAsciiWeight(txt)||parseStdWeight(e.target.value);
            if(r) setScaleLive(r);
          });
          connected=true;
          pop("Scale connected (custom UUID).","ok");
        }catch(e){}
      }

      if(connected){
        setScaleStatus("connected");
      } else {
        setScaleStatus("error");
        pop("Connected to device but no recognised scale service found. Try setting Protocol in Settings.","warn");
      }
    }catch(e){
      setScaleStatus("off");
      if(e.name!=="NotFoundError") pop("Scale: "+e.message,"err");
      else pop("No device selected.","warn");
    }
  };

  const disconnectScale=()=>{
    if(scaleDevice&&scaleDevice.gatt&&scaleDevice.gatt.connected){
      scaleDevice.gatt.disconnect();
    }
    setScaleStatus("off");
    setScaleDevice(null);
    setScaleLive(null);
  };

  const sendDuressSMS=async(contact,msg)=>{
    const p=settings.smsProvider||"sms_uri";

    if(p==="textbelt"){
      try{
        const r=await fetch("https://textbelt.com/text",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({phone:contact,message:msg,key:settings.textbeltKey||"textbelt"}),
        });
        const d=await r.json();
        return d.success?{ok:true,msg:"Sent via Textbelt"}:{ok:false,msg:"Textbelt: "+(d.error||"quota exceeded — buy credits at textbelt.com")};
      }catch(e){return{ok:false,msg:"Textbelt error: "+e.message};}
    }

    if(p==="webhook"){
      if(!settings.duressWebhookUrl) return{ok:false,msg:"Webhook URL not configured"};
      try{
        const r=await fetch(settings.duressWebhookUrl,{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({type:"DURESS_ALERT",message:msg,contact,
            contacts:[contact],address:settings.address||"",
            business:settings.businessName||"",timestamp:new Date().toISOString()}),
        });
        return r.ok||r.status===0?{ok:true,msg:"Sent via webhook"}:{ok:false,msg:"Webhook error: "+r.status};
      }catch(e){return{ok:false,msg:"Webhook error: "+e.message};}
    }

    if(p==="twilio_fn"){
      if(!settings.twilioFnUrl) return{ok:false,msg:"Twilio Function URL not configured"};
      try{
        const r=await fetch(settings.twilioFnUrl,{
          method:"POST",
          headers:{"Content-Type":"application/x-www-form-urlencoded"},
          body:"contact="+encodeURIComponent(contact)+"&message="+encodeURIComponent(msg)+"&contacts="+encodeURIComponent(contact),
        });
        const d=await r.json().catch(()=>({}));
        return d.sent||r.ok?{ok:true,msg:"Sent via Twilio Function"}:{ok:false,msg:"Twilio Function error: "+r.status};
      }catch(e){return{ok:false,msg:"Twilio Function error: "+e.message};}
    }

    const encoded=encodeURIComponent(msg);
    window.open("sms:"+contact+"?body="+encoded);
    return{ok:true,msg:"SMS app opened for "+contact};
  };

  const triggerDuress=async()=>{
    setDuressActive(true);
    let locStr=settings.address||settings.businessName||"Address not set in app";
    try{
      const pos=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{timeout:5000}));
      const lat=pos.coords.latitude.toFixed(5),lng=pos.coords.longitude.toFixed(5);
      locStr=(settings.address||"Our address")+" (GPS "+lat+","+lng+" maps.google.com/?q="+lat+","+lng+")";
    }catch(e){
      try{
        const r=await fetch("https://ipapi.co/json/");
        const d=await r.json();
        if(d.city) locStr=(settings.address||"Our address")+" (approx "+d.city+", "+d.region+")";
      }catch(e2){}
    }
    const msg="URGENT — There is a robbery/aggression happening at our shop right now. "+
      "Please call 000 immediately. Our address is: "+locStr;
    const contacts=[
      settings.duressContact1,settings.duressContact2,settings.duressContact3,
      settings.duressContact4,settings.duressContact5,settings.duressContact6,
      settings.duressContact7,settings.duressContact8,settings.duressContact9,
      settings.duressContact10,
    ].map(s=>(s||"").trim()).filter(Boolean);
    let sent=0;
    for(const contact of contacts){
      const r=await sendDuressSMS(contact,msg);
      if(r.ok) sent++;
    }
    const provider=(settings.smsProvider||"sms_uri")==="sms_uri"?"SMS app":settings.smsProvider;
    pop("🚨 DURESS — "+sent+"/"+contacts.length+" contacts alerted via "+provider+". Call 000 NOW if not done.","err");
    setTimeout(()=>setDuressActive(false),5*60*1000);
  };

  // genPoliceReport moved to module scope

  const sendEftpos=async(amountAUD)=>{
    const provider=settings.eftposProvider||"none";

    if(provider==="square"){
      if(!settings.squareToken||!settings.squareTerminalId)
        return{ok:false,msg:"Square terminal not configured. Add Access Token and Terminal Device ID in Settings."};
      try{
        const r=await fetch("https://connect.squareup.com/v2/terminals/checkouts",{
          method:"POST",
          headers:{"Content-Type":"application/json","Square-Version":"2024-11-20","Authorization":"Bearer "+settings.squareToken},
          body:JSON.stringify({
            idempotency_key:"eftpos-"+txNo+"-"+Date.now(),
            checkout:{
              amount_money:{amount:Math.round(amountAUD*100),currency:"AUD"},
              device_options:{device_id:settings.squareTerminalId,skip_receipt_screen:false},
              note:"Loot Ledgr #"+txNo,
              payment_options:{autocomplete:true},
            },
          }),
        });
        const d=await r.json();
        if(d.checkout&&d.checkout.id){
          const checkId=d.checkout.id;
          pop("Payment sent to terminal — waiting for customer to tap/insert…","ok");
          for(let attempt=0;attempt<18;attempt++){
            await new Promise(res=>setTimeout(res,5000));
            const poll=await fetch("https://connect.squareup.com/v2/terminals/checkouts/"+checkId,{
              headers:{"Authorization":"Bearer "+settings.squareToken,"Square-Version":"2024-11-20"},
            });
            const pd=await poll.json();
            const status=pd.checkout&&pd.checkout.status;
            if(status==="COMPLETED") return{ok:true,msg:"EFTPOS payment approved."};
            if(status==="CANCELED"||status==="CANCEL_REQUESTED") return{ok:false,msg:"Payment cancelled at terminal."};
          }
          return{ok:false,msg:"Terminal timeout — check terminal screen."};
        }
        return{ok:false,msg:"Square terminal error: "+((d.errors&&d.errors[0]&&d.errors[0].detail)||"Unknown")};
      }catch(e){return{ok:false,msg:"Square terminal error: "+e.message};}
    }

    if(provider==="linkly"){
      const base=settings.linklyBaseUrl||"http://localhost:4242";
      try{
        const r=await fetch(base+"/api/v1/transaction/purchase",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            PurchaseAnalysisData:{},
            Request:{
              TxnType:"P",               // Purchase
              AmtPurchase:Math.round(amountAUD*100),
              AmtCash:0,
              TxnRef:txNo,
              CurrencyCode:"AUD",
              CutReceipt:"0",
              EnableTip:false,
            },
          }),
        });
        const d=await r.json();
        if(d&&d.Response){
          const resp=d.Response;
          if(resp.Success===true||resp.RespCode==="00")
            return{ok:true,msg:"EFTPOS approved. Auth: "+(resp.AuthCode||"—")};
          return{ok:false,msg:"EFTPOS declined: "+(resp.ResponseText||resp.RespCode||"Unknown")};
        }
        return{ok:false,msg:"Linkly: unexpected response"};
      }catch(e){
        if(e.message&&e.message.includes("fetch")){
          return{ok:false,msg:"Cannot reach Linkly. Is PC-EFTPOS running on this device? (localhost:4242)"};
        }
        return{ok:false,msg:"Linkly error: "+e.message};
      }
    }

    return{ok:false,msg:"No EFTPOS provider configured. Set it up in Settings → Integrations."};
  };

  const sendShopifySell=async(invNo,sellItems,clientName)=>{
    if(!settings.shopifyDomain||!settings.shopifyToken) return{ok:false,msg:"Shopify not configured"};
    try{
      const r=await fetch("https://"+settings.shopifyDomain+"/admin/api/2024-01/orders.json",{
        method:"POST",
        headers:{"Content-Type":"application/json","X-Shopify-Access-Token":settings.shopifyToken},
        body:JSON.stringify({order:{
          financial_status:"paid",tags:"loot,sale",
          note:"Sale — Loot #"+invNo+(clientName?" | "+clientName:""),
          line_items:sellItems.map(i=>({title:i.product.label,quantity:1,price:(i.price||0).toFixed(2)})),
        }}),
      });
      const d=await r.json();
      if(d.order&&d.order.id) return{ok:true,msg:"Shopify sale recorded ("+d.order.name+")"};
      return{ok:false,msg:"Shopify sell error: "+JSON.stringify(d.errors||d)};
    }catch(e){return{ok:false,msg:"Shopify sell failed: "+e.message};}
  };

  const sendShopifyBuy=async(invNo,buyItems,totalAmt,clientName,payMethod)=>{
    if(!settings.shopifyDomain||!settings.shopifyToken) return{ok:false,msg:"Shopify not configured"};
    try{
      const dr=await fetch("https://"+settings.shopifyDomain+"/admin/api/2024-01/draft_orders.json",{
        method:"POST",
        headers:{"Content-Type":"application/json","X-Shopify-Access-Token":settings.shopifyToken},
        body:JSON.stringify({draft_order:{
          tags:"vendor-purchase,loot,buy-from-client",
          note:"VENDOR PURCHASE — Loot #"+invNo+" | Supplier: "+(clientName||"Walk-in")+" | "+payMethod,
          note_attributes:[
            {name:"transaction_type",value:"vendor_purchase"},
            {name:"invoice_no",value:invNo},
            {name:"supplier",value:clientName||""},
            {name:"payment_method",value:payMethod||""},
          ],
          line_items:buyItems.map(i=>({title:"[PURCHASE] "+i.product.label,quantity:1,price:(i.price||0).toFixed(2),requires_shipping:false})),
        }}),
      });
      const dd=await dr.json();
      if(!dd.draft_order) return{ok:false,msg:"Shopify draft error: "+JSON.stringify(dd.errors||dd)};
      const cr=await fetch("https://"+settings.shopifyDomain+"/admin/api/2024-01/draft_orders/"+dd.draft_order.id+"/complete.json?payment_pending=false",{
        method:"PUT",headers:{"Content-Type":"application/json","X-Shopify-Access-Token":settings.shopifyToken},
      });
      const cd=await cr.json();
      const status=cd.draft_order&&cd.draft_order.status;
      return{ok:true,msg:status==="completed"?"Shopify vendor purchase recorded ("+dd.draft_order.name+")":"Shopify draft created ("+dd.draft_order.name+") — review in admin"};
    }catch(e){return{ok:false,msg:"Shopify buy failed: "+e.message};}
  };

  const pushIntegrations=async(tx)=>{
    const msgs=[];
    const buys=tx.items.filter(i=>i.mode==="buy"),sells=tx.items.filter(i=>i.mode==="sell");
    if(settings.squareToken&&settings.squareLoc){
      if(buys.length&&tx.buyTotal>0){
        const r=await sendSquareBuy(tx.id,buys,tx.buyTotal,tx.client&&tx.client.fullName,tx.payment);
        msgs.push("Square: "+(r.ok?"✓ "+r.msg:"✗ "+r.msg));
      }
    }
    if(settings.shopifyDomain&&settings.shopifyToken){
      if(buys.length&&tx.buyTotal>0){
        const r=await sendShopifyBuy(tx.id,buys,tx.buyTotal,tx.client&&tx.client.fullName,tx.payment);
        msgs.push("Shopify: "+(r.ok?"✓ "+r.msg:"✗ "+r.msg));
      }
      if(sells.length&&tx.sellTotal>0){
        const r=await sendShopifySell(tx.id,sells,tx.client&&tx.client.fullName);
        msgs.push("Shopify: "+(r.ok?"✓ "+r.msg:"✗ "+r.msg));
      }
    }
    if(settings.webhookUrl){
      try{
        await fetch(settings.webhookUrl,{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({event:"transaction",invoice:tx.id,date:tx.date,
            buy:{items:buys.map(i=>({label:i.product.label,price:i.price})),total:tx.buyTotal},
            sell:{items:sells.map(i=>({label:i.product.label,price:i.price})),total:tx.sellTotal},
            payment:tx.payment,net:tx.net})});
        msgs.push("Webhook: ✓ pushed");
      }catch(e){msgs.push("Webhook: ✗ "+e.message);}
    }
    if(msgs.length) pop(msgs.join(" | ").slice(0,200),"ok");
  };

  const sendSquare=sendSquareSell;

  const unlockApp=()=>{
    if(appPinInput===settings.staffPin){
      setAppUnlocked(true);
      store.set("sessionActive",true);
      store.set("sessionLast",Date.now());
      setAppPinInput("");
    } else pop("Incorrect PIN","err");
  };

  const resetTx=()=>{
    setTxItems([]);setTxStep(1);setTxPay("cash");
    setClient({});setStaff({});setKycDone(false);setPrivAck(false);
    setIdSighted(false);setPhoto(null);setItemPhotos({});setTxNo(peekInv());
    setAddQty("");setAddCustom("");setAddNote("");
  };

  const togglePoliceHold=(id,val)=>setStock(p=>p.map(s=>s.id===id?{...s,policeHold:val}:s));

  const purge=()=>{
    const expiredTx=txList.filter(t=>isExpired7yr(t.deleteAfter));
    const expiredStock=(stock||[]).filter(s=>isExpired7yr(s.deleteAfter));
    expiredTx.forEach(t=>{if(t.photoKey)store.del(t.photoKey);});
    setTxList(p=>p.filter(t=>!isExpired7yr(t.deleteAfter)));
    setStock(p=>p.filter(s=>!isExpired7yr(s.deleteAfter)));
    if(expiredTx.length===0&&expiredStock.length===0){
      pop("Nothing to purge — no records have passed their 7-year retention date yet.","ok");
    } else {
      pop("Purged "+expiredTx.length+" transaction(s) and "+expiredStock.length+" stock item(s) past 7-year retention.","ok");
    }
  };

  const makeTxt=tx=>{
    const cl=tx.client||{},st=tx.staff||{},its=tx.items||[];
    return["LOOT — TRANSACTION RECORD","Invoice: "+tx.id,"Date: "+fmtDate(tx.date),"Payment: "+(tx.payment||"").toUpperCase(),"",
      "── CLIENT ──────────────────","Name: "+(cl.fullName||""),"DOB: "+(cl.dob||""),"Phone: "+(cl.phone||""),"Address: "+(cl.address||""),"",
      "── ID ──────────────────────","Type: "+(cl.idType||""),"Number: "+(cl.idNumber||""),"Sighted: "+(tx.idSighted?"Yes":"No"),"",
      "── ITEMS ───────────────────",
      ...its.filter(i=>i.mode==="buy").map((it,n)=>"  "+(n+1)+". [BUY] "+((it.product&&it.product.label)||"Item")+" — "+fmtAUD(it.price)+(it.note?" ("+it.note+")":"")),
      ...its.filter(i=>i.mode==="sell").map((it,n)=>"  "+(n+1)+". [SELL] "+((it.product&&it.product.label)||"Item")+" — "+fmtAUD(it.price)+(it.note?" ("+it.note+")":"")),
      "","Buy Total: "+fmtAUD(tx.buyTotal),"Sell Total: "+fmtAUD(tx.sellTotal),"",
      "── COMPLIANCE ──────────────","KYC: "+(tx.kycDone?"Completed":"N/A"),"TTR: "+(tx.ttrStatus||"N/A"),"SMR: "+(tx.smrFlagged?"YES":"No"),
      "Staff: "+(st.staffName||""),"Storage: "+(st.storageLocation||""),"",
      "Delete After: "+fmtDate(tx.deleteAfter)
    ].join("\n");
  };
  const dlTx=tx=>{
    const u=URL.createObjectURL(new Blob([makeTxt(tx)],{type:"text/plain"})),a=document.createElement("a");
    a.href=u;a.download=tx.id+"_"+((tx.client&&tx.client.fullName)||"client").replace(/[^a-zA-Z0-9]/g,"_")+".txt";
    a.click();URL.revokeObjectURL(u);
    const ph=tx.photoKey?store.get(tx.photoKey,{}):{idPhoto:tx.idPhoto,itemPhotos:tx.itemPhotos};
    if(ph.idPhoto)setTimeout(()=>{const a2=document.createElement("a");a2.href=ph.idPhoto;a2.download=tx.id+"_id.jpg";a2.click();},300);
    if(ph.itemPhotos)Object.values(ph.itemPhotos).filter(Boolean).forEach((d,i)=>setTimeout(()=>{const a3=document.createElement("a");a3.href=d;a3.download=tx.id+"_item"+i+".jpg";a3.click();},(i+2)*300));
  };
  const dlBatch=()=>{
    const fr=cliFrom?new Date(cliFrom):new Date(0),to=cliTo?new Date(cliTo):new Date();to.setHours(23,59,59);
    const f=txList.filter(t=>{const d=new Date(t.date);return d>=fr&&d<=to;});
    if(!f.length){pop("No transactions in range.","warn");return;}
    f.forEach(dlTx);pop("Downloading "+f.length+" file(s).","ok");
  };

  const handlePhoto=e=>{
    const f=e.target.files&&e.target.files[0];if(!f)return;
    const r=new FileReader();r.onload=ev=>checkPhotoSize(ev.target.result,d=>setPhoto(d));r.readAsDataURL(f);
  };
  const handleItemPhoto=e=>{
    const f=e.target.files&&e.target.files[0];if(!f)return;
    const id=pendingPhotoId.current;
    if(!id){pop("Photo error, retry.","warn");return;}
    const r=new FileReader();
    r.onload=ev=>checkPhotoSize(ev.target.result,d=>{setItemPhotos(p=>({...p,[id]:d}));pendingPhotoId.current=null;});
    r.onerror=()=>{pop("Could not read photo.","warn");pendingPhotoId.current=null;};
    r.readAsDataURL(f);e.target.value="";
  };
  const captureItemPhoto=()=>{}; // replaced by label+input per item
  const handleStockPhoto=e=>{
    const f=e.target.files&&e.target.files[0];if(!f||!selStockItem)return;
    const r=new FileReader();
    r.onload=ev=>checkPhotoSize(ev.target.result,d=>{
      store.set("stockph_"+selStockItem.id,d);
      setStock(p=>p.map(s=>s.id===selStockItem.id?{...s,hasPhoto:true}:s));
      setSelStockItem(null);pop("Photo saved to item.","ok");
    });
    r.onerror=()=>pop("Could not read photo.","warn");
    r.readAsDataURL(f);e.target.value="";
  };

  const saveProd=()=>{
    if(!newProd.label){pop("Product label is required.","warn");return;}
    const prod={...newProd,id:(editProd&&editProd.id)||uid(),
      purity:newProd.purity!==""?parseFloat(newProd.purity):null,
      carat:newProd.carat!==""?parseFloat(newProd.carat):null,
      buyMult:newProd.buyMult!==""?parseFloat(newProd.buyMult):null,
      sellMult:newProd.sellMult!==""?parseFloat(newProd.sellMult):null,
      weightG:newProd.weightG!==""?parseFloat(newProd.weightG):null,
      buyMode:newProd.carat?"carat":null,active:true,
    };
    if(editProd) setCatalog(prev=>prev.map(x=>x.id===editProd.id?prod:x));
    else setCatalog(prev=>[...prev,prod]);
    setEditProd(null);
    setNewProd({cat:"Other",sub:"",type:"scrap",unit:"g",purity:"",carat:"",label:"",buyMult:"",sellMult:"",weightG:"",active:true});
    pop("Product saved.","ok");
  };

  const deleteProd=(id,label)=>{
    setCatalog(prev=>prev.filter(x=>x.id!==id));
    pop(label+" deleted.","ok");
  };

  const exportPayload=()=>({
    exported:nowISO(),
    spots:{goldAUD_oz:gSpot,silverAUD_oz:sSpot},
    prices:{
      goldPerGram:fmt2(gSpot/TROY_OZ),
      goldBuy999PerG:fmt2(gSpot/TROY_OZ*0.9),
      alluvialBuyPerG:fmt2(gSpot/TROY_OZ*0.9),
      silverPerGram:fmt2(sSpot/TROY_OZ),
    },
    recentTransactions:txList.slice(0,5).map(t=>({contractNo:t.id,date:t.date,buy:t.buyTotal,sell:t.sellTotal,net:t.net})),
  });

  const NAV=[
    {id:"dashboard",icon:"⬡",label:"Dashboard"},
    {id:"newTx",    icon:"＋",label:"New Tx"},
    {id:"stock",    icon:"◈",label:"Stock"},
    {id:"history",  icon:"☰",label:"History"},
    {id:"prices",   icon:"⚖",label:"Prices"},
    {id:"clients",  icon:"👤",label:"Clients"},
  ];

  const locked = settings.requirePin && !appUnlocked;

  return (
    <div style={{fontFamily:T.ff,background:T.bg,minHeight:"100vh",color:T.text,paddingBottom:60,boxSizing:"border-box",fontSize:simp?16:13,lineHeight:simp?"1.6":"1.4",position:"relative"}}>
      {locked?(
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}>
          <div style={c.card({padding:32,maxWidth:320,width:"100%",textAlign:"center"})}>
            <div style={{fontSize:32,marginBottom:12}}>🔒</div>
            <div style={{fontSize:16,fontWeight:"bold",color:T.white,marginBottom:6}}>Loot Ledgr</div>
            <div style={{fontSize:12,color:T.muted,marginBottom:20}}>Enter PIN to continue</div>
            <input style={{...c.inp(),textAlign:"center",fontSize:22,letterSpacing:"0.3em",marginBottom:14}}
              type="password" maxLength={8} value={appPinInput}
              onChange={e=>setAppPinInput(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter")unlockApp();}}
              placeholder="••••" autoFocus/>
            <button style={{...c.btn(T.gold,T.bg),width:"100%"}} onClick={unlockApp}>Unlock</button>
          </div>
        </div>
      ):(
        <div>

      {/* TOP BAR */}
      <div style={{background:T.surface,borderBottom:"1px solid "+T.border,
        padding:"0 8px",display:"flex",alignItems:"center",justifyContent:"space-between",
        minHeight:50,position:"sticky",top:0,zIndex:100,flexWrap:"nowrap"}}>

        {/* LEFT: logo + name — click logo to open logo manager */}
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0,flexGrow:0,width:"auto",maxWidth:160}}>
          <img src={settings.logoImg||SEED_LOGO} alt="logo"
            style={{width:34,height:34,borderRadius:"50%",objectFit:"contain",
              border:"2px solid "+T.gold,flexShrink:0,background:"#fff",padding:3}}/>
          <div style={{overflow:"hidden"}}>
            <div style={{fontSize:11,fontWeight:"bold",color:T.gold,letterSpacing:"0.03em",
              whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>Loot Ledger</div>
            <div style={{fontSize:7.5,color:T.muted,letterSpacing:"0.08em",textTransform:"uppercase",
              whiteSpace:"nowrap",marginTop:1}}>Compliance POS</div>
          </div>
        </div>

        {/* RIGHT: spots + controls */}
        <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:2,background:T.goldBg,
            border:"1px solid "+T.goldDim+"44",borderRadius:5,padding:"2px 5px"}}>
            <span style={{fontSize:8,color:T.muted,flexShrink:0}}>Au</span>
            <input style={{background:"transparent",border:"none",color:T.gold,fontFamily:T.ff,
              fontSize:11,fontWeight:"bold",width:52,outline:"none",textAlign:"right"}}
              type="number" value={gSpot} onChange={e=>setGSpotManual(parseFloat(e.target.value)||0)}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:2,background:T.silverBg,
            border:"1px solid "+T.silverDim+"44",borderRadius:5,padding:"2px 5px"}}>
            <span style={{fontSize:8,color:T.muted,flexShrink:0}}>Ag</span>
            <input style={{background:"transparent",border:"none",color:T.silver,fontFamily:T.ff,
              fontSize:11,fontWeight:"bold",width:42,outline:"none",textAlign:"right"}}
              type="number" value={sSpot} onChange={e=>setSSpotManual(parseFloat(e.target.value)||0)}/>
          </div>
          <span
            title={spotStatus==="live"?"Live: "+spotSource:spotStatus==="manual"?"Manual — tap ↺ to resume":"No API"}
            style={{width:7,height:7,borderRadius:"50%",flexShrink:0,display:"inline-block",
              background:spotStatus==="live"?T.green:spotStatus==="manual"?T.gold:spotStatus==="off"?T.border:T.orange}}/>
          <button style={{...c.bsm(T.border),flexShrink:0,padding:"4px 8px",fontSize:11}} onClick={()=>setShowSet(true)}>⚙</button>
          <button style={{...c.bsm(T.border),flexShrink:0,padding:"4px 8px",fontSize:11}} onClick={()=>setShowApi(true)}>⇄</button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{padding:"18px 16px",paddingBottom:72,overflowY:"auto"}}>

          {/* ═══ DASHBOARD ═══ */}
          {screen==="dashboard"&&(
            <div>
              <div style={{fontSize:17,fontWeight:"bold",color:T.white,marginBottom:18,display:"flex",alignItems:"center"}}>
                {settings.businessName} — {new Date().toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short"})}
              </div>
              <div style={c.g2(10)}>
                <div style={{...c.card({padding:"clamp(10px,2vw,20px)"}),minWidth:0}}>
                  <div style={c.lbl}>⬡ Gold (AUD/oz)</div>
                  <div style={{fontSize:"clamp(18px,3vw,32px)",fontWeight:"bold",color:T.gold,whiteSpace:"nowrap",marginTop:3,letterSpacing:"-0.02em",overflow:"hidden",textOverflow:"ellipsis"}}>{fmtAUD(gSpot)}</div>
                  <div style={{fontSize:"clamp(10px,1.2vw,14px)",color:T.muted,marginTop:4}}>/ g <span style={{color:T.goldLight,fontWeight:"bold"}}>{fmtAUD(gSpot/TROY_OZ)}</span></div>
                </div>
                <div style={{...c.card({padding:"clamp(10px,2vw,20px)"}),minWidth:0}}>
                  <div style={c.lbl}>◈ Silver (AUD/oz)</div>
                  <div style={{fontSize:"clamp(18px,3vw,32px)",fontWeight:"bold",color:T.silver,whiteSpace:"nowrap",marginTop:3,letterSpacing:"-0.02em",overflow:"hidden",textOverflow:"ellipsis"}}>{fmtAUD(sSpot)}</div>
                  <div style={{fontSize:"clamp(10px,1.2vw,14px)",color:T.muted,marginTop:4}}>/ g <span style={{color:T.silver,fontWeight:"bold"}}>{fmtAUD(sSpot/TROY_OZ)}</span></div>
                </div>
              </div>
              {/* Scale live widget — shown when connected */}
              {scaleStatus==="connected"&&(
                <div style={{...c.card({padding:"10px 16px"}),marginBottom:4,display:"flex",alignItems:"center",gap:12,boxShadow:"4px 4px 14px rgba(0,0,0,0.22), 1px 1px 0 rgba(255,255,255,0.05)"}}>
                  <span style={{fontSize:20}}>⚖</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:9,color:T.muted,letterSpacing:"0.12em",textTransform:"uppercase"}}>Scale — {scaleDevice&&scaleDevice.name||"Connected"}</div>
                    <div style={{fontSize:"clamp(18px,3vw,28px)",fontWeight:"bold",color:T.gold,letterSpacing:"-0.02em",lineHeight:1.1}}>
                      {scaleLive?fmtScaleWeight(scaleLive):"Place item on scale…"}
                    </div>
                  </div>
                  <div style={{fontSize:9,color:scaleLive?T.gold:T.muted,whiteSpace:"nowrap"}}>
                    {scaleLive?"● LIVE":"○ waiting"}
                  </div>
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10,margin:"12px 0"}}>
                {[
                  {l:"Txn 24h",v:(()=>{const now=new Date();const midnight=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime();return txList.filter(t=>t.date&&new Date(t.date).getTime()>=midnight).length;})()},
                  {l:"In Hold",v:(stock||[]).filter(s=>!s.policeHold&&hoursLeft(s.holdUntil)>0).length,col:T.orange},
                  {l:"For Sale",v:(stock||[]).filter(s=>!s.policeHold&&hoursLeft(s.holdUntil)<=0&&!s.sold).length,col:T.gold},
                  {l:"🚔 Hold",v:(stock||[]).filter(s=>s.policeHold).length,col:T.red},
                ].map(st=>(
                  <div key={st.l} style={{...c.card({padding:15}),minWidth:0,overflow:"hidden"}}>
                    <div style={{fontSize:10,color:T.muted,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:5,display:"block",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"100%"}}>{st.l}</div>
                    <div style={{fontSize:23,fontWeight:"bold",color:st.col||T.text,letterSpacing:"-0.02em"}}>{st.v}</div>
                  </div>
                ))}
              </div>
              {(catalog||[]).filter(p=>p.active).length>0&&(
                <div style={c.card({padding:0,overflow:"hidden",marginBottom:14})}>
                  <div style={c.shead(true)}>⬡ Quick Reference Prices</div>
                  <div style={{padding:"10px 14px"}}>
                    {(catalog||[]).filter(p=>p.active).slice(0,6).map(p=>(
                      <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid "+T.border+"33"}}>
                        <span style={{fontSize:12,color:T.text}}>{p.label}</span>
                        <span style={{fontSize:12,fontWeight:"bold",color:T.green}}>{calcUnitPrice(p,gSpot,sSpot,"buy")?fmtAUD(calcUnitPrice(p,gSpot,sSpot,"buy"))+"  buy":"—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(catalog||[]).filter(p=>p.active).length===0&&(
                <div style={{...c.card({padding:20}),textAlign:"center",color:T.muted,fontSize:12}}>
                  No products yet. Go to <strong style={{color:T.gold}}>Prices → Edit Catalog</strong>
                </div>
              )}
              {txList.some(t=>t.ttrStatus==="PENDING")&&(
                <div style={c.bnr("block")}>
                  🔴 AUSTRAC TTR PENDING — {txList.filter(t=>t.ttrStatus==="PENDING").length} transaction(s) require a Threshold Transaction Report. File via AUSTRAC Online within 10 business days.
                </div>
              )}
              <div style={{...c.row(10),marginTop:14,flexWrap:"wrap"}}>
                <button style={c.btn(T.gold,T.bg,{flex:2,minWidth:160,padding:"13px 0",fontSize:13})}
                  onClick={()=>{resetTx();setScreen("newTx");}}>＋ New Transaction</button>
                <button style={c.btn(T.border,T.text,{flex:1,minWidth:100,padding:"13px 0",fontSize:12})}
                  onClick={()=>setShowEOD(true)}>📋 EOD</button>
              </div>
              <div style={{display:"flex",justifyContent:"center",gap:10,marginTop:8,flexWrap:"wrap"}}>
                <button style={c.bsm(T.border,T.muted)} onClick={()=>setShowVendors(true)}>🏪 Suppliers</button>
                <button style={c.bsm(T.border,T.muted)} onClick={()=>setShowStaff(true)}>👥 Staff</button>
                <button style={c.bsm(T.border,T.muted)} onClick={()=>setShowBackup(true)}>💾 Backup</button>
                {activeStaff&&staffList.find(s=>s.id===activeStaff)&&<span style={{fontSize:11,color:T.green,padding:"5px 8px"}}>👤 {(staffList.find(s=>s.id===activeStaff)||{}).name}</span>}
              </div>
              <div style={{display:"flex",justifyContent:"center",marginTop:8}}>
                <button style={c.bsm(T.border,T.muted)} onClick={()=>setShowPolice(true)}>🚔 Police Report</button>
              </div>
              {/* DURESS BUTTON — centred, same height as bsm, width of ~2 buttons */}
              <div style={{display:"flex",justifyContent:"center",marginTop:10}}>
                <button
                  style={{
                    padding:"10px 18px",minWidth:200,maxWidth:280,
                    background:duressActive?"#cc0000":"#111",
                    color:"#fff",
                    border:duressActive?"2px solid #ff4444":"2px solid #333",
                    borderRadius:8,fontSize:13,fontWeight:"bold",
                    letterSpacing:"0.08em",cursor:"pointer",
                    textTransform:"uppercase",whiteSpace:"nowrap",
                    boxShadow:duressActive
                      ?"0 0 20px rgba(255,0,0,0.6), 4px 4px 14px rgba(0,0,0,0.5)"
                      :"4px 4px 14px rgba(0,0,0,0.5), 1px 1px 0 rgba(255,255,255,0.05)",
                  }}
                  onClick={()=>{if(!duressActive) triggerDuress();}}>
                  {duressActive?"🚨 DURESS ACTIVE":"🆘 POLICE HELP"}
                </button>
              </div>
            </div>
          )}

          {/* ═══ NEW TRANSACTION ═══ */}
          {screen==="newTx"&&(
            <div>
              {/* STEP INDICATOR */}
              <div style={{...c.row(0),flexWrap:"wrap",gap:4,marginBottom:18}}>
                {["Basket","Compliance","Client","Staff","Payment","Done"].map((s,i)=>(
                  <div key={s} style={{...c.row(0)}}>
                    <div style={{padding:"5px 12px",borderRadius:4,fontSize:10,fontWeight:"bold",
                      background:txStep===i+1?T.gold:txStep>i+1?T.greenBg:T.surface,
                      color:txStep===i+1?T.bg:txStep>i+1?T.green:T.muted,
                      border:"1px solid "+txStep===i+1?T.gold:txStep>i+1?T.green:T.border,
                      letterSpacing:"0.08em"}}>
                      {txStep>i+1?"✓ ":""}{s}
                    </div>
                    {i<4&&<div style={{width:16,height:1,background:T.border}}/>}
                  </div>
                ))}
              </div>

              {/* Scale reading bar — visible on all transaction steps when connected */}
              {scaleStatus==="connected"&&(
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:7,background:T.surface,border:"1px solid "+(scaleLive?T.gold:T.border),marginBottom:12,boxShadow:"3px 3px 10px rgba(0,0,0,0.18)"}}>
                  <span style={{fontSize:16}}>⚖</span>
                  <span style={{fontSize:10,color:T.muted,flex:1}}>Scale</span>
                  <span style={{fontSize:16,fontWeight:"bold",color:scaleLive?T.gold:T.muted}}>
                    {scaleLive?fmtScaleWeight(scaleLive):"Place item on scale…"}
                  </span>
                  {scaleLive&&<span style={{fontSize:9,color:T.gold}}>● LIVE</span>}
                </div>
              )}

              {/* ─── STEP 1: BASKET ─── */}
              {txStep===1&&(
                <div>
                  <div style={{marginBottom:14}}>
                    <div style={{fontSize:13,fontWeight:"bold",color:T.white}}>Invoice #<span style={{color:T.gold}}>{txNo}</span></div>
                  </div>
                  {/* ADD ITEM */}
                  <div style={c.card({padding:16,marginBottom:14})}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                      <div style={{fontSize:11,fontWeight:"bold",color:T.white,letterSpacing:"0.08em"}}>ADD ITEM TO BASKET</div>
                      <div style={c.row(6)}>
                        <button style={c.bsm(!quickMode?T.gold:T.border,!quickMode?T.bg:T.text)} onClick={()=>setQuickMode(false)}>Catalog</button>
                        <button style={c.bsm(quickMode?T.blue:T.border,quickMode?T.bg:T.text)} onClick={()=>setQuickMode(true)}>⚡ Quick</button>
                        {!quickMode&&<button style={c.bsm(T.border,T.muted)} onClick={()=>setShowCat(true)}>✎ Edit</button>}
                      </div>
                    </div>
                    <div style={c.g2(10)}>
                      <div>
                        <label style={c.lbl}>Mode</label>
                        <div style={c.row(8)}>
                          {["buy","sell"].map(m=>(
                            <button key={m} style={c.btn(addMode===m?(m==="buy"?T.green:T.gold):T.border,addMode===m?T.bg:T.text,{padding:"6px 16px",fontSize:11})}
                              onClick={()=>setAddMode(m)}>{m.toUpperCase()}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label style={c.lbl}>Product</label>
                        {(catalog||[]).filter(p=>p.active).length===0
                          ?<div style={{background:T.orangeBg,border:"1px solid "+T.orange+"44",borderRadius:6,padding:"10px 12px",fontSize:11,color:T.orange}}>
                            No products yet. Go to <strong>Prices → Edit Catalog</strong> to add products first.
                          </div>
                          :<select style={{...c.sel(),width:"100%"}} value={addId} onChange={e=>setAddId(e.target.value)}>
                            <option value="">— Select a product —</option>
                            {["Gold","Silver","Other"].map(cat=>(
                              <optgroup key={cat} label={"── "+cat+" ──"}>
                                {(catalog||[]).filter(p=>p.cat===cat&&p.active).map(p=>(
                                  <option key={p.id} value={p.id}>{p.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        }
                      </div>
                      <div>
                        <label style={c.lbl}>{addProd&&addProd.unit==="pc"?"Quantity":addProd&&addProd.unit==="oz"?"Weight (oz)":"Weight (g)"}{scaleStatus==="connected"&&scaleLive&&<span style={{color:T.gold,fontSize:9,marginLeft:4,fontWeight:"bold"}}>⚖ LIVE</span>}</label>
                        <div style={c.row(6)}>
                        <input style={{...c.inp(),flex:1}} type="number" placeholder="0" value={addQty} onChange={e=>setAddQty(e.target.value)}/>
                        {scaleStatus==="connected"&&scaleLive&&addProd&&(
                          <button style={{...c.bsm(T.goldBg,T.gold),whiteSpace:"nowrap"}}
                            onClick={()=>{
                              const grams=scaleLive.g;
                              if(addProd.unit==="oz") setAddQty((grams/28.3495).toFixed(3));
                              else setAddQty(grams.toFixed(3));
                            }}>⚖ {fmtScaleWeight(scaleLive)}</button>
                        )}
                        </div>
                        {addProd&&addQtyN>0&&addUnit!=null&&(
                          <div style={{fontSize:12,color:addMode==="buy"?T.green:T.gold,marginTop:4,fontWeight:"bold"}}>
                            {fmtAUD(addUnit)}/{addProd.unit} → <strong style={{fontSize:14}}>{fmtAUD(addCalc)}</strong>
                          </div>
                        )}
                        {addProd&&addQtyN>0&&addUnit==null&&(
                          <div style={{fontSize:11,color:T.orange,marginTop:4}}>
                            ⚠ Set purity or carat on this product to auto-calculate price
                          </div>
                        )}
                      </div>
                      {addUnit==null&&(
                        <div>
                          <label style={c.lbl}>Custom Price ($)</label>
                          <input style={c.inp()} type="number" placeholder="Enter price" value={addCustom} onChange={e=>setAddCustom(e.target.value)}/>
                          {addCustom&&<div style={{fontSize:12,color:T.gold,marginTop:4,fontWeight:"bold"}}>Total: <strong>{fmtAUD(parseFloat(addCustom)||0)}</strong></div>}
                        </div>
                      )}
                      <div>
                        <label style={c.lbl}>Note / Description</label>
                        <input style={c.inp()} type="text" placeholder="Markings, condition, source…" value={addNote} onChange={e=>setAddNote(e.target.value)}/>
                      </div>
                    </div>
                    {(catalog||[]).filter(p=>p.active).length>0&&!quickMode&&<button style={c.btn(addMode==="buy"?T.green:T.gold,T.bg,{marginTop:10})} onClick={handleAddItem}>+ Add to Basket</button>}
                  </div>
                  {quickMode&&<div style={c.card({padding:16,marginBottom:14})}>
                    <div style={{...c.bnr("info"),marginBottom:10}}>⚡ <strong>Quick Item</strong> — for unlisted items. Enter details manually.</div>
                    <div style={c.g2(10)}>
                      <div><label style={c.lbl}>Mode</label><div style={c.row(8)}>{["buy","sell"].map(m=><button key={m} style={c.btn(qmMode===m?(m==="buy"?T.green:T.gold):T.border,qmMode===m?T.bg:T.text,{padding:"7px 14px"})} onClick={()=>setQMMode(m)}>{m.toUpperCase()}</button>)}</div></div>
                      <div><label style={c.lbl}>Description *</label><input style={c.inp()} type="text" placeholder="e.g. Unusual gold bracelet" value={qf.label} onChange={e=>setQF(p=>({...p,label:e.target.value}))}/></div>
                      <div><label style={c.lbl}>Metal</label><select style={{...c.sel(),width:"100%"}} value={qf.cat} onChange={e=>setQF(p=>({...p,cat:e.target.value}))}><option value="Gold">Gold</option><option value="Silver">Silver</option><option value="Other">Other</option></select></div>
                      <div><label style={c.lbl}>Compliance Type</label><select style={{...c.sel(),width:"100%"}} value={qf.type} onChange={e=>setQF(p=>({...p,type:e.target.value}))}><option value="scrap">Scrap / Jewellery ($10k)</option><option value="bullion">Bullion ($5k)</option></select></div>
                      <div><label style={c.lbl}>Unit</label><select style={{...c.sel(),width:"100%"}} value={qf.unit} onChange={e=>setQF(p=>({...p,unit:e.target.value}))}><option value="g">Grams</option><option value="oz">Troy oz</option><option value="pc">Piece</option></select></div>
                      {qf.cat==="Gold"&&<div><label style={c.lbl}>Carat (e.g. 9, 14, 18, 22, 24)</label><input style={c.inp()} type="number" placeholder="e.g. 18" value={qf.carat} onChange={e=>setQF(p=>({...p,carat:e.target.value,purity:""}))}/></div>}
                      {qf.cat==="Silver"&&<div><label style={c.lbl}>Purity (0–1, e.g. 0.925)</label><input style={c.inp()} type="number" step="0.001" placeholder="e.g. 0.925" value={qf.purity} onChange={e=>setQF(p=>({...p,purity:e.target.value,carat:""}))}/></div>}
                      <div>
                        <label style={c.lbl}>Weight / Qty {scaleStatus==="connected"&&scaleLive&&<span style={{color:T.gold,fontSize:9,marginLeft:4}}>⚖ LIVE</span>}</label>
                        <div style={c.row(6)}>
                          <input style={{...c.inp(),flex:1}} type="number" placeholder="0.00" value={qf.qty} onChange={e=>setQF(p=>({...p,qty:e.target.value}))}/>
                          {scaleStatus==="connected"&&scaleLive&&(
                            <button style={c.bsm(T.goldBg,T.gold)} onClick={()=>setQF(p=>({...p,qty:scaleLive.g.toFixed(3)}))}>⚖ Use {fmtScaleWeight(scaleLive)}</button>
                          )}
                        </div>
                      </div>
                      <div><label style={c.lbl}>Price ($) *</label><input style={c.inp()} type="number" placeholder="0.00" value={qf.price} onChange={e=>setQF(p=>({...p,price:e.target.value}))}/></div>
                      <div><label style={c.lbl}>Note</label><input style={c.inp()} type="text" placeholder="Condition, markings…" value={qf.note} onChange={e=>setQF(p=>({...p,note:e.target.value}))}/></div>
                      <div>
                        <label style={c.lbl}>Photo (optional)</label>
                        {qf.photo
                          ?<div style={{display:"flex",alignItems:"center",gap:10,marginTop:4}}>
                            <img src={qf.photo} alt="preview" style={{width:72,height:72,objectFit:"cover",borderRadius:6,border:"1px solid "+T.border}}/>
                            <button style={c.bsm(T.redBg,T.red)} onClick={()=>setQF(p=>({...p,photo:null}))}>🗑 Remove</button>
                          </div>
                          :<label style={{...c.bsm(T.border,T.muted),display:"inline-block",cursor:"pointer",padding:"8px 14px",borderRadius:4,fontSize:12}}>
                            📷 Upload Photo
                            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{display:"none"}} onChange={e=>{
                              const f=e.target.files&&e.target.files[0];if(!f)return;
                              const r=new FileReader();
                              r.onload=ev=>checkPhotoSize(ev.target.result,d=>setQF(p=>({...p,photo:d})));
                              r.readAsDataURL(f);e.target.value="";
                            }}/>
                          </label>
                        }
                      </div>
                    </div>
                    <button style={c.btn(qmMode==="buy"?T.green:T.gold,T.bg,{marginTop:10})} onClick={()=>{
                      if(!qf.label){pop("Description required.","warn");return;}
                      const price=Math.max(0,parseFloat(qf.price)||0);
                      if(!price){pop("Enter a valid price.","warn");return;}
                      const qPurity=qf.cat==="Gold"&&qf.carat?{caratKey:String(qf.carat)+"ct"}:qf.purity?{purityKey:String(qf.purity)}:{};
                      setTxItems(p=>[...p,{id:uid(),mode:qmMode,
                        product:{isQuick:true,label:qf.label,cat:qf.cat,type:qf.type,unit:qf.unit,
                          purity:qf.purity?parseFloat(qf.purity):null,
                          carat:qf.carat?parseFloat(qf.carat):null},
                        qty:parseFloat(qf.qty)||1,price,calculatedPrice:price,
                        purity:qf.purity||null,carat:qf.carat||null,
                        weight_g:qf.unit==="g"?parseFloat(qf.qty)||null:null,
                        note:qf.note,isQuick:true,
                        holdUntil:qmMode==="buy"?addHours(new Date().toISOString(),THRESH.HOLD_HOURS):null,
                        policeHold:false,suspicious:false}]);
                      setQuickMode(false);setQF({label:"",cat:"Gold",type:"scrap",unit:"g",price:"",qty:"",note:"",purity:"",carat:"",photo:null});
                      pop("Quick item added.","ok");
                    }}>⚡ Add Quick Item</button>
                  </div>}
                  {/* BASKET TABLE */}
                  {txItems.length>0&&(
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
                                {it.negotiated&&<div style={{fontSize:9,color:T.muted}}>adj</div>}
                                {adjId===it.id
                                  ?<div style={{display:"flex",gap:4,marginTop:3,alignItems:"center"}}>
                                    <input style={c.inp({width:68,padding:"3px 7px",fontSize:11})} type="number" value={adjVal} onChange={e=>setAdjVal(e.target.value)} autoFocus/>
                                    <button style={c.bsm(T.greenBg,T.green)} onClick={()=>{const v=Math.max(0,parseFloat(adjVal)||0);if(!v){pop("Enter valid price.","warn");return;}setTxItems(prev=>prev.map(x=>x.id===adjId?{...x,price:v,negotiated:true}:x));setAdjId(null);setAdjVal("");pop("Price adjusted.","ok");}}>✓</button>
                                    <button style={c.bsm()} onClick={()=>setAdjId(null)}>✕</button>
                                  </div>
                                  :<button style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",fontSize:9,padding:"2px 4px",display:"block"}} onClick={()=>{setAdjId(it.id);setAdjVal(String(it.price));}}>✎</button>
                                }
                              </td>
                              <td style={c.td()}>
                                {itemPhotos[it.id]
                                  ?<button style={c.bsm(T.redBg,T.red)} onClick={()=>setItemPhotos(p=>{const n={...p};delete n[it.id];return n;})}>🗑</button>
                                  :<label style={{...c.bsm(T.border,T.muted),display:"inline-block",cursor:"pointer",padding:"5px 9px",borderRadius:4,fontSize:11,whiteSpace:"nowrap"}}>
                                    📷 Add
                                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{display:"none"}} onChange={e=>{
                                      const f=e.target.files&&e.target.files[0];if(!f)return;
                                      const iid=it.id;
                                      const r=new FileReader();
                                      r.onload=ev=>checkPhotoSize(ev.target.result,d=>setItemPhotos(p=>({...p,[iid]:d})));
                                      r.readAsDataURL(f);e.target.value="";
                                    }}/>
                                  </label>
                                }
                              </td>
                              <td style={c.td()}>{it.holdUntil?<HoldTimer holdUntil={it.holdUntil} policeHold={false}/>:<span style={{color:T.muted}}>—</span>}</td>
                              <td style={c.td()}>
                                <div style={{display:"flex",gap:4}}>
                                  <button title="Suspicious (internal)" style={c.bsm(it.suspicious?T.orangeBg:T.border,it.suspicious?T.orange:T.muted)} onClick={()=>setTxItems(p=>p.map(x=>x.id===it.id?{...x,suspicious:!x.suspicious}:x))}>🚩</button>
                                  {it.mode==="buy"&&<button title="Police hold" style={c.bsm(it.policeHold?T.redBg:T.border,it.policeHold?T.red:T.muted)} onClick={()=>setTxItems(p=>p.map(x=>x.id===it.id?{...x,policeHold:!x.policeHold}:x))}>🚔</button>}
                                </div>
                              </td>
                              <td style={c.td()}><button style={c.bsm(T.redBg,T.red)} onClick={()=>setTxItems(p=>p.filter(x=>x.id!==it.id))}>✕</button></td>
                            </tr>
                          ))}
                          </tbody>
                      </table>
                      <div style={{padding:"10px 14px",background:T.surface,display:"flex",justifyContent:"flex-end",gap:16,flexWrap:"wrap"}}>
                        {buyTotal>0&&<span style={{fontSize:13}}>Buy: <strong style={{color:T.green}}>{fmtAUD(buyTotal)}</strong></span>}
                        {sellTotal>0&&<span style={{fontSize:13}}>Sell: <strong style={{color:T.gold}}>{fmtAUD(sellTotal)}</strong></span>}
                        <span style={{fontSize:13,fontWeight:"bold"}}>Net: <strong style={{color:net>=0?T.gold:T.green}}>{net>=0?"Client pays "+fmtAUD(net):"We pay "+fmtAUD(-net)}</strong></span>
                      </div>
                    </div>
                  )}
                  <div style={c.row(10)}>
                    <button style={c.btn(T.gold)} onClick={handleToCompliance}>Next: Compliance →</button>
                    <button style={c.bsm()} onClick={resetTx}>Reset</button>
                  </div>
                </div>
              )}

              {/* ─── STEP 2: COMPLIANCE ─── */}
              {txStep===2&&(
                <div>
                  <div style={{fontSize:14,fontWeight:"bold",color:T.white,marginBottom:14}}>Compliance Check</div>
                  {compliance.flags.map(f=><div key={f.key} style={c.bnr(f.level)}>{f.msg}</div>)}

                  {/* KYC BLOCK */}
                  {compliance.requiresKYC&&!kycDone&&(
                    <div style={c.card({padding:18,marginTop:14,borderColor:T.red+"55"})}>
                      <div style={{fontSize:12,fontWeight:"bold",color:T.red,marginBottom:14}}>🔴 AUSTRAC KYC/CDD — All fields mandatory</div>
                      <div style={c.g2(10)}>
                        <div>
                        <F label="Full Legal Name" required value={client.fullName} onChange={v=>setClient(p=>({...p,fullName:v}))}/>
                        {client.fullName&&client.fullName.length>2&&txList.filter(t=>t.client&&(t.client.fullName||"").toLowerCase()===client.fullName.toLowerCase()).length>0&&(
                          <div style={{...c.bnr(txList.filter(t=>t.client&&(t.client.fullName||"").toLowerCase()===client.fullName.toLowerCase()).some(t=>t.smrFlagged||t.items&&t.items.some(i=>i.suspicious))?"warn":"info"),fontSize:11,marginTop:-8}}>
                            {txList.filter(t=>t.client&&(t.client.fullName||"").toLowerCase()===client.fullName.toLowerCase()).some(t=>t.smrFlagged||t.items&&t.items.some(i=>i.suspicious))?"⚠️":"ℹ️"} Returning client — {txList.filter(t=>t.client&&(t.client.fullName||"").toLowerCase()===client.fullName.toLowerCase()).length} previous transaction(s).{txList.filter(t=>t.client&&(t.client.fullName||"").toLowerCase()===client.fullName.toLowerCase()).some(t=>t.smrFlagged)?" Previously SMR flagged.":""}
                          </div>
                        )}
                      </div>
                        <F label="Date of Birth" required type="date" value={client.dob} onChange={v=>setClient(p=>({...p,dob:v}))}/>
                        <F label="Residential Address" required value={client.address} onChange={v=>setClient(p=>({...p,address:v}))}/>
                        <F label="Phone" value={client.phone} onChange={v=>setClient(p=>({...p,phone:v}))}/>
                        <SF label="ID Type" required value={client.idType} onChange={v=>setClient(p=>({...p,idType:v}))} options={[
                          {value:"",label:"— Select —"},{value:"dl",label:"Driver's Licence"},
                          {value:"pp",label:"Passport"},{value:"lp",label:"Learner Permit"},
                          {value:"fl",label:"Firearms Licence"},{value:"op",label:"Other Photo ID"},
                          {value:"2doc",label:"Two Non-Photo Documents"},
                        ]}/>
                        <F label="ID Number" required value={client.idNumber} onChange={v=>setClient(p=>({...p,idNumber:v}))}/>
                        <F label="Issuing State" value={client.idState} onChange={v=>setClient(p=>({...p,idState:v}))}/>
                        <F label="ID Expiry" type="date" value={client.idExpiry} onChange={v=>setClient(p=>({...p,idExpiry:v}))}/>
                      </div>
                      {compliance.flags.some(f=>f.key==="ttr")&&(
                        <F label="Source of Funds — How did seller acquire these goods?" required value={client.sourceOfFunds} onChange={v=>setClient(p=>({...p,sourceOfFunds:v}))}/>
                      )}
                      <div style={{...c.g2(12),marginTop:8}}>
                        <label style={{...c.row(8),cursor:"pointer",fontSize:12}}>
                          <input type="checkbox" checked={!!staff.pepCheck} onChange={e=>setStaff(p=>({...p,pepCheck:e.target.checked}))}/>
                          PEP Check — Seller is NOT a PEP
                        </label>
                        <label style={{...c.row(8),cursor:"pointer",fontSize:12}}>
                          <input type="checkbox" checked={!!staff.tfsCheck} onChange={e=>setStaff(p=>({...p,tfsCheck:e.target.checked}))}/>
                          TFS Check — NOT on Sanctions List (dfat.gov.au)
                        </label>
                      </div>
                      <div style={{marginTop:10}}>
                        <label style={c.lbl}>Risk Rating</label>
                        <select style={c.sel()} value={staff.riskRating||""} onChange={e=>setStaff(p=>({...p,riskRating:e.target.value}))}>
                          <option value="">— Select —</option>
                          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                        </select>
                      </div>
                      <button style={c.btn(T.green,T.bg,{marginTop:14})} onClick={()=>{
                        if(!client.fullName||!client.dob||!client.idType||!client.idNumber){pop("Fill all required KYC fields.","err");return;}
                        if(!staff.pepCheck||!staff.tfsCheck){pop("Complete PEP and TFS checks.","err");return;}
                        if(!staff.riskRating){pop("Assign risk rating.","err");return;}
                        setKycDone(true);pop("KYC completed.","ok");
                      }}>✓ Mark KYC Complete</button>
                    </div>
                  )}
                  {(kycDone||!compliance.requiresKYC)&&(
                    <div style={{...c.bnr("info"),marginTop:8}}>✓ Compliance check passed. Proceed to client form.</div>
                  )}
                  <div style={{...c.row(10),marginTop:10}}>
                    <button style={c.bsm(T.redBg,T.red)} onClick={()=>setShowFlag(true)}>🚩 Flag SMR (internal)</button>
                    <span style={{fontSize:10,color:T.muted}}>Never disclose to customer — tipping off is a criminal offence.</span>
                  </div>
                  <div style={{...c.row(10),marginTop:16}}>
                    <button style={c.btn(T.gold)} onClick={handleToClient}>Next: Client Form →</button>
                    <button style={c.bsm()} onClick={()=>setTxStep(1)}>← Back</button>
                  </div>
                </div>
              )}

              {/* ─── STEP 3: CLIENT FORM ─── */}
              {txStep===3&&(
                <div>
                  <div style={{fontSize:14,fontWeight:"bold",color:T.white,marginBottom:4}}>Client Section — BUY TRANSACTION RECORD</div>
                  <div style={{fontSize:11,color:T.muted,marginBottom:14}}>Invoice #: {txNo} · {new Date().toLocaleDateString("en-AU")}</div>

                  {/* Privacy Notice */}
                  <div style={c.card({padding:14,marginBottom:14,borderColor:T.blue+"44"})}>
                    <div style={{fontSize:11,color:T.blue,fontWeight:"bold",marginBottom:8}}>PRIVACY NOTICE</div>
                    <pre style={{fontSize:10,color:T.muted,whiteSpace:"pre-wrap",lineHeight:1.6,margin:0,maxHeight:180,overflowY:"auto"}}>
                      {PRIVACY_NOTICE(settings.businessName,settings.abn)}
                    </pre>
                    <label style={{...c.row(8),marginTop:10,cursor:"pointer",fontSize:12}}>
                      <input type="checkbox" checked={privAck} onChange={e=>setPrivAck(e.target.checked)}/>
                      <strong>I HAVE READ AND UNDERSTOOD THIS NOTICE — PROCEED</strong>
                    </label>
                  </div>

                  {/* Section 1 — Transaction */}
                  <div style={c.card({padding:16,marginBottom:14})}>
                    <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,letterSpacing:"0.1em"}}>SECTION 1 — TRANSACTION DETAILS</div>
                    <div style={c.g2(10)}>
                      <F label="Date" value={new Date().toLocaleDateString("en-AU")} readOnly/>
                      <F label="Contract No" value={txNo} readOnly/>
                    </div>
                    <div style={{marginBottom:12}}>
                      <label style={c.lbl}>I am selling</label>
                      <div style={c.row(8)}>
                        {["Bullion (bars / coins)","Scrap / Jewellery","Mixed"].map(opt=>(
                          <button key={opt} style={c.btn(client.selling===opt?T.gold:T.border,client.selling===opt?T.bg:T.text,{padding:"6px 12px",fontSize:11})}
                            onClick={()=>setClient(p=>({...p,selling:opt}))}>{opt}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{marginBottom:10}}>
                      <label style={c.lbl}>I wish to be paid by</label>
                      <div style={c.row(8)}>
                        {[
                          {v:"cash",l:"Cash (under $2,000 only)"},
                          {v:"card",l:"Card (purchases/sell only)"},
                          {v:"bank",l:"Bank Transfer"},
                          ...(settings.cryptoEnabled?[{v:"crypto",l:"Cryptocurrency"}]:[]),
                        ].map(opt=>(
                          <button key={opt.v} style={c.btn(txPay===opt.v?T.gold:T.border,txPay===opt.v?T.bg:T.text,{padding:"6px 12px",fontSize:11})}
                            onClick={()=>setTxPay(opt.v)}>{opt.l}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Section 2 — Items */}
                  <div style={c.card({padding:16,marginBottom:14})}>
                    <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,letterSpacing:"0.1em"}}>SECTION 2 — ITEMS I AM SELLING</div>
                    {txItems.filter(i=>i.mode==="buy").map((it,i)=>(
                      <div key={it.id} style={{borderBottom:"1px solid "+T.border+"44",paddingBottom:8,marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                          <div>
                            <span style={{fontSize:11,color:T.muted,marginRight:6}}>#{i+1}</span>
                            <span style={{color:T.white,fontWeight:"bold"}}>{it.product.label}</span>
                          </div>
                          <span style={{color:T.green,fontWeight:"bold"}}>{fmtAUD(it.price)}</span>
                        </div>
                        <div style={{fontSize:11,color:T.muted,marginTop:2}}>
                          {it.product.cat} · {it.product.carat?it.product.carat+"ct":it.product.purity?(it.product.purity*100).toFixed(1)+"%":"—"} · {it.qty} {it.product.unit}
                          {it.note&&" · "+it.note}
                        </div>
                      </div>
                    ))}
                    <div style={{display:"flex",justifyContent:"space-between",paddingTop:4}}>
                      <span style={{fontSize:12,fontWeight:"bold",color:T.white}}>TOTAL</span>
                      <span style={{fontSize:14,fontWeight:"bold",color:T.green}}>{fmtAUD(buyTotal)}</span>
                    </div>
                    <F label="Notes (condition, markings, how acquired)" value={client.itemNotes} onChange={v=>setClient(p=>({...p,itemNotes:v}))} as="textarea"/>
                  </div>

                  {/* Section 3 — Identity */}
                  <div style={c.card({padding:16,marginBottom:14})}>
                    <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,letterSpacing:"0.1em"}}>SECTION 3 — MY IDENTITY</div>
                    <div style={c.g2(10)}>
                      <div>
                        <F label="Full Legal Name" required value={client.fullName} onChange={v=>setClient(p=>({...p,fullName:v}))}/>
                        {client.fullName&&client.fullName.length>2&&txList.filter(t=>t.client&&(t.client.fullName||"").toLowerCase()===client.fullName.toLowerCase()).length>0&&(
                          <div style={{...c.bnr(txList.filter(t=>t.client&&(t.client.fullName||"").toLowerCase()===client.fullName.toLowerCase()).some(t=>t.smrFlagged)?"warn":"info"),fontSize:11,marginTop:-8}}>
                            {txList.filter(t=>t.client&&(t.client.fullName||"").toLowerCase()===client.fullName.toLowerCase()).some(t=>t.smrFlagged)?"⚠️":"ℹ️"} Returning client — {txList.filter(t=>t.client&&(t.client.fullName||"").toLowerCase()===client.fullName.toLowerCase()).length} previous transaction(s).{txList.filter(t=>t.client&&(t.client.fullName||"").toLowerCase()===client.fullName.toLowerCase()).some(t=>t.smrFlagged)?" Previously SMR flagged.":""}
                          </div>
                        )}
                      </div>
                      <F label="Date of Birth" required type="date" value={client.dob} onChange={v=>setClient(p=>({...p,dob:v}))}/>
                      <F label="Phone Number" value={client.phone} onChange={v=>setClient(p=>({...p,phone:v}))}/>
                      <F label="Residential Address" required value={client.address} onChange={v=>setClient(p=>({...p,address:v}))}/>
                    </div>
                  </div>

                  {/* Section 4 — ID */}
                  <div style={c.card({padding:16,marginBottom:14})}>
                    <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,letterSpacing:"0.1em"}}>SECTION 4 — IDENTIFICATION DOCUMENT</div>
                    <div style={c.g2(10)}>
                      <SF label="ID Type" required value={client.idType} onChange={v=>setClient(p=>({...p,idType:v}))} options={[
                        {value:"",label:"— Select —"},{value:"dl",label:"Driver's Licence"},
                        {value:"pp",label:"Passport"},{value:"lp",label:"Learner Permit"},
                        {value:"fl",label:"Firearms Licence"},{value:"op",label:"Other Photo ID"},
                        {value:"2doc",label:"Two Non-Photo Documents"},
                      ]}/>
                      <F label="ID Number" required value={client.idNumber} onChange={v=>setClient(p=>({...p,idNumber:v}))}/>
                      <F label="Issuing State / Country" value={client.idState} onChange={v=>setClient(p=>({...p,idState:v}))}/>
                      <F label="Expiry Date" type="date" value={client.idExpiry} onChange={v=>setClient(p=>({...p,idExpiry:v}))}/>
                    </div>
                    <div style={{marginTop:8}}>
                      <label style={c.lbl}>ID Document Photo</label>
                      <div style={c.row(10)}>
                        <button style={c.btn(T.border,T.text,{padding:"8px 14px"})} onClick={()=>fileRef.current&&fileRef.current.click()}>
                          📷 Capture / Upload ID
                        </button>
                        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" style={{display:"none"}} onChange={handlePhoto}/>
                        {photo&&<span style={c.badge(T.green)}>✓ Photo captured</span>}
                      </div>
                      {photo&&<img src={photo} alt="ID" style={{marginTop:8,maxWidth:180,borderRadius:6,border:"1px solid "+T.border}}/>}
                    </div>
                  </div>

                  {/* Declaration */}
                  <div style={c.card({padding:14,marginBottom:14,borderColor:T.blue+"44"})}>
                    <div style={{fontSize:11,color:T.text,lineHeight:1.7,marginBottom:10}}>
                      <strong>DECLARATION:</strong> I declare that all information I have provided is true and correct, and the goods I am selling are my property and I have the right to sell them.
                    </div>
                    <F label="Client Signature (type full name)" required value={client.signature} onChange={v=>setClient(p=>({...p,signature:v}))} placeholder="Type full name to sign…"/>
                    <F label="Date" type="date" required value={client.signatureDate||nowISO().slice(0,10)} onChange={v=>setClient(p=>({...p,signatureDate:v}))}/>
                  </div>

                  <div style={c.row(10)}>
                    <button style={c.btn(T.gold)} onClick={()=>{
                      if(!privAck){pop("Client must acknowledge Privacy Notice.","err");return;}
                      if(!client.signature){pop("Client signature required.","err");return;}
                      setTxStep(4);
                    }}>Next: Staff Section →</button>
                    <button style={c.bsm()} onClick={()=>setTxStep(2)}>← Back</button>
                  </div>
                </div>
              )}

              {/* ─── STEP 4: STAFF SECTION ─── */}
              {txStep===4&&(
                <div>
                  <div style={{fontSize:14,fontWeight:"bold",color:T.white,marginBottom:4}}>Staff Section — COMPLIANCE RECORD</div>
                  <div style={{fontSize:11,color:T.muted,marginBottom:14}}>Staff section only. Retain 7 years per AUSTRAC/Privacy Act.</div>

                  {/* S5 — ID Verification */}
                  <div style={c.card({padding:16,marginBottom:14})}>
                    <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,letterSpacing:"0.1em"}}>SECTION 5 — IDENTITY VERIFICATION BY STAFF</div>
                    <div style={{fontSize:12,color:T.text,lineHeight:1.7,marginBottom:10}}>
                      "I have physically sighted the document presented and confirm the photo matches the person in front of me."
                    </div>
                    <div style={c.g2(10)}>
                      <F label="Staff Member Name" required value={staff.staffName} onChange={v=>setStaff(p=>({...p,staffName:v}))}/>
                      <F label="Date / Time" value={new Date().toLocaleString("en-AU")} readOnly/>
                    </div>
                    <label style={{...c.row(8),cursor:"pointer",fontSize:12}}>
                      <input type="checkbox" checked={idSighted} onChange={e=>setIdSighted(e.target.checked)}/>
                      <strong style={{color:T.orange}}>✓ I confirm I have physically sighted the ID and the photo matches the person in front of me</strong>
                    </label>
                  </div>

                  {/* S6 — KYC */}
                  <div style={c.card({padding:16,marginBottom:14})}>
                    <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,letterSpacing:"0.1em"}}>
                      SECTION 6 — KYC CHECKS{compliance.requiresKYC&&<span style={{...c.badge(T.red),marginLeft:8}}>MANDATORY</span>}
                    </div>
                    {!compliance.requiresKYC
                      ?<div style={c.bnr("info")}>N/A — Transaction below all AUSTRAC thresholds. Victorian ID law still applies (Step 5).</div>
                      :(
                        <div>
                          {kycDone&&<div style={c.bnr("info")}>✓ KYC completed in Step 2.</div>}
                          <div style={c.g2(10)}>
                            <SF label="PEP Check" required value={staff.pepResult||""} onChange={v=>setStaff(p=>({...p,pepResult:v}))} options={[
                              {value:"",label:"— Select —"},{value:"no",label:"Not a PEP"},
                              {value:"yes",label:"PEP — refer to compliance officer"},{value:"unable",label:"Unable to determine"},
                            ]}/>
                            <SF label="TFS Check — dfat.gov.au/sanctions" required value={staff.tfsResult||""} onChange={v=>setStaff(p=>({...p,tfsResult:v}))} options={[
                              {value:"",label:"— Select —"},{value:"clear",label:"Seller NOT listed"},{value:"listed",label:"LISTED — DO NOT PROCEED"},
                            ]}/>
                          </div>
                          <SF label="Risk Rating" required value={staff.riskRating||""} onChange={v=>setStaff(p=>({...p,riskRating:v}))} options={[
                            {value:"",label:"— Select —"},{value:"low",label:"Low"},{value:"medium",label:"Medium"},{value:"high",label:"High"},
                          ]}/>
                        </div>
                      )}
                  </div>

                  {/* S7 — Flags */}
                  <div style={c.card({padding:16,marginBottom:14})}>
                    <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,letterSpacing:"0.1em"}}>SECTION 7 — COMPLIANCE FLAGS</div>
                    {compliance.flags.map(f=><div key={f.key} style={c.bnr(f.level)}>{f.msg}</div>)}
                    {compliance.flags.some(f=>f.key==="ttr")&&(
                      <div style={{marginTop:8}}>
                        <div style={{fontSize:12,color:T.red,fontWeight:"bold"}}>
                          TTR Deadline: File by {new Date(Date.now()+10*24*3600000).toLocaleDateString("en-AU")} via AUSTRAC Online
                        </div>
                        <F label="Compliance Officer Notified" value={staff.complianceOfficer} onChange={v=>setStaff(p=>({...p,complianceOfficer:v}))}/>
                      </div>
                    )}
                    <div style={{marginTop:8}}>
                      <label style={c.lbl}>Suspicious Matter</label>
                      <div style={c.row(8)}>
                        <button style={c.bsm(T.greenBg,T.green)} onClick={()=>setStaff(p=>({...p,smr:"none"}))}>No Suspicion</button>
                        <button style={c.bsm(T.redBg,T.red)} onClick={()=>setShowFlag(true)}>🚩 Flag for SMR</button>
                      </div>
                      <div style={{fontSize:10,color:T.muted,marginTop:4}}>⚠️ NEVER tell the seller a report has been or may be filed — tipping off is a criminal offence (AML/CTF Act s.123).</div>
                    </div>
                  </div>

                  {/* S8 — Hold */}
                  <div style={c.card({padding:16,marginBottom:14})}>
                    <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,letterSpacing:"0.1em"}}>SECTION 8 — SAFETY HOLD — Vic Act s.21 (168 hours)</div>
                    <div style={c.bnr("warn")}>Automatic 168-hour Safety Hold applies. No item may be sold, altered, melted, or sent to refinery until Hold has fully expired.</div>
                    <div style={c.g2(10)}>
                      <div><div style={c.lbl}>Hold Start</div><div style={{fontSize:12,color:T.orange}}>{new Date().toLocaleString("en-AU")}</div></div>
                      <div><div style={c.lbl}>Hold Expiry (+168 hrs)</div><div style={{fontSize:12,color:T.orange}}>{new Date(Date.now()+THRESH.HOLD_HOURS*3600000).toLocaleString("en-AU")}</div></div>
                    </div>
                    <F label="Storage Location (bay / safe / tray — required by Vic Act s.21A)" required value={staff.storageLocation} onChange={v=>setStaff(p=>({...p,storageLocation:v}))}/>
                  </div>

                  <div style={c.row(10)}>
                    <button style={c.btn(T.green,T.bg)} onClick={finalize}>✓ Finalise Transaction</button>
                    <button style={c.bsm()} onClick={()=>setTxStep(3)}>← Back</button>
                  </div>
                </div>
              )}

              {/* ─── STEP 5: PAYMENT + INTEGRATIONS ─── */}
              {txStep===5&&(
                <div>
                  <div style={{fontSize:13,fontWeight:"bold",color:T.white,marginBottom:14}}>💳 Payment</div>

                  {/* Payment method selector */}
                  <div style={{...c.card({padding:16}),marginBottom:14}}>
                    <label style={c.lbl}>Payment Method</label>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:8}}>
                      {[
                        {v:"cash",   icon:"💵", label:"Cash",        note:"Buy ≤ $2,000"},
                        {v:"eftpos", icon:"🖥",  label:"EFTPOS",      note:"Terminal"},
                        {v:"card",   icon:"💳",  label:"Card Online", note:"Link"},
                        {v:"bank",   icon:"🏦",  label:"Bank EFT",    note:"Transfer"},
                        ...(settings.cryptoEnabled?[{v:"crypto",icon:"₿",label:"Crypto",note:"BTC/ETH"}]:[]),
                      ].map(opt=>(
                        <button key={opt.v} onClick={()=>setTxPay(opt.v)}
                          style={{...c.btn(txPay===opt.v?T.gold:T.border,txPay===opt.v?T.bg:T.text,
                            {padding:"12px 16px",minWidth:80,display:"flex",flexDirection:"column",
                             alignItems:"center",gap:3,textTransform:"none",letterSpacing:0,fontSize:11})}}>
                          <span style={{fontSize:28}}>{opt.icon}</span>
                          <span style={{fontWeight:"bold"}}>{opt.label}</span>
                          <span style={{fontSize:9,opacity:0.65,fontWeight:"normal"}}>{opt.note}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Net amount display */}
                  <div style={{...c.card({padding:14}),marginBottom:14,textAlign:"center"}}>
                    <div style={{fontSize:11,color:T.muted,marginBottom:4}}>
                      {net>=0?"Amount to collect from client":"Amount to pay client"}
                    </div>
                    <div style={{fontSize:28,fontWeight:"bold",color:net>=0?T.gold:T.green}}>
                      {fmtAUD(Math.abs(net))}
                    </div>
                    {buyTotal>0&&sellTotal>0&&<div style={{fontSize:11,color:T.muted,marginTop:4}}>
                      Buy: {fmtAUD(buyTotal)} · Sell: {fmtAUD(sellTotal)}
                    </div>}
                  </div>

                  {/* EFTPOS terminal button */}
                  {txPay==="eftpos"&&net>0&&(
                    <div style={{...c.card({padding:16}),marginBottom:10,borderLeft:"4px solid "+T.green}}>
                      <div style={{fontSize:11,fontWeight:"bold",color:T.green,marginBottom:8}}>🖥 EFTPOS Terminal</div>
                      {settings.eftposProvider==="none"||!settings.eftposProvider
                        ?<div style={{fontSize:11,color:T.muted,marginBottom:10}}>No terminal configured — confirm manually below, or set up in Settings → Integrations.</div>
                        :<div style={{fontSize:11,color:T.muted,marginBottom:10}}>
                          Provider: <strong>{settings.eftposProvider==="square"?"Square Terminal":"Linkly / PC-EFTPOS"}</strong>
                          {settings.eftposProvider==="linkly"&&<span> · {settings.linklyBaseUrl||"localhost:4242"}</span>}
                        </div>
                      }
                      <button style={{...c.btn(T.green,T.bg),width:"100%",fontSize:14,padding:"14px"}}
                        onClick={async()=>{
                          pop("Sending "+fmtAUD(net)+" to terminal…","ok");
                          const r=await sendEftpos(net);
                          pop(r.msg,r.ok?"ok":"err");
                        }}>
                        🖥 Send {fmtAUD(net)} to Terminal
                      </button>
                      <button style={{...c.bsm(T.border,T.muted),marginTop:8,width:"100%"}}
                        onClick={()=>pop("Manual EFTPOS confirmed.","ok")}>
                        ✓ Confirm Manually (terminal not connected)
                      </button>
                    </div>
                  )}

                  {/* Cash */}
                  {txPay==="cash"&&net>=0&&(
                    <div style={{...c.card({padding:16}),marginBottom:10,borderLeft:"4px solid "+T.green}}>
                      <div style={c.bnr("info")}>💵 Collect {fmtAUD(net)} cash from client.</div>
                      <button style={{...c.btn(T.green,T.bg),marginTop:10,width:"100%"}} onClick={()=>pop("Cash received.","ok")}>✓ Cash Received</button>
                    </div>
                  )}

                  {/* Card online */}
                  {txPay==="card"&&net>=0&&(
                    <div style={{...c.card({padding:16}),marginBottom:10,borderLeft:"4px solid "+T.gold}}>
                      <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:8}}>💳 Card — Online Checkout</div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        <button style={{...c.btn(T.gold,T.bg),flex:1}}
                          onClick={async()=>{
                            if(!settings.squareToken){pop("Square not configured in Settings.","warn");return;}
                            pop("Opening Square checkout…","ok");
                            try{await sendSquareSell();}catch(e){pop("Square: "+e.message,"err");}
                          }}>⬡ Square Checkout</button>
                        <button style={{...c.btn(T.border,T.text),flex:1}}
                          onClick={async()=>{
                            if(!settings.shopifyDomain){pop("Shopify not configured in Settings.","warn");return;}
                            pop("Creating Shopify order…","ok");
                            try{const r=await sendShopifySell(txNo,txItems.filter(i=>i.mode==="sell"),client.fullName);pop(r.ok?"✓ "+r.msg:"✗ "+r.msg,r.ok?"ok":"err");}
                            catch(e){pop("Shopify: "+e.message,"err");}
                          }}>🛍 Shopify Order</button>
                      </div>
                      <button style={{...c.bsm(T.border,T.muted),marginTop:8,width:"100%"}} onClick={()=>pop("Card payment confirmed.","ok")}>✓ Confirm Manually</button>
                    </div>
                  )}

                  {/* Bank transfer */}
                  {txPay==="bank"&&net>=0&&(
                    <div style={{...c.card({padding:16}),marginBottom:10,borderLeft:"4px solid "+T.blue}}>
                      <div style={c.bnr("info")}>🏦 Client transfers {fmtAUD(net)} to your account.</div>
                      <button style={{...c.btn(T.green,T.bg),marginTop:10,width:"100%"}} onClick={()=>pop("Bank transfer noted.","ok")}>✓ Transfer Noted</button>
                    </div>
                  )}

                  {/* Crypto */}
                  {txPay==="crypto"&&net>=0&&(
                    <div style={{...c.card({padding:16}),marginBottom:10,borderLeft:"4px solid "+T.orange}}>
                      <div style={{fontSize:11,fontWeight:"bold",color:T.orange,marginBottom:8}}>₿ Crypto</div>
                      {(()=>{
                        const COINS=[
                          {k:"BTC",l:"Bitcoin",w:settings.walletBTC},
                          {k:"ETH",l:"Ethereum",w:settings.walletETH},
                          {k:"BNB",l:"Binance BEP-2",w:settings.walletBNB},
                          {k:"XRP",l:"Ripple",w:settings.walletXRP},
                          {k:"SOL",l:"Solana",w:settings.walletSOL},
                        ].filter(x=>x.w);
                        if(!COINS.length) return <div style={c.bnr("warn")}>No wallets configured in Settings.</div>;
                        return COINS.map(coin=>(
                          <div key={coin.k} style={{...c.card({padding:10}),marginBottom:6}}>
                            <div style={{fontWeight:"bold",color:T.gold,fontSize:11,marginBottom:4}}>{coin.k} — {coin.l}</div>
                            <div style={{fontFamily:"monospace",fontSize:10,color:T.white,background:T.surface,padding:"6px 8px",borderRadius:4,wordBreak:"break-all",marginBottom:6}}>{coin.w}</div>
                            <button style={c.bsm(T.goldBg,T.gold)} onClick={()=>{navigator.clipboard&&navigator.clipboard.writeText(coin.w);pop(coin.k+" copied.","ok");}}>📋 Copy</button>
                          </div>
                        ));
                      })()}
                      <button style={{...c.btn(T.green,T.bg),marginTop:8,width:"100%"}} onClick={()=>pop("Crypto received.","ok")}>✓ Crypto Received</button>
                    </div>
                  )}

                  {/* We owe client */}
                  {net<0&&(
                    <div style={{...c.card({padding:16}),marginBottom:10,borderLeft:"4px solid "+T.green}}>
                      <div style={c.bnr("warn")}>We pay client {fmtAUD(-net)} by {(txPay||"cash").toUpperCase()}.</div>
                      {txPay==="eftpos"&&<button style={{...c.btn(T.green,T.bg),marginTop:8,width:"100%"}} onClick={async()=>{const r=await sendEftpos(-net);pop(r.msg,r.ok?"ok":"err");}}>🖥 Refund via Terminal</button>}
                      <button style={{...c.btn(T.green,T.bg),marginTop:8,width:"100%"}} onClick={()=>pop("Client paid.","ok")}>✓ Client Paid</button>
                    </div>
                  )}

                  {net===0&&<div style={c.bnr("info")}>⚖ Zero balance — no payment needed.</div>}

                  {/* Integrations row */}
                  <div style={{...c.card({padding:12}),marginBottom:14}}>
                    <div style={{fontSize:10,color:T.muted,marginBottom:8,letterSpacing:"0.08em"}}>RECORD IN</div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      <button style={c.bsm(settings.squareToken?T.goldBg:T.surface,settings.squareToken?T.gold:T.muted)}
                        onClick={async()=>{
                          if(!settings.squareToken){pop("Square not configured.","warn");return;}
                          const buys=txItems.filter(i=>i.mode==="buy");
                          const sells=txItems.filter(i=>i.mode==="sell");
                          if(buys.length) try{const r=await sendSquareBuy(txNo,buys,buyTotal,client.fullName,txPay);pop(r.ok?"✓ "+r.msg:"✗ "+r.msg,r.ok?"ok":"err");}catch(e){pop("Square: "+e.message,"err");}
                          if(sells.length) try{await sendSquareSell();}catch(e){pop("Square sell: "+e.message,"err");}
                        }}>⬡ Square</button>
                      <button style={c.bsm(settings.shopifyDomain?T.goldBg:T.surface,settings.shopifyDomain?T.gold:T.muted)}
                        onClick={async()=>{
                          if(!settings.shopifyDomain){pop("Shopify not configured.","warn");return;}
                          const buys=txItems.filter(i=>i.mode==="buy");
                          const sells=txItems.filter(i=>i.mode==="sell");
                          if(buys.length) try{const r=await sendShopifyBuy(txNo,buys,buyTotal,client.fullName,txPay);pop(r.ok?"✓ "+r.msg:"✗ "+r.msg,r.ok?"ok":"err");}catch(e){pop("Shopify: "+e.message,"err");}
                          if(sells.length) try{const r=await sendShopifySell(txNo,sells,client.fullName);pop(r.ok?"✓ "+r.msg:"✗ "+r.msg,r.ok?"ok":"err");}catch(e){pop("Shopify: "+e.message,"err");}
                        }}>🛍 Shopify</button>
                      <button style={c.bsm(settings.xeroToken?T.goldBg:T.surface,settings.xeroToken?T.gold:T.muted)}
                        onClick={async()=>{
                          if(!settings.xeroToken){pop("Xero not configured.","warn");return;}
                          pop("Xero sync requires webhook setup — configure in Settings.","warn");
                        }}>📒 Xero</button>
                    </div>
                    <div style={{fontSize:9,color:T.muted,marginTop:6}}>Greyed = not configured. Tap to see instructions.</div>
                  </div>

                  <button style={{...c.btn(T.gold,T.bg),width:"100%",marginTop:4}} onClick={()=>setTxStep(6)}>
                    Next: Finalise →
                  </button>
                </div>
              )}

              {txStep===6&&(
                <div>
                  {/* Transaction summary */}
                  <div style={{...c.card({padding:16}),marginBottom:14,borderLeft:"4px solid "+T.gold}}>
                    <div style={{fontSize:12,fontWeight:"bold",color:T.gold,marginBottom:12,letterSpacing:"0.08em"}}>📋 TRANSACTION SUMMARY</div>
                    <div style={c.g2(10)}>
                      <div><div style={c.lbl}>Invoice #</div><div style={{color:T.gold,fontWeight:"bold",fontSize:14}}>{txNo}</div></div>
                      <div><div style={c.lbl}>Client</div><div style={{color:T.white}}>{client.fullName}</div></div>
                      <div><div style={c.lbl}>Payment</div><div style={{textTransform:"uppercase",color:T.white}}>{txPay}</div></div>
                      {activeStaff&&staffList.find(s=>s.id===activeStaff)&&(
                        <div><div style={c.lbl}>Staff</div><div style={{color:T.white}}>{(staffList.find(s=>s.id===activeStaff)||{}).name}</div></div>
                      )}
                      {buyTotal>0&&<div><div style={c.lbl}>Buy Total</div><div style={{color:T.green,fontWeight:"bold"}}>{fmtAUD(buyTotal)}</div></div>}
                      {sellTotal>0&&<div><div style={c.lbl}>Sell Total</div><div style={{color:T.gold,fontWeight:"bold"}}>{fmtAUD(sellTotal)}</div></div>}
                      <div><div style={c.lbl}>Net</div><div style={{fontWeight:"bold",color:net>=0?T.gold:T.green,fontSize:16}}>{net>=0?"Client pays "+fmtAUD(net):"We pay "+fmtAUD(-net)}</div></div>
                    </div>
                    {compliance.flags.some(f=>f.key==="ttr")&&(
                      <div style={{...c.bnr("block"),marginTop:10}}>🔴 TTR required — file with AUSTRAC Online within 10 business days.</div>
                    )}
                    {compliance.flags.some(f=>f.key==="smr")&&(
                      <div style={{...c.bnr("warn"),marginTop:8}}>⚠ Suspicious — consider filing an SMR with AUSTRAC.</div>
                    )}
                  </div>

                  {/* Items recap */}
                  {txItems.length>0&&(
                    <div style={{...c.card({padding:14}),marginBottom:14}}>
                      <div style={{fontSize:11,color:T.muted,marginBottom:8,letterSpacing:"0.08em"}}>ITEMS ({txItems.length})</div>
                      {txItems.map((it,i)=>(
                        <div key={it.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i<txItems.length-1?"1px solid "+T.border+"44":"none"}}>
                          <div>
                            <span style={{...c.badge(it.mode==="buy"?T.green:T.gold),marginRight:6}}>{it.mode.toUpperCase()}</span>
                            <span style={{fontSize:12,color:T.white}}>{it.product&&it.product.label}</span>
                            {it.note&&<span style={{fontSize:11,color:T.muted}}> — {it.note}</span>}
                          </div>
                          <span style={{fontWeight:"bold",color:it.mode==="buy"?T.green:T.gold}}>{fmtAUD(it.price)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Finalise button */}
                  <button style={{...c.btn(T.green,T.bg),width:"100%",fontSize:15,padding:"16px",marginBottom:10}}
                    onClick={finalize}>
                    ✓ Complete Transaction
                  </button>

                  {/* Navigation */}
                  <div style={c.row(10)}>
                    <button style={{...c.bsm(T.border,T.muted),flex:1}} onClick={()=>setTxStep(5)}>← Back to Payment</button>
                    <button style={{...c.bsm(T.border,T.muted),flex:1}} onClick={()=>{resetTx();setScreen("dashboard");}}>✕ Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ STOCK / HOLDS ═══ */}
          {screen==="stock"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontSize:17,fontWeight:"bold",color:T.white,display:"flex",alignItems:"center"}}>Stock / Hold Manager<AIGhost settings={settings} label="Stock"/></div>
                <button style={{...c.btn(T.gold,T.bg,{fontSize:11,padding:"7px 12px"})}} onClick={dlAccounting}>📊 Accounting</button>
              </div>
              {frozenSnap&&<div style={{...c.bnr("warn"),marginBottom:10}}>
                ❄ Frozen at {frozenSnap.frozenAt} — Au {fmtAUD(frozenSnap.gSpot)}/oz · Ag {fmtAUD(frozenSnap.sSpot)}/oz. All melt values use these locked prices.
                <button style={{...c.bsm(T.redBg,T.red),marginLeft:10,fontSize:10}} onClick={()=>setPinModal({reason:"Unfreeze accounting snapshot — manager PIN required.",cb:()=>{setFrozenSnap(null);pop("Snapshot unfrozen. Live prices resumed.","ok");}})}>Unfreeze</button>
              </div>}
              {!frozenSnap&&<div style={{...c.bnr("info"),marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>📸 No frozen snapshot. Lock prices for month-end accounting.</span>
                <button style={{...c.bsm(T.goldBg,T.gold),fontSize:10}} onClick={()=>setPinModal({reason:"Freeze accounting snapshot at current spot prices — manager PIN required.",cb:()=>{const snap={gSpot:gSpot,sSpot:sSpot,frozenAt:todayStr()};setFrozenSnap(snap);pop("Snapshot locked at Au "+fmtAUD(gSpot)+"/oz, Ag "+fmtAUD(sSpot)+"/oz.","ok");}})}>❄ Freeze Now</button>
              </div>}
              {/* Value summary by metal */}
              {stock.length>0&&(
                <div style={{...c.g2(10),marginBottom:12}}>
                  {["Gold","Silver","Other"].map(cat=>(
                    (stock||[]).filter(s=>s.product&&s.product.cat===cat&&!s.sold).length===0 ? null :
                    <div key={cat} style={c.card({padding:12,borderLeft:"3px solid "+(cat==="Gold"?T.gold:cat==="Silver"?T.silver:T.muted)})}>
                      <div style={{fontSize:10,color:T.muted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>{cat==="Gold"?"⬡":cat==="Silver"?"◈":"◇"} {cat}</div>
                      <div style={{fontSize:15,fontWeight:"bold",color:cat==="Gold"?T.gold:cat==="Silver"?T.silver:T.text}}>
                        {fmtAUD((stock||[]).filter(s=>s.product&&s.product.cat===cat&&!s.sold).reduce((a,s)=>a+(s.price||0),0))}
                      </div>
                      <div style={{fontSize:10,color:T.green,marginTop:2}}>
                        {(stock||[]).filter(s=>s.product&&s.product.cat===cat&&!s.sold&&!s.policeHold&&hoursLeft(s.holdUntil)<=0).length} ready · {fmtAUD((stock||[]).filter(s=>s.product&&s.product.cat===cat&&!s.sold&&!s.policeHold&&hoursLeft(s.holdUntil)<=0).reduce((a,s)=>a+(s.price||0),0))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{fontSize:11,color:T.muted,marginBottom:12}}>
                🟠 In hold · 🟢 Ready for sale · 🔴 Police Hold
              </div>
              {stock.length===0
                ?<div style={{color:T.muted,padding:40,textAlign:"center"}}>No stock items yet.</div>
                :(stock||[]).map((s,i)=>(
                  <StockCard key={s.id} s={s} T={T} c={c}
                    fmtAUD={fmtAUD} fmtDate={fmtDate} calcMelt={calcMelt}
                    frozenSnap={frozenSnap} hoursLeft={hoursLeft}
                    togglePoliceHold={togglePoliceHold} setPinModal={setPinModal}
                    setPinVal={setPinVal} setStock={setStock}
                    setEditStockId={setEditStockId} setEditStockVal={setEditStockVal}
                    nowISO={nowISO} GOLD_P={GOLD_P} SILV_P={SILV_P}/>
                ))
              }
            </div>
          )}

          {/* ═══ CLIENTS ═══ */}
          {screen==="clients"&&(
            <div>
              <div style={{marginBottom:14}}><h1 style={{fontSize:17,fontWeight:"bold",color:T.white,margin:0,display:"flex",alignItems:"center"}}>Client Data<AIGhost settings={settings} label="Clients"/></h1><p style={{fontSize:11,color:T.muted,marginTop:3}}>Retained 7 years. Encrypted drive. Erase monthly (APP 11).</p></div>
              <div style={c.card({padding:16,marginBottom:14})}>
                <div style={{fontSize:12,fontWeight:"bold",color:T.white,marginBottom:10}}>Download by Date Range</div>
                <div style={c.g2(10)}><F label="From" type="date" value={cliFrom} onChange={setCliFrom}/><F label="To" type="date" value={cliTo} onChange={setCliTo}/></div>
                <div style={c.row(10)}>
                  <button style={c.btn(T.gold,T.bg)} onClick={dlBatch}>⬇ Download Files</button>
                  <span style={{fontSize:11,color:T.muted}}>{txList.filter(t=>{const d=new Date(t.date),fr=cliFrom?new Date(cliFrom):new Date(0),to=cliTo?new Date(cliTo):new Date();to.setHours(23,59,59);return d>=fr&&d<=to;}).length} tx in range</span>
                </div>
              </div>
              <input style={c.inp({marginBottom:12})} type="text" placeholder="Search by name or invoice…" value={cliSearch} onChange={e=>setCliSearch(e.target.value)}/>
              {txList.length===0
                ?<div style={{...c.card({padding:32}),textAlign:"center",color:T.muted}}>No records yet.</div>
                :txList.filter(tx=>{if(!cliSearch)return true;const q=cliSearch.toLowerCase();return((tx.client&&tx.client.fullName)||"").toLowerCase().includes(q)||(tx.id||"").toLowerCase().includes(q);}).map(tx=>(
                  <div key={tx.id} style={{...c.card({padding:14}),marginBottom:8,borderLeft:"3px solid "+(isBlacklistedName((tx.client&&tx.client.fullName)||"")?T.red:T.border)}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                          <span style={{fontWeight:"bold",color:T.gold,fontSize:13}}>{tx.id}</span>
                          {tx.hasPhotos&&<span style={c.badge(T.green,T.greenBg)}>Photos</span>}
                          {isBlacklistedName((tx.client&&tx.client.fullName)||"")&&<span style={c.badge(T.red)}>⛔ BL</span>}
                          {tx.smrFlagged&&<span style={c.badge(T.orange)}>SMR</span>}
                        </div>
                        <div style={{fontSize:12,color:T.white,fontWeight:500}}>{(tx.client&&tx.client.fullName)||"—"}</div>
                        <div style={{fontSize:11,color:T.muted,marginTop:2}}>{fmtDate(tx.date)}{tx.client&&tx.client.dob?" · DOB: "+tx.client.dob:""}</div>
                        {tx.clientNote&&<div style={{fontSize:11,color:T.gold,marginTop:2,fontStyle:"italic"}}>📝 {tx.clientNote}</div>}
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:5}}>
                        <button style={c.bsm(T.goldBg,T.gold)} onClick={()=>dlTx(tx)}>⬇</button>
                        <button style={c.bsm(T.border,T.muted)} onClick={()=>{setCliNoteId(tx.id);setCliNoteVal(tx.clientNote||"");}}>📝</button>
                        <button style={{...c.bsm(isBlacklistedName((tx.client&&tx.client.fullName)||"")?T.redBg:T.border,isBlacklistedName((tx.client&&tx.client.fullName)||"")?T.red:T.muted),fontSize:10,whiteSpace:"nowrap"}}
                          onClick={()=>{const nm=(tx.client&&tx.client.fullName)||"";const bl=blacklist.some(b=>b.name.toLowerCase()===nm.toLowerCase());if(bl)setBlacklist(p=>p.filter(b=>b.name.toLowerCase()!==nm.toLowerCase()));else if(nm)setBlacklist(p=>[...p,{name:nm,addedAt:nowISO()}]);pop(bl?"Removed from blacklist.":"Added to blacklist.","ok");}}>
                          {isBlacklistedName((tx.client&&tx.client.fullName)||"")?"⛔ Unban":"⛔ Ban"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              }
              <button style={{...c.bsm(T.border,T.muted),marginTop:10,fontSize:11}} onClick={()=>{
                const rows=[["Invoice","Date","Client","DOB","Buy","Sell","Net","Payment","TTR","SMR","KYC"]];
                txList.forEach(t=>{rows.push([t.id,t.date&&t.date.slice(0,10),(t.client&&t.client.fullName)||"",(t.client&&t.client.dob)||"",t.buyTotal||0,t.sellTotal||0,t.net||0,(t.payment||"").toUpperCase(),t.ttrStatus||"",t.smrFlagged?"YES":"",t.kycDone?"YES":""])});
                const DQ2=String.fromCharCode(34);const csvEsc=v=>{const s=String(v==null?"":v);return DQ2+s.split(DQ2).join(DQ2+DQ2)+DQ2;};
                const csv=rows.map(r=>r.map(csvEsc).join(",")).join("\n");
                dlFile(csv,"lootledgr-export-"+nowISO().slice(0,10)+".csv","text/csv");
                pop("CSV exported.","ok");
              }}>⬇ Export All as CSV</button>
            </div>
          )}

          {/* ═══ HISTORY ═══ */}
          {screen==="history"&&(
            <div>
              <div style={{fontSize:17,fontWeight:"bold",color:T.white,marginBottom:10,display:"flex",alignItems:"center"}}>Transaction History<AIGhost settings={settings} label="History"/></div>
              <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
                {[["all","All ("+txList.length+")"],["smr","🚩 SMR ("+txList.filter(t=>t.smrFlagged).length+")"],["ttr","🔴 TTR Pending ("+txList.filter(t=>t.ttrStatus==="PENDING").length+")"]].map(([k,lbl])=>(
                  <button key={k} style={{...c.bsm(histFilter===k?T.gold:T.border,histFilter===k?T.bg:T.muted),fontSize:11}} onClick={()=>setHistFilter(k)}>{lbl}</button>
                ))}
              </div>
              {txList.length===0
                ?<div style={{color:T.muted,padding:40,textAlign:"center"}}>No transactions recorded yet.</div>
                :txList.filter(tx=>histFilter==="smr"?tx.smrFlagged:histFilter==="ttr"?tx.ttrStatus==="PENDING":true).map(tx=>(
                  <div key={tx.id} style={{...c.card({padding:14}),marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:4}}>
                          <span style={{fontWeight:"bold",color:T.gold,fontSize:13}}>{tx.id}</span>
                          <span style={{fontSize:11,color:T.muted}}>{fmtDate(tx.date)}</span>
                          {tx.ttrRequired&&<span style={c.badge(T.red)}>TTR{tx.ttrStatus==="FILED"?" ✓":""}</span>}
                          {tx.smrFlagged&&<span style={c.badge(T.orange)}>SMR</span>}
                          {tx.items&&tx.items.some(i=>i.suspicious)&&<span style={c.badge(T.orange)}>🚩</span>}
                          {tx.items&&tx.items.some(i=>i.policeHold)&&<span style={c.badge(T.red)}>🚔</span>}
                        </div>
                        <div style={{fontSize:13,color:T.white,fontWeight:500,marginBottom:3}}>{(tx.client&&tx.client.fullName)||"—"}</div>
                        <div style={{display:"flex",gap:12,flexWrap:"wrap",fontSize:12}}>
                          {tx.buyTotal>0&&<span>Buy: <strong style={{color:T.green}}>{fmtAUD(tx.buyTotal)}</strong></span>}
                          {tx.sellTotal>0&&<span>Sell: <strong style={{color:T.gold}}>{fmtAUD(tx.sellTotal)}</strong></span>}
                          <span>Net: <strong style={{color:tx.net>=0?T.gold:T.green}}>{fmtAUD(Math.abs(tx.net||0))}</strong></span>
                          <span style={{color:T.muted,textTransform:"uppercase"}}>{tx.payment}</span>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:4}}>
                        <button style={c.bsm()} onClick={()=>setSelTx(tx)}>View</button>
                        <button style={c.bsm(T.goldBg,T.gold)} onClick={()=>setReceiptTx(tx)}>🧾</button>
                        {!tx.voided&&<button style={c.bsm(T.redBg,T.red)} onClick={()=>setPinModal({reason:"Void transaction "+tx.id+"? This cannot be undone.",cb:()=>{setTxList(p=>p.map(x=>x.id===tx.id?{...x,voided:true,voidedAt:nowISO()}:x));pop("Transaction "+tx.id+" voided.","ok");}})}>✕ Void</button>}
                        {tx.voided&&<span style={{...c.badge(T.red),fontSize:9}}>VOIDED</span>}
                      </div>
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {/* ═══ PRICE SHEET ═══ */}
          {screen==="prices"&&(
            <div>
              <div style={{...c.row(0),justifyContent:"space-between",marginBottom:12}}>
                <div style={{fontSize:17,fontWeight:"bold",color:T.white,display:"flex",alignItems:"center"}}>Live Price Sheet<AIGhost settings={settings} label="Prices"/></div>
                <button style={c.btn(T.border,T.text,{padding:"8px 14px",fontSize:11})} onClick={()=>setShowCat(true)}>✎ Edit Catalog</button>
              </div>

              {/* Manual spot override */}
              <div style={{...c.card({padding:12}),marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:8,letterSpacing:"0.06em"}}>⬡ Spot Prices (AUD/oz)</div>
                <div style={{display:"flex",gap:10}}>
                  <div style={{flex:1}}>
                    <label style={c.lbl}>Gold</label>
                    <input style={c.inp()} type="number" placeholder="e.g. 4800" value={gSpot||""} onChange={e=>setGSpotManual(parseFloat(e.target.value)||0)}/>
                  </div>
                  <div style={{flex:1}}>
                    <label style={c.lbl}>Silver</label>
                    <input style={c.inp()} type="number" placeholder="e.g. 48" value={sSpot||""} onChange={e=>setSSpotManual(parseFloat(e.target.value)||0)}/>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:10,color:spotStatus==="live"?T.green:spotStatus==="manual"?T.gold:T.orange,flex:1}}>
                    {spotStatus==="live"
                      ?"🟢 Live — "+spotSource
                      :spotStatus==="manual"
                        ?(()=>{const mins=Math.max(0,Math.ceil((MANUAL_TTL-(Date.now()-manualTs.current))/60000));return "🟡 Manual override — resumes in "+mins+" min";})()
                      :"🟠 No API feed — price held"}
                  </span>
                  <button
                    style={c.btn(spotStatus==="manual"?T.gold:T.border, spotStatus==="manual"?T.bg:T.muted, {fontSize:11,padding:"7px 16px"})}
                    onClick={forceResumeAPI}>
                    ↺ {spotStatus==="manual"?"Resume API Now":"Refresh Prices"}
                  </button>
                </div>
              </div>
              {(catalog||[]).filter(p=>p.active).length===0
                ?<div style={{...c.card({padding:40}),textAlign:"center"}}>
                  <div style={{fontSize:18,marginBottom:12}}>📂</div>
                  <div style={{color:T.white,fontWeight:"bold",marginBottom:8}}>No products in catalog yet</div>
                  <div style={{color:T.muted,fontSize:12,marginBottom:20}}>Click Edit Catalog to add your first product.</div>
                  <button style={c.btn(T.gold,T.bg,{fontSize:12})} onClick={()=>setShowCat(true)}>+ Add First Product</button>
                </div>
                :<div>
                  {["Gold","Silver","Other"].map(cat=>(
                    (catalog||[]).filter(p=>p.cat===cat&&p.active).length===0 ? null :
                    <div key={cat} style={{marginBottom:14}}>
                      <div style={c.shead(cat==="Gold")}>{cat==="Gold"?"⬡":cat==="Silver"?"◈":"◇"} {cat}</div>
                      {(catalog||[]).filter(p=>p.cat===cat&&p.active).map(p=>(
                        <div key={p.id} style={{...c.card({padding:12}),marginBottom:6,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                          <div style={{flex:1}}>
                            <div style={{fontWeight:"bold",color:T.white,fontSize:13}}>{p.label}</div>
                            <div style={{fontSize:11,color:T.muted,marginTop:2}}>
                              <span style={c.badge(p.type==="bullion"?T.gold:T.muted)}>{p.type}</span>
                              <span style={{marginLeft:6}}>{p.unit}{p.carat?" · "+p.carat+"ct":p.purity?" · "+(p.purity*100).toFixed(0)+"%":""}</span>
                            </div>
                          </div>
                          <div style={{textAlign:"right",flexShrink:0}}>
                            <div style={{fontSize:13,fontWeight:"bold",color:T.green}}>{calcUnitPrice(p,gSpot,sSpot,"buy")?fmtAUD(calcUnitPrice(p,gSpot,sSpot,"buy")):"custom"}<span style={{fontSize:10,color:T.muted,fontWeight:"normal"}}> buy</span></div>
                            <div style={{fontSize:13,fontWeight:"bold",color:T.gold}}>{calcUnitPrice(p,gSpot,sSpot,"sell")?fmtAUD(calcUnitPrice(p,gSpot,sSpot,"sell")):"custom"}<span style={{fontSize:10,color:T.muted,fontWeight:"normal"}}> sell</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              }
            </div>
          )}

      </div>{/* end main content */}

      {/* BOTTOM NAV */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:T.surface,
        borderTop:"1px solid "+T.border,display:"flex",zIndex:200}}>
        {NAV.map(n=>(
          <button key={n.id} onClick={()=>{if(n.id==="newTx")resetTx();setScreen(n.id);}}
            style={{flex:1,background:"transparent",border:"none",
              color:screen===n.id?T.gold:T.muted,fontFamily:T.ff,fontSize:9,
              cursor:"pointer",padding:"7px 4px",display:"flex",flexDirection:"column",
              alignItems:"center",gap:2,letterSpacing:"0.06em",textTransform:"uppercase"}}>
            <span style={{fontSize:18}}>{n.icon}</span>{n.label}
          </button>
        ))}
      </div>

      {/* ── MODALS ── */}

      {/* SMR Flag */}
      {showFlag&&(
        <Modal title="🚩 Internal SMR Flag — CONFIDENTIAL" onClose={()=>setShowFlag(false)}>
          <div style={c.bnr("block")}>⚠️ TIPPING OFF IS A CRIMINAL OFFENCE. Do not tell the customer. Never record on any customer-facing document.</div>
          <div style={{fontSize:12,color:T.text,lineHeight:1.7,marginBottom:14}}>This flag is visible ONLY to the AML/CTF Compliance Officer. Record your observations below.</div>
          <F label="What did you observe? Why does this seem suspicious?" value={flagNote} onChange={setFlagNote} as="textarea"/>
          <div style={c.row(10)}>
            <button style={c.btn(T.red,T.white)} onClick={()=>{
              setStaff(p=>({...p,smrNote:flagNote,smrFlagged:true}));
              setShowFlag(false);pop("SMR flag recorded internally.","warn");
            }}>Submit Internal Flag</button>
            <button style={c.bsm()} onClick={()=>setShowFlag(false)}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* Manager PIN */}
      {pinModal&&(
        <div style={{position:"fixed",inset:0,background:"#000000e0",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={()=>setPinModal(null)}>
          <div style={{...c.card({padding:24}),maxWidth:460,width:"100%"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:15,fontWeight:"bold",color:T.white,marginBottom:16}}>🔒 Manager Authorisation</div>
            <div style={{...c.bnr("warn"),marginBottom:16}}>{pinModal.reason}</div>
            <F label="Manager PIN" type="password" value={pinVal} onChange={setPinVal} placeholder="Enter PIN…"/>
            <div style={c.row(10)}>
              <button style={c.btn(T.gold,T.bg)} onClick={submitPin}>Authorise</button>
              <button style={c.bsm(T.border,T.text)} onClick={()=>{setPinModal(null);setPinVal("");}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* TX Detail */}
      {selTx&&(
        <Modal title={"Transaction — "+selTx.id} onClose={()=>setSelTx(null)} wide>
          <div style={c.g2(14)}>
            {[
              {l:"Date",v:fmtDate(selTx.date)},
              {l:"Client",v:selTx.client&&selTx.client.fullName,col:T.white},
              {l:"ID Type / Number",v:selTx.client&&selTx.client.idType||"?"+" / "+selTx.client&&selTx.client.idNumber||"?",col:T.muted},
              {l:"Buy Total",v:fmtAUD(selTx.buyTotal),col:T.green},
              {l:"Sell Total",v:fmtAUD(selTx.sellTotal),col:T.gold},
              {l:"Net",v:fmtAUD(Math.abs(selTx.net||0))+" "+(selTx.net||0)>=0?"(client pays)":"(we pay)",bold:true},
              {l:"Payment",v:(selTx.payment||"").toUpperCase()},
              {l:"KYC",v:selTx.kycDone?"COMPLETED":"N/A",col:selTx.kycDone?T.green:T.muted},
              {l:"TTR",v:selTx.ttrStatus||"N/A",col:selTx.ttrRequired?T.red:T.muted},
              {l:"Auto-Delete After",v:fmtDate(selTx.deleteAfter),col:T.muted},
            ].map(row=>(
              <div key={row.l}><div style={c.lbl}>{row.l}</div><div style={{color:row.col||T.text,fontWeight:row.bold?"bold":"normal"}}>{row.v}</div></div>
            ))}
          </div>
          <div style={{marginTop:12,fontSize:11,color:T.muted}}>
            Items: {(selTx.items||[]).map(i=>(i.product&&i.product.label)+" ("+i.mode+")").join(", ")}
          </div>

          {/* ── PHOTO MANAGEMENT ── */}
          <div style={{marginTop:16,borderTop:"1px solid "+T.border,paddingTop:14}}>
            <div style={{fontSize:12,fontWeight:"bold",color:T.white,marginBottom:10}}>Photos</div>
            <TxPhotoManager selTx={selTx} store={store} setTxList={setTxList} setSelTx={setSelTx} T={T} c={c}/>
          </div>

          {selTx.ttrRequired&&selTx.ttrStatus!=="FILED"&&(
            <button style={c.btn(T.green,T.bg,{marginTop:14})} onClick={()=>{
              setTxList(p=>p.map(t=>t.id===selTx.id?{...t,ttrStatus:"FILED"}:t));
              setSelTx(p=>({...p,ttrStatus:"FILED"}));
              pop("TTR marked as filed.","ok");
            }}>✓ Mark TTR Filed</button>
          )}
        </Modal>
      )}

      {/* Catalog Editor */}
      {showCat&&(
        <Modal title="Product Catalog Editor" onClose={()=>setShowCat(false)} wide>
          <div style={{marginBottom:18}}>
            <div style={{fontSize:12,fontWeight:"bold",color:T.white,marginBottom:12}}>{editProd?"Editing: "+editProd.label:"Add New Product"}</div>
            <div style={c.g2(10)}>
              <F label="Product Label" required value={newProd.label} onChange={v=>setNewProd(p=>({...p,label:v}))}/>
              <SF label="Category" value={newProd.cat} onChange={v=>setNewProd(p=>({...p,cat:v}))} options={["Gold","Silver","Other"].map(x=>({value:x,label:x}))}/>
              <F label="Sub-Category" value={newProd.sub} onChange={v=>setNewProd(p=>({...p,sub:v}))}/>
              <SF label="Compliance Type" value={newProd.type} onChange={v=>setNewProd(p=>({...p,type:v}))} options={[{value:"bullion",label:"Bullion ($5k CDD)"},{value:"scrap",label:"Scrap/Jewellery ($10k CDD)"}]}/>
              <SF label="Unit" value={newProd.unit} onChange={v=>setNewProd(p=>({...p,unit:v}))} options={[{value:"g",label:"Grams (g)"},{value:"oz",label:"Troy oz"},{value:"pc",label:"Piece (pc)"}]}/>
              <F label="Purity (0–1)" value={newProd.purity} onChange={v=>setNewProd(p=>({...p,purity:v}))} placeholder="e.g. 0.999"/>
              <F label="Carat (scrap gold only)" value={newProd.carat} onChange={v=>setNewProd(p=>({...p,carat:v}))} placeholder="e.g. 18"/>
              <F label="Fixed Weight g (for coins)" value={newProd.weightG} onChange={v=>setNewProd(p=>({...p,weightG:v}))} placeholder="e.g. 7.98"/>
              <F label="Buy Multiplier" value={newProd.buyMult} onChange={v=>setNewProd(p=>({...p,buyMult:v}))} placeholder="e.g. 0.90 = 90% of spot"/>
              <F label="Sell Multiplier" value={newProd.sellMult} onChange={v=>setNewProd(p=>({...p,sellMult:v}))} placeholder="e.g. 1.35 = 135% of spot"/>
            </div>
            <div style={c.row(10)}>
              <button style={c.btn(T.gold)} onClick={saveProd}>Save</button>
              {editProd&&<button style={c.bsm()} onClick={e=>{e.stopPropagation();setEditProd(null);setNewProd({cat:"Other",sub:"",type:"scrap",unit:"g",purity:"",carat:"",label:"",buyMult:"",sellMult:"",weightG:"",active:true});}}>Cancel</button>}
            </div>
          </div>
          <div style={{borderTop:"1px solid "+T.border,paddingTop:14}}>
            <div style={{fontSize:12,fontWeight:"bold",color:T.white,marginBottom:10}}>All Products ({catalog.length})</div>
            {catalog.length===0
              ?<div style={{color:T.muted,fontSize:12,padding:16,textAlign:"center"}}>No products yet. Add one above.</div>
              :(catalog||[]).map(p=>(
                <div key={p.id} style={{background:T.surface,border:"1px solid "+T.border,borderRadius:8,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:"bold",color:T.white,fontSize:13,marginBottom:2}}>{p.label}</div>
                    <div style={{fontSize:11,color:T.muted}}>{p.cat} · {p.type} · {p.unit}{p.carat?" · "+p.carat+"ct":p.purity?" · "+(p.purity*100).toFixed(0)+"%":""}</div>
                    <div style={{fontSize:11,color:T.muted,marginTop:1}}>Buy: {p.buyMult!=null?p.buyMult+"×":"custom"} · Sell: {p.sellMult!=null?p.sellMult+"×":"custom"}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                    <button style={{...c.bsm(),padding:"8px 16px",fontSize:12,minWidth:60}} onClick={()=>{setEditProd(p);setNewProd({...p,purity:p.purity!=null?String(p.purity):"",carat:p.carat!=null?String(p.carat):"",buyMult:p.buyMult!=null?String(p.buyMult):"",sellMult:p.sellMult!=null?String(p.sellMult):"",weightG:p.weightG!=null?String(p.weightG):""});}}>✎ Edit</button>
                    <button style={{...c.bsm(T.redBg,T.red),padding:"8px 16px",fontSize:12,minWidth:60}} onClick={()=>deleteProd(p.id,p.label)}>🗑 Delete</button>
                  </div>
                </div>
              ))
            }
          </div>
        </Modal>
      )}

      {/* Settings */}
      {showSet&&(
        <Modal title="⚙ Settings" onClose={()=>{
            setAppUnlocked(!settings.requirePin);
            if(settings.requirePin) store.set("sessionActive",false);
            setShowSet(false);
          }} wide>
          {/* ── ACCORDION SECTIONS ── */}

          {/* 1. SPOT FEED & PRICES */}
          <div style={{borderBottom:"1px solid "+T.border}}>
            <button style={{width:"100%",background:"none",border:"none",padding:"12px 0",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:T.gold,fontWeight:"bold",fontSize:12,letterSpacing:"0.06em",textAlign:"left"}} onClick={()=>toggleSection("spotfeed")}>
              <span>📡 Spot Feed — API Keys</span>
              <span style={{fontSize:16,color:T.muted}}>{settingsOpen.spotfeed?"▲":"▾"}</span>
            </button>
            {settingsOpen.spotfeed&&(
              <div style={{paddingBottom:14}}>
                <div style={{fontSize:10,color:T.muted,marginBottom:10}}>Priority: GoldAPI.io → Metals-API → Metals.Dev. All free. Manual override in Prices screen beats all for 60 min.</div>
                <div style={c.g2(10)}>
                  <F label="1. GoldAPI.io key (primary)" value={settings.goldApiKey} onChange={v=>setSettings(p=>({...p,goldApiKey:v}))} placeholder="goldapi-xxxxxxxxxxxxxxxx"/>
                  <F label="2. Metals-API key (fallback)" value={settings.metalsApiKey||""} onChange={v=>setSettings(p=>({...p,metalsApiKey:v}))} placeholder="from metals-api.com"/>
                  <F label="3. Metals.Dev key (fallback)" value={settings.metalsDevKey||""} onChange={v=>setSettings(p=>({...p,metalsDevKey:v}))} placeholder="from metals.dev"/>
                </div>
                <div style={{display:"flex",gap:10,marginTop:10}}>
                  <div style={{flex:1}}>
                    <label style={c.lbl}>Gold alert when ≥ (AUD/oz)</label>
                    <input style={c.inp()} type="number" placeholder="e.g. 5000" value={settings.goldAlert||""} onChange={e=>setSettings(p=>({...p,goldAlert:e.target.value||null}))}/>
                  </div>
                  <div style={{flex:1}}>
                    <label style={c.lbl}>Silver alert when ≥ (AUD/oz)</label>
                    <input style={c.inp()} type="number" placeholder="e.g. 60" value={settings.silverAlert||""} onChange={e=>setSettings(p=>({...p,silverAlert:e.target.value||null}))}/>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10,marginTop:12,padding:"10px 12px",borderRadius:6,background:T.surface,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,flex:1,color:spotStatus==="live"?T.green:spotStatus==="manual"?T.gold:T.orange}}>
                    {spotStatus==="live"?"🟢 Live — "+spotSource:spotStatus==="manual"?(()=>{const mins=Math.max(0,Math.ceil((MANUAL_TTL-(Date.now()-manualTs.current))/60000));return "🟡 Manual override — "+mins+" min remaining";})():"🟠 No API feed — price held"}
                  </span>
                  <button
                    style={c.btn(spotStatus==="manual"?T.gold:T.border, spotStatus==="manual"?T.bg:T.muted, {fontSize:11,padding:"7px 16px"})}
                    onClick={forceResumeAPI}>
                    ↺ {spotStatus==="manual"?"Resume API Now":"Refresh Prices"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. BUSINESS */}
          <div style={{borderBottom:"1px solid "+T.border}}>
            <button style={{width:"100%",background:"none",border:"none",padding:"12px 0",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:T.gold,fontWeight:"bold",fontSize:12,letterSpacing:"0.06em",textAlign:"left"}} onClick={()=>toggleSection("business")}>
              <span>🏪 Business Details</span>
              <span style={{fontSize:16,color:T.muted}}>{settingsOpen.business?"▲":"▾"}</span>
            </button>
            {settingsOpen.business&&(
              <div style={{paddingBottom:14}}>
                <div style={c.g2(10)}>
                  <F label="Business Name" value={settings.businessName} onChange={v=>setSettings(p=>({...p,businessName:v}))}/>
                  <F label="ABN" value={settings.abn} onChange={v=>setSettings(p=>({...p,abn:v}))}/>
                  <F label="Address" value={settings.address} onChange={v=>setSettings(p=>({...p,address:v}))}/>
                  <F label="Phone" value={settings.phone} onChange={v=>setSettings(p=>({...p,phone:v}))}/>
                  <F label="Staff / Manager PIN" type="password" value={settings.staffPin} onChange={v=>setSettings(p=>({...p,staffPin:v}))}/>
                  <F label="Secondhand Dealer Licence No" value={settings.dealerLicenceNo||""} onChange={v=>setSettings(p=>({...p,dealerLicenceNo:v}))} placeholder="e.g. SHD1234"/>
                  <F label="Local Police Station Name" value={settings.policeStation||""} onChange={v=>setSettings(p=>({...p,policeStation:v}))} placeholder="e.g. Ballarat Police Station"/>
                  <F label="Police Station Email (for reports)" value={settings.policeEmail||""} onChange={v=>setSettings(p=>({...p,policeEmail:v}))} placeholder="ballaratcid@police.vic.gov.au"/>

                </div>
              </div>
            )}
          </div>

          {/* 3. APPEARANCE */}
          <div style={{borderBottom:"1px solid "+T.border}}>
            <button style={{width:"100%",background:"none",border:"none",padding:"12px 0",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:T.gold,fontWeight:"bold",fontSize:12,letterSpacing:"0.06em",textAlign:"left"}} onClick={()=>toggleSection("appearance")}>
              <span>🎨 Appearance</span>
              <span style={{fontSize:16,color:T.muted}}>{settingsOpen.appearance?"▲":"▾"}</span>
            </button>
            {settingsOpen.appearance&&(
              <div style={{paddingBottom:14}}>

                <div style={{marginBottom:16}}>
                  <label style={c.lbl}>Contrast</label>
                  <div style={{fontSize:10,color:T.muted,marginBottom:8}}>Softer ←→ Stronger</div>
                  <input type="range" min={-5} max={5} step={1} value={contrast}
                    onChange={e=>setContrast(Number(e.target.value))}
                    style={{width:"100%",accentColor:T.gold}}/>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.muted,marginTop:4}}>
                    <span>Soft</span><span style={{color:T.gold,fontWeight:"bold"}}>{contrast===0?"Default":contrast>0?"+"+contrast:contrast}</span><span>Strong</span>
                  </div>
                </div>
                <div style={{marginBottom:16}}>
                  <label style={c.lbl}>Font Size</label>
                  <div style={{fontSize:10,color:T.muted,marginBottom:8}}>Small ←→ Large</div>
                  <input type="range" min={12} max={36} step={1} value={fontSize}
                    onChange={e=>setFontSize(Number(e.target.value))}
                    style={{width:"100%",accentColor:T.gold}}/>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.muted,marginTop:4}}>
                    <span>Small</span>
                    <span style={{color:T.gold,fontWeight:"bold"}}>{fontSize}px · {fontSize<=14?"Regular":fontSize<=18?"Medium":fontSize<=24?"Semi-Bold":"Bold"}</span>
                    <span>Large & Bold</span>
                  </div>
                </div>
                <div style={{marginBottom:16}}>
                  <label style={c.lbl}>Zoom</label>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
                    {[80,90,100,110,120].map(z=><button key={z} style={c.btn(zoom===z?T.gold:T.border,zoom===z?T.bg:T.text,{padding:"6px 12px",fontSize:11})} onClick={()=>setZoom(z)}>{z}%</button>)}
                  </div>
                </div>
                <div>
                  <label style={c.lbl}>Simplified View</label>
                  <div style={{fontSize:10,color:T.muted,marginBottom:6}}>Larger text + touch targets — recommended for phones</div>
                  <div style={c.row(8)}>
                    <button style={c.btn(simp?T.green:T.border,simp?T.bg:T.text,{padding:"7px 14px",fontSize:11})} onClick={()=>setSimp(true)}>ON</button>
                    <button style={c.btn(!simp?T.gold:T.border,!simp?T.bg:T.text,{padding:"7px 14px",fontSize:11})} onClick={()=>setSimp(false)}>OFF</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 4. SCALE */}
          <div style={{borderBottom:"1px solid "+T.border}}>
            <button style={{width:"100%",background:"none",border:"none",padding:"12px 0",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:T.gold,fontWeight:"bold",fontSize:12,letterSpacing:"0.06em",textAlign:"left"}} onClick={()=>toggleSection("scale")}>
              <span>⚖ Bluetooth Scale</span>
              <span style={{fontSize:16,color:T.muted}}>{settingsOpen.scale?"▲":"▾"}</span>
            </button>
            {settingsOpen.scale&&(
              <div style={{paddingBottom:14}}>
                <div style={{fontSize:10,color:T.muted,marginBottom:10}}>
                  Connect via Bluetooth on this device. Works in Chrome and Edge on Android. Does not work on Safari/iOS.
                  Scale must be in range and powered on when connecting.
                </div>

                {/* Connection status + button */}
                <div style={{...c.card({padding:14}),marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:"bold",color:T.white}}>
                        {scaleStatus==="connected"?"⚖ "+((scaleDevice&&scaleDevice.name)||"Scale")+" connected":
                         scaleStatus==="connecting"?"⚖ Connecting…":
                         scaleStatus==="error"?"⚠ Connected — no scale service found":
                         "⚖ No scale connected"}
                      </div>
                      {scaleLive&&<div style={{fontSize:13,color:T.gold,fontWeight:"bold",marginTop:4}}>{fmtScaleWeight(scaleLive)}</div>}
                    </div>
                    <div style={c.row(8)}>
                      {scaleStatus!=="connected"
                        ?<button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 16px"})} onClick={connectScale}>⚖ Connect Scale</button>
                        :<button style={c.bsm(T.redBg,T.red)} onClick={disconnectScale}>✕ Disconnect</button>
                      }
                    </div>
                  </div>
                </div>

                {/* Protocol */}
                <div style={{marginBottom:10}}>
                  <label style={c.lbl}>Protocol</label>
                  <select style={{...c.sel(),width:"100%"}} value={settings.scaleProtocol||"auto"} onChange={e=>setSettings(p=>({...p,scaleProtocol:e.target.value}))}>
                    <option value="auto">Auto-detect (tries all — recommended)</option>
                    <option value="standard">Standard BLE Weight Scale (Bluetooth SIG 0x181D)</option>
                    <option value="nordic_uart">Nordic UART / ASCII (Ohaus, Adam, A&D, Kern BLE adapters)</option>
                    <option value="custom">Custom UUID (advanced)</option>
                  </select>
                </div>
                <div style={{fontSize:10,color:T.muted,marginBottom:10,lineHeight:1.6}}>
                  <strong>Auto</strong> tries Standard BLE then Nordic UART — covers most brands.<br/>
                  <strong>Nordic UART</strong> covers Ohaus Scout BT kit, Adam BLE, A&D BLE, Kern BLE — these send ASCII weight strings.<br/>
                  <strong>Standard BLE</strong> covers newer consumer scales (A&D UC-352BLE etc).<br/>
                  <strong>Custom</strong> — enter your scale's GATT service and characteristic UUIDs from its manual.
                </div>

                {settings.scaleProtocol==="custom"&&(
                  <div style={c.g2(8)}>
                    <F label="Service UUID" value={settings.scaleCustomServiceUUID||""} onChange={v=>setSettings(p=>({...p,scaleCustomServiceUUID:v}))} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
                    <F label="Characteristic UUID" value={settings.scaleCustomCharUUID||""} onChange={v=>setSettings(p=>({...p,scaleCustomCharUUID:v}))} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
                  </div>
                )}

                {/* Display unit */}
                <div style={{marginTop:10}}>
                  <label style={c.lbl}>Display unit</label>
                  <div style={c.row(8)}>
                    {["g","oz","ozt"].map(u=>(
                      <button key={u} style={c.btn((settings.scaleUnit||"g")===u?T.gold:T.border,(settings.scaleUnit||"g")===u?T.bg:T.text,{padding:"6px 14px",fontSize:11,textTransform:"none"})}
                        onClick={()=>setSettings(p=>({...p,scaleUnit:u}))}>{u}</button>
                    ))}
                  </div>
                  <div style={{fontSize:10,color:T.muted,marginTop:4}}>Internal precision is always grams. Display unit is cosmetic only.</div>
                </div>
              </div>
            )}
          </div>

          {/* 5. SECURITY */}
          <div style={{borderBottom:"1px solid "+T.border}}>
            <button style={{width:"100%",background:"none",border:"none",padding:"12px 0",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:T.gold,fontWeight:"bold",fontSize:12,letterSpacing:"0.06em",textAlign:"left"}} onClick={()=>toggleSection("security")}>
              <span>🔒 Security</span>
              <span style={{fontSize:16,color:T.muted}}>{settingsOpen.security?"▲":"▾"}</span>
            </button>
            {settingsOpen.security&&(
              <div style={{paddingBottom:14}}>
                <div style={{fontSize:10,color:T.muted,marginBottom:10}}>When enabled, a PIN screen blocks access on every app open.</div>
                <div style={c.g2(10)}>
                  <div>
                    <label style={c.lbl}>Require PIN to open app</label>
                    <div style={c.row(10)}>
                      <button style={c.btn(settings.requirePin?T.green:T.border,settings.requirePin?T.bg:T.text,{padding:"7px 16px",fontSize:11})} onClick={()=>setSettings(p=>({...p,requirePin:true}))}>ON</button>
                      <button style={c.btn(!settings.requirePin?T.gold:T.border,!settings.requirePin?T.bg:T.text,{padding:"7px 16px",fontSize:11})} onClick={()=>setSettings(p=>({...p,requirePin:false}))}>OFF</button>
                    </div>
                  </div>
                  <div>
                    <label style={c.lbl}>Session timeout</label>
                    <select style={{...c.sel(),width:"100%"}} value={settings.sessionTimeout||"never"} onChange={e=>setSettings(p=>({...p,sessionTimeout:e.target.value}))}>
                      <option value="never">Never</option>
                      <option value="1h">1 hour</option>
                      <option value="8h">8 hours</option>
                      <option value="close">On app close</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 5. POLICE HELP */}
          <div style={{borderBottom:"1px solid "+T.border}}>
            <button style={{width:"100%",background:"none",border:"none",padding:"12px 0",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:T.gold,fontWeight:"bold",fontSize:12,letterSpacing:"0.06em",textAlign:"left"}} onClick={()=>toggleSection("policehelp")}>
              <span>🆘 Police Help — Duress Alerts</span>
              <span style={{fontSize:16,color:T.muted}}>{settingsOpen.policehelp?"▲":"▾"}</span>
            </button>
            {settingsOpen.policehelp&&(
              <div style={{paddingBottom:14}}>
                <div style={{...c.bnr("warn"),marginBottom:14,fontSize:11}}>
                  Pressing <strong>🆘 Police Help</strong> sends SMS to all contacts instantly — no confirmation. Set this up and test it before you ever need it.
                </div>

                {/* ── SMS PROVIDER ── */}
                <div style={{fontSize:11,fontWeight:"bold",color:T.white,marginBottom:10}}>SMS Provider</div>

                <div style={{marginBottom:10}}>
                  <label style={c.lbl}>How to send the emergency SMS</label>
                  <select style={{...c.sel(),width:"100%"}} value={settings.smsProvider||"sms_uri"} onChange={e=>setSettings(p=>({...p,smsProvider:e.target.value}))}>
                    <option value="textbelt">◈ Textbelt — works directly, 1 free SMS/day, no setup</option>
                    <option value="webhook">🔗 Webhook (Zapier / Make / n8n → Twilio/Vonage)</option>
                    <option value="twilio_fn">⬡ Twilio Function URL — deploy once, free forever</option>
                    <option value="sms_uri">📲 Device SMS App — requires SIM on this device</option>
                  </select>
                </div>

                {/* TEXTBELT — works directly from browser */}
                {settings.smsProvider==="textbelt"&&(
                  <div style={{...c.card({padding:12}),marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:6}}>Textbelt</div>
                    <div style={{fontSize:10,color:T.muted,marginBottom:10}}>
                      Works directly from this app — no server needed, no CORS issues. Free key sends 1 SMS/day. Buy credits at textbelt.com for more (~$0.09/SMS AU).
                    </div>
                    <F label="Textbelt API Key" value={settings.textbeltKey||"textbelt"} onChange={v=>setSettings(p=>({...p,textbeltKey:v}))} placeholder="textbelt"/>
                    <div style={{fontSize:10,color:T.muted,marginTop:4}}>
                      Use <code style={{background:T.surface,padding:"1px 4px",borderRadius:3}}>textbelt</code> as the key for 1 free SMS/day (no account needed). For paid: sign up at textbelt.com, get a key, paste here.
                    </div>
                  </div>
                )}

                {/* WEBHOOK — Zapier / Make */}
                {settings.smsProvider==="webhook"&&(
                  <div style={{...c.card({padding:12}),marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:6}}>Webhook → SMS Gateway</div>
                    <div style={{fontSize:10,color:T.muted,marginBottom:10}}>
                      This app POSTs a JSON payload to your webhook URL. Wire it to Twilio or any SMS provider via Zapier, Make, or n8n. Works from WiFi — no SIM needed.
                    </div>
                    <F label="Webhook URL" value={settings.duressWebhookUrl||""} onChange={v=>setSettings(p=>({...p,duressWebhookUrl:v}))} placeholder="https://hooks.zapier.com/hooks/catch/..."/>
                    <div style={{fontSize:10,color:T.muted,marginTop:8,lineHeight:1.6}}>
                      <strong>Setup (Zapier):</strong> New Zap → Trigger: Webhooks by Zapier (Catch Hook) → Action: Twilio (Send SMS). Map <code style={{background:T.surface,padding:"1px 4px",borderRadius:3}}>message</code> and <code style={{background:T.surface,padding:"1px 4px",borderRadius:3}}>contacts</code> from the payload. Free Zapier plan works.
                    </div>
                    <div style={{fontSize:10,color:T.muted,marginTop:6,lineHeight:1.6}}>
                      The app sends: <code style={{background:T.surface,padding:"1px 4px",borderRadius:3}}>{"{type:'DURESS_ALERT', message:'...', contacts:[...], address:'...'}"}</code>
                    </div>
                  </div>
                )}

                {/* TWILIO FUNCTION */}
                {settings.smsProvider==="twilio_fn"&&(
                  <div style={{...c.card({padding:12}),marginBottom:10}}>
                    <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:6}}>Twilio Function URL</div>
                    <div style={{fontSize:10,color:T.muted,marginBottom:10}}>
                      Deploy a tiny Twilio Function (free tier) that receives the call and sends the SMS. You get a URL to paste here. Works over WiFi, no CORS issues.
                    </div>
                    <F label="Twilio Function URL" value={settings.twilioFnUrl||""} onChange={v=>setSettings(p=>({...p,twilioFnUrl:v}))} placeholder="https://xx.twil.io/duress-sms"/>
                    <div style={{fontSize:10,color:T.muted,marginTop:8,lineHeight:1.7}}>
                      <strong>Setup (5 min):</strong><br/>
                      1. Sign up free at twilio.com (no credit card for trial)<br/>
                      2. Console → Functions → Create Service → Add Function<br/>
                      3. Paste this code:<br/>
                      <code style={{display:"block",background:T.surface,padding:"8px",borderRadius:4,marginTop:4,fontSize:9,lineHeight:1.5,wordBreak:"break-all"}}>
                        {"exports.handler=(ctx,ev,cb)=>{const c=new(require('@twilio/runtime-handler').Context)(ctx);const t=require('twilio')(ctx.ACCOUNT_SID,ctx.AUTH_TOKEN);ev.contacts.split(',').forEach(n=>t.messages.create({to:n,from:ctx.FROM,body:ev.message}));cb(null,{sent:true});}"}
                      </code>
                      <br/>4. Add environment vars: ACCOUNT_SID, AUTH_TOKEN, FROM (your Twilio number)<br/>
                      5. Deploy → copy the URL → paste above
                    </div>
                  </div>
                )}

                {/* SMS APP */}
                {settings.smsProvider==="sms_uri"&&(
                  <div style={{...c.bnr("warn"),marginBottom:10,fontSize:10}}>
                    Opens your device SMS app pre-filled with the emergency message. Only works on devices with a SIM card, or iPhone with SMS Relay, or Android with Messages web. If this is a WiFi-only tablet, use Textbelt or Webhook instead.
                  </div>
                )}

                {/* ── EMERGENCY CONTACTS ── */}
                <div style={{fontSize:11,fontWeight:"bold",color:T.white,marginBottom:6,marginTop:14}}>Emergency Contacts (up to 10)</div>
                <div style={{fontSize:10,color:T.muted,marginBottom:10}}>
                  International format — +614XXXXXXXX. All contacts receive the SMS simultaneously.
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[1,2,3,4,5,6,7,8,9,10].map(n=>(
                    <div key={n}>
                      <label style={c.lbl}>Contact {n}</label>
                      <input style={c.inp()} type="tel" placeholder="+61400000000"
                        value={settings["duressContact"+n]||""}
                        onChange={e=>setSettings(p=>({...p,["duressContact"+n]:e.target.value.trim()}))}/>
                    </div>
                  ))}
                </div>

                {/* Test button */}
                <button style={{...c.bsm(T.border,T.muted),marginTop:14,width:"100%"}}
                  onClick={async()=>{
                    const contacts=[1,2,3,4,5,6,7,8,9,10]
                      .map(n=>settings["duressContact"+n]||"").filter(Boolean);
                    if(!contacts.length){pop("No contacts configured.","warn");return;}
                    const testMsg="TEST — This is a test of the Loot Ledgr duress alert system for "+
                      (settings.businessName||"your shop")+". No action required.";
                    let sent=0;
                    for(const c of contacts){const r=await sendDuressSMS(c,testMsg);if(r.ok)sent++;}
                    pop("Test sent to "+sent+"/"+contacts.length+" contact(s).","ok");
                  }}>📲 Send Test SMS to All Contacts</button>
              </div>
            )}
          </div>

{/* 6. COMPLIANCE */}
          <div style={{borderBottom:"1px solid "+T.border}}>
            <button style={{width:"100%",background:"none",border:"none",padding:"12px 0",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:T.gold,fontWeight:"bold",fontSize:12,letterSpacing:"0.06em",textAlign:"left"}} onClick={()=>toggleSection("compliance")}>
              <span>📋 Compliance — TTR</span>
              <span style={{fontSize:16,color:T.muted}}>{settingsOpen.compliance?"▲":"▾"}</span>
            </button>
            {settingsOpen.compliance&&(
              <div style={{paddingBottom:14}}>
                <div style={{...c.card({padding:14})}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:"bold",color:T.white}}>Threshold Transaction Reports</div>
                      <div style={{fontSize:11,color:T.muted,marginTop:3}}>TTR applies to physical cash over $10,000. If you never accept cash over $2,000 this will never trigger.</div>
                    </div>
                    <button style={{...c.btn(settings.ttrEnabled!==false?T.green:T.border,settings.ttrEnabled!==false?T.bg:T.muted,{marginLeft:16,flexShrink:0,fontSize:11})}}
                      onClick={()=>setSettings(p=>({...p,ttrEnabled:p.ttrEnabled===false?true:false}))}>
                      {settings.ttrEnabled!==false?"ON":"OFF"}
                    </button>
                  </div>
                  {settings.ttrEnabled===false&&<div style={{...c.bnr("warn"),marginBottom:0}}>TTR disabled. Only turn off if you never accept cash over $10,000.</div>}
                </div>
              </div>
            )}
          </div>

          {/* 7. CRYPTO */}
          <div style={{borderBottom:"1px solid "+T.border}}>
            <button style={{width:"100%",background:"none",border:"none",padding:"12px 0",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:T.gold,fontWeight:"bold",fontSize:12,letterSpacing:"0.06em",textAlign:"left"}} onClick={()=>toggleSection("crypto")}>
              <span>₿ Cryptocurrency Payments</span>
              <span style={{fontSize:16,color:T.muted}}>{settingsOpen.crypto?"▲":"▾"}</span>
            </button>
            {settingsOpen.crypto&&(
              <div style={{paddingBottom:14}}>
                <div style={{...c.card({padding:14}),marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:"bold",color:T.white}}>Accept Crypto</div>
                      <div style={{fontSize:11,color:T.muted,marginTop:3}}>Adds Crypto to payment selector. No AUSTRAC registration needed — just record AUD value for tax.</div>
                    </div>
                    <button style={{...c.btn(settings.cryptoEnabled?T.green:T.border,settings.cryptoEnabled?T.bg:T.muted,{marginLeft:16,flexShrink:0,fontSize:11})}}
                      onClick={()=>setSettings(p=>({...p,cryptoEnabled:!p.cryptoEnabled}))}>
                      {settings.cryptoEnabled?"ON":"OFF"}
                    </button>
                  </div>
                </div>
                {settings.cryptoEnabled&&(
                  <div style={{...c.card({padding:14})}}>
                    <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:12}}>Wallet Addresses</div>
                    {[
                      {k:"walletBTC",label:"Bitcoin (BTC)",placeholder:"1... or 3... or bc1...",validate:v=>/^(1[a-km-zA-HJ-NP-Z1-9]{25,33}|3[a-km-zA-HJ-NP-Z1-9]{25,33}|bc1[a-z0-9]{6,87})$/.test(v),hint:"Starts with 1, 3, or bc1"},
                      {k:"walletETH",label:"Ethereum / BNB BEP-20",placeholder:"0x...",validate:v=>/^0x[0-9a-fA-F]{40}$/.test(v),hint:"0x + 40 hex chars"},
                      {k:"walletBNB",label:"Binance BEP-2 (native)",placeholder:"bnb1...",validate:v=>/^bnb1[0-9a-z]{38}$/.test(v),hint:"bnb1 + 38 chars"},
                      {k:"walletXRP",label:"Ripple (XRP)",placeholder:"r...",validate:v=>/^r[0-9a-zA-Z]{24,34}$/.test(v),hint:"r + 24–34 chars"},
                      {k:"walletSOL",label:"Solana (SOL)",placeholder:"Base58...",validate:v=>/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v),hint:"Base58 · 32–44 chars"},
                    ].map(field=>{
                      const val=settings[field.k]||"";
                      const ok=val===""||field.validate(val);
                      return(
                        <div key={field.k} style={{marginBottom:12}}>
                          <label style={c.lbl}>{field.label}</label>
                          <input style={{...c.inp(),borderColor:val&&!ok?T.red:val&&ok?T.green:T.border,fontFamily:"monospace",fontSize:11}}
                            value={val} placeholder={field.placeholder}
                            onChange={e=>setSettings(p=>({...p,[field.k]:e.target.value.trim()}))}/>
                          <div style={{fontSize:10,marginTop:2,color:val&&!ok?T.red:T.muted}}>{val&&!ok?"⚠ "+field.hint:field.hint}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 8. AI AGENT */}
          <div style={{borderBottom:"1px solid "+T.border}}>
            <button style={{width:"100%",background:"none",border:"none",padding:"12px 0",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:T.gold,fontWeight:"bold",fontSize:12,letterSpacing:"0.06em",textAlign:"left"}} onClick={()=>toggleSection("ai")}>
              <span>🤖 AI Agent</span>
              <span style={{fontSize:16,color:T.muted}}>{settingsOpen.ai?"▲":"▾"}</span>
            </button>
            {settingsOpen.ai&&(
              <div style={{paddingBottom:14}}>
                <div style={{...c.card({padding:14})}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:"bold",color:T.white}}>AI Agent</div>
                      <div style={{fontSize:11,color:T.muted,marginTop:3}}>Connect Sophiie, Claude, or any AI agent.</div>
                    </div>
                    <button style={{...c.btn(settings.aiAgentEnabled?T.green:T.border,settings.aiAgentEnabled?T.bg:T.muted,{marginLeft:16,flexShrink:0,fontSize:11})}}
                      onClick={()=>setSettings(p=>({...p,aiAgentEnabled:!p.aiAgentEnabled}))}>
                      {settings.aiAgentEnabled?"ON":"OFF"}
                    </button>
                  </div>
                  {settings.aiAgentEnabled&&(
                    <div>
                      <div style={{marginBottom:10}}><label style={c.lbl}>Agent Name</label><input style={c.inp()} value={settings.aiAgentName||""} placeholder="Sophiie" onChange={e=>setSettings(p=>({...p,aiAgentName:e.target.value}))}/></div>
                      <div style={{marginBottom:10}}><label style={c.lbl}>Webhook URL (optional)</label><input style={c.inp()} value={settings.aiAgentUrl||""} placeholder="https://..." onChange={e=>setSettings(p=>({...p,aiAgentUrl:e.target.value}))}/></div>
                      <div>
                        <label style={c.lbl}>Access Level</label>
                        <div style={c.row(8)}>
                          <button style={c.btn(settings.aiAgentLevel===1?T.gold:T.border,settings.aiAgentLevel===1?T.bg:T.text,{fontSize:11,padding:"7px 14px"})} onClick={()=>setSettings(p=>({...p,aiAgentLevel:1}))}>Level 1 — Observe</button>
                          <button style={c.btn(settings.aiAgentLevel===2?T.orange:T.border,settings.aiAgentLevel===2?T.bg:T.muted,{fontSize:11,padding:"7px 14px"})} onClick={()=>setPinModal({reason:"Level 2 grants AI control. Manager PIN required.",cb:()=>setSettings(p=>({...p,aiAgentLevel:2}))})}>Level 2 — Autonomous (v2.0)</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 9. INTEGRATIONS */}
          <div style={{borderBottom:"1px solid "+T.border}}>
            <button style={{width:"100%",background:"none",border:"none",padding:"12px 0",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:T.gold,fontWeight:"bold",fontSize:12,letterSpacing:"0.06em",textAlign:"left"}} onClick={()=>toggleSection("integrations")}>
              <span>🔗 Integrations</span>
              <span style={{fontSize:16,color:T.muted}}>{settingsOpen.integrations?"▲":"▾"}</span>
            </button>
            {settingsOpen.integrations&&(
              <div style={{paddingBottom:14}}>
                <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:8,marginTop:4}}>🖥 EFTPOS Terminal</div>
                <div style={{fontSize:10,color:T.muted,marginBottom:8}}>Connect a physical payment terminal. Square Terminal works globally. Linkly connects to any Australian bank terminal (CBA, NAB, ANZ, Westpac) via the PC-EFTPOS app running on the same device.</div>
                <div style={{marginBottom:10}}>
                  <label style={c.lbl}>EFTPOS Provider</label>
                  <select style={{...c.sel(),width:"100%"}} value={settings.eftposProvider||"none"} onChange={e=>setSettings(p=>({...p,eftposProvider:e.target.value}))}>
                    <option value="none">None (manual confirmation)</option>
                    <option value="square">Square Terminal API</option>
                    <option value="linkly">Linkly / PC-EFTPOS (AU bank terminals)</option>
                  </select>
                </div>
                {settings.eftposProvider==="square"&&(
                  <div style={{marginBottom:10}}>
                    <label style={c.lbl}>Square Terminal Device ID</label>
                    <input style={c.inp()} value={settings.squareTerminalId||""} placeholder="device:XXXXXXXXXXXXXXXX" onChange={e=>setSettings(p=>({...p,squareTerminalId:e.target.value}))}/>
                    <div style={{fontSize:10,color:T.muted,marginTop:3}}>Find in Square Dashboard → Devices → your terminal → Device ID</div>
                  </div>
                )}
                {settings.eftposProvider==="linkly"&&(
                  <div style={{marginBottom:10}}>
                    <label style={c.lbl}>Linkly Base URL</label>
                    <input style={c.inp()} value={settings.linklyBaseUrl||"http://localhost:4242"} placeholder="http://localhost:4242" onChange={e=>setSettings(p=>({...p,linklyBaseUrl:e.target.value}))}/>
                    <div style={{fontSize:10,color:T.muted,marginTop:3}}>Default is localhost:4242. PC-EFTPOS must be running on this device.</div>
                  </div>
                )}
                <div style={{height:1,background:T.border,margin:"12px 0"}}/>
                <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:8,marginTop:4}}>💳 Square</div>
                <div style={{fontSize:10,color:T.muted,marginBottom:8}}>BUY → vendor expense (Orders+Payments API) · SELL → checkout link</div>
                <div style={c.g2(10)}>
                  <F label="Square Access Token" type="password" value={settings.squareToken} onChange={v=>setSettings(p=>({...p,squareToken:v}))} placeholder="EAAAl…"/>
                  <F label="Square Location ID" value={settings.squareLoc} onChange={v=>setSettings(p=>({...p,squareLoc:v}))}/>
                  <F label="Redirect URL" value={settings.squareRedirect} onChange={v=>setSettings(p=>({...p,squareRedirect:v}))} placeholder="https://…"/>
                </div>
                <div style={{fontSize:11,fontWeight:"bold",color:T.gold,margin:"14px 0 8px"}}>📊 Google Sheets</div>
                <div style={c.g2(10)}>
                  <F label="Spreadsheet ID" value={settings.sheetsId} onChange={v=>setSettings(p=>({...p,sheetsId:v}))}/>
                  <F label="Range" value={settings.sheetsRange} onChange={v=>setSettings(p=>({...p,sheetsRange:v}))} placeholder="Sheet1!A1"/>
                  <F label="OAuth Token" type="password" value={settings.sheetsToken} onChange={v=>setSettings(p=>({...p,sheetsToken:v}))}/>
                </div>
                <div style={{fontSize:11,fontWeight:"bold",color:T.gold,margin:"14px 0 8px"}}>🔗 Webhook (Zapier / Make / n8n)</div>
                <div style={c.g2(10)}>
                  <F label="Webhook URL" value={settings.webhookUrl} onChange={v=>setSettings(p=>({...p,webhookUrl:v}))} placeholder="https://hooks.zapier.com/…"/>
                </div>
                <div style={{fontSize:11,fontWeight:"bold",color:T.gold,margin:"14px 0 8px"}}>🛍 Shopify</div>
                <div style={{fontSize:10,color:T.muted,marginBottom:8}}>BUY → vendor draft order · SELL → completed order</div>
                <div style={c.g2(10)}>
                  <F label="Store Domain (xxx.myshopify.com)" value={settings.shopifyDomain} onChange={v=>setSettings(p=>({...p,shopifyDomain:v}))}/>
                  <F label="Admin API Token" type="password" value={settings.shopifyToken} onChange={v=>setSettings(p=>({...p,shopifyToken:v}))}/>
                </div>
                <div style={{fontSize:11,fontWeight:"bold",color:T.gold,margin:"14px 0 8px"}}>📒 Xero</div>
                <div style={{fontSize:10,color:T.muted,marginBottom:8}}>BUY = ACCPAY · SELL = ACCREC. OAuth2 bearer token from Xero Developer Portal.</div>
                <div style={c.g2(10)}>
                  <F label="Xero Bearer Token" type="password" value={settings.xeroToken||""} onChange={v=>setSettings(p=>({...p,xeroToken:v}))} placeholder="OAuth2 Bearer"/>
                  <F label="Xero Tenant ID" value={settings.xeroTenantId||""} onChange={v=>setSettings(p=>({...p,xeroTenantId:v}))} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
                  <div style={{display:"flex",gap:10}}>
                    <div style={{flex:1}}><label style={c.lbl}>Buy Account Code</label><input style={c.inp()} type="text" value={settings.xeroBuyCode||"310"} placeholder="310" onChange={e=>setSettings(p=>({...p,xeroBuyCode:e.target.value}))}/></div>
                    <div style={{flex:1}}><label style={c.lbl}>Sell Account Code</label><input style={c.inp()} type="text" value={settings.xeroSellCode||"200"} placeholder="200" onChange={e=>setSettings(p=>({...p,xeroSellCode:e.target.value}))}/></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 9. DANGER ZONE -- always visible at bottom */}

          <div style={{marginTop:24,borderTop:"1px solid "+T.border,paddingTop:14}}>
            <div style={{fontSize:11,fontWeight:"bold",color:T.red,marginBottom:6}}>⚠ Danger Zone</div>
            <div style={{...c.bnr("warn"),marginBottom:10,fontSize:11}}>Both actions below require manager PIN confirmation.</div>
            <button style={{...c.bsm(T.orangeBg,T.orange),marginBottom:8}} onClick={()=>{
              setPinModal({
                reason:"PURGE EXPIRED RECORDS — This will permanently delete all transactions and stock items past their 7-year retention date. This cannot be undone. Enter manager PIN to confirm.",
                cb:()=>{purge();setShowSet(false);}
              });
              setPinVal("");
            }}>🗑 Purge Expired Records (7yr)</button>
            <button style={c.bsm(T.redBg,T.red)} onClick={()=>{
              setPinModal({
                reason:"CLEAR ALL APP DATA — This will permanently erase every transaction, client record, stock item, catalog entry, photo and setting on this device. There is no recovery. Enter manager PIN to confirm.",
                cb:()=>{
                  try{
                    localStorage.clear();
                    pop("All app data cleared. Reloading…","ok");
                    setTimeout(()=>window.location.reload(),1500);
                  }catch(e){pop("Could not clear data.","err");}
                }
              });
              setPinVal("");
            }}>🗑 Clear All App Data</button>
            <div style={{fontSize:10,color:T.muted,marginTop:5}}>Removes all transactions, stock, catalog, photos and settings from this device.</div>
          </div>

          {/* ── SPOT PRICE HISTORY ── */}
          <div style={{marginTop:20,borderTop:"1px solid "+T.border,paddingTop:14}}>
            <div style={{fontSize:11,fontWeight:"bold",color:T.muted,letterSpacing:"0.08em",marginBottom:8}}>SPOT PRICE LOG (last 30)</div>
            {spotLog.length===0&&<div style={{fontSize:11,color:T.muted}}>No price records yet.</div>}
            {spotLog.slice(0,10).map((e,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"4px 0",borderBottom:"1px solid "+T.border+"22"}}>
                <span style={{color:T.muted}}>{new Date(e.t).toLocaleString("en-AU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</span>
                <span style={{color:T.gold}}>Au {fmtAUD(e.g)}</span>
                <span style={{color:T.silver}}>Ag {fmtAUD(e.s)}</span>
                <span style={{color:T.muted,fontSize:9}}>{e.src}</span>
              </div>
            ))}
          </div>

          {/* ── BLACKLIST ── */}
          <div style={{marginTop:20,borderTop:"1px solid "+T.border,paddingTop:14}}>
            <div style={{fontSize:11,fontWeight:"bold",color:T.red,letterSpacing:"0.08em",marginBottom:8}}>⛔ CLIENT BLACKLIST</div>
            <div style={{fontSize:11,color:T.muted,marginBottom:10}}>Blacklisted clients are flagged in red on the Clients screen. To ban a client, go to Clients and tap the ⛔ Ban button on their record.</div>
            {blacklist.length===0
              ?<div style={{fontSize:11,color:T.muted,fontStyle:"italic"}}>No blacklisted clients.</div>
              :blacklist.map((b,i)=>(
                <div key={i} style={{...c.card({padding:12}),marginBottom:8,borderLeft:"3px solid "+T.red,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:"bold",color:T.red,fontSize:13}}>⛔ {b.name}</div>
                    {b.addedAt&&<div style={{fontSize:10,color:T.muted,marginTop:2}}>Banned: {fmtDate(b.addedAt)}</div>}
                  </div>
                  <button style={{...c.bsm(T.redBg,T.red),fontWeight:"bold"}} onClick={()=>{setBlacklist(p=>p.filter(x=>x.name!==b.name));pop(b.name+" removed from blacklist.","ok");}}>✓ Remove Ban</button>
                </div>
              ))
            }
          </div>

          {/* ── QUICK ACTIONS ── */}
          <div style={{marginTop:20,borderTop:"1px solid "+T.border,paddingTop:14}}>
            <div style={{fontSize:11,fontWeight:"bold",color:T.muted,letterSpacing:"0.08em",marginBottom:10}}>QUICK ACTIONS</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button style={c.bsm(T.border,T.muted)} onClick={()=>{setShowSet(false);setShowVendors(true);}}>🏪 Suppliers</button>
              <button style={c.bsm(T.border,T.muted)} onClick={()=>{setShowSet(false);setShowStaff(true);}}>👥 Staff</button>
              <button style={c.bsm(T.border,T.muted)} onClick={()=>{setShowSet(false);setShowBackup(true);}}>💾 Backup</button>
            </div>
          </div>

          {/* ── ABOUT ── */}
          <div style={{marginTop:28,borderTop:"1px solid "+T.border,paddingTop:14}}>
            <button onClick={()=>setShowAbout(v=>!v)}
              style={{width:"100%",background:"transparent",border:"none",cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0"}}>
              <span style={{fontSize:12,fontWeight:"bold",color:T.muted,letterSpacing:"0.08em"}}>ABOUT</span>
              <span style={{color:T.muted,fontSize:14}}>{showAbout?"▲":"▼"}</span>
            </button>
            {showAbout&&(
              <div style={{paddingTop:16,textAlign:"center"}}>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:12}}>
                  <img src={settings.logoImg||SEED_LOGO} alt="logo"
                    onClick={()=>{setLogoPinMode(true);setLogoPinVal("");}}
                    style={{width:52,height:52,borderRadius:"50%",objectFit:"contain",border:"2px solid "+T.gold,background:"#fff",padding:4,marginBottom:10,display:"block",cursor:"pointer"}}/>
                  {logoPinMode&&(
                    <div style={{...c.card({padding:12}),marginBottom:8,display:"flex",gap:8,alignItems:"center"}}>
                      <input
                        autoFocus
                        type="password"
                        placeholder="PIN"
                        value={logoPinVal}
                        onChange={e=>setLogoPinVal(e.target.value)}
                        onKeyDown={e=>{
                          if(e.key==="Enter"){
                            if(logoPinVal===settings.staffPin){setLogoPinMode(false);setLogoPinVal("");setShowLogoLib(true);}
                            else{setLogoPinVal("");pop("Wrong PIN","err");}
                          }
                          if(e.key==="Escape"){setLogoPinMode(false);setLogoPinVal("");}
                        }}
                        style={{...c.inp(),width:80,textAlign:"center",fontSize:18,letterSpacing:"0.3em"}}/>
                      <button style={c.btn(T.gold,T.bg,{fontSize:11,padding:"6px 12px"})}
                        onClick={()=>{
                          if(logoPinVal===settings.staffPin){setLogoPinMode(false);setLogoPinVal("");setShowLogoLib(true);}
                          else{setLogoPinVal("");pop("Wrong PIN","err");}
                        }}>OK</button>
                      <button style={c.bsm(T.border,T.muted)}
                        onClick={()=>{setLogoPinMode(false);setLogoPinVal("");}}>✕</button>
                    </div>
                  )}
                  <div style={{fontSize:16,fontWeight:"bold",color:T.gold,lineHeight:1.2}}>Loot Ledgr</div>
                  <div style={{fontSize:10,color:T.muted,letterSpacing:"0.12em",textTransform:"uppercase",marginTop:4}}>Compliance POS · Second-Hand Sale Tracking</div>
                </div>
                <div style={{background:T.surface,borderRadius:8,padding:"10px 18px",marginBottom:14,textAlign:"left",display:"inline-block"}}>
                  <div style={{fontSize:11,color:T.muted,marginBottom:4}}>Version <span style={{color:T.white,fontWeight:"bold"}}>{"v"+APP_VERSION}</span></div>
                  <div style={{fontSize:11,color:T.muted,marginBottom:4}}>Built with <span style={{color:T.white}}>React · Vite · Capacitor</span></div>
                  <div style={{fontSize:11,color:T.muted,marginBottom:4}}>Storage <span style={{color:T.white}}>localStorage / Dexie (IndexedDB)</span></div>
                  <div style={{fontSize:11,color:T.muted}}>Compliance <span style={{color:T.white}}>AUSTRAC AML/CTF · Vic SHD Act</span></div>
                </div>
                <div style={{fontSize:12,color:T.muted,marginBottom:4}}>Developed by</div>
                <div style={{fontSize:14,fontWeight:"bold",color:T.white,marginBottom:2}}>Guillaume Weber</div>
                <div style={{fontSize:11,color:T.gold,fontStyle:"italic",marginBottom:16}}>The Professor Goldenfrog</div>
                <div style={{fontSize:10,color:T.muted,lineHeight:1.7}}>
                  This application is provided for internal business use only.<br/>
                  All compliance obligations remain the responsibility of the operator.
                </div>
              </div>
            )}
          </div>

        </Modal>
      )}

      {/* API Export */}
      {showApi&&(
        <Modal title="⇄ API / Export & Diagnostics" onClose={()=>setShowApi(false)} wide>

          {/* ── LIVE PAYLOAD ── */}
          <div style={{fontSize:12,fontWeight:"bold",color:T.gold,marginBottom:6}}>📦 Current Transaction Payload</div>
          <div style={{fontSize:11,color:T.muted,marginBottom:8}}>This is the exact JSON that gets sent to Square, Shopify, Xero and webhooks. Use it to verify your data before testing integrations.</div>
          <pre style={{background:T.surface,padding:12,borderRadius:6,fontSize:10,color:T.muted,overflowX:"auto",maxHeight:220,marginBottom:8}}>
            {JSON.stringify(exportPayload(),null,2)}
          </pre>
          <div style={{...c.row(10),marginBottom:20,flexWrap:"wrap"}}>
            <button style={c.btn(T.gold,T.bg)} onClick={()=>{navigator.clipboard&&navigator.clipboard.writeText(JSON.stringify(exportPayload(),null,2));pop("JSON copied.","ok");}}>Copy JSON</button>
            {settings.webhookUrl&&<button style={c.btn(T.green,T.bg)} onClick={()=>{fetch(settings.webhookUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(exportPayload())}).then(()=>pop("Pushed to webhook.","ok")).catch(()=>pop("Webhook failed.","err"));}}>Push Webhook</button>}
          </div>

          {/* ── SQUARE DIAGNOSTICS ── */}
          <div style={{fontSize:12,fontWeight:"bold",color:T.gold,marginBottom:6}}>⬡ Square — Connection Test</div>
          <div style={{...c.card({padding:12}),marginBottom:6,fontSize:11,color:T.muted}}>
            <div>Token: <span style={{color:settings.squareToken?T.green:T.red}}>{settings.squareToken?settings.squareToken.slice(0,12)+"…":"Not set"}</span></div>
            <div>Location ID: <span style={{color:settings.squareLoc?T.green:T.red}}>{settings.squareLoc||"Not set"}</span></div>
            <div style={{marginTop:6,fontSize:10}}>⚠ Square tokens start with <strong>EAAAl</strong> (live) or <strong>EAAAlhb</strong> (sandbox). Location IDs are alphanumeric ~10 chars.</div>
          </div>
          <button style={{...c.btn(T.gold,T.bg),marginBottom:4}} onClick={async()=>{
            if(!settings.squareToken||!settings.squareLoc){pop("Add Square credentials in Settings first.","warn");return;}
            pop("Testing Square connection…","ok");
            try{
              const r=await fetch("https://connect.squareup.com/v2/locations/"+settings.squareLoc,{
                headers:{"Authorization":"Bearer "+settings.squareToken,"Square-Version":"2024-11-20"},
              });
              const d=await r.json();
              if(d.location) pop("✓ Square OK — Location: "+d.location.name+" ("+d.location.status+")","ok");
              else pop("✗ Square error: "+(d.errors&&d.errors[0]&&d.errors[0].detail||JSON.stringify(d)),"err");
            }catch(e){pop("✗ Square connection failed: "+e.message,"err");}
          }}>⬡ Test Square Connection</button>
          <div style={{fontSize:10,color:T.muted,marginBottom:16}}>
            Troubleshooting: <strong>401</strong> = wrong token · <strong>404</strong> = wrong Location ID · <strong>CORS</strong> = test after deployment, not in StackBlitz · Get tokens at <strong>developer.squareup.com → Apps → OAuth</strong>
          </div>

          {/* ── SHOPIFY DIAGNOSTICS ── */}
          <div style={{fontSize:12,fontWeight:"bold",color:T.gold,marginBottom:6}}>🛍 Shopify — Connection Test</div>
          <div style={{...c.card({padding:12}),marginBottom:6,fontSize:11,color:T.muted}}>
            <div>Domain: <span style={{color:settings.shopifyDomain?T.green:T.red}}>{settings.shopifyDomain||"Not set"}</span></div>
            <div>Token: <span style={{color:settings.shopifyToken?T.green:T.red}}>{settings.shopifyToken?settings.shopifyToken.slice(0,12)+"…":"Not set"}</span></div>
            <div style={{marginTop:6,fontSize:10}}>⚠ Domain = <strong>yourstore.myshopify.com</strong> (no https://). Token starts with <strong>shpat_</strong>. Needs scopes: write_orders, write_draft_orders.</div>
          </div>
          <button style={{...c.btn(T.gold,T.bg),marginBottom:4}} onClick={async()=>{
            if(!settings.shopifyDomain||!settings.shopifyToken){pop("Add Shopify credentials in Settings first.","warn");return;}
            pop("Testing Shopify connection…","ok");
            try{
              const r=await fetch("https://"+settings.shopifyDomain+"/admin/api/2024-01/shop.json",{
                headers:{"X-Shopify-Access-Token":settings.shopifyToken},
              });
              const d=await r.json();
              if(d.shop) pop("✓ Shopify OK — Shop: "+d.shop.name+" ("+d.shop.email+")","ok");
              else pop("✗ Shopify error: "+JSON.stringify(d.errors||d),"err");
            }catch(e){pop("✗ Shopify connection failed: "+e.message,"err");}
          }}>🛍 Test Shopify Connection</button>
          <div style={{fontSize:10,color:T.muted,marginBottom:16}}>
            Troubleshooting: <strong>401</strong> = wrong token · <strong>403</strong> = missing scope (write_orders or write_draft_orders) · <strong>404</strong> = wrong domain · Get token at <strong>Shopify Admin → Apps → Develop apps → API credentials</strong>
          </div>

          {/* ── XERO DIAGNOSTICS ── */}
          <div style={{fontSize:12,fontWeight:"bold",color:T.gold,marginBottom:6}}>📒 Xero — Connection Test</div>
          <div style={{...c.card({padding:12}),marginBottom:6,fontSize:11,color:T.muted}}>
            <div>Bearer token: <span style={{color:settings.xeroToken?T.green:T.red}}>{settings.xeroToken?settings.xeroToken.slice(0,16)+"…":"Not set"}</span></div>
            <div>Tenant ID: <span style={{color:settings.xeroTenantId?T.green:T.red}}>{settings.xeroTenantId||"Not set"}</span></div>
            <div>Buy code: <span style={{color:T.white}}>{settings.xeroBuyCode||"310"}</span> · Sell code: <span style={{color:T.white}}>{settings.xeroSellCode||"200"}</span></div>
            <div style={{marginTop:6,fontSize:10}}>⚠ Xero tokens expire after <strong>30 minutes</strong>. If you get 401, refresh the token in Xero Developer Portal → My Apps → OAuth 2.0 playground.</div>
          </div>
          <button style={{...c.btn(T.gold,T.bg),marginBottom:4}} onClick={async()=>{
            if(!settings.xeroToken){pop("Add Xero Bearer token in Settings first.","warn");return;}
            pop("Testing Xero connection…","ok");
            try{
              const r=await fetch("https://api.xero.com/connections",{
                headers:{"Authorization":"Bearer "+settings.xeroToken,"Content-Type":"application/json"},
              });
              if(r.status===401){pop("✗ Xero 401 — Token expired or invalid. Refresh in Xero Developer Portal.","err");return;}
              const d=await r.json();
              if(Array.isArray(d)&&d.length>0){
                const orgs=d.map(c=>c.tenantName).join(", ");
                const ids=d.map(c=>c.tenantId);
                const match=ids.includes(settings.xeroTenantId);
                pop("✓ Xero OK — Orgs: "+orgs+(match?" · Tenant ID matches ✓":" · ⚠ Tenant ID not found in list"),"ok");
              } else {
                pop("✗ Xero: no connections found. Check token has org access.","err");
              }
            }catch(e){pop("✗ Xero connection failed: "+e.message,"err");}
          }}>📒 Test Xero Connection</button>
          <button style={{...c.btn(T.border,T.text),marginBottom:4,marginLeft:8}} onClick={async()=>{
            if(!settings.xeroToken){pop("Add Xero token first.","warn");return;}
            try{
              const r=await fetch("https://api.xero.com/connections",{
                headers:{"Authorization":"Bearer "+settings.xeroToken},
              });
              const d=await r.json();
              if(Array.isArray(d)){
                const txt=d.map(c=>c.tenantName+" → "+c.tenantId).join("\n");
                navigator.clipboard&&navigator.clipboard.writeText(txt);
                pop("Tenant IDs copied:\n"+txt,"ok");
              }
            }catch(e){pop("Failed: "+e.message,"err");}
          }}>Copy Tenant IDs</button>
          <div style={{fontSize:10,color:T.muted,marginBottom:16}}>
            Troubleshooting: <strong>401</strong> = token expired (30min limit) · <strong>403</strong> = wrong tenant ID · <strong>Account code errors</strong> = code does not exist in your Xero chart of accounts · Account 310 = Purchases, 200 = Revenue (default AU Xero). Verify in Xero: Accounting, then Chart of Accounts.
          </div>

          {/* ── GOOGLE SHEETS FORMAT ── */}
          <div style={{fontSize:12,fontWeight:"bold",color:T.gold,marginBottom:6}}>📊 Google Sheets — REST Format</div>
          <pre style={{background:T.surface,padding:12,borderRadius:6,fontSize:10,color:T.muted,overflowX:"auto",marginBottom:4}}>
{"PUT https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/{RANGE}\n?valueInputOption=USER_ENTERED\nAuthorization: Bearer {OAUTH_TOKEN}\nContent-Type: application/json\n\nBody: { \"values\": [[\"key\",\"value\"], ...] }"}
          </pre>
          <div style={{fontSize:10,color:T.muted,marginBottom:8}}>Get Sheet ID from the URL: docs.google.com/spreadsheets/d/<strong>THIS_PART</strong>/edit</div>

        </Modal>
      )}

        {/* ── LOGO MODAL ── */}
        {showLogoLib&&(
          <div style={{position:"fixed",inset:0,background:"#000000d0",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:12}}
            onClick={()=>setShowLogoLib(false)}>
            <div style={{...c.card({padding:24,maxWidth:980,width:"100%",maxHeight:"93vh",overflowY:"auto"})}}
              onClick={e=>e.stopPropagation()}>
              <div style={{...c.row(0),justifyContent:"space-between",marginBottom:20}}>
                <span style={{fontSize:15,fontWeight:"bold",color:T.white}}>🖼 Logo</span>
                <button style={c.bsm()} onClick={()=>setShowLogoLib(false)}>✕ Close</button>
              </div>
            <div style={{fontSize:11,color:T.muted,marginBottom:12}}>Upload images here. Tick one to use it as the app logo. Images are stored locally on this device.</div>
            {/* Drop zone */}
            <div
              style={{border:"2px dashed "+(logoDragOver?T.gold:T.border),borderRadius:8,padding:"24px 16px",textAlign:"center",marginBottom:16,background:logoDragOver?T.goldBg:"transparent",transition:"all 0.15s",cursor:"pointer"}}
              onDragOver={e=>{e.preventDefault();setLogoDragOver(true);}}
              onDragLeave={()=>setLogoDragOver(false)}
              onDrop={e=>{
                e.preventDefault();setLogoDragOver(false);
                const files=Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith("image/"));
                files.forEach(f=>{
                  const r=new FileReader();
                  r.onload=ev=>checkPhotoSize(ev.target.result,d=>{
                    setLogoLib(p=>[...p,{id:uid(),data:d,isLogo:false}]);
                    pop("Image added.","ok");
                  });
                  r.readAsDataURL(f);
                });
              }}>
              <div style={{fontSize:28,marginBottom:6}}>📂</div>
              <div style={{fontSize:13,color:logoDragOver?T.gold:T.muted,fontWeight:"bold"}}>Drop images here</div>
              <div style={{fontSize:11,color:T.muted,marginTop:4}}>or</div>
              <label style={{display:"inline-block",marginTop:8,...c.btn(T.gold,T.bg,{fontSize:11,padding:"8px 18px",cursor:"pointer"})}}>
                Browse Files
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple style={{display:"none"}} onChange={e=>{
                  const files=Array.from(e.target.files||[]);
                  files.forEach(f=>{
                    const r=new FileReader();
                    r.onload=ev=>checkPhotoSize(ev.target.result,d=>{
                      setLogoLib(p=>[...p,{id:uid(),data:d,isLogo:false}]);
                      pop("Image added.","ok");
                    });
                    r.readAsDataURL(f);
                  });
                  e.target.value="";
                }}/>
              </label>
            </div>
            {/* Image grid */}
            {logoLib.length===0
              ?<div style={{color:T.muted,textAlign:"center",padding:20,fontSize:12}}>No images yet. Drop or browse to add your logo.</div>
              :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:12}}>
                {(logoLib||[]).map(img=>{
                  const isActive=settings.logoImg===img.data;
                  return(
                    <div key={img.id} style={{...c.card({padding:8}),borderColor:isActive?T.gold:T.border,borderWidth:isActive?2:1,position:"relative",textAlign:"center"}}>
                      <img src={img.data} alt={img.name} style={{width:"100%",height:80,objectFit:"contain",borderRadius:4,marginBottom:6,background:T.surface}}/>
                      
                      <div style={{display:"flex",gap:4,justifyContent:"center",flexWrap:"wrap"}}>
                        <button
                          style={{...c.bsm(isActive?T.goldBg:T.border,isActive?T.gold:T.muted),fontSize:10,padding:"4px 8px",fontWeight:isActive?"bold":"normal"}}
                          onClick={()=>{
                            setSettings(p=>({...p,logoImg:isActive?null:img.data}));
                            setLogoLib(p=>p.map(x=>({...x,isLogo:x.id===img.id&&!isActive})));
                            pop(isActive?"Logo removed.":img.name+" set as logo.","ok");
                          }}>
                          {isActive?"✓ Logo":"Set Logo"}
                        </button>
                        <button style={{...c.bsm(T.border,T.muted),fontSize:10,padding:"4px 8px"}}
                          title="Download image"
                          onClick={()=>{
                            const a=document.createElement("a");
                            a.href=img.data;
                            a.download=(img.name||"logo")+".png";
                            a.click();
                            pop("Downloading "+( img.name||"image")+"…","ok");
                          }}>⬇</button>
                        <button style={{...c.bsm(T.redBg,T.red),fontSize:10,padding:"4px 8px"}}
                          onClick={()=>{
                            if(isActive)setSettings(p=>({...p,logoImg:null}));
                            setLogoLib(p=>p.filter(x=>x.id!==img.id));
                            pop("Image removed.","ok");
                          }}>🗑</button>
                      </div>
                      {isActive&&<div style={{position:"absolute",top:4,right:4,background:T.gold,borderRadius:"50%",width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:T.bg,fontWeight:"bold"}}>✓</div>}
                    </div>
                  );
                })}
              </div>
            }
          </Modal>
        )}

        {/* ── STOCK EDIT MODAL ── */}
        {editStockId&&(
          <Modal title="✎ Edit Stock Item" onClose={()=>setEditStockId(null)}>
            {[["Description","description","text"],["Weight (g)","weight_g","number"],["Bought Price ($)","price","number"],["Storage Location","storageLocation","text"]].map(([lbl,key,type])=>(
              <div key={key} style={{marginBottom:10}}>
                <label style={c.lbl}>{lbl}</label>
                <input style={c.inp()} type={type} value={editStockVal[key]||""} onChange={e=>setEditStockVal(p=>({...p,[key]:e.target.value}))}/>
              </div>
            ))}
            <div style={{marginBottom:10}}>
              <label style={c.lbl}>Purity</label>
              <select style={c.inp()} value={editStockVal.purity||""} onChange={e=>setEditStockVal(p=>({...p,purity:e.target.value}))}>
                <option value="">— select —</option>
                <optgroup label="Gold">{Object.keys(GOLD_P).map(k=><option key={k} value={k}>{k}</option>)}</optgroup>
                <optgroup label="Silver">{Object.keys(SILV_P).map(k=><option key={k} value={k}>{k}</option>)}</optgroup>
              </select>
            </div>
            <button style={{...c.btn(T.gold,T.bg),width:"100%"}} onClick={()=>{
              setStock(p=>p.map(x=>x.id===editStockId?{...x,
                description:editStockVal.description||x.description,
                weight_g:editStockVal.weight_g?parseFloat(editStockVal.weight_g)||x.weight_g:x.weight_g,
                purity:editStockVal.purity||x.purity,
                storageLocation:editStockVal.storageLocation||x.storageLocation,
                price:editStockVal.price?parseFloat(editStockVal.price)||x.price:x.price,
              }:x));
              setEditStockId(null);pop("Item updated.","ok");
            }}>Save Changes</button>
          </Modal>
        )}

        {/* ── RECEIPT MODAL ── */}
        {receiptTx&&(
          <Modal title="🧾 Receipt / Contract" onClose={()=>setReceiptTx(null)} wide>
            <pre style={{background:T.surface,padding:14,borderRadius:6,fontSize:11,color:T.text,overflowX:"auto",whiteSpace:"pre-wrap",fontFamily:"monospace",lineHeight:1.6}}>{makeReceipt(receiptTx)}</pre>
            <div style={c.row(10)}>
              <button style={c.btn(T.gold,T.bg)} onClick={()=>{dlFile(makeReceipt(receiptTx),"receipt-"+receiptTx.id+".txt","text/plain");pop("Receipt downloaded.","ok");}}>⬇ Download</button>
              <button style={c.btn(T.green,T.bg)} onClick={()=>{navigator.clipboard&&navigator.clipboard.writeText(makeReceipt(receiptTx));pop("Copied to clipboard.","ok");}}>Copy</button>
            </div>
          </Modal>
        )}

        {/* ── EOD SUMMARY MODAL ── */}
        {showEOD&&(
          <Modal title="📋 End of Day Summary" onClose={()=>setShowEOD(false)} wide>
            <div style={{fontSize:12,color:T.muted,marginBottom:12}}>{new Date().toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
            <div style={c.g2(12)}>
              {[{l:"Transactions",v:todayTx().length,col:T.white},{l:"Total Bought",v:fmtAUD(todayTx().reduce((a,t)=>a+(t.buyTotal||0),0)),col:T.green},{l:"Total Sold",v:fmtAUD(todayTx().reduce((a,t)=>a+(t.sellTotal||0),0)),col:T.gold},{l:"Net",v:fmtAUD(Math.abs(todayTx().reduce((a,t)=>a+(t.sellTotal||0),0)-todayTx().reduce((a,t)=>a+(t.buyTotal||0),0))),col:T.gold}].map(st=>(
                <div key={st.l} style={c.card({padding:12})}>
                  <div style={c.lbl}>{st.l}</div>
                  <div style={{fontSize:20,fontWeight:"bold",color:st.col}}>{st.v}</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:12}}>
              {[["💵 Cash","cash"],["💳 Card","card"],["🏦 Bank","bank"]].map(([lbl,pay])=>(
                <div key={pay} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid "+T.border+"33",fontSize:12}}>
                  <span style={{color:T.muted}}>{lbl}</span>
                  <span style={{color:T.white}}>{todayTx().filter(t=>t.payment===pay).length} tx · {fmtAUD(todayTx().filter(t=>t.payment===pay).reduce((a,t)=>a+(t.buyTotal||0)+(t.sellTotal||0),0))}</span>
                </div>
              ))}
            </div>
            {todayTx().some(t=>t.ttrStatus==="PENDING")&&<div style={{...c.bnr("block"),marginTop:10}}>🔴 TTR pending — file with AUSTRAC within 10 business days.</div>}
            {todayTx().some(t=>t.smrFlagged)&&<div style={{...c.bnr("warn"),marginTop:8}}>🚩 SMR-flagged transactions today.</div>}
            <button style={{...c.btn(T.gold,T.bg),width:"100%",marginTop:14}} onClick={()=>{
              const txs=todayTx();const b=settings.businessName||"";
              const paySum=(pay)=>fmtAUD(txs.filter(t=>t.payment===pay).reduce((a,t)=>a+(t.buyTotal||0)+(t.sellTotal||0),0));
              const txt=["EOD REPORT "+todayStr(),b,"","Transactions: "+txs.length,"Bought: "+fmtAUD(txs.reduce((a,t)=>a+(t.buyTotal||0),0)),"Sold: "+fmtAUD(txs.reduce((a,t)=>a+(t.sellTotal||0),0)),"Cash: "+paySum("cash"),"Card: "+paySum("card"),"Bank: "+paySum("bank")].join("\n");
              dlFile(txt,"eod-"+todayStr()+".txt","text/plain");
              pop("EOD report downloaded.","ok");
            }}>⬇ Download EOD Report</button>
          </Modal>
        )}

        {/* ── VENDOR DB MODAL ── */}
        {showVendors&&(
          <Modal title="🏪 Supplier / Vendor Database" onClose={()=>setShowVendors(false)} wide>
            <div style={{...c.bnr("info"),marginBottom:10}}>Professional suppliers who sell to you regularly. Separate from one-off KYC client records.</div>
            <button style={{...c.btn(T.gold,T.bg),marginBottom:10}} onClick={()=>{setEditVendor("new");setVendorForm({});}}>+ Add Supplier</button>
            {editVendor&&(
              <div style={{...c.card({padding:14}),marginBottom:10}}>
                <div style={{fontSize:12,fontWeight:"bold",color:T.gold,marginBottom:10}}>{editVendor==="new"?"New Supplier":"Edit Supplier"}</div>
                {[["Business / Trade Name","name"],["Contact Name","contact"],["Phone","phone"],["ABN / ID","abn"],["Address","address"],["Metal types supplied","metals"],["Notes","notes"]].map(([lbl,key])=>(
                  <div key={key} style={{marginBottom:8}}>
                    <label style={c.lbl}>{lbl}</label>
                    <input style={c.inp()} value={vendorForm[key]||""} onChange={e=>setVendorForm(p=>({...p,[key]:e.target.value}))}/>
                  </div>
                ))}
                <div style={c.row(10)}>
                  <button style={c.btn(T.gold,T.bg)} onClick={()=>{
                    if(!vendorForm.name){pop("Supplier name required.","warn");return;}
                    if(editVendor==="new") setVendors(p=>[...p,{id:uid(),...vendorForm,createdAt:nowISO()}]);
                    else setVendors(p=>p.map(v=>v.id===editVendor?{...v,...vendorForm}:v));
                    setEditVendor(null);setVendorForm({});pop("Supplier saved.","ok");
                  }}>Save</button>
                  <button style={c.bsm()} onClick={()=>{setEditVendor(null);setVendorForm({});}}>Cancel</button>
                </div>
              </div>
            )}
            {vendors.length===0&&!editVendor&&<div style={{color:T.muted,padding:20,textAlign:"center"}}>No suppliers yet.</div>}
            {vendors.map(v=>(
              <div key={v.id} style={{...c.card({padding:12}),marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:"bold",color:T.white,fontSize:13}}>{v.name}</div>
                    {v.contact&&<div style={{fontSize:11,color:T.muted}}>{v.contact}{v.phone?" · "+v.phone:""}</div>}
                    {v.abn&&<div style={{fontSize:11,color:T.muted}}>ABN/ID: {v.abn}</div>}
                    {v.metals&&<div style={{fontSize:11,color:T.gold}}>Supplies: {v.metals}</div>}
                    {v.notes&&<div style={{fontSize:11,color:T.muted,fontStyle:"italic"}}>{v.notes}</div>}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button style={c.bsm(T.border,T.muted)} onClick={()=>{setEditVendor(v.id);setVendorForm({...v});}}>✎</button>
                    <button style={c.bsm(T.redBg,T.red)} onClick={()=>setVendors(p=>p.filter(x=>x.id!==v.id))}>🗑</button>
                  </div>
                </div>
              </div>
            ))}
          </Modal>
        )}

        {/* ── STAFF PROFILES MODAL ── */}
        {showStaff&&(
          <Modal title="👥 Staff Profiles" onClose={()=>setShowStaff(false)} wide>
            <button style={{...c.btn(T.gold,T.bg),marginBottom:10}} onClick={()=>setStaffForm({name:"",pin:"",role:"staff"})}>+ Add Staff</button>
            {staffForm.name!==undefined&&(
              <div style={{...c.card({padding:14}),marginBottom:10}}>
                {[["Name","name","text"],["PIN","pin","password"],["Role","role","text"]].map(([lbl,key,type])=>(
                  <div key={key} style={{marginBottom:8}}>
                    <label style={c.lbl}>{lbl}</label>
                    <input style={c.inp()} type={type} value={staffForm[key]||""} onChange={e=>setStaffForm(p=>({...p,[key]:e.target.value}))}/>
                  </div>
                ))}
                <div style={c.row(10)}>
                  <button style={c.btn(T.gold,T.bg)} onClick={()=>{
                    if(!staffForm.name||!staffForm.pin){pop("Name and PIN required.","warn");return;}
                    const exists=staffList.find(s=>s.id===staffForm.id);
                    if(exists) setStaffList(p=>p.map(s=>s.id===staffForm.id?{...s,...staffForm}:s));
                    else setStaffList(p=>[...p,{id:uid(),...staffForm,createdAt:nowISO()}]);
                    setStaffForm({});pop("Staff saved.","ok");
                  }}>Save</button>
                  <button style={c.bsm()} onClick={()=>setStaffForm({})}>Cancel</button>
                </div>
              </div>
            )}
            {staffList.length===0&&staffForm.name===undefined&&<div style={{color:T.muted,padding:20,textAlign:"center"}}>No staff profiles yet.</div>}
            {(staffList||[]).map(s=>(
              <div key={s.id} style={{...c.card({padding:12}),marginBottom:8,borderLeft:"3px solid "+(activeStaff===s.id?T.green:T.border)}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:"bold",color:T.white}}>{s.name}</div>
                    <div style={{fontSize:11,color:T.muted}}>{s.role||"staff"}{activeStaff===s.id?" · ✓ Active":""}</div>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button style={c.bsm(activeStaff===s.id?T.greenBg:T.border,activeStaff===s.id?T.green:T.muted)} onClick={()=>{setActiveStaff(activeStaff===s.id?"":s.id);pop(activeStaff===s.id?"Deselected.":s.name+" set as active.","ok");}}>
                      {activeStaff===s.id?"✓ Active":"Select"}
                    </button>
                    <button style={c.bsm(T.border,T.muted)} onClick={()=>setStaffForm({...s})}>✎</button>
                    <button style={c.bsm(T.redBg,T.red)} onClick={()=>setStaffList(p=>p.filter(x=>x.id!==s.id))}>🗑</button>
                  </div>
                </div>
              </div>
            ))}
          </Modal>
        )}

        {/* ── CLIENT NOTE MODAL ── */}
        {cliNoteId&&(
          <Modal title="📝 Client Note" onClose={()=>setCliNoteId(null)}>
            <label style={c.lbl}>Note (internal — not shown to client)</label>
            <textarea style={{...c.inp(),minHeight:80,marginBottom:10}} value={cliNoteVal} onChange={e=>setCliNoteVal(e.target.value)} placeholder="e.g. Regular supplier. Trustworthy. Brings 22ct chains."/>
            <button style={{...c.btn(T.gold,T.bg),width:"100%"}} onClick={()=>{
              setTxList(p=>p.map(x=>x.id===cliNoteId?{...x,clientNote:cliNoteVal}:x));
              setCliNoteId(null);pop("Note saved.","ok");
            }}>Save Note</button>
          </Modal>
        )}

        {/* ── POLICE REPORT MODAL ── */}
        {showPolice&&(
          <div style={{position:"fixed",inset:0,background:"#000000d0",zIndex:1500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
            onClick={()=>setShowPolice(false)}>
            <div style={{...c.card({padding:24}),maxWidth:480,width:"100%",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
              <div style={{...c.row(0),justifyContent:"space-between",marginBottom:20}}>
                <span style={{fontSize:15,fontWeight:"bold",color:T.white}}>🚔 Police Report</span>
                <button style={c.bsm()} onClick={()=>setShowPolice(false)}>✕</button>
              </div>
              <div style={{marginBottom:14}}>
                <label style={c.lbl}>State / Territory</label>
                <select style={{...c.sel(),width:"100%"}} value={settings.state||"VIC"} onChange={e=>setSettings(p=>({...p,state:e.target.value}))}>
                  {["VIC","NSW","QLD","SA","WA","NT","ACT","TAS"].map(s=>(
                    <option key={s} value={s}>{s} — {(STATE_INFO[s]||{}).name||s}</option>
                  ))}
                </select>
              </div>
              {(()=>{const st=STATE_INFO[settings.state||"VIC"]||STATE_INFO.VIC;return(
                <div style={{...c.bnr("info"),marginBottom:14,fontSize:11}}>
                  <strong>{st.act}</strong><br/>
                  Hold period: <strong>{st.hold}</strong> · Submit: <strong>{st.freq}</strong><br/>
                  {st.note}
                </div>
              );})()}

              {/* Option 1: Immediate suspicious item report */}
              <div style={{...c.card({padding:14}),marginBottom:12,borderLeft:"3px solid "+T.red}}>
                <div style={{fontSize:12,fontWeight:"bold",color:T.red,marginBottom:6}}>🚨 Immediate — Suspicious Item Report</div>
                <div style={{fontSize:11,color:T.muted,marginBottom:10}}>
                  Generates a report of all SMR-flagged transactions. Use when you have purchased an item you suspect may be stolen and need to notify police immediately.
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button style={c.btn(T.red,"#fff",{fontSize:12})} onClick={()=>{
                    const csv=genPoliceReport(new Date(0,txList,settings),new Date(),true,settings.state||"VIC");
                    const flagged=txList.filter(t=>t.smrFlagged).length;
                    if(flagged===0){pop("No SMR-flagged transactions found.","warn");return;}
                    dlFile(csv,"suspicious_items_"+(settings.state||"VIC")+"_"+new Date().toISOString().slice(0,10)+".csv","text/csv");
                    pop("Suspicious items report downloaded — "+flagged+" transaction(s).","ok");
                  }}>⬇ Download CSV</button>
                  {((STATE_INFO[settings.state||"VIC"]||{}).defaultEmail||settings.policeEmail)&&(
                    <button style={c.bsm(T.border,T.muted)} onClick={()=>{
                      const stateEmail=(STATE_INFO[settings.state||"VIC"]||{}).defaultEmail||settings.policeEmail||"";
                            window.open("mailto:"+stateEmail+
                        "?subject=Suspicious+Item+Report+—+"+(settings.businessName||"Secondhand+Dealer")+
                        "&body=Please+find+attached+our+suspicious+item+report.+Licence+No:+"+(settings.dealerLicenceNo||"[Licence]")+
                        ".+ABN:+"+(settings.abn||"[ABN]")+".");
                    }}>📧 Open Email Draft</button>
                  )}
                </div>
              </div>

              {/* Option 2: Weekly report */}
              <div style={{...c.card({padding:14}),marginBottom:14,borderLeft:"3px solid "+T.gold}}>
                <div style={{fontSize:12,fontWeight:"bold",color:T.gold,marginBottom:6}}>📋 Weekly Transaction Report</div>
                <div style={{fontSize:11,color:T.muted,marginBottom:10}}>
                  Covers all buy transactions in the selected 7-day period. Required weekly under the Secondhand Dealers & Pawnbrokers Act 1989 (Vic).
                </div>
                {(()=>{
                  const now=new Date();
                  const dayOfWeek=now.getDay();
                  const lastMonday=new Date(now);lastMonday.setDate(now.getDate()-(dayOfWeek===0?6:dayOfWeek-1));lastMonday.setHours(0,0,0,0);
                  const lastSunday=new Date(lastMonday);lastSunday.setDate(lastMonday.getDate()+6);lastSunday.setHours(23,59,59,999);
                  const txCount=txList.filter(t=>{
                    if(!t.date) return false;
                    const d=new Date(t.date);
                    return d>=lastMonday&&d<=lastSunday&&(t.items||[]).some(i=>i.mode==="buy");
                  }).length;
                  return(
                    <div>
                      <div style={{fontSize:11,color:T.muted,marginBottom:10}}>
                        Period: {lastMonday.toLocaleDateString("en-AU")} — {lastSunday.toLocaleDateString("en-AU")} · {txCount} buy transaction(s)
                      </div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        <button style={c.btn(T.gold,T.bg,{fontSize:12})} onClick={()=>{
                          const csv=genPoliceReport(lastMonday,lastSunday,false,settings.state||"VIC",txList,settings);
                          dlFile(csv,"police_report_"+(settings.state||"VIC")+"_"+lastMonday.toISOString().slice(0,10)+".csv","text/csv");
                          pop("Weekly police report downloaded — "+txCount+" transaction(s).","ok");
                        }}>⬇ Download CSV</button>
                        {((STATE_INFO[settings.state||"VIC"]||{}).defaultEmail||settings.policeEmail)&&(
                          <button style={c.bsm(T.border,T.muted)} onClick={()=>{
                            window.open("mailto:"+settings.policeEmail+
                              "?subject=Weekly+Transaction+Report+—+"+(settings.businessName||"Secondhand+Dealer")+
                              "+w/e+"+(lastSunday.toLocaleDateString("en-AU").replace(/\//g,"-"))+
                              "&body=Please+find+attached+our+weekly+transaction+report+for+the+period+"+
                              lastMonday.toLocaleDateString("en-AU")+" to "+lastSunday.toLocaleDateString("en-AU")+
                              ".+Dealer+Licence+No:+"+(settings.dealerLicenceNo||"[Licence]")+
                              ".+ABN:+"+(settings.abn||"[ABN]")+".");
                          }}>📧 Open Email Draft</button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Station config reminder */}
              {(!settings.policeEmail||!settings.dealerLicenceNo)&&(
                <div style={c.bnr("warn")}>
                  ⚠ Set your <strong>police station email</strong> and <strong>dealer licence number</strong> in Settings → Business to enable email drafts.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── BACKUP / RESTORE MODAL ── */}
        {showBackup&&(
          <Modal title="💾 Backup & Restore" onClose={()=>setShowBackup(false)} wide>
            <div style={{...c.bnr("warn"),marginBottom:12}}>Backup includes all transactions, stock, catalog, vendors and staff. Photos are not included (too large).</div>
            <button style={{...c.btn(T.gold,T.bg),width:"100%",marginBottom:12}} onClick={dlBackup}>⬇ Download Backup (.json)</button>
            <div style={{fontSize:12,fontWeight:"bold",color:T.white,marginBottom:8}}>Restore from backup</div>
            <div style={{...c.bnr("block"),marginBottom:10}}>⚠ Restore will overwrite all current data. Cannot be undone.</div>
            <label style={{...c.btn(T.border,T.text,{display:"block",textAlign:"center",cursor:"pointer",padding:10,fontSize:12})}}>
              📂 Select Backup File (.json)
              <input type="file" accept=".json" style={{display:"none"}} onChange={e=>{
                const f=e.target.files&&e.target.files[0];if(!f)return;
                setPinModal({reason:"Restore backup — overwrites ALL current data. Manager PIN required.",cb:()=>restoreBackup(f)});
                setPinVal("");e.target.value="";
              }}/>
            </label>
          </Modal>
        )}

      {notify&&<Notif msg={notify.msg} type={notify.type} onClose={()=>setNotify(null)}/>}
    </div>
      )}
    </div>
  );
}
