// LOOT LEDGR v5 — Compliance POS . Gold & Silver . Australia
// AML/CTF Act 2006 (Cth) . SHD Act 1989 (Vic) . Privacy Act 1988 (Cth)
import React,{useState,useEffect,useRef,useMemo} from "react";
import {TROY_OZ,APP_VERSION,DEFAULT_SETTINGS,SCALE_STD_SVC,SCALE_STD_CHAR,NUS_SVC,NUS_TX,SEED_LOGO} from "./lib/constants.js";
import {sN,sS,uid,fmt2,fmtAUD,fmtDate,addHours,hoursLeft,isExpired7yr,nowISO,todayStr,peekInv,makeInv,parseStdWeight,parseAsciiWeight,fmtScaleWeight} from "./lib/utils.js";
import {store,sb,checkPhotoSize,initTxList} from "./lib/storage.js";
import {sendDuressSMS,pushIntegrations} from "./lib/integrations.js";
import {THRESH,checkCompliance,calcUnitPrice,calcMeltFn,makeReceiptFn,makeTxt,getRequiredFields} from "./lib/compliance/index.js";
import {clients,findOrCreateByIdNumber,pickClientRecordFields} from "./lib/clients.js";
import {requireAdminPin} from "./lib/adminGate.js";
import {LIGHT,T,c} from "./theme.js";
import {Modal,F,Notif} from "./components/ui";
import StockCard from "./components/StockCard.jsx";
import TxPhotoManager from "./components/TxPhotoManager.jsx";
import Dashboard from "./screens/Dashboard.jsx";
import Stock from "./screens/Stock.jsx";
import History from "./screens/History.jsx";
import Prices from "./screens/Prices.jsx";
import Clients from "./screens/Clients.jsx";
import NewTx from "./screens/NewTx.jsx";
import BackupRestore from "./modals/BackupRestore.jsx";
import EOD from "./modals/EOD.jsx";
import Vendors from "./modals/Vendors.jsx";
import PoliceReport from "./modals/PoliceReport.jsx";
import Staff from "./modals/Staff.jsx";
import Settings from "./modals/Settings.jsx";
import ApiDiagnostics from "./modals/ApiDiagnostics.jsx";
import CatalogEditor from "./modals/CatalogEditor.jsx";
import LogoManager from "./modals/LogoManager.jsx";
import ForgotPin from "./modals/ForgotPin.jsx";

