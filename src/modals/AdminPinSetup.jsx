// LootLedger — Admin PIN first-time setup modal.
// Phase 2.7 smoke-test follow-up batch 2 (2026-04-29).
//
// Triggered from Settings → Security when the user toggles
// "Require PIN to open app" ON for the first time (when
// settings.adminRecoveryPassphraseHash is empty). The toggle does
// NOT flip until this modal completes — the modal itself is what
// writes settings.requirePin = true alongside the recovery bundle,
// in a single setSettings call so the partial state can never
// strand the dealer.
//
// What lands in settings on save:
//   staffPin                              — chosen 4–12 digit PIN
//   adminRecoverySalt                     — 16 random bytes b64
//   adminRecoveryPassphraseEncrypted      — AES-GCM ciphertext
//   adminRecoveryPassphraseHash           — SHA-256 hex
//   adminRecoveryPhone                    — phone or ""
//   requirePin                            — true
//
// The passphrase is generated once at mount via useState's lazy
// initialiser so it stays stable across renders. The dealer must
// tick the "I have saved this" checkbox to enable the Save button.
// If they leave the phone blank they must also tick the "I
// understand I'm skipping SMS recovery" checkbox.
//
// SMS recovery itself is deferred to Phase 3 (locked roadmap).
// The phone field is captured here so the data is in place when
// Phase 3 wires it up.

import React,{useState} from "react";
import {T,c} from "../theme.js";
import {Modal,F} from "../components/ui";
import {generatePassphrase,buildRecoveryBundle} from "../lib/auth/passphrase.js";

function isValidPin(s){return /^\d{4,12}$/.test(String(s||""));}

export default function AdminPinSetup({setSettings,pop,onClose}){
  const[pin,setPin]=useState("");
  const[pinConfirm,setPinConfirm]=useState("");
  const[phone,setPhone]=useState("");
  const[ackSaved,setAckSaved]=useState(false);
  const[ackNoSms,setAckNoSms]=useState(false);
  const[busy,setBusy]=useState(false);
  // Generated once. useState lazy initialiser keeps the value stable
  // across renders so the user can copy from the same string they
  // see; regenerating on every keystroke would defeat the point.
  const[passphrase]=useState(()=>generatePassphrase());

  const phoneBlank=!String(phone||"").trim();
  const pinOk=isValidPin(pin)&&pin===pinConfirm;
  const checksOk=ackSaved&&(!phoneBlank||ackNoSms);
  const canSave=pinOk&&checksOk&&!busy;

  const copy=async()=>{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      try{await navigator.clipboard.writeText(passphrase);pop&&pop("Passphrase copied to clipboard.","ok");}
      catch(_){pop&&pop("Copy failed — write it down manually.","warn");}
    }else pop&&pop("Clipboard unavailable — write it down manually.","warn");
  };

  const onSave=async()=>{
    if(!canSave)return;
    setBusy(true);
    try{
      const bundle=await buildRecoveryBundle(passphrase,pin);
      setSettings(p=>({
        ...p,
        staffPin:pin,
        ...bundle,
        adminRecoveryPhone:String(phone||"").trim(),
        requirePin:true,
      }));
      pop&&pop("Admin PIN set. Recovery passphrase stored (encrypted).","ok");
      onClose&&onClose(true);
    }catch(e){
      pop&&pop("Setup failed: "+(e&&e.message||"unknown error"),"err");
    }finally{setBusy(false);}
  };

  return <Modal title="🔐 Set Up Admin PIN" onClose={()=>onClose&&onClose(false)} wide>
    <div style={{...c.bnr("info"),marginBottom:14}}>The Admin PIN unlocks this app and authorises every destructive action. Your <strong>recovery passphrase</strong> below is the only way to reset the PIN if you forget it. Save it now — it is generated once and never shown in this form again.</div>

    <div style={{...c.card({padding:14}),marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10}}>1 · CHOOSE ADMIN PIN</div>
      <F label="Admin PIN (4–12 digits)" type="password" value={pin} onChange={setPin} placeholder="••••" required/>
      <F label="Confirm Admin PIN" type="password" value={pinConfirm} onChange={setPinConfirm} placeholder="••••" required note={pin&&pinConfirm&&pin!==pinConfirm?"PINs do not match.":undefined}/>
    </div>

    <div style={{...c.card({padding:14}),marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10}}>2 · RECOVERY PASSPHRASE</div>
      <div style={{background:T.surface,border:"1px solid "+T.border,borderRadius:6,padding:14,fontFamily:"monospace",fontSize:18,letterSpacing:"0.08em",textAlign:"center",wordSpacing:"0.2em",color:T.white,marginBottom:10}}>{passphrase}</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <button style={c.bsm(T.goldBg,T.gold)} onClick={copy} disabled={busy}>📋 Copy</button>
        <span style={{fontSize:10,color:T.muted,flex:1,minWidth:200}}>Write this down on paper or save it to a password manager. The passphrase is generated once. Changing your PIN does NOT change the passphrase.</span>
      </div>
    </div>

    <div style={{...c.card({padding:14}),marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:10}}>3 · RECOVERY PHONE (OPTIONAL)</div>
      <F label="Recovery phone number" value={phone} onChange={setPhone} placeholder="+61400000000" note="Reserved for SMS-based PIN recovery. The SMS branch lands in Phase 3; the field is captured now so it's in place when Phase 3 wires it up."/>
      {phoneBlank&&<div style={c.bnr("warn")}>⚠ Without a recovery phone, your only PIN-reset path will be the passphrase above (and a manual administrator reset as a last resort).</div>}
    </div>

    <div style={{marginBottom:14}}>
      <label style={{display:"flex",alignItems:"flex-start",gap:8,cursor:"pointer",fontSize:12,marginBottom:8}}>
        <input type="checkbox" checked={ackSaved} onChange={e=>setAckSaved(e.target.checked)} style={{marginTop:3}}/>
        <span>I have saved my recovery passphrase in a safe place.</span>
      </label>
      {phoneBlank&&<label style={{display:"flex",alignItems:"flex-start",gap:8,cursor:"pointer",fontSize:12}}>
        <input type="checkbox" checked={ackNoSms} onChange={e=>setAckNoSms(e.target.checked)} style={{marginTop:3}}/>
        <span>I understand I am skipping SMS recovery.</span>
      </label>}
    </div>

    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      <button style={{...c.btn(canSave?T.gold:T.border,canSave?T.bg:T.muted),opacity:canSave?1:0.6,cursor:canSave?"pointer":"default"}} disabled={!canSave} onClick={onSave}>{busy?"Saving…":"Save and Activate Admin PIN"}</button>
      <button style={c.bsm()} onClick={()=>onClose&&onClose(false)} disabled={busy}>Cancel</button>
    </div>
  </Modal>;
}
