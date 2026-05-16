// LootLedger — Staff workspace Settings tab.
// Phase 5.2 staff-workspace fix-forward 1.5 (2026-05-16).
//
// Two sub-sections, both for the profile owner:
//   - My PIN — change the per-staff PIN. Requires the current PIN
//     to confirm identity before the new PIN is committed (the
//     existing set_my_pin RPC is the authoritative write; the
//     "current PIN" check is a UI-side identity step. Server side
//     trusts auth.uid() for the change.)
//   - Job title — decorative label printed on receipts. No PIN
//     required to change.
//
// Migrated 2026-05-16 from src/modals/Staff.jsx Section A.
// Source-file removal of Staff.jsx itself is intentionally NOT
// done; Section A's code in Staff.jsx is removed but the file
// stays per "only add, never remove."

import React,{useState,useEffect} from "react";
import {T,c} from "../../theme.js";
import {sS} from "../../lib/utils.js";
import {F} from "../../components/ui";
import {useAuth} from "../../components/AuthProvider.jsx";
import {setMyPin,setMyJobTitle} from "../../lib/auth/saas.js";

function normalizePin(v){
  const s=(v==null?"":String(v)).trim();
  if(s==="")return "";
  if(!/^\d{4,12}$/.test(s))return null;
  return s;
}

export default function SettingsTab({sessionPin,pop}){
  const auth=useAuth();
  const myRecord=(auth&&auth.userRecord)||null;
  const myPinSet=!!(myRecord&&myRecord.pin);

  const[currentPinInput,setCurrentPinInput]=useState("");
  const[newPinInput,setNewPinInput]=useState("");
  const[pinBusy,setPinBusy]=useState(false);

  const[jobTitleInput,setJobTitleInput]=useState("");
  const[jobTitleBusy,setJobTitleBusy]=useState(false);

  // Sync the current PIN field once with the cached session PIN
  // (verified at tile click) so the user doesn't have to retype
  // it. They CAN clear and retype if they want; the field is
  // editable.
  useEffect(()=>{
    if(sessionPin)setCurrentPinInput(sessionPin);
  },[sessionPin]);

  useEffect(()=>{
    setJobTitleInput(sS(myRecord&&myRecord.job_title)||"");
  },[myRecord]);

  const onChangePin=async()=>{
    const cur=normalizePin(currentPinInput);
    const next=normalizePin(newPinInput);
    if(myPinSet){
      if(!cur){pop&&pop("Enter your current PIN to confirm identity.","warn");return;}
      if(myRecord&&myRecord.pin&&cur!==myRecord.pin){pop&&pop("Current PIN doesn't match. Aborting change.","err");return;}
    }
    if(next===null||next===""){pop&&pop("New PIN must be 4–12 digits.","warn");return;}
    if(next===cur){pop&&pop("New PIN matches current PIN — no change.","warn");return;}
    setPinBusy(true);
    try{
      await setMyPin(next);
      setNewPinInput("");
      setCurrentPinInput(next);
      // Refresh the auth context so myPinSet flips true after a
      // first-set (and so the UI shows the latest pin value).
      if(typeof auth.refresh==="function")try{await auth.refresh();}catch(_){}
      pop&&pop("PIN updated. Use the new PIN next time you tap your tile.","ok");
    }catch(e){
      pop&&pop("PIN update failed: "+sS(e&&e.message),"err");
    }finally{setPinBusy(false);}
  };

  const onClearPin=async()=>{
    if(!myPinSet){pop&&pop("No PIN to clear.","info");return;}
    if(typeof window!=="undefined"&&window.confirm){
      if(!window.confirm("Clear your per-staff PIN? You'll need the shop Admin PIN to unlock the app until you set a new one."))return;
    }
    setPinBusy(true);
    try{
      await setMyPin(null);
      setCurrentPinInput("");
      setNewPinInput("");
      if(typeof auth.refresh==="function")try{await auth.refresh();}catch(_){}
      pop&&pop("PIN cleared.","ok");
    }catch(e){
      pop&&pop("Clear failed: "+sS(e&&e.message),"err");
    }finally{setPinBusy(false);}
  };

  const onSaveJobTitle=async()=>{
    setJobTitleBusy(true);
    try{
      await setMyJobTitle(jobTitleInput);
      if(typeof auth.refresh==="function")try{await auth.refresh();}catch(_){}
      pop&&pop("Job title updated.","ok");
    }catch(e){
      pop&&pop("Job title update failed: "+sS(e&&e.message),"err");
    }finally{setJobTitleBusy(false);}
  };

  return <div>
    {/* ── My PIN ───────────────────────────────────────────── */}
    <div style={{...c.card({padding:14}),marginBottom:14}}>
      <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:8,letterSpacing:"0.05em",textTransform:"uppercase"}}>My PIN</div>
      <div style={{fontSize:11,color:T.muted,marginBottom:10,lineHeight:1.5}}>
        {myPinSet
          ?"Change your per-staff PIN. Enter the current one to confirm identity, then the new one."
          :"You don't have a per-staff PIN. Set one to gate your tile."}
      </div>
      <div style={c.g2(10)}>
        {myPinSet?<F label="Current PIN" type="password" value={currentPinInput} onChange={setCurrentPinInput} placeholder="••••"/>:null}
        <F label={myPinSet?"New PIN (4–12 digits)":"PIN (4–12 digits)"} type="password" value={newPinInput} onChange={setNewPinInput} placeholder="••••"/>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
        <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={onChangePin} disabled={pinBusy||!newPinInput}>{pinBusy?"…":(myPinSet?"Change PIN":"Set PIN")}</button>
        {myPinSet?<button style={c.bsm(T.redBg||T.surface,T.red)} onClick={onClearPin} disabled={pinBusy}>Clear PIN</button>:null}
      </div>
    </div>

    {/* ── Job title ────────────────────────────────────────── */}
    <div style={c.card({padding:14})}>
      <div style={{fontSize:11,fontWeight:"bold",color:T.gold,marginBottom:8,letterSpacing:"0.05em",textTransform:"uppercase"}}>Job title</div>
      <div style={{fontSize:11,color:T.muted,marginBottom:10,lineHeight:1.5}}>
        Decorative label — printed on receipts and shown next to your name in admin views.
      </div>
      <F label="Job title" value={jobTitleInput} onChange={setJobTitleInput} placeholder="e.g. Goldsmith, Buyer"/>
      <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={onSaveJobTitle} disabled={jobTitleBusy}>{jobTitleBusy?"…":"Save job title"}</button>
    </div>
  </div>;
}
