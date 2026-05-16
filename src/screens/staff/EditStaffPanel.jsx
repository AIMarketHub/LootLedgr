// LootLedger — Edit Staff Panel.
// Phase 5.2 staff-workspace fix-forward 1.5 (2026-05-16).
//
// Opened from the ✏ Edit button on each Staff Tile (visible only
// to owner / manager). Lets the boss change a staff member's
// name / email / role, reset their PIN, or deactivate their
// profile (soft delete).
//
// Permission breakdown:
//   - Name + email: editable by owner OR manager.
//   - Role: editable by owner only (server-side check too).
//   - Reset PIN: owner only (uses existing set_staff_pin RPC).
//   - Deactivate: owner OR manager, but manager can't deactivate
//     an owner (server-side check too).
//   - Cannot deactivate or edit your own row from here — use the
//     Profile → Settings tab for self-management.
//
// Admin PIN gate: the parent (StaffTiles) has already prompted
// for and cached the caller's PIN at first ✏ click, so this
// panel doesn't re-prompt — the gate is upstream.

import React,{useState} from "react";
import {T,c} from "../../theme.js";
import {sS} from "../../lib/utils.js";
import {F,SF} from "../../components/ui";
import {useAuth} from "../../components/AuthProvider.jsx";
import {setStaffPin,adminSetStaffActive,adminUpdateStaffFields} from "../../lib/auth/saas.js";

function userLabel(u){
  if(!u)return "(unknown)";
  const fn=sS(u.first_name||"");
  const ln=sS(u.family_name||"");
  const full=(fn+" "+ln).trim();
  return full||sS(u.email)||"(no name)";
}

function randomPin4(){
  // Random 4-digit PIN. Uses crypto when available.
  try{
    if(typeof crypto!=="undefined"&&crypto.getRandomValues){
      const bytes=new Uint8Array(2);
      crypto.getRandomValues(bytes);
      const n=((bytes[0]<<8)|bytes[1])%10000;
      return String(n).padStart(4,"0");
    }
  }catch(_){}
  return String(Math.floor(Math.random()*10000)).padStart(4,"0");
}

