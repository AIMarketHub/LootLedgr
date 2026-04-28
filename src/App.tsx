// LOOT LEDGR v5 — Compliance POS . Gold & Silver . Australia
// AML/CTF Act 2006 (Cth) . SHD Act 1989 (Vic) . Privacy Act 1988 (Cth)
import React,{useState,useEffect,useRef,useMemo} from "react";
import {TROY_OZ,APP_VERSION,GOLD_P,SILV_P,DEFAULT_SETTINGS,ID_OPTIONS,SCALE_STD_SVC,SCALE_STD_CHAR,NUS_SVC,NUS_TX,SEED_LOGO} from "./lib/constants.js";
import {sN,sS,uid,fmt2,fmtAUD,fmtDate,addHours,hoursLeft,fmtHold,sevenYrsFrom,isExpired7yr,nowISO,todayStr,invDay,peekInv,makeInv,toGrams,parseStdWeight,parseAsciiWeight,fmtScaleWeight} from "./lib/utils.js";
import {store,sb,checkPhotoSize,initTxList} from "./lib/storage.js";
import {sendSquareSell,sendSquareBuy,sendShopifySell,sendShopifyBuy,sendEftpos,sendDuressSMS,pushIntegrations} from "./lib/integrations.js";
import {THRESH,STATE_INFO,PRIVACY_NOTICE,checkCompliance,calcUnitPrice,calcMeltFn,makeReceiptFn,makeTxt,genPoliceReport} from "./lib/compliance/index.js";
import {LIGHT,T,c} from "./theme.js";
import {Modal,F,SF,Notif,HoldTimer,AIGhost} from "./components/ui";
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
  const[settingsOpen,setSettingsOpen]=useState({spotfeed:false,appearance:true,business:false,scale:false,security:false,policehelp:false,compliance:false,crypto:false,ai:false,integrations:false});
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
  const MANUAL_TTL=5*60*1000; // 5 min manual override — API resumes quickly
  const isManualActive=()=>(Date.now()-manualTs.current)<MANUAL_TTL;

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
  const submitPin=()=>{if(!settings.staffPin){pop("No manager PIN set. Set one in Settings → Business.","warn");setPinModal(null);return;}if(pinVal===settings.staffPin){pinModal&&pinModal.cb&&pinModal.cb();setPinModal(null);setPinVal("");}else{pop("Incorrect PIN.","err");setPinVal("");}};
  const handleToCompliance=()=>{if((txItems||[]).length===0){pop("Add at least one item.","warn");return;}setTxStep(2);};
  const handleToClient=()=>{if(compliance.requiresKYC&&!kycDone){pop("KYC must be completed — AUSTRAC hard block.","err");return;}if(compliance.flags.some(f=>f.key==="cash_shop_hardblock")){pop("Cash refused — exceeds shop hard limit. Switch to EFTPOS, card, or bank transfer.","err");return;}if(compliance.flags.some(f=>f.key==="cash_warn")){setPinModal({reason:"Cash transaction ≥ $2,000 — Manager acknowledgement required.",cb:()=>setTxStep(3)});setPinVal("");}else setTxStep(3);};

  const finalize=()=>{
    if(!client.fullName||!client.dob||!client.address||!client.idType||!client.idNumber){pop("Client form incomplete.","err");return;}
    if(!idSighted){pop("Staff must confirm ID sighted.","err");return;}
    if(!privAck){pop("Client must acknowledge Privacy Notice.","err");return;}
    const now=nowISO(),realInv=makeInv();
    const phData={idPhoto:compliance.requiresKYC?photo:null,itemPhotos};
    const hasPh=!!(phData.idPhoto||Object.keys(phData.itemPhotos||{}).length);
    const photoKey=hasPh?"photos_"+realInv:null;
    if(hasPh)store.set(photoKey,phData);
    const tx={id:realInv,date:now,items:txItems,payment:txPay,buyTotal,sellTotal,net,client,staff,idSighted,photo:phData.idPhoto||null,itemPhotos:phData.itemPhotos||{},hasPhotos:hasPh,photoKey,kycDone,flags:compliance.flags.map(f=>f.key),ttrRequired:compliance.flags.some(f=>f.key==="ttr"),ttrStatus:compliance.flags.some(f=>f.key==="ttr")?"PENDING":null,smrFlagged:!!staff.smrFlagged,deleteAfter:sevenYrsFrom(now)};
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
  const resetTx=()=>{setTxItems([]);setTxStep(1);setTxPay("cash");setClient({});setStaff({});setKycDone(false);setPrivAck(false);setIdSighted(false);setPhoto(null);setItemPhotos({});setTxNo(peekInv());setAddQty("");setAddCustom("");setAddNote("");};
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
  const saveProd=()=>{if(!newProd.label){pop("Product label required.","warn");return;}const prod={...newProd,id:(editProd&&editProd.id)||uid(),purity:newProd.purity!==""?parseFloat(newProd.purity):null,carat:newProd.carat!==""?parseFloat(newProd.carat):null,buyMult:newProd.buyMult!==""?parseFloat(newProd.buyMult):null,sellMult:newProd.sellMult!==""?parseFloat(newProd.sellMult):null,weightG:newProd.weightG!==""?parseFloat(newProd.weightG):null,buyMode:newProd.carat?"carat":null,active:true};if(editProd)setCatalog(prev=>prev.map(x=>x.id===editProd.id?prod:x));else setCatalog(prev=>[...prev,prod]);setEditProd(null);setNewProd({cat:"Other",sub:"",type:"scrap",unit:"g",purity:"",carat:"",label:"",buyMult:"",sellMult:"",weightG:"",active:true});pop("Product saved.","ok");};
  const deleteProd=(id,label)=>{setCatalog(prev=>prev.filter(x=>x.id!==id));pop(sS(label)+" deleted.","ok");};
  const exportPayload=()=>({exported:nowISO(),spots:{goldAUD_oz:gSpot,silverAUD_oz:sSpot},prices:{goldPerGram:fmt2(gSpot/TROY_OZ),goldBuy999PerG:fmt2(gSpot/TROY_OZ*0.9),alluvialBuyPerG:fmt2(gSpot/TROY_OZ*0.9),silverPerGram:fmt2(sSpot/TROY_OZ)},recentTransactions:(txList||[]).slice(0,5).map(t=>({contractNo:t.id,date:t.date,buy:t.buyTotal,sell:t.sellTotal,net:t.net}))});

  const locked=settings.requirePin&&!appUnlocked;
  const NAV=[{id:"dashboard",icon:"⬡",label:"Dashboard"},{id:"newTx",icon:"＋",label:"New Tx"},{id:"stock",icon:"◈",label:"Stock"},{id:"history",icon:"☰",label:"History"},{id:"prices",icon:"⚖",label:"Prices"},{id:"clients",icon:"👤",label:"Clients"}];
  const ABTN={width:"100%",background:"none",border:"none",padding:"12px 0",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:T.gold,fontWeight:"bold",fontSize:12,letterSpacing:"0.06em",textAlign:"left"};

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

  return (
    <div style={{fontFamily:T.ff,background:T.bg,minHeight:"100vh",color:T.text,paddingBottom:60,boxSizing:"border-box",fontSize:S?16:13,lineHeight:S?"1.6":"1.4"}}>
      {locked?(
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh"}}>
          <div style={c.card({padding:32,maxWidth:320,width:"100%",textAlign:"center"})}>
            <div style={{fontSize:32,marginBottom:12}}>🔒</div>
            <div style={{fontSize:16,fontWeight:"bold",color:T.white,marginBottom:6}}>Loot Ledgr</div>
            <div style={{fontSize:12,color:T.muted,marginBottom:20}}>Enter PIN to continue</div>
            <input style={{...c.inp(),textAlign:"center",fontSize:22,letterSpacing:"0.3em",marginBottom:14}} type="password" maxLength={8} value={appPinInput} onChange={e=>setAppPinInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")unlockApp();}} placeholder="••••" autoFocus/>
            <button style={{...c.btn(T.gold,T.bg),width:"100%"}} onClick={unlockApp}>Unlock</button>
          </div>
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
          />}

          {screen==="history"&&<History
            txList={txList} histFilter={histFilter} setHistFilter={setHistFilter}
            setSelTx={setSelTx} setReceiptTx={setReceiptTx} setTxList={setTxList}
          />}

          {screen==="prices"&&<Prices
            settings={settings} gSpot={gSpot} sSpot={sSpot} catalog={catalog}
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
            <div style={{fontSize:15,fontWeight:"bold",color:T.white,marginBottom:16}}>🔐 Manager Authorisation Required</div>
            <div style={{...c.bnr("warn"),marginBottom:16}}>{pinModal.reason}</div>
            <F label="Manager PIN" type="password" value={pinVal} onChange={setPinVal}/>
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

        {showCat&&<Modal title="Product Catalog Editor" onClose={()=>setShowCat(false)} wide>
          <div style={{marginBottom:18}}>
            <div style={{fontSize:12,fontWeight:"bold",color:T.white,marginBottom:12}}>{editProd?"Edit Product":"Add New Product"}</div>
            <div style={c.g2(10)}>
              <F label="Product Label" required value={newProd.label} onChange={v=>setNewProd(p=>({...p,label:v}))}/>
              <SF label="Category" value={newProd.cat} onChange={v=>setNewProd(p=>({...p,cat:v}))} options={["Gold","Silver","Other"].map(x=>({value:x,label:x}))}/>
              <SF label="Compliance Type" value={newProd.type} onChange={v=>setNewProd(p=>({...p,type:v}))} options={[{value:"bullion",label:"Bullion ($5k CDD)"},{value:"scrap",label:"Scrap / Jewellery ($10k)"},{value:"other",label:"Other"}]}/>
              <SF label="Unit" value={newProd.unit} onChange={v=>setNewProd(p=>({...p,unit:v}))} options={[{value:"g",label:"Grams (g)"},{value:"oz",label:"Troy oz"},{value:"pc",label:"Piece (pc)"}]}/>
              <F label="Purity (0–1, e.g. 0.999)" value={newProd.purity} onChange={v=>setNewProd(p=>({...p,purity:v}))} placeholder="e.g. 0.999"/>
              <F label="Carat (scrap gold only)" value={newProd.carat} onChange={v=>setNewProd(p=>({...p,carat:v}))} placeholder="e.g. 18"/>
              <F label="Fixed Weight g (for coins)" value={newProd.weightG} onChange={v=>setNewProd(p=>({...p,weightG:v}))} placeholder="e.g. 31.1"/>
              <F label="Buy Multiplier" value={newProd.buyMult} onChange={v=>setNewProd(p=>({...p,buyMult:v}))} placeholder="e.g. 0.95"/>
              <F label="Sell Multiplier" value={newProd.sellMult} onChange={v=>setNewProd(p=>({...p,sellMult:v}))} placeholder="e.g. 1.35"/>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button style={c.btn(T.gold)} onClick={saveProd}>Save</button>
              {editProd&&<button style={c.bsm()} onClick={()=>{setEditProd(null);setNewProd({cat:"Other",sub:"",type:"scrap",unit:"g",purity:"",carat:"",label:"",buyMult:"",sellMult:"",weightG:"",active:true});}}>Cancel Edit</button>}
            </div>
          </div>
          <div style={{borderTop:"1px solid "+T.border,paddingTop:14}}>
            <div style={{fontSize:12,fontWeight:"bold",color:T.white,marginBottom:10}}>All Products ({(catalog||[]).length})</div>
            {(catalog||[]).length===0?<div style={{color:T.muted,padding:16,textAlign:"center"}}>No products yet. Add one above.</div>
              :(catalog||[]).map(p=><div key={p.id} style={{background:T.surface,border:"1px solid "+T.border,borderRadius:8,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:"bold",color:T.white,fontSize:13}}>{p.label}</div>
                  <div style={{fontSize:11,color:T.muted}}>{p.cat} · {p.type} · {p.unit}{p.carat?" · "+p.carat+"ct":p.purity?" · "+(sN(p.purity)*100).toFixed(0)+"%":""}</div>
                  <div style={{fontSize:11,color:T.muted}}>Buy: {p.buyMult!=null?p.buyMult+"×":"custom"} · Sell: {p.sellMult!=null?p.sellMult+"×":"custom"}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <button style={c.bsm()} onClick={()=>{setEditProd(p);setNewProd({...p,purity:p.purity!=null?String(p.purity):"",carat:p.carat!=null?String(p.carat):"",buyMult:p.buyMult!=null?String(p.buyMult):"",sellMult:p.sellMult!=null?String(p.sellMult):"",weightG:p.weightG!=null?String(p.weightG):""})}}>✎ Edit</button>
                  <button style={c.bsm(T.redBg,T.red)} onClick={()=>deleteProd(p.id,p.label)}>🗑</button>
                </div>
              </div>)}
          </div>
        </Modal>}

        {showSet&&<Modal title="⚙ Settings" onClose={()=>{setAppUnlocked(!settings.requirePin);if(settings.requirePin)store.set("sessionActive",false);setShowSet(false);}} wide>
          {[
            ["spotfeed","📡 Spot Feed — API Keys",<div style={{paddingBottom:14}}>
              <div style={{fontSize:10,color:T.muted,marginBottom:10}}>Priority: GoldAPI.io → Metals-API → Metals.Dev. All free. Manual override in Prices tab is valid for 60 min.</div>
              <div style={c.g2(10)}>
                <F label="1. GoldAPI.io key (primary)" value={settings.goldApiKey} onChange={v=>setSettings(p=>({...p,goldApiKey:v}))} placeholder="goldapi-xxxxxxxx"/>
                <F label="2. Metals-API key (fallback)" value={settings.metalsApiKey||""} onChange={v=>setSettings(p=>({...p,metalsApiKey:v}))} placeholder="from metals-api.com"/>
                <F label="3. Metals.Dev key (fallback)" value={settings.metalsDevKey||""} onChange={v=>setSettings(p=>({...p,metalsDevKey:v}))} placeholder="from metals.dev"/>
              </div>
              <div style={{display:"flex",gap:10,marginTop:10}}>
                <div style={{flex:1}}><label style={c.lbl}>Gold alert ≥ (AUD/oz)</label><input style={c.inp()} type="number" placeholder="e.g. 5000" value={settings.goldAlert||""} onChange={e=>setSettings(p=>({...p,goldAlert:e.target.value||null}))}/></div>
                <div style={{flex:1}}><label style={c.lbl}>Silver alert ≥ (AUD/oz)</label><input style={c.inp()} type="number" placeholder="e.g. 60" value={settings.silverAlert||""} onChange={e=>setSettings(p=>({...p,silverAlert:e.target.value||null}))}/></div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginTop:12,padding:"10px 12px",borderRadius:6,background:T.surface}}>
                <span style={{fontSize:11,flex:1,color:spotStatus==="live"?T.readyGreen:spotStatus==="manual"?T.gold:T.orange}}>{spotStatus==="live"?"🟢 Live — "+spotSource:spotStatus==="manual"?(()=>{const m=Math.max(0,Math.ceil((MANUAL_TTL-(Date.now()-manualTs.current))/60000));return "🟡 Manual — "+m+" min remaining";})():"🟠 No API feed"}</span>
                <button style={c.btn(spotStatus==="manual"?T.gold:T.border,spotStatus==="manual"?T.bg:T.muted,{fontSize:11,padding:"7px 16px"})} onClick={forceResumeAPI}>↺ {spotStatus==="manual"?"Resume API":"Refresh"}</button>
              {apiError&&<div style={{background:"#2a0a0a",border:"1px solid #cc3333",borderRadius:6,padding:"10px 14px",marginTop:8,fontSize:12,color:"#ff6666",wordBreak:"break-word"}}><strong>API Error:</strong> {apiError}<button style={{marginLeft:10,background:"none",border:"none",color:"#ff6666",cursor:"pointer",fontSize:11}} onClick={()=>setApiError("")}>✕</button></div>}
              </div>
            </div>],
            ["business","🏪 Business Details",<div style={{paddingBottom:14}}>
              <div style={c.g2(10)}>
                <F label="Business Name" value={settings.businessName} onChange={v=>setSettings(p=>({...p,businessName:v}))}/>
                <F label="ABN" value={settings.abn} onChange={v=>setSettings(p=>({...p,abn:v}))}/>
                <F label="Address" value={settings.address} onChange={v=>setSettings(p=>({...p,address:v}))}/>
                <F label="Phone" value={settings.phone} onChange={v=>setSettings(p=>({...p,phone:v}))}/>
                <F label="Staff / Manager PIN" type="password" value={settings.staffPin} onChange={v=>setSettings(p=>({...p,staffPin:v}))}/>
                <F label="Dealer Licence No" value={settings.dealerLicenceNo||""} onChange={v=>setSettings(p=>({...p,dealerLicenceNo:v}))} placeholder="e.g. SHD1234"/>
                <F label="Police Station Name" value={settings.policeStation||""} onChange={v=>setSettings(p=>({...p,policeStation:v}))} placeholder="e.g. Ballarat Police Station"/>
                <F label="Police Station Email" value={settings.policeEmail||""} onChange={v=>setSettings(p=>({...p,policeEmail:v}))} placeholder="ballaratcid@police.vic.gov.au"/>
                <SF label="State / Territory" value={settings.state||"VIC"} onChange={v=>setSettings(p=>({...p,state:v}))} options={["VIC","NSW","QLD","SA","WA","NT","ACT","TAS"].map(x=>({value:x,label:x}))}/>
              </div>
            </div>],
            ["appearance","🎨 Appearance",<div style={{paddingBottom:14}}>
              <div style={{marginBottom:16}}>
                <label style={c.lbl}>Contrast: {contrast>0?"+":""}{contrast}</label>
                <input type="range" min="-5" max="5" step="1" value={contrast} onChange={e=>setContrast(Number(e.target.value))} style={{width:"100%"}}/>
              </div>
              <div style={{marginBottom:16}}>
                <label style={c.lbl}>Font Size: {fontSize}px</label>
                <input type="range" min="12" max="24" step="1" value={fontSize} onChange={e=>setFontSize(Number(e.target.value))} style={{width:"100%"}}/>
              </div>
              <div style={{marginBottom:16}}>
                <label style={c.lbl}>Simplified View</label>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12}}><input type="checkbox" checked={simp} onChange={e=>setSimp(e.target.checked)}/>Larger text, simplified controls</label>
              </div>
            </div>],
            ["scale","⚖ Bluetooth Scale",<div style={{paddingBottom:14}}>
              <div style={{display:"flex",gap:10,marginBottom:14}}>
                {scaleStatus==="connected"?<button style={c.btn(T.red,T.white)} onClick={disconnectScale}>Disconnect Scale</button>:<button style={c.btn(T.gold,T.bg)} onClick={connectScale}>Connect Scale</button>}
                <span style={{fontSize:11,color:scaleStatus==="connected"?T.green:T.muted,padding:"8px 0"}}>{scaleStatus==="connected"?"● "+sS(scaleDevice&&scaleDevice.name||"Connected"):scaleStatus==="connecting"?"Connecting…":"Not connected"}</span>
              </div>
              <SF label="Protocol" value={settings.scaleProtocol||"auto"} onChange={v=>setSettings(p=>({...p,scaleProtocol:v}))} options={[{value:"auto",label:"Auto-detect (try both)"},{value:"standard",label:"Standard BLE Weight Scale"},{value:"nordic_uart",label:"Nordic UART (NUS)"},{value:"custom",label:"Custom UUID"}]}/>
              {settings.scaleProtocol==="custom"&&<div style={c.g2(10)}><F label="Service UUID" value={settings.scaleCustomServiceUUID||""} onChange={v=>setSettings(p=>({...p,scaleCustomServiceUUID:v}))}/><F label="Characteristic UUID" value={settings.scaleCustomCharUUID||""} onChange={v=>setSettings(p=>({...p,scaleCustomCharUUID:v}))}/></div>}
              <SF label="Display Unit" value={settings.scaleUnit||"g"} onChange={v=>setSettings(p=>({...p,scaleUnit:v}))} options={[{value:"g",label:"Grams (g)"},{value:"ozt",label:"Troy oz (ozt)"},{value:"oz",label:"Avoirdupois oz"}]}/>
            </div>],
            ["security","🔒 Security",<div style={{paddingBottom:14}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,marginBottom:14}}><input type="checkbox" checked={!!settings.requirePin} onChange={e=>setSettings(p=>({...p,requirePin:e.target.checked}))}/>Require PIN to open app</label>
              <SF label="Session Timeout" value={settings.sessionTimeout||"never"} onChange={v=>setSettings(p=>({...p,sessionTimeout:v}))} options={[{value:"never",label:"Never (stay logged in)"},{value:"1h",label:"1 hour"},{value:"8h",label:"8 hours"},{value:"close",label:"Every time app closes"}]}/>
            </div>],
            ["policehelp","🆘 Police Help — Duress Alerts",<div style={{paddingBottom:14}}>
              <div style={c.bnr("warn")}>The POLICE HELP button on the dashboard sends silent SMS alerts to all configured contacts. Never disclose this to potential offenders.</div>
              <SF label="SMS Provider" value={settings.smsProvider||"sms_uri"} onChange={v=>setSettings(p=>({...p,smsProvider:v}))} options={[{value:"textbelt",label:"Textbelt (1 free/day, then paid)"},{value:"webhook",label:"Webhook (Make / Zapier)"},{value:"twilio_fn",label:"Twilio Function"},{value:"sms_uri",label:"SMS App (opens on device)"}]}/>
              {settings.smsProvider==="textbelt"&&<F label="Textbelt API Key" value={settings.textbeltKey||"textbelt"} onChange={v=>setSettings(p=>({...p,textbeltKey:v}))} note="'textbelt' = 1 free SMS/day. Buy a key at textbelt.com for more."/>}
              {settings.smsProvider==="webhook"&&<F label="Webhook URL" value={settings.duressWebhookUrl||""} onChange={v=>setSettings(p=>({...p,duressWebhookUrl:v}))} placeholder="https://hook.make.com/…"/>}
              {settings.smsProvider==="twilio_fn"&&<F label="Twilio Function URL" value={settings.twilioFnUrl||""} onChange={v=>setSettings(p=>({...p,twilioFnUrl:v}))} placeholder="https://…twil.io/…"/>}
              <div style={{fontSize:11,fontWeight:"bold",color:T.white,marginTop:14,marginBottom:8}}>Emergency Contacts (up to 10)</div>
              <div style={c.g2(8)}>
                {[1,2,3,4,5,6,7,8,9,10].map(n=><F key={n} label={"Contact "+n} value={settings["duressContact"+n]||""} onChange={v=>setSettings(p=>({...p,["duressContact"+n]:v}))} placeholder="+61400000000"/>)}
              </div>
              <button style={c.btn(T.border,T.text,{fontSize:11,marginTop:10})} onClick={async()=>{const contacts=[1,2,3,4,5,6,7,8,9,10].map(n=>sS(settings["duressContact"+n]).trim()).filter(Boolean);if(!contacts.length){pop("No contacts configured.","warn");return;}const r=await sendDuressSMS(contacts[0],"LOOT LEDGR — Test alert from duress system. If received, system is working.");pop(r.msg,r.ok?"ok":"err");}}>Test SMS to Contact 1</button>
            </div>],
            ["compliance","📋 Compliance — TTR",<div style={{paddingBottom:14}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12}}><input type="checkbox" checked={settings.ttrEnabled!==false} onChange={e=>setSettings(p=>({...p,ttrEnabled:e.target.checked}))}/>Enable TTR check at $10,000 cash threshold</label>
              <div style={{fontSize:10,color:T.muted,marginTop:8,marginBottom:14}}>Disabling TTR check does NOT remove your legal obligation to file Threshold Transaction Reports with AUSTRAC. Only disable if your business is exempt.</div>
              <F label="Refuse cash transactions at or above (AUD)" type="number" value={settings.cashHardBlockAbove==null?"":String(settings.cashHardBlockAbove)} onChange={v=>setSettings(p=>({...p,cashHardBlockAbove:v===""?null:parseFloat(v)}))} placeholder="Leave blank for no extra block"/>
              <div style={{fontSize:10,color:T.muted,marginTop:6}}>Stricter than the legal minimum. When set, the system refuses cash payment for any transaction whose buy total is at or above this amount, regardless of bullion or TTR status. Leave blank to fall back to AUSTRAC thresholds only ($2k warn, $5k bullion CDD, $10k TTR).</div>
            </div>],
            ["crypto","₿ Cryptocurrency Payments",<div style={{paddingBottom:14}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,marginBottom:14}}><input type="checkbox" checked={!!settings.cryptoEnabled} onChange={e=>setSettings(p=>({...p,cryptoEnabled:e.target.checked}))}/>Enable cryptocurrency payment option</label>
              {settings.cryptoEnabled&&<div style={c.g2(10)}>
                {[{k:"walletBTC",l:"Bitcoin (BTC)"},{k:"walletETH",l:"Ethereum (ETH)"},{k:"walletBNB",l:"Binance BEP-2 (BNB)"},{k:"walletXRP",l:"Ripple (XRP)"},{k:"walletSOL",l:"Solana (SOL)"}].map(w=><F key={w.k} label={w.l} value={settings[w.k]||""} onChange={v=>setSettings(p=>({...p,[w.k]:v}))} placeholder="Wallet address…"/>)}
              </div>}
            </div>],
            ["ai","🤖 AI Agent",<div style={{paddingBottom:14}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,marginBottom:14}}><input type="checkbox" checked={!!settings.aiAgentEnabled} onChange={e=>setSettings(p=>({...p,aiAgentEnabled:e.target.checked}))}/>Enable AI Agent indicator</label>
              {settings.aiAgentEnabled&&<div style={c.g2(10)}>
                <F label="Agent Name" value={settings.aiAgentName||"Sophiie"} onChange={v=>setSettings(p=>({...p,aiAgentName:v}))}/>
                <F label="Agent URL" value={settings.aiAgentUrl||""} onChange={v=>setSettings(p=>({...p,aiAgentUrl:v}))} placeholder="https://…"/>
                <SF label="Level" value={String(settings.aiAgentLevel||1)} onChange={v=>setSettings(p=>({...p,aiAgentLevel:parseInt(v)}))} options={[{value:"1",label:"1 — Listening (blue)"},{value:"2",label:"2 — Autonomous (amber)"}]}/>
              </div>}
            </div>],
            ["integrations","🔗 Integrations",<div style={{paddingBottom:14}}>
              <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10}}>EFTPOS Terminal</div>
              <SF label="Provider" value={settings.eftposProvider||"none"} onChange={v=>setSettings(p=>({...p,eftposProvider:v}))} options={[{value:"none",label:"None / Manual"},{value:"square",label:"Square Terminal"},{value:"linkly",label:"Linkly / PC-EFTPOS"}]}/>
              {settings.eftposProvider==="square"&&<F label="Square Terminal Device ID" value={settings.squareTerminalId||""} onChange={v=>setSettings(p=>({...p,squareTerminalId:v}))}/>}
              {settings.eftposProvider==="linkly"&&<F label="Linkly Base URL" value={settings.linklyBaseUrl||"http://localhost:4242"} onChange={v=>setSettings(p=>({...p,linklyBaseUrl:v}))}/>}
              <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,marginTop:14}}>Square API</div>
              <div style={c.g2(10)}>
                <F label="Access Token" type="password" value={settings.squareToken||""} onChange={v=>setSettings(p=>({...p,squareToken:v}))} placeholder="EAAAl…"/>
                <F label="Location ID" value={settings.squareLoc||""} onChange={v=>setSettings(p=>({...p,squareLoc:v}))}/>
                <F label="Redirect URL (after checkout)" value={settings.squareRedirect||""} onChange={v=>setSettings(p=>({...p,squareRedirect:v}))} placeholder="https://lootledgr.netlify.app"/>
              </div>
              <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,marginTop:14}}>Shopify</div>
              <div style={c.g2(10)}>
                <F label="Store Domain" value={settings.shopifyDomain||""} onChange={v=>setSettings(p=>({...p,shopifyDomain:v}))} placeholder="yourstore.myshopify.com"/>
                <F label="Admin API Token" type="password" value={settings.shopifyToken||""} onChange={v=>setSettings(p=>({...p,shopifyToken:v}))}/>
              </div>
              <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,marginTop:14}}>Webhook</div>
              <F label="Webhook URL (POST on every transaction)" value={settings.webhookUrl||""} onChange={v=>setSettings(p=>({...p,webhookUrl:v}))} placeholder="https://hook.make.com/…"/>
            </div>],
          ].map(([key,title,content])=>(
            <div key={key} style={{borderBottom:"1px solid "+T.border}}>
              <button style={ABTN} onClick={()=>toggleSection(key)}><span>{title}</span><span style={{fontSize:16,color:T.muted}}>{settingsOpen[key]?"▲":"▾"}</span></button>
              {settingsOpen[key]&&content}
            </div>
          ))}
          <div style={{marginTop:14,borderTop:"2px solid "+T.border,paddingTop:14}}>
            <div style={{fontSize:11,fontWeight:"bold",color:T.red,marginBottom:10}}>⚠ Danger Zone</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button style={c.bsm(T.redBg,T.red)} onClick={()=>{if(window.confirm&&!window.confirm("Clear all transactions and stock? This cannot be undone."))return;setTxList([]);setStock([]);pop("All data cleared.","warn");}}>🗑 Clear All Data</button>
              <button style={c.bsm(T.border,T.muted)} onClick={purge}>🧹 Purge Expired (7yr)</button>
            </div>
            <div style={{marginTop:14}}>
              <div style={{fontSize:11,fontWeight:"bold",color:T.white,marginBottom:8}}>Spot Price History (last 90)</div>
              {(spotLog||[]).slice(0,10).map((e,i)=><div key={i} style={{fontSize:10,color:T.muted,marginBottom:2}}>{sS(e.t).slice(0,16)} Au {fmtAUD(e.g)} Ag {fmtAUD(e.s)} [{sS(e.src)}]</div>)}
            </div>
            <div style={{marginTop:14}}>
              <div style={{fontSize:11,fontWeight:"bold",color:T.white,marginBottom:8}}>Blacklist ({(blacklist||[]).length})</div>
              {(blacklist||[]).map((b,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,marginBottom:4}}><span>{sS(b.name)}</span><button style={c.bsm(T.border,T.muted)} onClick={()=>setBlacklist(p=>p.filter((_,j)=>j!==i))}>Remove</button></div>)}
            </div>
            <div style={{marginTop:14,fontSize:10,color:T.muted}}>Loot Ledgr v{APP_VERSION} · github.com/AIMarketHub/LootLedgr · lootledgr.netlify.app</div>
          </div>
        </Modal>}

        {showApi&&<Modal title="⇄ API & Diagnostics" onClose={()=>setShowApi(false)} wide>
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
              <button style={c.btn(T.gold,T.bg)} onClick={dlAccounting}>📊 Accounting CSV</button>
              <button style={c.bsm(T.border,T.muted)} onClick={()=>{const rows=[["Invoice","Date","Client","Buy","Sell","Net","Payment","KYC","TTR","SMR"]];(txList||[]).forEach(t=>rows.push([sS(t.id),sS(t.date&&t.date.slice(0,10)),sS(t.client&&t.client.fullName),sS(t.buyTotal),sS(t.sellTotal),sS(t.net),sS(t.payment),t.kycDone?"YES":"",t.ttrRequired?"YES":"",t.smrFlagged?"YES":""]));const Q='"';const esc=v=>Q+sS(v).replace(/"/g,Q+Q)+Q;dlFile(rows.map(r=>r.map(esc).join(",")).join("\n"),"lootledgr-tx-"+todayStr()+".csv","text/csv");pop("TX CSV exported.","ok");}}>⬇ TX CSV</button>
            </div>
          </div>
        </Modal>}

        {showPolice&&<Modal title="🚔 Police Report Generator" onClose={()=>setShowPolice(false)} wide>
          {(()=>{
            const[dateFrom,setDateFrom]=React.useState(new Date(Date.now()-7*86400000).toISOString().slice(0,10));
            const[dateTo,setDateTo]=React.useState(new Date().toISOString().slice(0,10));
            const[suspicious,setSuspicious]=React.useState(false);
            const sc=settings.state||"VIC";const st=STATE_INFO[sc]||STATE_INFO.VIC;
            return <div>
              <div style={{...c.card({padding:12}),marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:8}}>State: {st.name}</div>
                <div style={{fontSize:11,color:T.muted,marginBottom:4}}>Governing Act: {st.act}</div>
                <div style={{fontSize:11,color:T.muted,marginBottom:4}}>Hold Period: {st.hold}</div>
                <div style={{fontSize:11,color:T.muted}}>{st.note}</div>
              </div>
              <div style={c.g2(10)}>
                <F label="From" type="date" value={dateFrom} onChange={setDateFrom}/>
                <F label="To" type="date" value={dateTo} onChange={setDateTo}/>
              </div>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,marginBottom:14}}><input type="checkbox" checked={suspicious} onChange={e=>setSuspicious(e.target.checked)}/>Only include SMR-flagged transactions</label>
              <div style={{display:"flex",gap:10}}>
                <button style={c.btn(T.gold,T.bg)} onClick={()=>{const csv=genPoliceReport(new Date(dateFrom),new Date(dateTo),suspicious,sc,txList,settings);dlFile(csv,"police-report-"+todayStr()+".csv","text/csv");pop("Police report downloaded.","ok");}}>⬇ Download Report CSV</button>
                <button style={c.bsm()} onClick={()=>{const csv=genPoliceReport(new Date(dateFrom),new Date(dateTo),suspicious,sc,txList,settings);const subject="Secondhand Dealer Transaction Report — "+sS(settings.businessName);window.location.href="mailto:"+(settings.policeEmail||st.defaultEmail)+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent("Please find attached the transaction register.\n\nBusiness: "+sS(settings.businessName)+"\nABN: "+sS(settings.abn)+"\nLicence: "+sS(settings.dealerLicenceNo));pop("Email client opened.","ok");}}>✉ Email to Station</button>
              </div>
            </div>;
          })()}
        </Modal>}

        {showEOD&&<EOD todayTxData={todayTxData} dlAccounting={dlAccounting} setShowEOD={setShowEOD}/>}

        {showVendors&&<Vendors
          vendors={vendors} setVendors={setVendors}
          vendorForm={vendorForm} setVendorForm={setVendorForm}
          editVendor={editVendor} setEditVendor={setEditVendor}
          pop={pop} setShowVendors={setShowVendors}
        />}

        {showStaff&&<Modal title="👥 Staff" onClose={()=>setShowStaff(false)}>
          <div style={{marginBottom:14}}>
            <div style={c.g2(10)}>
              <F label="Staff Name" required value={staffForm.name||""} onChange={v=>setStaffForm(p=>({...p,name:v}))}/>
              <F label="Role" value={staffForm.role||""} onChange={v=>setStaffForm(p=>({...p,role:v}))} placeholder="e.g. Buyer, Manager"/>
            </div>
            <button style={c.btn(T.gold)} onClick={()=>{if(!staffForm.name){pop("Name required.","warn");return;}setStaffList(p=>[...p,{...staffForm,id:uid()}]);setStaffForm({});pop("Staff member added.","ok");}}>Add Staff Member</button>
          </div>
          <div style={{marginBottom:14}}>
            <label style={c.lbl}>Active Staff Member</label>
            <select style={{...c.sel(),width:"100%"}} value={activeStaff} onChange={e=>setActiveStaff(e.target.value)}>
              <option value="">— None selected —</option>
              {(staffList||[]).map(s=><option key={s.id} value={s.id}>{sS(s.name)}{s.role?" ("+s.role+")":""}</option>)}
            </select>
          </div>
          {(staffList||[]).map(s=><div key={s.id} style={{...c.card({padding:12}),marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontWeight:"bold",color:T.white}}>{sS(s.name)}</div><div style={{fontSize:11,color:T.muted}}>{sS(s.role)}</div></div>
            <button style={c.bsm(T.redBg,T.red)} onClick={()=>setStaffList(p=>p.filter(x=>x.id!==s.id))}>🗑</button>
          </div>)}
        </Modal>}

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
            <button style={c.btn(T.gold)} onClick={()=>{setStock(p=>p.map(s=>s.id===editStockId?{...s,...editStockVal,weight_g:editStockVal.weight_g?parseFloat(editStockVal.weight_g):s.weight_g,price:editStockVal.price?parseFloat(editStockVal.price):s.price}:s));setEditStockId(null);pop("Stock item updated.","ok");}}>Save</button>
            <button style={c.bsm()} onClick={()=>setEditStockId(null)}>Cancel</button>
          </div>
        </Modal>}

        {showBackup&&<BackupRestore txList={txList} stock={stock} dlBackup={dlBackup} restoreBackup={restoreBackup} setShowBackup={setShowBackup}/>}

        {logoPinMode&&<div style={{position:"fixed",inset:0,background:"#000000e0",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setLogoPinMode(false)}>
          <div style={{...c.card({padding:24}),maxWidth:400,width:"100%"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:14,fontWeight:"bold",color:T.white,marginBottom:16}}>🖼 Logo Manager</div>
            <div style={{marginBottom:14}}>
              <label style={{...c.btn(T.gold,T.bg),display:"inline-block",cursor:"pointer",marginBottom:10}}>Upload Logo<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{display:"none"}} onChange={e=>{const f=e.target.files&&e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{const data=ev.target.result;const entry={id:uid(),data,isLogo:true};setLogoLib(p=>[entry,...p]);setSettings(p=>({...p,logoImg:data}));pop("Logo updated.","ok");setLogoPinMode(false);};r.readAsDataURL(f);e.target.value="";  }}/></label>
              {(logoLib||[]).length>0&&<div>
                <div style={{fontSize:11,color:T.muted,marginBottom:8}}>Saved logos:</div>
                {logoDel&&<div style={{...c.bnr("warn"),marginBottom:10,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <img src={logoDel.data} alt="" style={{width:32,height:32,borderRadius:"50%",objectFit:"cover",flexShrink:0}}/>
                  <span style={{flex:1,minWidth:140,fontSize:12}}>Delete this image? This cannot be undone.</span>
                  <button style={c.btn(T.red,T.white,{fontSize:11,padding:"6px 12px"})} onClick={()=>{const wasActive=settings.logoImg===logoDel.data;setLogoLib(p=>p.filter(x=>x.id!==logoDel.id));if(wasActive)setSettings(p=>({...p,logoImg:""}));pop("Logo deleted.","ok");setLogoDel(null);}}>Delete</button>
                  <button style={c.bsm()} onClick={()=>setLogoDel(null)}>Cancel</button>
                </div>}
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {(logoLib||[]).map(l=><div key={l.id} style={{position:"relative",cursor:"pointer"}} onClick={()=>{setSettings(p=>({...p,logoImg:l.data}));pop("Logo selected.","ok");setLogoPinMode(false);}}>
                    <img src={l.data} alt="logo" style={{width:56,height:56,borderRadius:"50%",objectFit:"cover",border:"2px solid "+(settings.logoImg===l.data?T.gold:T.border)}}/>
                    {l.id!=="default-logo"&&<button title="Delete this image" onClick={e=>{e.stopPropagation();setLogoDel(l);}} style={{position:"absolute",top:-4,right:-4,width:20,height:20,borderRadius:"50%",background:T.red,color:T.white,border:"1px solid "+T.bg,cursor:"pointer",fontSize:11,lineHeight:"18px",padding:0,fontWeight:"bold"}}>✕</button>}
                  </div>)}
                </div>
              </div>}
            </div>
            <button style={c.bsm()} onClick={()=>setLogoPinMode(false)}>Close</button>
          </div>
        </div>}

        <Notif msg={notify&&notify.msg} type={notify&&notify.type} onClose={()=>setNotify(null)}/>
      </div>
      )}
    </div>
  );
}
