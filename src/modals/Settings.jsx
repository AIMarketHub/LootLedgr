// LootLedger — Settings modal.
// Mechanically extracted from src/App.tsx during Phase 2 step 10a
// (briefing §7.3). No semantic changes; markup preserved verbatim.
//
// The largest modal in the app. Nine accordion sections plus a
// danger zone:
//   📡 Spot Feed (API keys + thresholds + status)
//   🏪 Business Details (name, ABN, licence, police email, state)
//   🎨 Appearance (contrast, font size, simplified view)
//   ⚖ Bluetooth Scale (connect / disconnect, protocol, unit)
//   🔒 Security (PIN gate, session timeout)
//   🆘 Police Help — Duress Alerts (provider, key/URL, contacts)
//   📋 Compliance — TTR (toggle + cash hard-block above N)
//   ₿ Cryptocurrency Payments (toggle + wallets)
//   🤖 AI Agent (toggle + name / URL / level — placeholder UI)
//   🔗 Integrations (EFTPOS, Square, Shopify, generic webhook)
// + Danger Zone: clear all data, purge expired (7-year),
//   spot-price history, blacklist, app version footer.
//
// `ABTN` (the accordion-button style) lived at App.tsx top-level
// because it was only used inside this modal — moved here.
//
// Briefing §7.3 step 10a flagged this modal as a candidate for
// sub-stepping (each accordion panel could become its own
// component). Phase 2 keeps it as one extraction; further
// decomposition can happen as a Phase 9 polish pass if it pays
// off in readability or shared behaviour with other settings UIs.

import React,{useState,useEffect} from "react";
import {T,c} from "../theme.js";
import {sS,fmtAUD} from "../lib/utils.js";
import {APP_VERSION} from "../lib/constants.js";
import {sendDuressSMS} from "../lib/integrations.js";
import {probeStripe} from "../lib/integrations/stripe.js";
import {PROVIDERS,probeProvider} from "../lib/idAutofill/index.js";
import AdminPinSetup from "./AdminPinSetup.jsx";
import {decryptPassphrase,encryptPassphrase} from "../lib/auth/passphrase.js";

// 24 alphabet chars → "XXXX-XXXX-XXXX-XXXX-XXXX-XXXX". Defensive
// against decrypt that for some reason returned an unexpected
// length — show whatever came back.
function formatPassphrase(s){
  const c=String(s||"").replace(/[\s-]+/g,"");
  const out=[];
  for(let i=0;i<c.length;i+=4)out.push(c.slice(i,i+4));
  return out.join("-");
}
function isValidPin(s){return /^\d{4,12}$/.test(String(s||""));}
import {THRESH} from "../lib/compliance/index.js";
import {clients} from "../lib/clients.js";
import {analyzeMigrationTargets,runTestDataMigration} from "../lib/clientsMigration.js";
import {Modal,F,SF} from "../components/ui";

// Tighten-only validator for the Compliance Thresholds section.
// Returns an onChange handler that rejects values above the legal
// minimum with the spec'd toast message; accepts blank (null = use
// regional default) and any numeric ≤ legalMin.
function makeTightenHandler(setSettings,pop,key,legalMin){
  return v=>{
    if(v===""||v==null){setSettings(p=>({...p,[key]:null}));return;}
    const n=parseFloat(v);
    if(isNaN(n)||n<0){setSettings(p=>({...p,[key]:null}));return;}
    if(n>legalMin){
      pop("Cannot loosen below legal minimum: $"+legalMin.toLocaleString(),"warn");
      return; // input snaps back to last accepted value (controlled F)
    }
    setSettings(p=>({...p,[key]:n}));
  };
}

const ABTN={width:"100%",background:"none",border:"none",padding:"12px 0",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:T.gold,fontWeight:"bold",fontSize:12,letterSpacing:"0.06em",textAlign:"left"};