export default function EditStaffPanel({user,onClose,onChanged,pop}){
  const auth=useAuth();
  const callerRole=(auth&&auth.role)||null;
  const canEditRole=callerRole==="owner";
  const canResetPin=callerRole==="owner";
  const canDeactivate=callerRole==="owner"||(callerRole==="manager"&&user.role!=="owner");

  const[firstName,setFirstName]=useState(sS(user.first_name||""));
  const[familyName,setFamilyName]=useState(sS(user.family_name||""));
  const[email,setEmail]=useState(sS(user.email||""));
  const[role,setRole]=useState(sS(user.role||"staff"));

  const[busy,setBusy]=useState(false);
  const[errMsg,setErrMsg]=useState("");
  const[revealedPin,setRevealedPin]=useState(null);

  const roleOptions=[
    {value:"staff",label:"Staff"},
    {value:"manager",label:"Manager"},
    {value:"owner",label:"Owner"},
  ];

  const onSave=async()=>{
    setBusy(true);setErrMsg("");
    try{
      await adminUpdateStaffFields({
        userId:user.id,
        firstName,
        familyName,
        email,
        role:canEditRole?role:null,
      });
      pop&&pop("Staff details updated.","ok");
      if(typeof onChanged==="function")onChanged();
      onClose&&onClose();
    }catch(e){
      setErrMsg("Save failed: "+sS(e&&e.message));
    }finally{setBusy(false);}
  };

  const onResetPin=async()=>{
    if(!canResetPin)return;
    if(typeof window!=="undefined"&&window.confirm){
      if(!window.confirm("Reset PIN for "+userLabel(user)+"? They'll need to use the new PIN until they change it from their Profile → Settings."))return;
    }
    setBusy(true);setErrMsg("");
    try{
      const newPin=randomPin4();
      await setStaffPin(user.id,newPin);
      setRevealedPin(newPin);
      pop&&pop("PIN reset. Write down the new PIN before closing this panel.","warn");
      if(typeof onChanged==="function")onChanged();
    }catch(e){
      setErrMsg("Reset failed: "+sS(e&&e.message));
    }finally{setBusy(false);}
  };

  const onDeactivate=async()=>{
    if(!canDeactivate)return;
    if(typeof window!=="undefined"&&window.confirm){
      if(!window.confirm("Deactivate "+userLabel(user)+"? Their data is preserved but they can't sign in. Reactivate later via Studio if needed."))return;
    }
    setBusy(true);setErrMsg("");
    try{
      await adminSetStaffActive(user.id,false);
      pop&&pop("Profile deactivated.","ok");
      if(typeof onChanged==="function")onChanged();
      onClose&&onClose();
    }catch(e){
      setErrMsg("Deactivate failed: "+sS(e&&e.message));
    }finally{setBusy(false);}
  };

  return <div style={{position:"fixed",inset:0,background:"#000000e0",zIndex:2100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>!busy&&onClose&&onClose()}>
    <div style={{...c.card({padding:20}),maxWidth:520,width:"100%"}} onClick={e=>e.stopPropagation()}>
      <div style={{fontSize:14,fontWeight:"bold",color:T.white,marginBottom:6}}>✏ Edit staff — {userLabel(user)}</div>
      <div style={{fontSize:11,color:T.muted,marginBottom:12}}>
        Update name and email. {canEditRole?"Role editable.":"Role editable by owner only."} {canResetPin?"PIN resettable.":""} {canDeactivate?"Deactivate disables sign-in but preserves data.":""}
      </div>

      <div style={c.g2(10)}>
        <F label="First name" value={firstName} onChange={setFirstName} placeholder="Jane"/>
        <F label="Family name" value={familyName} onChange={setFamilyName} placeholder="Smith"/>
      </div>
      <div style={{marginTop:8}}>
        <F label="Email" value={email} onChange={setEmail} placeholder="jane@example.com"/>
      </div>
      <div style={{marginTop:8}}>
        {canEditRole
          ?<SF label="Role" value={role} onChange={setRole} options={roleOptions}/>
          :<div>
            <label style={c.lbl}>Role (read-only — owner can edit)</label>
            <div style={{...c.inp(),background:T.surface,color:T.muted,padding:"10px 12px"}}>{sS(role).toUpperCase()}</div>
          </div>}
      </div>

      {revealedPin?<div style={{...c.bnr("warn"),marginTop:14,fontFamily:"monospace",fontSize:14}}>
        New PIN for <strong>{userLabel(user)}</strong>: <strong style={{fontSize:18,letterSpacing:"0.2em"}}>{revealedPin}</strong>
        <div style={{fontSize:10,color:T.muted,marginTop:4,fontFamily:"system-ui"}}>Write this down before closing. It won't be shown again.</div>
      </div>:null}

      {errMsg?<div style={{...c.bnr("block"),marginTop:12}}>{errMsg}</div>:null}

      <div style={{display:"flex",gap:8,marginTop:18,flexWrap:"wrap",justifyContent:"space-between"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {canResetPin?<button style={c.bsm(T.goldBg,T.gold)} onClick={onResetPin} disabled={busy}>🔑 Reset PIN</button>:null}
          {canDeactivate?<button style={c.bsm(T.redBg||T.surface,T.red)} onClick={onDeactivate} disabled={busy}>🗑 Deactivate</button>:null}
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button style={c.bsm()} onClick={()=>!busy&&onClose&&onClose()} disabled={busy}>Cancel</button>
          <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={onSave} disabled={busy||!firstName&&!familyName&&!email}>{busy?"…":"Save changes"}</button>
        </div>
      </div>
    </div>
  </div>;
}