export default function Loot(){
  const[screen,setScreen]=useState("dashboard");
  const[gSpot,setGSpot]=useState(()=>store.get("gSpot",0));
  const[sSpot,setSSpot]=useState(()=>store.get("sSpot",0));
  const[catalog,setCatalog]=useState(()=>store.get("catalog",[]));
  const[txList,setTxList]=useState(()=>initTxList());
  const[stock,setStock]=useState(()=>store.get("stock",[]));
  const[settings,setSettings]=useState(()=>({...DEFAULT_SETTINGS,...store.get("settings",{})}));
  const[txStep,setTxStep]=useState(1);
  const[txItems,setTxItems]=useState([]);
  const[txPay,setTxPay]=useState("cash");
  const[txNo,setTxNo]=useState(()=>peekInv());
  const[client,setClient]=useState({});
  // Phase 2.7.9b — links the in-progress transaction to a persistent
  // client record. Set when staff selects an existing client via the
  // step-4 ClientSearch popup; remains null until then. resetTx
  // clears it. clientStep drives step 4's internal state machine
  // (search input → existing-client form OR new-client photo-first
  // flow → new-client form).
  const[selectedClientId,setSelectedClientId]=useState(null);
  const[clientStep,setClientStep]=useState("search");
  const[staff,setStaff]=useState({});
  const[kycDone,setKycDone]=useState(false);
  const[privAck,setPrivAck]=useState(false);
  const[idSighted,setIdSighted]=useState(false);
  const[photo,setPhoto]=useState(null);
  const[itemPhotos,setItemPhotos]=useState({});
  const[zoom,setZoom]=useState(()=>store.get("zoom",100));
  const[simp,setSimp]=useState(()=>store.get("simp",false));
  const[contrast,setContrast]=useState(()=>store.get("contrast",0));
  const[fontSize,setFontSize]=useState(()=>store.get("fontSize",14));
  const[settingsOpen,setSettingsOpen]=useState({spotfeed:false,appearance:true,business:false,scale:false,security:false,policehelp:false,compliance:false,compliancethresholds:false,crypto:false,ai:false,idautofill:false,integrations:false});
  const toggleSection=k=>setSettingsOpen(p=>({...p,[k]:!p[k]}));
  const[quickMode,setQuickMode]=useState(false);
  const[qmMode,setQMMode]=useState("buy");
  const[qf,setQF]=useState({label:"",cat:"Gold",type:"scrap",unit:"g",price:"",qty:"",note:"",purity:"",carat:""});
  const[adjId,setAdjId]=useState(null);
  const[adjVal,setAdjVal]=useState("");
  const[cliSearch,setCliSearch]=useState("");
  const[cliFrom,setCliFrom]=useState("");
  const[cliTo,setCliTo]=useState("");
  const[logoLib,setLogoLib]=useState(()=>store.get("logoLib",[]));
  const[showLogoLib,setShowLogoLib]=useState(false);
  const[logoPinMode,setLogoPinMode]=useState(false);
  const[logoPinVal,setLogoPinVal]=useState("");
  const[logoDel,setLogoDel]=useState(null);
  const[logoDragOver,setLogoDragOver]=useState(false);
  const[editStockId,setEditStockId]=useState(null);
  const[editStockVal,setEditStockVal]=useState({});
  const[receiptTx,setReceiptTx]=useState(null);
  const[cliNoteId,setCliNoteId]=useState(null);
  const[cliNoteVal,setCliNoteVal]=useState("");
  const[vendors,setVendors]=useState(()=>store.get("vendors",[]));
  const[showVendors,setShowVendors]=useState(false);
  const[editVendor,setEditVendor]=useState(null);
  const[vendorForm,setVendorForm]=useState({});
  const[staffList,setStaffList]=useState(()=>store.get("staffList",[]));
  const[showStaff,setShowStaff]=useState(false);
  const[staffForm,setStaffForm]=useState({});
  const[activeStaff,setActiveStaff]=useState(()=>store.get("activeStaff",""));
  const[showEOD,setShowEOD]=useState(false);
  const[frozenSnap,setFrozenSnap]=useState(()=>store.get("frozenSnap",null));
  const[spotLog,setSpotLog]=useState(()=>store.get("spotLog",[]));
  const[histFilter,setHistFilter]=useState("all");
  const[blacklist,setBlacklist]=useState(()=>store.get("blacklist",[]));
  const[showBackup,setShowBackup]=useState(false);
  const[showPolice,setShowPolice]=useState(false);
  const[scaleLive,setScaleLive]=useState(null);
  const[scaleDevice,setScaleDevice]=useState(null);
  const[scaleStatus,setScaleStatus]=useState("off");
  const[duressActive,setDuressActive]=useState(false);
  const[appUnlocked,setAppUnlocked]=useState(()=>{const s=store.get("settings",{});if(!s.requirePin)return true;const t=s.sessionTimeout||"never";if(t==="never")return !!store.get("sessionActive",false);if(t==="close")return false;const limits={"1h":3600000,"8h":28800000};return Date.now()-store.get("sessionLast",0)<(limits[t]||Infinity);});
  const[appPinInput,setAppPinInput]=useState("");
  const[forgotPinOpen,setForgotPinOpen]=useState(false);
  const[pinModal,setPinModal]=useState(null);
  const[pinVal,setPinVal]=useState("");
  const[flagNote,setFlagNote]=useState("");
  const[showFlag,setShowFlag]=useState(false);
  const[showCat,setShowCat]=useState(false);
  const[showSet,setShowSet]=useState(false);
  const[showAbout,setShowAbout]=useState(false);
  const[showApi,setShowApi]=useState(false);
  const[selTx,setSelTx]=useState(null);
  const[notify,setNotify]=useState(null);
  const[apiError,setApiError]=useState("");
  const[editProd,setEditProd]=useState(null);
  const[newProd,setNewProd]=useState({cat:"Other",sub:"",type:"scrap",unit:"g",purity:"",carat:"",label:"",buyMult:"",sellMult:"",weightG:"",active:true});
  const[addMode,setAddMode]=useState("buy");
  const[addId,setAddId]=useState("");
  const[addQty,setAddQty]=useState("");
  const[addCustom,setAddCustom]=useState("");
  const[addNote,setAddNote]=useState("");
  const fileRef=useRef();
  const sbSettingsTimer=useRef(null);
  const prevStockRef=useRef([]);
  const[spotStatus,setSpotStatus]=useState("off");
  const[spotSource,setSpotSource]=useState("");
  const manualTs=useRef(0); // manual override resets on reload — API always tries fresh
  // Manual-override TTL is configurable via Settings → Spot Feed
  // (Phase 2.7 smoke-test follow-up, 2026-04-29). "always" disables
  // auto-expiry; the Refresh / Resume API button still cancels
  // regardless. Computed each render so settings changes take effect
  // without remounting.
  const MANUAL_TTL_MAP={"1h":3600000,"6h":21600000,"12h":43200000,"24h":86400000};
  const MANUAL_TTL=settings.manualPriceTTL==="always"?Infinity:(MANUAL_TTL_MAP[settings.manualPriceTTL]||3600000);
  const isManualActive=()=>{
    if(manualTs.current<=0)return false;
    if(MANUAL_TTL===Infinity)return true;
    return (Date.now()-manualTs.current)<MANUAL_TTL;
  };

  // T is the live theme object (exported from theme.js as a clone of
  // LIGHT). Reset it to baseline LIGHT, then overlay contrast tweaks
  // in place — Object.assign on the imported T mutates the same
  // object the c style helpers close over, so they pick up the new
  // values on the next read. (Originally `T = LIGHT` and
  // `T = Object.assign({}, T, {…})` reassignments; cross-module
  // reassignment isn't possible, so the in-place mutation pattern
  // replaces it. End-state property values are identical.)
  Object.assign(T,LIGHT);
  if(contrast!==0){const cv=contrast;Object.assign(T,{border:"rgba(0,0,0,"+(cv>0?(0.12+cv*0.075):(0.12+cv*0.02))+")",muted:cv>0?"#"+Math.max(0,0x73-cv*18).toString(16).padStart(2,"0").repeat(3):"#737373",text:cv>0?"#000":"#"+Math.max(0x11,0x11+Math.round(cv*8)).toString(16).padStart(2,"0").repeat(3),gold:cv>0?"#7a5200":"#9C7A00"});}
  const S=simp;
  Object.assign(c,{
    btn:(bg=T.gold,col="#080c09",x={})=>({background:bg,color:col,border:"none",borderRadius:S?8:6,padding:S?"14px 24px":"14px 28px",fontFamily:T.ff,fontSize:S?15:14,fontWeight:"bold",letterSpacing:S?"0.06em":"0.08em",textTransform:"uppercase",cursor:"pointer",whiteSpace:"nowrap",...x,boxShadow:"4px 4px 14px rgba(0,0,0,0.22)"}),
    bsm:(bg=T.border,col=T.text)=>({background:bg,color:col,border:"none",borderRadius:S?6:5,padding:S?"10px 16px":"10px 18px",fontFamily:T.ff,fontSize:13,fontWeight:S?undefined:"600",cursor:"pointer",whiteSpace:"nowrap",boxShadow:"3px 3px 10px rgba(0,0,0,0.18)"}),
    inp:(x={})=>({background:T.surface,border:"1px solid "+T.border,borderRadius:S?8:6,color:T.text,fontFamily:T.ff,fontSize:S?15:13,padding:S?"13px 14px":"9px 12px",outline:"none",width:"100%",boxSizing:"border-box",...x}),
    lbl:{fontSize:S?12:10,color:T.muted,letterSpacing:S?"0.1em":"0.15em",textTransform:"uppercase",marginBottom:S?6:5,display:"block"},
  });

  useEffect(()=>{document.body.style.cssText="background:"+T.bg+";margin:0;padding:0";document.documentElement.style.background=T.bg;},[]);
  useEffect(()=>{
    if(!document.getElementById("gf-fonts")){const l=document.createElement("link");l.id="gf-fonts";l.rel="stylesheet";l.href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";document.head.appendChild(l);const s=document.createElement("style");s.id="gf-reset";s.textContent="*{box-sizing:border-box}html,body{margin:0;padding:0;background:"+LIGHT.bg+";min-height:100%}";document.head.appendChild(s);}
    const el=document.getElementById("gf-focus")||document.createElement("style");el.id="gf-focus";if(!el.parentNode)document.head.appendChild(el);
    el.textContent="input:focus,select:focus,textarea:focus{outline:2px solid "+T.gold+";outline-offset:1px;}";
  },[]);
  useEffect(()=>{const sc=fontSize/14,w=fontSize<=14?400:fontSize<=18?500:fontSize<=24?600:700;const root=document.getElementById("root");if(root){root.style.zoom=sc;root.style.fontWeight=w;}const el=document.getElementById("gf-fontscale")||document.createElement("style");el.id="gf-fontscale";if(!el.parentNode)document.head.appendChild(el);el.textContent="#root,#root *{font-weight:"+w+" !important}#root strong,#root b{font-weight:"+Math.min(w+200,900)+" !important}";},[fontSize]);
  useEffect(()=>{(async()=>{try{const[t,s,cfg,cat]=await Promise.all([sb.loadTxList(),sb.loadStock(),sb.loadSettings(),sb.loadCatalog()]);if(t&&t.length)setTxList(t);if(s&&s.length)setStock(s);if(cfg&&Object.keys(cfg).length){setSettings(p=>({...DEFAULT_SETTINGS,...p,...cfg}));if(cfg.gSpot)setGSpot(cfg.gSpot);if(cfg.sSpot)setSSpot(cfg.sSpot);}if(cat&&cat.length)setCatalog(cat);}catch(_){}})();},[]);
  useEffect(()=>store.set("zoom",zoom),[zoom]);
  useEffect(()=>store.set("simp",simp),[simp]);
  useEffect(()=>store.set("contrast",contrast),[contrast]);
  useEffect(()=>store.set("fontSize",fontSize),[fontSize]);
  useEffect(()=>store.set("gSpot",gSpot),[gSpot]);
  useEffect(()=>store.set("sSpot",sSpot),[sSpot]);
  useEffect(()=>{store.set("catalog",catalog);sb.saveCatalog(catalog);},[catalog]);
  useEffect(()=>{store.set("txList",txList.map(t=>({...t,photo:null,itemPhotos:{}})));if(txList.length)sb.saveTx(txList[0]);},[txList]);
  useEffect(()=>{store.set("stock",stock);const prev=prevStockRef.current,curr=new Set((stock||[]).map(s=>s.id));prev.forEach(s=>{if(!curr.has(s.id))sb.deleteStock(s.id);});(stock||[]).forEach(s=>{const o=prev.find(p=>p.id===s.id);if(!o||JSON.stringify(o)!==JSON.stringify(s))sb.saveStock(s);});prevStockRef.current=stock;},[stock]);
  useEffect(()=>{store.set("settings",settings);if(sbSettingsTimer.current)clearTimeout(sbSettingsTimer.current);sbSettingsTimer.current=setTimeout(()=>sb.saveSettings(settings),2000);},[settings]);
  useEffect(()=>store.set("vendors",vendors),[vendors]);
  useEffect(()=>store.set("logoLib",logoLib),[logoLib]);
  useEffect(()=>{if(logoLib.length===0&&SEED_LOGO){setLogoLib([{id:"default-logo",data:SEED_LOGO,isLogo:true}]);setSettings(p=>p.logoImg?p:{...p,logoImg:SEED_LOGO});}},[]);
  useEffect(()=>store.set("staffList",staffList),[staffList]);
  useEffect(()=>store.set("activeStaff",activeStaff),[activeStaff]);
  useEffect(()=>store.set("frozenSnap",frozenSnap),[frozenSnap]);
  useEffect(()=>store.set("spotLog",spotLog),[spotLog]);
  useEffect(()=>store.set("blacklist",blacklist),[blacklist]);

  const setGSpotManual=v=>{setGSpot(v);manualTs.current=Date.now();store.set("manualSpotTs",manualTs.current);setSpotSource("manual");setSpotStatus("manual");};
  const setSSpotManual=v=>{setSSpot(v);manualTs.current=Date.now();store.set("manualSpotTs",manualTs.current);setSpotSource("manual");setSpotStatus("manual");};

  const forceResumeAPI=async()=>{
    const{goldApiKey:k1,metalsApiKey:k2,metalsDevKey:k3}=settings;
    if(!k1&&!k2&&!k3){pop("No API keys configured in Settings → Spot Feed.","warn");return;}
    pop("Fetching live prices…","ok");
    const errs=[];
    const applyLive=(g,s,src)=>{manualTs.current=0;store.set("manualSpotTs",0);setGSpot(parseFloat(Number(g).toFixed(2)));setSSpot(parseFloat(Number(s).toFixed(2)));setSpotStatus("live");setSpotSource(src);pop("🟢 Live prices from "+src+".","ok");};
    if(k1){
      try{
        const gR=await fetch("https://www.goldapi.io/api/XAU/AUD",{headers:{"x-access-token":k1}});
        const gD=await gR.json();
        console.log("GoldAPI XAU response",gR.status,gD);
        if(!gR.ok){errs.push("GoldAPI "+gR.status+": "+(gD.message||gD.error||gD.info||JSON.stringify(gD).slice(0,60)));}
        else{
          const sR=await fetch("https://www.goldapi.io/api/XAG/AUD",{headers:{"x-access-token":k1}});
          const sD=await sR.json();
          const g=gD.price||gD.ask||gD.bid, s=sD.price||sD.ask||sD.bid;
          if(g&&s){applyLive(g,s,"GoldAPI");return;}
          else errs.push("GoldAPI: got response but no price field. Got: "+JSON.stringify(gD).slice(0,80));
        }
      }catch(e){errs.push("GoldAPI fetch failed: "+e.message);}
    }
    if(k2){
      try{
        const r=await fetch("https://metals-api.com/api/latest?access_key="+k2+"&base=AUD&symbols=XAU,XAG");
        const d=await r.json();
        console.log("Metals-API response",r.status,d);
        if(!r.ok||!d.success){errs.push("Metals-API "+r.status+": "+(d.message||d.error||"success=false"));}
        else{
          const g=d.rates&&(d.rates.AUDXAU||(d.rates.XAU?1/d.rates.XAU:null));
          const s=d.rates&&(d.rates.AUDXAG||(d.rates.XAG?1/d.rates.XAG:null));
          if(g&&s){applyLive(g,s,"Metals-API");return;}
          else errs.push("Metals-API: rates present but no XAU/XAG found");
        }
      }catch(e){errs.push("Metals-API fetch failed: "+e.message);}
    }
    if(k3){
      try{
        const r=await fetch("https://api.metals.dev/v1/latest?api_key="+k3+"&currency=AUD&unit=troy_oz");
        const d=await r.json();
        console.log("Metals.Dev response",r.status,d);
        if(!r.ok){errs.push("Metals.Dev "+r.status+": "+(d.message||d.error||"check key"));}
        else if(d.metals&&d.metals.gold&&d.metals.silver){applyLive(d.metals.gold,d.metals.silver,"Metals.Dev");return;}
        else errs.push("Metals.Dev: unexpected shape: "+JSON.stringify(d).slice(0,80));
      }catch(e){errs.push("Metals.Dev fetch failed: "+e.message);}
    }
    const msg=errs.length ? errs.join(" | ") : "All APIs failed — no keys configured?";
    setApiError(msg);
    pop(msg,"warn");
  };

  useEffect(()=>{
    const{goldApiKey:k1,metalsApiKey:k2,metalsDevKey:k3}=settings;
    if(!k1&&!k2&&!k3){setSpotStatus("off");return;}
    const applySpot=(g,s,src)=>{setSpotLog(p=>[{t:nowISO(),g,s,src},...p].slice(0,90));if(isManualActive())return;setGSpot(parseFloat(Number(g).toFixed(2)));setSSpot(parseFloat(Number(s).toFixed(2)));setSpotStatus("live");setSpotSource(src);if(settings.goldAlert&&g>=parseFloat(settings.goldAlert))pop("⬡ Gold alert: "+fmtAUD(parseFloat(settings.goldAlert)),"ok");if(settings.silverAlert&&s>=parseFloat(settings.silverAlert))pop("◈ Silver alert: "+fmtAUD(parseFloat(settings.silverAlert)),"ok");};
    const tF=async(url,h={})=>{try{const r=await fetch(url,{headers:h});if(!r.ok){console.warn("Spot API",r.status,url);return null;}return await r.json();}catch(e){console.warn("Spot API network:",e.message,url);return null;}};
    const fetchSpot=async()=>{
      if(isManualActive()){setSpotStatus("manual");return;}setSpotStatus("stale");
      if(k1){const[gD,sD]=await Promise.all([tF("https://www.goldapi.io/api/XAU/AUD",{"x-access-token":k1}),tF("https://www.goldapi.io/api/XAG/AUD",{"x-access-token":k1})]);const g=gD&&(gD.price||gD.ask||gD.bid),s=sD&&(sD.price||sD.ask||sD.bid);if(g&&s){applySpot(parseFloat(g),parseFloat(s),"GoldAPI");return;}}
      if(k2){const d=await tF("https://metals-api.com/api/latest?access_key="+k2+"&base=AUD&symbols=XAU,XAG");if(d&&d.success&&d.rates){const g=d.rates.AUDXAU||(d.rates.XAU?1/d.rates.XAU:null),s=d.rates.AUDXAG||(d.rates.XAG?1/d.rates.XAG:null);if(g&&s){applySpot(g,s,"Metals-API");return;}}}
      if(k3){const d=await tF("https://api.metals.dev/v1/latest?api_key="+k3+"&currency=AUD&unit=troy_oz");if(d&&d.metals&&d.metals.gold&&d.metals.silver){applySpot(d.metals.gold,d.metals.silver,"Metals.Dev");return;}}
      setSpotStatus("stale");
    };
    fetchSpot();const id=setInterval(fetchSpot,60*60*1000);return()=>clearInterval(id);
  },[settings.goldApiKey,settings.metalsApiKey,settings.metalsDevKey]);

  const pop=(msg,type="ok")=>{setNotify({msg,type});setTimeout(()=>setNotify(null),4000);};
  const dlFile=(content,filename,mime)=>{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([content],{type:mime||"text/plain"}));a.download=filename;a.click();};
  const isBlacklistedName=name=>name&&blacklist.some(b=>b.name.toLowerCase()===sS(name).toLowerCase());
  const spotForCalc=()=>frozenSnap?{g:frozenSnap.gSpot,s:frozenSnap.sSpot}:{g:gSpot,s:sSpot};
  const calcMelt=item=>calcMeltFn(item,frozenSnap,gSpot,sSpot);
  const makeReceipt=tx=>makeReceiptFn(tx,settings);
  const todayTxData=useMemo(()=>(txList||[]).filter(t=>t.date&&t.date.slice(0,10)===nowISO().slice(0,10)),[txList]);
  const todayTx=()=>todayTxData;
  const compliance=useMemo(()=>checkCompliance(txItems,txPay,settings.ttrEnabled!==false,settings.cashHardBlockAbove),[txItems,txPay,settings.ttrEnabled,settings.cashHardBlockAbove]);
  const buyTotal=(txItems||[]).filter(i=>i.mode==="buy").reduce((s,i)=>s+sN(i.price),0);
  const sellTotal=(txItems||[]).filter(i=>i.mode==="sell").reduce((s,i)=>s+sN(i.price),0);
  const net=sellTotal-buyTotal;
  const addProd=(catalog||[]).find(p=>p.id===addId);
  const addUnit=addProd?calcUnitPrice(addProd,gSpot,sSpot,addMode):null;
  const addQtyN=sN(addQty)||0;
  const addCalc=(addUnit!=null&&addQtyN)?addUnit*addQtyN:(sN(addCustom)||0);
  const fmtSW=r=>fmtScaleWeight(r,settings.scaleUnit||"g");

  const handleAddItem=()=>{if(!addProd||!addCalc){pop("Enter quantity or price.","warn");return;}setTxItems(p=>[...p,{id:uid(),mode:addMode,product:addProd,qty:addQtyN||1,unitPrice:addUnit,price:addCalc,note:addNote,holdUntil:addMode==="buy"?addHours(nowISO(),THRESH.HOLD_HOURS):null,policeHold:false}]);setAddQty("");setAddCustom("");setAddNote("");pop("Added: "+sS(addProd.label),"ok");};
  const submitPin=()=>{if(!settings.staffPin){pop("No Admin PIN set. Set one in Settings → Security.","warn");setPinModal(null);return;}if(pinVal===settings.staffPin){pinModal&&pinModal.cb&&pinModal.cb();setPinModal(null);setPinVal("");}else{pop("Incorrect PIN.","err");setPinVal("");}};
  // Phase 2.7 follow-up batch 2 — single closure-bound gate helper
  // shared with destructive call sites in the modals/screens.
  // Wraps requireAdminPin so callers don't have to re-thread the
  // four callback dependencies (settings/pop/setPinModal/setPinVal)
  // every time. When settings.requirePin is false the gate is a
  // pass-through, so single-operator dev mode stays frictionless.
  const withAdminGate=(reason,fn)=>{requireAdminPin({reason,callbacks:{settings,pop,setPinModal,setPinVal},onApproved:fn});};
  const handleToCompliance=()=>{if((txItems||[]).length===0){pop("Add at least one item.","warn");return;}setTxStep(2);};
  // Phase 2.7.9a: gates the Payment → Compliance transition (step 2
  // → step 3 in the reordered flow). Drops the old kycDone block
  // because in the new flow KYC fields are collected AT step 3,
  // not before — step 3 is what we're trying to enter. The cash-
  // hardblock and $2k cash-warn PIN gates still apply.
  const handleToClient=()=>{if(compliance.flags.some(f=>f.key==="cash_shop_hardblock")){pop("Cash refused — exceeds shop hard limit. Switch to EFTPOS, card, or bank transfer.","err");return;}if(compliance.flags.some(f=>f.key==="cash_warn")){setPinModal({reason:"Cash transaction ≥ $2,000 — Admin acknowledgement required.",cb:()=>setTxStep(3)});setPinVal("");}else setTxStep(3);};

  // Phase 2.7.9b — async because we resolve the client linkage
  // (update existing or create new) before assembling the tx.
  // Failures during client linkage are swallowed: the
  // orphan-clientId rule (memory: project_phase_2_7_decisions.md)
  // says transactions can stand alone with the client snapshot in
  // tx.client even if no live client record exists. So a Supabase
  // hiccup at finalize doesn't block the tx; clientId may be null.
  const finalize=async()=>{
    if(!client.fullName||!client.dob||!client.address||!client.idType||!client.idNumber){pop("Client form incomplete.","err");return;}
    if(!idSighted){pop("Staff must confirm ID sighted.","err");return;}
    if(!privAck){pop("Client must acknowledge Privacy Notice.","err");return;}
    const now=nowISO(),realInv=makeInv();

    // Resolve client linkage. Three paths:
    //   1. selectedClientId set        → update existing client
    //                                     (txCount++, lastTxAt=now)
    //   2. no selectedClientId, but
    //      idNumber set                → dedupe by idNumber: if a
    //                                     client matches, update it;
    //                                     otherwise create new
    //   3. no selectedClientId, no
    //      idNumber                    → no client record; tx
    //                                     proceeds with clientId=null
    let clientId=selectedClientId;
    const recordFields=pickClientRecordFields({...client,idPhoto:photo||client.idPhoto||null});
    if(clientId){
      try{
        await clients.update(clientId,{...recordFields,txCount:(client.txCount||0)+1,lastTxAt:now});
      }catch(_){/* orphan-clientId acceptable */}
    }else if(client.idNumber){
      try{
        const r=await findOrCreateByIdNumber({...recordFields,createdAt:now,lastTxAt:now,txCount:1});
        if(r&&r.client){
          clientId=r.client.id;
          if(!r.created){
            // Found via idNumber dedupe — bump txCount on the
            // matched record so the lastTxAt + count stay fresh.
            try{await clients.update(clientId,{txCount:(r.client.txCount||0)+1,lastTxAt:now});}catch(_){}
          }
        }
      }catch(_){/* orphan-clientId acceptable */}
    }

    // Phase 2.7.9b — kycDone now computed from getRequiredFields
    // (was a user-toggled boolean in the old flow). Empty required-
    // field set or all required fields filled → kycDone=true.
    const reqFields=getRequiredFields({payment:txPay,buyTotal,items:txItems},settings);
    const computedKycDone=reqFields.length===0||reqFields.every(k=>{const v=client[k];return v!=null&&String(v).trim()!=="";});

    const phData={idPhoto:compliance.requiresKYC?photo:null,itemPhotos};
    const hasPh=!!(phData.idPhoto||Object.keys(phData.itemPhotos||{}).length);
    const photoKey=hasPh?"photos_"+realInv:null;
    if(hasPh)store.set(photoKey,phData);
    const tx={id:realInv,date:now,items:txItems,payment:txPay,buyTotal,sellTotal,net,client,clientId,staff,idSighted,photo:phData.idPhoto||null,itemPhotos:phData.itemPhotos||{},hasPhotos:hasPh,photoKey,kycDone:computedKycDone,flags:compliance.flags.map(f=>f.key),ttrRequired:compliance.flags.some(f=>f.key==="ttr"),ttrStatus:compliance.flags.some(f=>f.key==="ttr")?"PENDING":null,smrFlagged:!!staff.smrFlagged,deleteAfter:sevenYrsFrom(now)};
    const newStock=(txItems||[]).filter(i=>i.mode==="buy").map(i=>({id:uid(),txId:realInv,date:now,product:i.product,qty:i.qty,price:i.price,description:sS(i.note||i.product&&i.product.label),purity:i.purity||(i.product&&i.product.purity)||null,carat:i.carat||(i.product&&i.product.carat)||null,weight_g:i.weight_g||(i.product&&i.product.unit==="g"?i.qty:null),holdUntil:i.holdUntil,policeHold:!!i.policeHold,suspicious:!!i.suspicious,storageLocation:sS(staff.storageLocation),deleteAfter:sevenYrsFrom(now)}));
    setTxList(p=>[tx,...p].slice(0,500));setStock(p=>[...newStock,...p]);
    setTxNo(peekInv());setTxStep(6);
    pushIntegrations(settings,tx).then(msgs=>{if(msgs&&msgs.length)pop(msgs.join(" | ").slice(0,200),"ok");}).catch(()=>{});
  };

  const connectScale=async()=>{
    if(!navigator.bluetooth){pop("Web Bluetooth not supported. Use Chrome or Edge on Android.","err");return;}
    try{
      setScaleStatus("connecting");pop("Opening Bluetooth scanner…","ok");
      const proto=settings.scaleProtocol||"auto",optServices=[];
      if(proto==="auto"||proto==="standard")optServices.push(SCALE_STD_SVC);
      if(proto==="auto"||proto==="nordic_uart")optServices.push(NUS_SVC);
      if(proto==="custom"&&settings.scaleCustomServiceUUID)optServices.push(settings.scaleCustomServiceUUID.toLowerCase());
      const device=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:optServices});
      setScaleDevice(device);const server=await device.gatt.connect();let connected=false;
      if(proto==="auto"||proto==="standard"){try{const svc=await server.getPrimaryService(SCALE_STD_SVC);const ch=await svc.getCharacteristic(SCALE_STD_CHAR);await ch.startNotifications();ch.addEventListener("characteristicvaluechanged",e=>{const r=parseStdWeight(e.target.value);if(r)setScaleLive(r);});connected=true;setScaleStatus("connected");pop("Scale connected (Standard BLE).","ok");}catch(_){}}
      if((proto==="auto"||proto==="nordic_uart")&&!connected){try{const svc=await server.getPrimaryService(NUS_SVC);const tx=await svc.getCharacteristic(NUS_TX);await tx.startNotifications();let buf="";tx.addEventListener("characteristicvaluechanged",e=>{buf+=new TextDecoder().decode(e.target.value);if(buf.length>30){const r=parseAsciiWeight(buf);if(r)setScaleLive(r);buf="";}});connected=true;setScaleStatus("connected");pop("Scale connected (Nordic UART).","ok");}catch(_){}}
      if(!connected){setScaleStatus("error");pop("Connected but no scale service found. Try a different Protocol in Settings.","warn");}
      device.addEventListener("gattserverdisconnected",()=>{setScaleStatus("off");setScaleLive(null);setScaleDevice(null);});
    }catch(e){setScaleStatus("off");if(e.name!=="NotFoundError")pop("Scale: "+e.message,"err");}
  };
  const disconnectScale=()=>{if(scaleDevice&&scaleDevice.gatt&&scaleDevice.gatt.connected){try{scaleDevice.gatt.disconnect();}catch(_){}}setScaleStatus("off");setScaleDevice(null);setScaleLive(null);};

  const triggerDuress=async()=>{
    setDuressActive(true);
    let loc=sS(settings.address||settings.businessName||"Address not set");
    try{const pos=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{timeout:5000}));const la=pos.coords.latitude.toFixed(5),lo=pos.coords.longitude.toFixed(5);loc=sS(settings.address||"Our address")+" (GPS "+la+","+lo+")";}
    catch(_){try{const d=await(await fetch("https://ipapi.co/json/")).json();if(d.city)loc=sS(settings.address||"Our address")+" (approx "+d.city+", "+d.region+")";}catch(_){}}
    const msg="URGENT — Robbery/aggression at our shop. Call 000 immediately. Address: "+loc;
    const contacts=[1,2,3,4,5,6,7,8,9,10].map(n=>sS(settings["duressContact"+n]).trim()).filter(Boolean);
    let sent=0;for(const contact of contacts){const r=await sendDuressSMS(settings,contact,msg);if(r.ok)sent++;}
    pop("🚨 DURESS — "+sent+"/"+contacts.length+" contacts alerted. Call 000 NOW.","warn");
    setTimeout(()=>setDuressActive(false),5*60*1000);
  };

  const dlAccounting=()=>{
    const sp=spotForCalc();
    const sn=frozenSnap?"FROZEN "+frozenSnap.frozenAt+" Au:"+fmtAUD(frozenSnap.gSpot)+"/oz Ag:"+fmtAUD(frozenSnap.sSpot)+"/oz":"LIVE Au:"+fmtAUD(sp.g)+"/oz Ag:"+fmtAUD(sp.s)+"/oz";
    const esc=v=>{const str=sS(v).replace(/[\r\n]+/g," ");const Q='"';return Q+str.split(Q).join(Q+Q)+Q;};
    const csv=rows=>rows.map(r=>r.map(esc).join(",")).join("\n");
    const s1=[["TRANSACTION REGISTER"],["Spot: "+sn],["Invoice","Date","Client","Item","Metal","Purity","Wt(g)","Bought($)","Sold($)","Margin($)","GST","GST Est($)","Status"]];
    (txList||[]).forEach(tx=>(tx.items||[]).forEach(it=>{const b=it.mode==="buy"?sN(it.price):0,sv=it.mode==="sell"?sN(it.price):0,m=sv-b;const gst=it.gstApplicable===false?"GST-Free":it.gstScheme==="margin"?"Margin":"Standard 10%";const ge=it.gstApplicable===false?0:it.gstScheme==="margin"?Math.max(0,m/11):sv*0.1;s1.push([sS(tx.id),sS(tx.date&&tx.date.slice(0,10)),sS((tx.client&&tx.client.fullName)||"—"),sS((it.product&&it.product.label)||it.description||"—"),sS((it.product&&it.product.cat)||"—"),sS(it.purity||((it.product&&it.product.carat)&&it.product.carat+"ct")||"—"),sS(it.qty||"—"),b||"",sv||"",m||"",gst,ge.toFixed(2),tx.voided?"VOIDED":"OK"]);}));
    const s2=[["STOCK VALUATION"],["Spot: "+sn],["Item","Invoice","Metal","Purity","Wt(g)","Bought($)","Melt($)","P&L($)","GST","Days","Status"]];
    (stock||[]).filter(x=>!x.sold).forEach(s=>{const mv=calcMeltFn(s,frozenSnap,sp.g,sp.s),b=sN(s.price),d=s.date?Math.floor((Date.now()-new Date(s.date))/86400000):0;s2.push([sS(s.description||((s.product&&s.product.label))||"—"),sS(s.txId||"—"),sS((s.product&&s.product.cat)||"—"),sS(s.purity||"—"),sS(s.weight_g||"—"),b.toFixed(2),mv!=null?mv.toFixed(2):"—",mv!=null?(mv-b).toFixed(2):"—",s.gstApplicable===false?"GST-Free":"Taxable",d,s.policeHold?"POLICE HOLD":hoursLeft(s.holdUntil)>0?"In Hold":"Ready"]);});
    let tS=0,tP=0,tMG=0,tSG=0;
    (txList||[]).forEach(tx=>(tx.items||[]).forEach(it=>{if(it.mode==="sell"&&it.gstApplicable!==false){tS+=sN(it.price);if(it.gstScheme==="margin")tMG+=Math.max(0,(sN(it.price)-sN(it.boughtAt))/11);else tSG+=sN(it.price)*0.1;}if(it.mode==="buy")tP+=sN(it.price);}));
    const s3=[["GST SUMMARY"],["Period: "+(frozenSnap?frozenSnap.frozenAt:todayStr())],["Total Sales","$"+tS.toFixed(2)],["Total Purchases","$"+tP.toFixed(2)],["Standard GST (10%)","$"+tSG.toFixed(2)],["Margin Scheme GST","$"+tMG.toFixed(2)],["TOTAL GST (est)","$"+(tSG+tMG).toFixed(2)],["",""],["Estimate only — confirm with registered tax agent",""]];
    const s4=[["COMPLIANCE LOG"],["Invoice","Date","Client","TTR Status","SMR","KYC","Police Hold","Voided"]];
    (txList||[]).forEach(tx=>s4.push([sS(tx.id),sS(tx.date&&tx.date.slice(0,10)),sS((tx.client&&tx.client.fullName)||"—"),sS(tx.ttrStatus||"N/A"),tx.smrFlagged?"YES":"",tx.kycDone?"YES":"",(tx.items||[]).some(i=>i.policeHold)?"YES":"",tx.voided?"YES":""]));
    dlFile("LOOT LEDGR — ACCOUNTING EXPORT\nBusiness: "+sS(settings.businessName)+"  ABN: "+sS(settings.abn)+"\nExported: "+todayStr()+"  Spot: "+sn+"\n\n1. TRANSACTION REGISTER\n"+csv(s1)+"\n\n2. STOCK VALUATION\n"+csv(s2)+"\n\n3. GST SUMMARY\n"+csv(s3)+"\n\n4. COMPLIANCE LOG\n"+csv(s4),"lootledgr-accounting-"+todayStr()+".csv","text/csv");
    pop("Accounting export downloaded.","ok");
  };

  const dlBackup=()=>{dlFile(JSON.stringify({version:APP_VERSION,exportedAt:nowISO(),txList,stock,catalog,settings:{...settings,logoImg:null},vendors,staffList,blacklist,frozenSnap,spotLog},null,2),"lootledgr-backup-"+todayStr()+".json","application/json");pop("Backup downloaded.","ok");};
  const restoreBackup=file=>{const r=new FileReader();r.onload=ev=>{try{const d=JSON.parse(ev.target.result);if(!d.txList||!d.stock){pop("Invalid backup file.","err");return;}if(d.txList)setTxList(d.txList);if(d.stock)setStock(d.stock);if(d.catalog)setCatalog(d.catalog);if(d.vendors)setVendors(d.vendors);if(d.staffList)setStaffList(d.staffList);if(d.blacklist)setBlacklist(d.blacklist);if(d.frozenSnap)setFrozenSnap(d.frozenSnap);pop("Backup restored.","ok");}catch(e){pop("Restore failed: "+e.message,"err");}};r.readAsText(file);};
  const unlockApp=()=>{if(appPinInput===settings.staffPin){setAppUnlocked(true);store.set("sessionActive",true);store.set("sessionLast",Date.now());setAppPinInput("");}else pop("Incorrect PIN","err");};
  const resetTx=()=>{setTxItems([]);setTxStep(1);setTxPay("cash");setClient({});setSelectedClientId(null);setClientStep("search");setStaff({});setKycDone(false);setPrivAck(false);setIdSighted(false);setPhoto(null);setItemPhotos({});setTxNo(peekInv());setAddQty("");setAddCustom("");setAddNote("");};
  // TODO (briefing §9 Gap 8) — Police notice 21-day countdown.
  //   Today policeHold is binary. Per state law it has a 21-day default
  //   life with a single 21-day reissue (total 42). Replace this toggle
  //   with a modal capturing date received, expiry (auto +21d), and
  //   notice reference number. Stock card displays days remaining. The
  //   dashboard surfaces a banner at day-18, day-21 (expiring), day-42
  //   (reissue gone — sale unlocked unless court order recorded).
  //   Lands as a self-contained follow-up commit after Phase 2 modular
  //   split completes (touches stock schema + StockCard + dashboard).
  const togglePoliceHold=(id,val)=>setStock(p=>p.map(s=>s.id===id?{...s,policeHold:val}:s));
  const purge=()=>{const ex=(txList||[]).filter(t=>isExpired7yr(t.deleteAfter)),es=(stock||[]).filter(s=>isExpired7yr(s.deleteAfter));ex.forEach(t=>{if(t.photoKey)store.del(t.photoKey);});setTxList(p=>p.filter(t=>!isExpired7yr(t.deleteAfter)));setStock(p=>p.filter(s=>!isExpired7yr(s.deleteAfter)));pop(ex.length+es.length>0?"Purged "+ex.length+" tx + "+es.length+" stock items.":"Nothing to purge yet.","ok");};
  const dlTx=tx=>{const u=URL.createObjectURL(new Blob([makeTxt(tx)],{type:"text/plain"})),a=document.createElement("a");a.href=u;a.download=tx.id+"_"+sS(tx.client&&tx.client.fullName||"client").replace(/[^a-zA-Z0-9]/g,"_")+".txt";a.click();URL.revokeObjectURL(u);const ph=tx.photoKey?store.get(tx.photoKey,{}):{idPhoto:tx.idPhoto,itemPhotos:tx.itemPhotos};if(ph.idPhoto)setTimeout(()=>{const a2=document.createElement("a");a2.href=ph.idPhoto;a2.download=tx.id+"_id.jpg";a2.click();},300);if(ph.itemPhotos)Object.values(ph.itemPhotos).filter(Boolean).forEach((d,i)=>setTimeout(()=>{const a3=document.createElement("a");a3.href=d;a3.download=tx.id+"_item"+i+".jpg";a3.click();},(i+2)*300));};
  const dlBatch=()=>{const fr=cliFrom?new Date(cliFrom):new Date(0),to=cliTo?new Date(cliTo):new Date();to.setHours(23,59,59);const f=(txList||[]).filter(t=>{const d=new Date(t.date);return d>=fr&&d<=to;});if(!f.length){pop("No transactions in range.","warn");return;}f.forEach(dlTx);pop("Downloading "+f.length+" file(s).","ok");};
  const saveProdImpl=()=>{if(!newProd.label){pop("Product label required.","warn");return;}const prod={...newProd,id:(editProd&&editProd.id)||uid(),purity:newProd.purity!==""?parseFloat(newProd.purity):null,carat:newProd.carat!==""?parseFloat(newProd.carat):null,buyMult:newProd.buyMult!==""?parseFloat(newProd.buyMult):null,sellMult:newProd.sellMult!==""?parseFloat(newProd.sellMult):null,weightG:newProd.weightG!==""?parseFloat(newProd.weightG):null,buyMode:newProd.carat?"carat":null,active:true};if(editProd)setCatalog(prev=>prev.map(x=>x.id===editProd.id?prod:x));else setCatalog(prev=>[...prev,prod]);setEditProd(null);setNewProd({cat:"Other",sub:"",type:"scrap",unit:"g",purity:"",carat:"",label:"",buyMult:"",sellMult:"",weightG:"",active:true});pop("Product saved.","ok");};
  const deleteProdImpl=(id,label)=>{setCatalog(prev=>prev.filter(x=>x.id!==id));pop(sS(label)+" deleted.","ok");};
  // Phase 2.7 follow-up batch 2 — Admin-gated wrappers handed to
  // CatalogEditor in place of the raw saveProd / deleteProd. The
  // editor stays unchanged; the gate is applied here so only one
  // call site needs to know about it. Bypassed when requirePin is
  // off (see adminGate.js).
  const saveProd=()=>{if(!newProd.label){pop("Product label required.","warn");return;}withAdminGate((editProd?"Update product: ":"Add product: ")+sS(newProd.label),saveProdImpl);};
  const deleteProd=(id,label)=>{withAdminGate("Delete catalog product: "+sS(label),()=>deleteProdImpl(id,label));};
  const exportPayload=()=>({exported:nowISO(),spots:{goldAUD_oz:gSpot,silverAUD_oz:sSpot},prices:{goldPerGram:fmt2(gSpot/TROY_OZ),goldBuy999PerG:fmt2(gSpot/TROY_OZ*0.9),alluvialBuyPerG:fmt2(gSpot/TROY_OZ*0.9),silverPerGram:fmt2(sSpot/TROY_OZ)},recentTransactions:(txList||[]).slice(0,5).map(t=>({contractNo:t.id,date:t.date,buy:t.buyTotal,sell:t.sellTotal,net:t.net}))});

  const locked=settings.requirePin&&!appUnlocked;
  const NAV=[{id:"dashboard",icon:"⬡",label:"Dashboard"},{id:"newTx",icon:"＋",label:"New Tx"},{id:"stock",icon:"◈",label:"Stock"},{id:"history",icon:"☰",label:"History"},{id:"prices",icon:"⚖",label:"Prices"},{id:"clients",icon:"👤",label:"Clients"}];

  return (
    <div style={{fontFamily:T.ff,background:T.bg,minHeight:"100vh",color:T.text,paddingBottom:60,boxSizing:"border-box",fontSize:S?16:13,lineHeight:S?"1.6":"1.4"}}>
      {locked?(
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}>
          <div style={c.card({padding:32,maxWidth:320,width:"100%",textAlign:"center"})}>
            <div style={{fontSize:32,marginBottom:12}}>🔒</div>
            <div style={{fontSize:16,fontWeight:"bold",color:T.white,marginBottom:6}}>Loot Ledgr</div>
            <div style={{fontSize:12,color:T.muted,marginBottom:20}}>Enter PIN to continue</div>
            <input style={{...c.inp(),textAlign:"center",fontSize:22,letterSpacing:"0.3em",marginBottom:14}} type="password" maxLength={12} value={appPinInput} onChange={e=>setAppPinInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")unlockApp();}} placeholder="••••" autoFocus/>
            <button style={{...c.btn(T.gold,T.bg),width:"100%"}} onClick={unlockApp}>Unlock</button>
            {settings.adminRecoveryPassphraseHash&&<button style={{background:"none",border:"none",color:T.muted,fontSize:11,marginTop:14,cursor:"pointer",textDecoration:"underline"}} onClick={()=>setForgotPinOpen(true)}>Forgot PIN?</button>}
          </div>
          {forgotPinOpen&&<ForgotPin
            settings={settings}
            setSettings={setSettings}
            pop={pop}
            onClose={()=>setForgotPinOpen(false)}
            onUnlocked={()=>{setAppUnlocked(true);store.set("sessionActive",true);store.set("sessionLast",Date.now());setAppPinInput("");}}
          />}
        </div>
      ):(
      <div>
        <div style={{background:T.surface,borderBottom:"1px solid "+T.border,padding:"0 8px",display:"flex",alignItems:"center",justifyContent:"space-between",minHeight:50,position:"sticky",top:0,zIndex:100}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0,maxWidth:160}} onClick={()=>{setLogoPinMode(true);setLogoPinVal("");}}>
            <img src={settings.logoImg||SEED_LOGO} alt="logo" style={{width:34,height:34,borderRadius:"50%",objectFit:"contain",border:"2px solid "+T.gold,flexShrink:0,background:"#fff",padding:3,cursor:"pointer"}}/>
            <div style={{overflow:"hidden"}}>
              <div style={{fontSize:11,fontWeight:"bold",color:T.gold,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>Loot Ledger</div>
              <div style={{fontSize:7.5,color:T.muted,letterSpacing:"0.08em",textTransform:"uppercase",whiteSpace:"nowrap"}}>Compliance POS</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
            {[[T.goldBg,T.goldDim,T.gold,"Au",52,gSpot,setGSpotManual],[T.silverBg,T.silverDim,T.silver,"Ag",42,sSpot,setSSpotManual]].map(([bg,dim,col,lbl,w,val,setter])=>(
              <div key={lbl} style={{display:"flex",alignItems:"center",gap:2,background:bg,border:"1px solid "+dim+"44",borderRadius:5,padding:"2px 5px"}}>
                <span style={{fontSize:8,color:T.muted,flexShrink:0}}>{lbl}</span>
                <input style={{background:"transparent",border:"none",color:col,fontFamily:T.ff,fontSize:11,fontWeight:"bold",width:w,outline:"none",textAlign:"right"}} type="number" value={val} onChange={e=>setter(parseFloat(e.target.value)||0)}/>
              </div>
            ))}
            <span title={spotStatus==="live"?"Live: "+spotSource:spotStatus==="manual"?"Manual override":"No API"} style={{width:7,height:7,borderRadius:"50%",flexShrink:0,display:"inline-block",background:spotStatus==="live"?T.readyGreen:spotStatus==="manual"?T.gold:spotStatus==="off"?T.border:T.orange}}/>
            <button style={{...c.bsm(T.border),padding:"4px 8px",fontSize:11}} onClick={()=>setShowSet(true)}>⚙</button>
            <button style={{...c.bsm(T.border),padding:"4px 8px",fontSize:11}} onClick={()=>setShowApi(true)}>⇄</button>
          </div>
        </div>

        <div style={{padding:"18px 16px",paddingBottom:72}}>

          {screen==="dashboard"&&<Dashboard
            settings={settings} gSpot={gSpot} sSpot={sSpot}
            scaleStatus={scaleStatus} scaleDevice={scaleDevice} scaleLive={scaleLive}
            txList={txList} stock={stock} catalog={catalog}
            activeStaff={activeStaff} staffList={staffList}
            duressActive={duressActive}
            resetTx={resetTx} setScreen={setScreen}
            setShowEOD={setShowEOD} setShowVendors={setShowVendors} setShowStaff={setShowStaff} setShowBackup={setShowBackup} setShowPolice={setShowPolice}
            triggerDuress={triggerDuress}
          />}

          {screen==="newTx"&&<NewTx
            txStep={txStep} setTxStep={setTxStep}
            txItems={txItems} setTxItems={setTxItems}
            txPay={txPay} setTxPay={setTxPay}
            txNo={txNo}
            buyTotal={buyTotal} sellTotal={sellTotal} net={net}
            compliance={compliance}
            kycDone={kycDone} setKycDone={setKycDone}
            privAck={privAck} setPrivAck={setPrivAck}
            idSighted={idSighted} setIdSighted={setIdSighted}
            photo={photo} setPhoto={setPhoto}
            itemPhotos={itemPhotos} setItemPhotos={setItemPhotos}
            client={client} setClient={setClient}
            staff={staff} setStaff={setStaff}
            adjId={adjId} setAdjId={setAdjId} adjVal={adjVal} setAdjVal={setAdjVal}
            addId={addId} setAddId={setAddId}
            addQty={addQty} setAddQty={setAddQty}
            addCustom={addCustom} setAddCustom={setAddCustom}
            addNote={addNote} setAddNote={setAddNote}
            addMode={addMode} setAddMode={setAddMode}
            addProd={addProd} addUnit={addUnit} addQtyN={addQtyN} addCalc={addCalc}
            quickMode={quickMode} setQuickMode={setQuickMode}
            qf={qf} setQF={setQF}
            qmMode={qmMode} setQMMode={setQMMode}
            catalog={catalog} settings={settings} scaleStatus={scaleStatus} scaleLive={scaleLive} fileRef={fileRef}
            handleAddItem={handleAddItem} handleToCompliance={handleToCompliance} handleToClient={handleToClient}
            resetTx={resetTx} finalize={finalize}
            pop={pop}
            setShowFlag={setShowFlag} setShowCat={setShowCat} setScreen={setScreen}
            selectedClientId={selectedClientId} setSelectedClientId={setSelectedClientId}
            clientStep={clientStep} setClientStep={setClientStep}
            setPinModal={setPinModal} setPinVal={setPinVal} activeStaff={activeStaff}
          />}

          {screen==="stock"&&<Stock
            settings={settings} gSpot={gSpot} sSpot={sSpot} stock={stock} frozenSnap={frozenSnap}
            dlAccounting={dlAccounting} setPinModal={setPinModal} setFrozenSnap={setFrozenSnap} pop={pop}
            togglePoliceHold={togglePoliceHold} setPinVal={setPinVal} setStock={setStock}
            setEditStockId={setEditStockId} setEditStockVal={setEditStockVal}
          />}

          {screen==="clients"&&<Clients
            txList={txList}
            cliFrom={cliFrom} setCliFrom={setCliFrom} cliTo={cliTo} setCliTo={setCliTo} cliSearch={cliSearch} setCliSearch={setCliSearch}
            dlBatch={dlBatch} dlTx={dlTx} dlFile={dlFile}
            isBlacklistedName={isBlacklistedName} setBlacklist={setBlacklist}
            setCliNoteId={setCliNoteId} setCliNoteVal={setCliNoteVal}
            pop={pop}
            setPinModal={setPinModal} setPinVal={setPinVal} activeStaff={activeStaff}
            withAdminGate={withAdminGate}
          />}

          {screen==="history"&&<History
            txList={txList} histFilter={histFilter} setHistFilter={setHistFilter}
            setSelTx={setSelTx} setReceiptTx={setReceiptTx} setTxList={setTxList}
          />}

          {screen==="prices"&&<Prices
            settings={settings} setSettings={setSettings} gSpot={gSpot} sSpot={sSpot} catalog={catalog}
            spotStatus={spotStatus} spotSource={spotSource} apiError={apiError}
            manualTs={manualTs} MANUAL_TTL={MANUAL_TTL}
            setShowCat={setShowCat} setGSpotManual={setGSpotManual} setSSpotManual={setSSpotManual} forceResumeAPI={forceResumeAPI}
          />}
        </div>

        <div style={{position:"fixed",bottom:0,left:0,right:0,background:T.surface,borderTop:"1px solid "+T.border,display:"flex",zIndex:200}}>
          {NAV.map(n=><button key={n.id} onClick={()=>{if(n.id==="newTx")resetTx();setScreen(n.id);}} style={{flex:1,background:"transparent",border:"none",color:screen===n.id?T.gold:T.muted,fontFamily:T.ff,fontSize:9,cursor:"pointer",padding:"7px 4px",display:"flex",flexDirection:"column",alignItems:"center",gap:2,letterSpacing:"0.06em",textTransform:"uppercase"}}><span style={{fontSize:18}}>{n.icon}</span>{n.label}</button>)}
        </div>


        {showFlag&&<Modal title="🚩 Internal SMR Flag — CONFIDENTIAL" onClose={()=>setShowFlag(false)}>
          <div style={c.bnr("block")}>⚠️ TIPPING OFF IS A CRIMINAL OFFENCE. Do NOT inform the customer.</div>
          <div style={{fontSize:12,lineHeight:1.7,marginBottom:14}}>Document what raised your suspicion. For internal records and AUSTRAC only.</div>
          <F label="What did you observe?" value={flagNote} onChange={setFlagNote} as="textarea"/>
          <div style={{display:"flex",gap:10}}>
            <button style={c.btn(T.red,T.white)} onClick={()=>{setStaff(p=>({...p,smrNote:flagNote,smrFlagged:true}));setShowFlag(false);pop("SMR flag recorded internally.","warn");}}>Submit Internal Flag</button>
            <button style={c.bsm()} onClick={()=>setShowFlag(false)}>Cancel</button>
          </div>
        </Modal>}

        {pinModal&&<div style={{position:"fixed",inset:0,background:"#000000e0",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setPinModal(null)}>
          <div style={{...c.card({padding:24}),maxWidth:460,width:"100%"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:15,fontWeight:"bold",color:T.white,marginBottom:16}}>🔐 Admin Authorisation Required</div>
            <div style={{...c.bnr("warn"),marginBottom:16}}>{pinModal.reason}</div>
            <F label="Admin PIN" type="password" value={pinVal} onChange={setPinVal}/>
            <div style={{display:"flex",gap:10}}>
              <button style={c.btn(T.gold,T.bg)} onClick={submitPin}>Authorise</button>
              <button style={c.bsm()} onClick={()=>{setPinModal(null);setPinVal("");}}>Cancel</button>
            </div>
          </div>
        </div>}

        {selTx&&<Modal title={"Transaction — "+selTx.id} onClose={()=>setSelTx(null)} wide>
          <div style={c.g2(14)}>
            {[{l:"Date",v:fmtDate(selTx.date)},{l:"Client",v:selTx.client&&selTx.client.fullName,col:T.white},{l:"Buy Total",v:fmtAUD(selTx.buyTotal),col:T.green},{l:"Sell Total",v:fmtAUD(selTx.sellTotal),col:T.gold},{l:"Net",v:fmtAUD(Math.abs(selTx.net||0))+" "+(sN(selTx.net)>=0?"(client pays)":"(we pay)")},{l:"Payment",v:sS(selTx.payment).toUpperCase()},{l:"KYC",v:selTx.kycDone?"COMPLETED":"N/A",col:selTx.kycDone?T.green:T.muted},{l:"TTR",v:sS(selTx.ttrStatus||"N/A"),col:selTx.ttrRequired?T.red:T.muted},{l:"Delete After",v:fmtDate(selTx.deleteAfter),col:T.muted}].map(row=><div key={row.l}><div style={c.lbl}>{row.l}</div><div style={{color:row.col||T.text}}>{sS(row.v)}</div></div>)}
          </div>
          <div style={{marginTop:12,fontSize:11,color:T.muted}}>Items: {(selTx.items||[]).map(i=>sS(i.product&&i.product.label)+" ("+i.mode.toUpperCase()+")").join(", ")}</div>
          <div style={{marginTop:16,borderTop:"1px solid "+T.border,paddingTop:16}}>
            <div style={{fontSize:12,fontWeight:"bold",color:T.white,marginBottom:10}}>Photos</div>
            <TxPhotoManager selTx={selTx} store={store} setTxList={setTxList} setSelTx={setSelTx}/>
          </div>
          {selTx.ttrRequired&&selTx.ttrStatus!=="FILED"&&<button style={c.btn(T.green,T.bg,{marginTop:14})} onClick={()=>{setTxList(p=>p.map(t=>t.id===selTx.id?{...t,ttrStatus:"FILED"}:t));setSelTx(p=>({...p,ttrStatus:"FILED"}));pop("TTR marked as filed.","ok");}}>✓ Mark TTR Filed</button>}
        </Modal>}

        {receiptTx&&<Modal title="🧾 Receipt" onClose={()=>setReceiptTx(null)}>
          <pre style={{fontSize:11,fontFamily:"monospace",background:T.surface,padding:16,borderRadius:6,whiteSpace:"pre-wrap",color:T.text,marginBottom:14}}>{makeReceipt(receiptTx)}</pre>
          <div style={{display:"flex",gap:10}}>
            <button style={c.btn(T.gold,T.bg)} onClick={()=>dlFile(makeReceipt(receiptTx),"receipt-"+receiptTx.id+".txt","text/plain")}>⬇ Download</button>
            <button style={c.bsm()} onClick={()=>setReceiptTx(null)}>Close</button>
          </div>
        </Modal>}

        {showCat&&<CatalogEditor
          catalog={catalog}
          newProd={newProd} setNewProd={setNewProd}
          editProd={editProd} setEditProd={setEditProd}
          saveProd={saveProd} deleteProd={deleteProd}
          setShowCat={setShowCat}
        />}

        {showSet&&<Settings
          settings={settings} setSettings={setSettings}
          spotStatus={spotStatus} spotSource={spotSource} manualTs={manualTs} MANUAL_TTL={MANUAL_TTL}
          apiError={apiError} setApiError={setApiError} forceResumeAPI={forceResumeAPI}
          contrast={contrast} setContrast={setContrast}
          fontSize={fontSize} setFontSize={setFontSize}
          simp={simp} setSimp={setSimp}
          scaleStatus={scaleStatus} scaleDevice={scaleDevice}
          connectScale={connectScale} disconnectScale={disconnectScale}
          pop={pop}
          txList={txList} setTxList={setTxList} setStock={setStock} purge={purge}
          spotLog={spotLog} blacklist={blacklist} setBlacklist={setBlacklist}
          settingsOpen={settingsOpen} toggleSection={toggleSection}
          setShowSet={setShowSet} setAppUnlocked={setAppUnlocked}
          withAdminGate={withAdminGate}
        />}

        {showApi&&<ApiDiagnostics
          settings={settings}
          spotStatus={spotStatus} spotSource={spotSource}
          apiError={apiError} setApiError={setApiError} forceResumeAPI={forceResumeAPI}
          exportPayload={exportPayload} dlAccounting={dlAccounting} dlFile={dlFile}
          txList={txList} pop={pop} setShowApi={setShowApi}
        />}

        {showPolice&&<PoliceReport settings={settings} txList={txList} dlFile={dlFile} pop={pop} setShowPolice={setShowPolice}/>}

        {showEOD&&<EOD todayTxData={todayTxData} dlAccounting={dlAccounting} setShowEOD={setShowEOD}/>}

        {showVendors&&<Vendors
          vendors={vendors} setVendors={setVendors}
          vendorForm={vendorForm} setVendorForm={setVendorForm}
          editVendor={editVendor} setEditVendor={setEditVendor}
          pop={pop} setShowVendors={setShowVendors}
        />}

        {showStaff&&<Staff
          staffList={staffList} setStaffList={setStaffList}
          staffForm={staffForm} setStaffForm={setStaffForm}
          activeStaff={activeStaff} setActiveStaff={setActiveStaff}
          pop={pop} setShowStaff={setShowStaff}
          withAdminGate={withAdminGate}
        />}

        {cliNoteId&&<Modal title="📝 Client Note" onClose={()=>setCliNoteId(null)}>
          <F label="Note (internal — not shown to client)" value={cliNoteVal} onChange={setCliNoteVal} as="textarea"/>
          <div style={{display:"flex",gap:10}}>
            <button style={c.btn(T.gold)} onClick={()=>{setTxList(p=>p.map(t=>t.id===cliNoteId?{...t,clientNote:cliNoteVal}:t));setCliNoteId(null);pop("Note saved.","ok");}}>Save Note</button>
            <button style={c.bsm()} onClick={()=>setCliNoteId(null)}>Cancel</button>
          </div>
        </Modal>}

        {editStockId&&<Modal title="✎ Edit Stock Item" onClose={()=>setEditStockId(null)}>
          <div style={c.g2(10)}>
            <F label="Description" value={editStockVal.description||""} onChange={v=>setEditStockVal(p=>({...p,description:v}))}/>
            <F label="Weight (g)" value={editStockVal.weight_g||""} onChange={v=>setEditStockVal(p=>({...p,weight_g:v}))} type="number"/>
            <F label="Purity" value={editStockVal.purity||""} onChange={v=>setEditStockVal(p=>({...p,purity:v}))} placeholder="e.g. 18ct or 0.925"/>
            <F label="Storage Location" value={editStockVal.storageLocation||""} onChange={v=>setEditStockVal(p=>({...p,storageLocation:v}))}/>
            <F label="Price Paid ($)" value={editStockVal.price||""} onChange={v=>setEditStockVal(p=>({...p,price:v}))} type="number"/>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button style={c.btn(T.gold)} onClick={()=>withAdminGate("Edit stock item: "+sS(editStockVal.description||editStockId),()=>{setStock(p=>p.map(s=>s.id===editStockId?{...s,...editStockVal,weight_g:editStockVal.weight_g?parseFloat(editStockVal.weight_g):s.weight_g,price:editStockVal.price?parseFloat(editStockVal.price):s.price}:s));setEditStockId(null);pop("Stock item updated.","ok");})}>Save</button>
            <button style={c.bsm()} onClick={()=>setEditStockId(null)}>Cancel</button>
          </div>
        </Modal>}

        {showBackup&&<BackupRestore txList={txList} stock={stock} dlBackup={dlBackup} restoreBackup={restoreBackup} setShowBackup={setShowBackup}/>}

        <LogoManager
          settings={settings} setSettings={setSettings}
          logoLib={logoLib} setLogoLib={setLogoLib}
          logoDel={logoDel} setLogoDel={setLogoDel}
          pop={pop}
          logoPinMode={logoPinMode} setLogoPinMode={setLogoPinMode}
          withAdminGate={withAdminGate}
        />

        <Notif msg={notify&&notify.msg} type={notify&&notify.type} onClose={()=>setNotify(null)}/>
      </div>
      )}
    </div>
  );
}