export default function Settings({
  settings,setSettings,
  spotStatus,spotSource,manualTs,MANUAL_TTL,apiError,setApiError,forceResumeAPI,
  contrast,setContrast,fontSize,setFontSize,simp,setSimp,
  scaleStatus,scaleDevice,connectScale,disconnectScale,
  pop,
  txList,setTxList,setStock,purge,spotLog,blacklist,setBlacklist,
  settingsOpen,toggleSection,
  setShowSet,
  withAdminGate,
}){
  // Phase 2.7 follow-up batch 2 — adminGate wrapper. Falls through
  // to fn() when the gate isn't wired (defensive — same single-
  // operator dev posture as the rest of the helpers in this modal).
  const gate=(reason,fn)=>typeof withAdminGate==="function"?withAdminGate(reason,fn):fn();
  // Compliance Thresholds — gate the VALUE-CHANGE action, not the
  // accordion expand. Reading the section is free; the first
  // attempt to mutate any threshold this Settings session prompts
  // for the Admin PIN. After approval, edits flow until Settings
  // closes (component unmount resets `thresholdsUnlocked`). Per-
  // keystroke gating would be unusable; one prompt per session is
  // the right grain.
  const[thresholdsUnlocked,setThresholdsUnlocked]=useState(false);
  const makeGatedTightenHandler=(key,legalMin)=>{
    const inner=makeTightenHandler(setSettings,pop,key,legalMin);
    return v=>{
      if(thresholdsUnlocked){inner(v);return;}
      gate("Modify compliance thresholds (tightening only).",()=>{
        setThresholdsUnlocked(true);
        inner(v);
      });
    };
  };
  // Phase 2.7.12 — test-data migration state. Loaded eagerly when
  // the Settings modal mounts so the Danger Zone status line is
  // accurate as soon as the user scrolls down.
  const[migStats,setMigStats]=useState(null);
  const[migLoading,setMigLoading]=useState(false);
  const[migBusy,setMigBusy]=useState(false);
  // Phase 2.7 follow-up batch 2 — first-time Admin PIN setup is a
  // dedicated modal triggered from the Require-PIN toggle. Toggle
  // does not flip until the modal completes.
  const[showAdminSetup,setShowAdminSetup]=useState(false);
  // Show / Change PIN modals — both gated by the Admin gate on the
  // outer click. The result modals are unconditional once the gate
  // approves, so we don't need a separate "open after PIN" plumb;
  // the gate's onApproved callback is the trigger.
  const[passphraseShown,setPassphraseShown]=useState(null);
  const[changePinOpen,setChangePinOpen]=useState(false);
  const[newPin,setNewPin]=useState("");
  const[newPinConfirm,setNewPinConfirm]=useState("");
  const[changePinBusy,setChangePinBusy]=useState(false);
  // Three-case toggle handler. Extracted from the inline onChange
  // so the branching is explicit and the gate is only invoked when
  // there's something for it to verify against.
  //
  //   next=true  + no bundle  → first-time setup modal, NO gate
  //                              (no PIN exists yet to validate).
  //   next=true  + bundle ok  → re-enable, just flip the flag
  //                              (rare — bundle survived a prior
  //                              disable; daily-use flow is to
  //                              keep requirePin on once set).
  //   next=false               → gate on current Admin PIN
  //                              (security must not be silently
  //                              disabled). The gate itself
  //                              short-circuits when requirePin is
  //                              already false, so the false→false
  //                              edge is a free pass-through.
  const onRequirePinToggle=next=>{
    if(next){
      if(!settings.adminRecoveryPassphraseHash){setShowAdminSetup(true);return;}
      setSettings(p=>({...p,requirePin:true}));
      return;
    }
    gate("Disable Require-PIN gate. Removes the lock screen and unprotects every other Admin-gated action.",()=>setSettings(p=>({...p,requirePin:false})));
  };
  const onShowPassphrase=()=>gate("Reveal recovery passphrase.",async()=>{
    const pp=await decryptPassphrase(settings.adminRecoveryPassphraseEncrypted,settings.staffPin,settings.adminRecoverySalt);
    if(pp==null){
      pop("Could not decrypt the passphrase. The recovery bundle may be corrupt — see the handover doc for the manual reset path.","err");
      return;
    }
    setPassphraseShown(pp);
  });
  const onChangePinClick=()=>gate("Change Admin PIN.",()=>{
    setNewPin("");
    setNewPinConfirm("");
    setChangePinOpen(true);
  });
  const doChangePin=async()=>{
    if(!isValidPin(newPin)||newPin!==newPinConfirm){pop("PIN must be 4–12 digits and match the confirmation.","warn");return;}
    setChangePinBusy(true);
    try{
      const pp=await decryptPassphrase(settings.adminRecoveryPassphraseEncrypted,settings.staffPin,settings.adminRecoverySalt);
      if(pp==null){pop("Could not re-encrypt — old PIN appears stale. Try Forgot PIN on the lock screen.","err");return;}
      const ct=await encryptPassphrase(pp,newPin,settings.adminRecoverySalt);
      setSettings(p=>({...p,staffPin:newPin,adminRecoveryPassphraseEncrypted:ct}));
      setChangePinOpen(false);
      pop("Admin PIN updated. Recovery passphrase re-encrypted with the new PIN.","ok");
    }catch(e){
      pop("Change failed: "+sS(e&&e.message),"err");
    }finally{setChangePinBusy(false);}
  };
  const copyPassphrase=async()=>{
    if(!passphraseShown)return;
    if(navigator.clipboard&&navigator.clipboard.writeText){
      try{await navigator.clipboard.writeText(formatPassphrase(passphraseShown));pop("Passphrase copied.","ok");}
      catch(_){pop("Copy failed.","warn");}
    }
  };
  const refreshMigStats=async()=>{
    setMigLoading(true);
    try{
      const cs=await clients.list();
      setMigStats(analyzeMigrationTargets(txList,cs));
    }catch(_){
      setMigStats(null);
    }finally{setMigLoading(false);}
  };
  useEffect(()=>{refreshMigStats();/* eslint-disable-next-line */},[]);
  return <>
  <Modal title="⚙ Settings" onClose={()=>setShowSet(false)} wide>
    {[
      ["spotfeed","📡 Spot Feed — API Keys",<div style={{paddingBottom:14}}>
        <div style={{fontSize:10,color:T.muted,marginBottom:10}}>Priority: GoldAPI.io → Metals-API → Metals.Dev. All free. Manual override TTL is configurable in the Prices tab.</div>
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
          <span style={{fontSize:11,flex:1,color:spotStatus==="live"?T.readyGreen:spotStatus==="manual"?T.gold:T.orange}}>{spotStatus==="live"?"🟢 Live — "+spotSource:spotStatus==="manual"?(MANUAL_TTL===Infinity?"🟡 Manual — always on":(()=>{const m=Math.max(0,Math.ceil((MANUAL_TTL-(Date.now()-manualTs.current))/60000));return "🟡 Manual — "+m+" min remaining";})()):"🟠 No API feed"}</span>
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
        <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,marginBottom:14}}><input type="checkbox" checked={!!settings.requirePin} onChange={e=>onRequirePinToggle(e.target.checked)}/>Require PIN to open app</label>
        <F label="Admin PIN" type="password" value={settings.staffPin} onChange={v=>setSettings(p=>({...p,staffPin:v}))} note="Master key — unlocks the app when the toggle above is on, and overrides any per-staff PIN."/>
        <SF label="Session Timeout" value={settings.sessionTimeout||"never"} onChange={v=>setSettings(p=>({...p,sessionTimeout:v}))} options={[{value:"never",label:"Never (stay logged in)"},{value:"1h",label:"1 hour"},{value:"8h",label:"8 hours"},{value:"close",label:"Every time app closes"}]}/>
        {settings.adminRecoveryPassphraseHash?<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
          <button style={c.bsm()} onClick={onShowPassphrase}>👁 Show Recovery Passphrase</button>
          <button style={c.bsm()} onClick={onChangePinClick}>🔄 Change Admin PIN</button>
        </div>:<div style={{fontSize:10,color:T.muted,marginTop:8}}>Show / change buttons appear after first-time setup completes.</div>}
        {settings.adminRecoveryPassphraseHash&&<F label="Recovery phone" value={settings.adminRecoveryPhone||""} onChange={v=>setSettings(p=>({...p,adminRecoveryPhone:v}))} placeholder="+61400000000" note="Reserved for SMS-based PIN recovery. SMS branch lands in Phase 3 — Phase-3 gate will require the Admin PIN to change this field. For now the field is plain editable."/>}
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
        <button style={c.btn(T.border,T.text,{fontSize:11,marginTop:10})} onClick={async()=>{const contacts=[1,2,3,4,5,6,7,8,9,10].map(n=>sS(settings["duressContact"+n]).trim()).filter(Boolean);if(!contacts.length){pop("No contacts configured.","warn");return;}const r=await sendDuressSMS(settings,contacts[0],"LOOT LEDGR — Test alert from duress system. If received, system is working.");pop(r.msg,r.ok?"ok":"err");}}>Test SMS to Contact 1</button>
      </div>],
      ["compliance","📋 Compliance — TTR",<div style={{paddingBottom:14}}>
        <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12}}><input type="checkbox" checked={settings.ttrEnabled!==false} onChange={e=>setSettings(p=>({...p,ttrEnabled:e.target.checked}))}/>Enable TTR check at $10,000 cash threshold</label>
        <div style={{fontSize:10,color:T.muted,marginTop:8,marginBottom:14}}>Disabling TTR check does NOT remove your legal obligation to file Threshold Transaction Reports with AUSTRAC. Only disable if your business is exempt.</div>
        <F label="Refuse cash transactions at or above (AUD)" type="number" value={settings.cashHardBlockAbove==null?"":String(settings.cashHardBlockAbove)} onChange={v=>setSettings(p=>({...p,cashHardBlockAbove:v===""?null:parseFloat(v)}))} placeholder="Leave blank for no extra block"/>
        <div style={{fontSize:10,color:T.muted,marginTop:6}}>Stricter than the legal minimum. When set, the system refuses cash payment for any transaction whose buy total is at or above this amount, regardless of bullion or TTR status. Leave blank to fall back to AUSTRAC thresholds only ($2k warn, $5k bullion CDD, $10k TTR).</div>
      </div>],
      ["compliancethresholds","📋 Compliance Thresholds",<div style={{paddingBottom:14}}>
        <div style={{fontSize:10,color:T.muted,marginBottom:12}}>Phase 2.7 — override the legal trigger thresholds for the conditional compliance fields shown in the New Transaction flow. You can only TIGHTEN (lower the dollar value to demand checks earlier) — values above the legal minimum are rejected.</div>
        <label style={{display:"flex",alignItems:"flex-start",gap:8,cursor:"pointer",fontSize:12,marginBottom:6}}>
          <input type="checkbox" checked={settings.requireIdOnEveryTx!==false} onChange={e=>{
            const next=e.target.checked;
            const apply=()=>setSettings(p=>({...p,requireIdOnEveryTx:next}));
            if(thresholdsUnlocked){apply();return;}
            gate("Modify compliance thresholds (tightening only).",()=>{setThresholdsUnlocked(true);apply();});
          }} style={{marginTop:3}}/>
          <span><strong>Require ID on every transaction (recommended)</strong></span>
        </label>
        <div style={{fontSize:10,color:T.muted,marginBottom:14}}>When on, ID type + ID number must be captured on every transaction, regardless of value. KYC (PEP / TFS / Source of Funds / etc.) still only applies at legal thresholds. When off, ID is only required above the legal threshold — sub-threshold transactions can complete without identifying the customer (legal minimum mode).</div>
        <F label="Tighten cash KYC trigger to:" type="number" value={settings.cashKycThreshold==null?"":String(settings.cashKycThreshold)} onChange={makeGatedTightenHandler("cashKycThreshold",THRESH.CASH_TTR)} placeholder="Leave blank to use default"/>
        <div style={{fontSize:10,color:T.muted,marginTop:-8,marginBottom:14}}>Default: ${THRESH.CASH_TTR.toLocaleString()} — leave blank to use this. Triggers PEP / TFS / Risk-rating checks.</div>
        <F label="Tighten bullion CDD trigger to:" type="number" value={settings.bullionCddThreshold==null?"":String(settings.bullionCddThreshold)} onChange={makeGatedTightenHandler("bullionCddThreshold",THRESH.BULLION_CDD)} placeholder="Leave blank to use default"/>
        <div style={{fontSize:10,color:T.muted,marginTop:-8,marginBottom:14}}>Default: ${THRESH.BULLION_CDD.toLocaleString()} — leave blank to use this. Triggers PEP / TFS / Risk-rating checks on bullion buys.</div>
        <F label="Tighten Source-of-Funds trigger to:" type="number" value={settings.sourceOfFundsCashThreshold==null?"":String(settings.sourceOfFundsCashThreshold)} onChange={makeGatedTightenHandler("sourceOfFundsCashThreshold",THRESH.CASH_TTR)} placeholder="Leave blank to use default"/>
        <div style={{fontSize:10,color:T.muted,marginTop:-8,marginBottom:14}}>Default: ${THRESH.CASH_TTR.toLocaleString()} cash — leave blank to use this.</div>
        <F label="Tighten Source-of-Wealth trigger to:" type="number" value={settings.sourceOfWealthCashThreshold==null?"":String(settings.sourceOfWealthCashThreshold)} onChange={makeGatedTightenHandler("sourceOfWealthCashThreshold",THRESH.CASH_TTR)} placeholder="Leave blank to use default"/>
        <div style={{fontSize:10,color:T.muted,marginTop:-8,marginBottom:6}}>Default: ${THRESH.CASH_TTR.toLocaleString()} cash — leave blank to use this.</div>
      </div>],
      ["crypto","₿ Cryptocurrency Payments",<div style={{paddingBottom:14}}>
        <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,marginBottom:14}}><input type="checkbox" checked={!!settings.cryptoEnabled} onChange={e=>setSettings(p=>({...p,cryptoEnabled:e.target.checked}))}/>Enable cryptocurrency payment option</label>
        {settings.cryptoEnabled&&<div style={c.g2(10)}>
          {[{k:"walletBTC",l:"Bitcoin (BTC)"},{k:"walletETH",l:"Ethereum (ETH)"},{k:"walletBNB",l:"Binance BEP-2 (BNB)"},{k:"walletXRP",l:"Ripple (XRP)"},{k:"walletSOL",l:"Solana (SOL)"}].map(w=><F key={w.k} label={w.l} value={settings[w.k]||""} onChange={v=>setSettings(p=>({...p,[w.k]:v}))} placeholder="Wallet address…"/>)}
        </div>}
      </div>],
      ["ai","🤖 AI Agent",<div style={{paddingBottom:14}}>
        <div style={{fontSize:10,color:T.muted,marginBottom:12,lineHeight:1.5}}>AI Agent is an upcoming extension (planned for post-launch as Stage 8.8 / 8.9). The fields below are reserved configuration — Name, URL, and Level placeholders that the future extension will read from. Full agent capabilities (chat trainer, induction tests, autonomous operation, biometric KYC) ship in the AI Agent extension.</div>
        <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,marginBottom:14}}><input type="checkbox" checked={!!settings.aiAgentEnabled} onChange={e=>setSettings(p=>({...p,aiAgentEnabled:e.target.checked}))}/>Enable AI Agent indicator</label>
        {settings.aiAgentEnabled&&<div style={c.g2(10)}>
          <F label="Agent Name" value={settings.aiAgentName||"Sophiie"} onChange={v=>setSettings(p=>({...p,aiAgentName:v}))}/>
          <F label="Agent URL" value={settings.aiAgentUrl||""} onChange={v=>setSettings(p=>({...p,aiAgentUrl:v}))} placeholder="https://…"/>
          <SF label="Level" value={String(settings.aiAgentLevel||1)} onChange={v=>setSettings(p=>({...p,aiAgentLevel:parseInt(v)}))} options={[{value:"1",label:"Level 1 — AI chat"},{value:"2",label:"Level 2 — AI app handling"}]}/>
        </div>}
      </div>],
      ["idautofill","🪪 ID Autofill Provider",<div style={{paddingBottom:14}}>
        <div style={{fontSize:10,color:T.muted,marginBottom:10}}>Phase 2.7 — extracts KYC fields from a captured ID photo so staff don't retype. Provider stubs are fully wired but not yet implemented; pick "None" to keep autofill off until a provider body lands.</div>
        <SF label="Provider" value={settings.idAutofillProvider||"none"} onChange={v=>setSettings(p=>({...p,idAutofillProvider:v}))} options={[{value:"none",label:"None (default)"},{value:"googleVision",label:"Google Vision API"},{value:"awsTextract",label:"AWS Textract"},{value:"tesseract",label:"Tesseract.js (on-device)"},{value:"llmVision",label:"LLM with vision"}]}/>
        {settings.idAutofillProvider==="googleVision"&&<div>
          <div style={{...c.bnr("warn"),marginBottom:10}}>{PROVIDERS.googleVision.privacyNotice}</div>
          <F label="API Key" type="password" value={settings.googleVisionApiKey||""} onChange={v=>setSettings(p=>({...p,googleVisionApiKey:v}))}/>
          <F label="Project ID (optional)" value={settings.googleVisionProjectId||""} onChange={v=>setSettings(p=>({...p,googleVisionProjectId:v}))}/>
          <button style={c.bsm()} onClick={async()=>{const r=await probeProvider("googleVision",settings);pop(r.msg,r.ok?"ok":"warn");}}>Test Connection</button>
        </div>}
        {settings.idAutofillProvider==="awsTextract"&&<div>
          <div style={{...c.bnr("warn"),marginBottom:10}}>{PROVIDERS.awsTextract.privacyNotice}</div>
          <F label="Access Key" type="password" value={settings.awsTextractAccessKey||""} onChange={v=>setSettings(p=>({...p,awsTextractAccessKey:v}))}/>
          <F label="Secret Key" type="password" value={settings.awsTextractSecretKey||""} onChange={v=>setSettings(p=>({...p,awsTextractSecretKey:v}))}/>
          <F label="Region" value={settings.awsTextractRegion||""} onChange={v=>setSettings(p=>({...p,awsTextractRegion:v}))} placeholder="e.g. ap-southeast-2"/>
          <button style={c.bsm()} onClick={async()=>{const r=await probeProvider("awsTextract",settings);pop(r.msg,r.ok?"ok":"warn");}}>Test Connection</button>
        </div>}
        {settings.idAutofillProvider==="tesseract"&&<div>
          <div style={{...c.bnr("info"),marginBottom:10}}>{PROVIDERS.tesseract.privacyNotice}</div>
          <button style={c.bsm()} onClick={async()=>{const r=await probeProvider("tesseract",settings);pop(r.msg,r.ok?"ok":"warn");}}>Test Connection</button>
        </div>}
        {settings.idAutofillProvider==="llmVision"&&<div>
          <div style={{...c.bnr("warn"),marginBottom:10}}>{PROVIDERS.llmVision.privacyNotice}</div>
          <SF label="LLM Sub-provider" value={settings.llmVisionSubProvider||"anthropic"} onChange={v=>setSettings(p=>({...p,llmVisionSubProvider:v}))} options={[{value:"anthropic",label:"Anthropic Claude"},{value:"openai",label:"OpenAI GPT-4V"},{value:"other",label:"Other (BYO endpoint)"}]}/>
          <F label="API Key" type="password" value={settings.llmVisionApiKey||""} onChange={v=>setSettings(p=>({...p,llmVisionApiKey:v}))}/>
          <F label="Model" value={settings.llmVisionModel||""} onChange={v=>setSettings(p=>({...p,llmVisionModel:v}))} placeholder="e.g. claude-opus-4-7"/>
          {settings.llmVisionSubProvider==="other"&&<F label="Endpoint URL" value={settings.llmVisionEndpoint||""} onChange={v=>setSettings(p=>({...p,llmVisionEndpoint:v}))} placeholder="https://…"/>}
          <button style={c.bsm()} onClick={async()=>{const r=await probeProvider("llmVision",settings);pop(r.msg,r.ok?"ok":"warn");}}>Test Connection</button>
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
        <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10,marginTop:14}}>Stripe Payments</div>
        <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12,marginBottom:10}}><input type="checkbox" checked={!!settings.stripeEnabled} onChange={e=>setSettings(p=>({...p,stripeEnabled:e.target.checked}))}/>Enable Stripe Payments</label>
        {settings.stripeEnabled&&<div>
          <div style={{...c.bnr("warn"),marginBottom:10}}>⚠ Payment data sent to Stripe (Privacy Act 1988 — confirm Stripe DPA accepted). Card numbers never touch this device — Stripe Checkout collects them on stripe.com.</div>
          <F label="Publishable Key" value={settings.stripePublishableKey||""} onChange={v=>setSettings(p=>({...p,stripePublishableKey:v}))} placeholder="pk_test_… or pk_live_…"/>
          <F label="Secret Key" type="password" value={settings.stripeSecretKey||""} onChange={v=>setSettings(p=>({...p,stripeSecretKey:v}))} placeholder="sk_test_… or sk_live_…"/>
          <SF label="Mode" value={settings.stripeMode||"test"} onChange={v=>setSettings(p=>({...p,stripeMode:v}))} options={[{value:"test",label:"Test mode"},{value:"live",label:"Live mode"}]}/>
          <F label="Webhook Endpoint URL" value={settings.stripeWebhookUrl||""} onChange={v=>setSettings(p=>({...p,stripeWebhookUrl:v}))} placeholder="https://…/stripe/webhook" note="Configured during production deployment. Stripe POSTs payment-confirmation events here. Stored only — no server endpoint is built into this skeleton yet."/>
          <button style={c.bsm()} onClick={async()=>{const r=await probeStripe(settings);pop(r.msg,r.ok?"ok":"warn");}}>Test Connection</button>
          <div style={{fontSize:10,color:T.muted,marginTop:6}}>Note: Stripe's REST API blocks browser CORS on the secret-key surface. Test Connection and Send-Payment-Link will only succeed once Stage 7 wires up a server proxy. Plumbing is correct against Stripe's contract — the toggle reserves the slot until then.</div>
        </div>}
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
        <button style={c.bsm(T.redBg,T.red)} onClick={()=>gate("Clear ALL transactions and stock. This cannot be undone.",()=>{if(window.confirm&&!window.confirm("Clear all transactions and stock? This cannot be undone."))return;setTxList([]);setStock([]);pop("All data cleared.","warn");})}>🗑 Clear All Data</button>
        <button style={c.bsm(T.border,T.muted)} onClick={()=>gate("Purge expired (7-year) records.",purge)}>🧹 Purge Expired (7yr)</button>
      </div>

      {/* Phase 2.7.12 — one-time test-data migration. Idempotent;
          does nothing when migStats.pending === 0. The status line
          recomputes after each run via refreshMigStats(). */}
      <div style={{marginTop:18,paddingTop:14,borderTop:"1px solid "+T.border}}>
        <div style={{fontSize:11,fontWeight:"bold",color:T.white,marginBottom:6}}>🔗 Client-record migration (one-time)</div>
        <div style={{fontSize:11,color:T.muted,marginBottom:10,minHeight:16}}>
          {migLoading?"Computing…":!migStats?"Stats unavailable.":migStats.pending===0?(migStats.legacyNoId>0?"✓ All migrate-able transactions linked. "+migStats.legacyNoId+" legacy un-IDed transaction"+(migStats.legacyNoId===1?"":"s")+" remain (pre-policy).":"✓ All transactions linked to client records."):(migStats.pending+" transaction"+(migStats.pending===1?"":"s")+" awaiting migration · "+migStats.newClientsToCreate+" new client record"+(migStats.newClientsToCreate===1?"":"s")+" to create"+(migStats.legacyNoId>0?" · "+migStats.legacyNoId+" legacy un-IDed (cannot migrate)":"")+".")}
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <button
            style={c.bsm(T.goldBg,T.gold)}
            disabled={migBusy||migLoading||!migStats||migStats.pending===0}
            onClick={()=>gate("Run one-time test-transaction migration ("+(migStats?migStats.pending:"?")+" tx awaiting).",async()=>{
              if(!migStats||migStats.pending===0)return;
              if(typeof window!=="undefined"&&window.confirm&&!window.confirm("Run the one-time test-transaction migration? Creates client records for unmigrated transactions and links them. Idempotent — safe to re-run."))return;
              setMigBusy(true);
              try{
                const r=await runTestDataMigration({txList,setTxList});
                const msg="Migrated: "+r.linked+" tx linked, "+r.created+" client"+(r.created===1?"":"s")+" created"+(r.alreadyLinked?", "+r.alreadyLinked+" already linked":"")+(r.skipped?", "+r.skipped+" skipped (no idNumber)":"")+(r.errors.length?", "+r.errors.length+" errors":"")+".";
                pop(msg,r.errors.length?"warn":"ok");
                await refreshMigStats();
              }catch(e){
                pop("Migration failed: "+sS(e&&e.message),"err");
              }finally{setMigBusy(false);}
            })}
          >
            {migBusy?"Migrating…":"Migrate test transactions to client records (one-time)"}
          </button>
          <button style={c.bsm()} disabled={migLoading||migBusy} onClick={refreshMigStats}>↺ Refresh stats</button>
        </div>
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
  </Modal>
  {/* Nested modals — rendered AFTER the Settings Modal so they win
      the same-z-index stacking tie. Modal primitive is fixed at
      z-index 999 across the app; later siblings paint on top.
      Without this ordering AdminPinSetup opens but stays hidden
      behind the Settings overlay (the bug fix this commit makes). */}
  {showAdminSetup&&<AdminPinSetup setSettings={setSettings} pop={pop} onClose={()=>setShowAdminSetup(false)}/>}
  {passphraseShown!=null&&<Modal title="🔑 Recovery Passphrase" onClose={()=>setPassphraseShown(null)}>
    <div style={{...c.bnr("warn"),marginBottom:14}}>Save this somewhere safe. It is the only PIN-reset path until Phase 3 wires up SMS recovery.</div>
    <div style={{background:T.surface,border:"1px solid "+T.border,borderRadius:6,padding:14,fontFamily:"monospace",fontSize:18,letterSpacing:"0.08em",textAlign:"center",color:T.white,marginBottom:14}}>{formatPassphrase(passphraseShown)}</div>
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      <button style={c.bsm(T.goldBg,T.gold)} onClick={copyPassphrase}>📋 Copy</button>
      <button style={c.btn(T.gold,T.bg)} onClick={()=>setPassphraseShown(null)}>Done</button>
    </div>
    <div style={{fontSize:10,color:T.muted,marginTop:10}}>The passphrase is forgotten when this modal closes. Re-open Show Recovery Passphrase if you need it again.</div>
  </Modal>}
  {changePinOpen&&<Modal title="🔄 Change Admin PIN" onClose={()=>!changePinBusy&&setChangePinOpen(false)}>
    <div style={{...c.bnr("info"),marginBottom:14}}>Setting a new Admin PIN re-encrypts the recovery passphrase under the new PIN. The passphrase itself does not change.</div>
    <F label="New Admin PIN (4–12 digits)" type="password" value={newPin} onChange={setNewPin} required note="Use at least 6 digits for meaningful protection. 4 digits is brute-forceable."/>
    <F label="Confirm New PIN" type="password" value={newPinConfirm} onChange={setNewPinConfirm} required note={newPin&&newPinConfirm&&newPin!==newPinConfirm?"PINs do not match.":undefined}/>
    <div style={{display:"flex",gap:10,marginTop:10}}>
      <button style={c.btn(isValidPin(newPin)&&newPin===newPinConfirm&&!changePinBusy?T.gold:T.border,isValidPin(newPin)&&newPin===newPinConfirm&&!changePinBusy?T.bg:T.muted)} disabled={!(isValidPin(newPin)&&newPin===newPinConfirm)||changePinBusy} onClick={doChangePin}>{changePinBusy?"Re-encrypting…":"Save New PIN"}</button>
      <button style={c.bsm()} onClick={()=>setChangePinOpen(false)} disabled={changePinBusy}>Cancel</button>
    </div>
  </Modal>}
  </>;
}
