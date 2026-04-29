// LootLedger — lock-screen "Forgot PIN" recovery modal.
// Phase 2.7 smoke-test follow-up batch 2 (2026-04-29).
//
// Triggered from the lock screen's "Forgot PIN?" link. Two
// recovery branches per the spec:
//
//   1. Use Recovery Passphrase  — fully implemented.
//   2. Send SMS Code            — DEFERRED to Phase 3 (locked
//                                  roadmap, Stage 2.4). The button
//                                  appears, greyed out, with a
//                                  helper note explaining when it
//                                  will become active. This stub
//                                  prevents the user assuming SMS
//                                  recovery is invisible / missing;
//                                  they can see it's coming.
//
// PASSPHRASE BRANCH
//
// 1. User enters their recovery passphrase (any case, with or
//    without hyphens — canonPassphrase normalises).
// 2. We hash and compare against settings.adminRecoveryPassphraseHash.
//    No PIN is in scope at this layer — we never need the old PIN
//    for this branch because the hash check verifies knowledge of
//    the passphrase directly.
// 3. On match: prompt for new PIN + confirm.
// 4. On save: re-encrypt the (now-verified) passphrase with the
//    new-PIN-derived key, persist {staffPin, ciphertext}. Hash and
//    salt do NOT change — the passphrase itself is unchanged, only
//    the encryption layer rotates.
// 5. unlockApp(true) — the dealer is now unlocked with the new PIN.
//
// FAILURE
//
// Bad passphrase: clear the input, show inline error. No lockout
// in this MVP — the 3-attempts-then-cooldown patterns are deferred
// to Phase 3 alongside SMS recovery and the audit log.

import React,{useState} from "react";
import {T,c} from "../theme.js";
import {Modal,F} from "../components/ui";
import {verifyPassphrase,encryptPassphrase,canonPassphrase} from "../lib/auth/passphrase.js";

function isValidPin(s){return /^\d{4,12}$/.test(String(s||""));}

export default function ForgotPin({settings,setSettings,pop,onClose,onUnlocked}){
  // "menu" | "passphrase" | "newpin"
  const[stage,setStage]=useState("menu");
  const[passphrase,setPassphrase]=useState("");
  const[verified,setVerified]=useState("");
  const[newPin,setNewPin]=useState("");
  const[newPinConfirm,setNewPinConfirm]=useState("");
  const[busy,setBusy]=useState(false);
  const[err,setErr]=useState("");

  const onVerifyPassphrase=async()=>{
    setBusy(true);
    setErr("");
    try{
      const ok=await verifyPassphrase(passphrase,settings.adminRecoveryPassphraseHash);
      if(!ok){
        setErr("Passphrase did not match. Check for typos and try again.");
        setPassphrase("");
        return;
      }
      setVerified(canonPassphrase(passphrase));
      setStage("newpin");
    }finally{setBusy(false);}
  };

  const onSaveNewPin=async()=>{
    if(!isValidPin(newPin)||newPin!==newPinConfirm){
      setErr("PIN must be 4–12 digits and match the confirmation.");
      return;
    }
    setBusy(true);
    setErr("");
    try{
      const ct=await encryptPassphrase(verified,newPin,settings.adminRecoverySalt);
      setSettings(p=>({...p,staffPin:newPin,adminRecoveryPassphraseEncrypted:ct}));
      pop&&pop("Admin PIN reset using recovery passphrase. The passphrase remains valid for future recovery.","ok");
      onUnlocked&&onUnlocked();
      onClose&&onClose();
    }catch(e){
      setErr("Reset failed: "+(e&&e.message||"unknown error"));
    }finally{setBusy(false);}
  };

  const smsAvailable=!!String(settings.adminRecoveryPhone||"").trim();

  return <Modal title="🔓 Recover Admin PIN" onClose={()=>!busy&&onClose&&onClose()}>
    {stage==="menu"&&<div>
      <div style={{...c.bnr("info"),marginBottom:14}}>Pick a recovery path. The recovery passphrase you saved at first-time setup is the canonical reset.</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <button style={c.btn(T.gold,T.bg)} onClick={()=>setStage("passphrase")}>📜 Use Recovery Passphrase</button>
        <button style={c.btn(T.border,T.muted,{opacity:0.5,cursor:"not-allowed"})} disabled title={smsAvailable?"SMS recovery lands in Phase 3.":"No recovery phone on file. Use the passphrase path."}>📱 Send SMS Code (Phase 3)</button>
        <div style={{fontSize:10,color:T.muted}}>{smsAvailable?"SMS branch is deferred to Phase 3 alongside full staff auth. Use the passphrase path until then.":"No recovery phone configured. Set one in Settings → Security after you regain access."}</div>
      </div>
    </div>}

    {stage==="passphrase"&&<div>
      <div style={{...c.bnr("info"),marginBottom:14}}>Enter your 24-character recovery passphrase. Hyphens and case do not matter.</div>
      <F label="Recovery passphrase" value={passphrase} onChange={setPassphrase} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"/>
      {err&&<div style={{...c.bnr("warn"),marginBottom:10}}>{err}</div>}
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button style={c.btn(T.gold,T.bg)} onClick={onVerifyPassphrase} disabled={busy||!passphrase}>{busy?"Checking…":"Verify"}</button>
        <button style={c.bsm()} onClick={()=>{setStage("menu");setPassphrase("");setErr("");}} disabled={busy}>Back</button>
      </div>
    </div>}

    {stage==="newpin"&&<div>
      <div style={{...c.bnr("ok"),marginBottom:14}}>✓ Passphrase verified. Set a new Admin PIN.</div>
      <F label="New Admin PIN (4–12 digits)" type="password" value={newPin} onChange={setNewPin} required/>
      <F label="Confirm New PIN" type="password" value={newPinConfirm} onChange={setNewPinConfirm} required note={newPin&&newPinConfirm&&newPin!==newPinConfirm?"PINs do not match.":undefined}/>
      {err&&<div style={{...c.bnr("warn"),marginBottom:10}}>{err}</div>}
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button style={c.btn(isValidPin(newPin)&&newPin===newPinConfirm&&!busy?T.gold:T.border,isValidPin(newPin)&&newPin===newPinConfirm&&!busy?T.bg:T.muted)} disabled={!(isValidPin(newPin)&&newPin===newPinConfirm)||busy} onClick={onSaveNewPin}>{busy?"Re-encrypting…":"Save & Unlock"}</button>
        <button style={c.bsm()} onClick={()=>!busy&&onClose&&onClose()} disabled={busy}>Cancel</button>
      </div>
    </div>}
  </Modal>;
}
