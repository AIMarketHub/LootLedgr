// LootLedger — staff invite claim screen (Phase 3 commit 3d-4-b).
//
// /claim-invite?token=... — entry point owners share with new
// staff. Single-component flow, no URL/localStorage round-trips:
//
//   On mount with valid token:
//     - If user already signed in → call claim_staff_invite RPC,
//       refresh auth, navigate to /app.
//     - If user not signed in → render inline auth (Sign in OR
//       Sign up). On submit → auth → claim → refresh → /app.
//
// Sign-up branch is a SUBSET of Signup.jsx — no business name,
// no ABN, no signup_shop RPC. The new staff is JOINING the
// inviter's shop; the public.users row + shop assignment land
// when claim_staff_invite resolves.
//
// Token validity is enforced server-side by the claim_staff_invite
// RPC (unclaimed + unexpired check). The screen surfaces RPC
// errors verbatim so the inviter knows to send a fresh link.
//
// What this DOES NOT do (deliberate scope):
//   - Stash the token in localStorage. The entire flow runs in
//     this component instance; the token never needs to survive
//     a navigation.
//   - Redirect away when no token. Shows a clear error so the
//     inviter knows the link they sent was malformed.
//   - Resend invite. Owner-side concern; not in this screen.

import React,{useState,useEffect,useCallback} from "react";
import {useLocation,useNavigate,Link} from "react-router-dom";
import AuthLayout,{authStyles as A,PasswordField} from "./AuthLayout.jsx";
import {signIn,signUpForInvite,claimStaffInvite,recordLegalAcceptance} from "../../lib/auth/saas.js";
import {translateAuthError} from "../../lib/auth/errorMessages.js";
import {useAuth} from "../../components/AuthProvider.jsx";
import LegalDocsViewer from "../../modals/LegalDocsViewer.jsx";

// AU-friendly phone normaliser (mirrors Signup.jsx pattern).
// Returns "+614xxxxxxxx" or null. Phone is OPTIONAL on the
// invite-claim flow — null is fine; we just don't pass it through.
function normalisePhone(input){
  const digits=String(input||"").replace(/[^0-9]/g,"");
  if(!digits)return null;
  if(digits.startsWith("61")&&digits.length===11)return "+"+digits;
  if(digits.startsWith("0")&&digits.length===10)return "+61"+digits.slice(1);
  if(digits.length===9)return "+61"+digits;
  return null;
}

export default function ClaimInvite(){
  const loc=useLocation();
  const nav=useNavigate();
  const{user,refresh}=useAuth();

  // Token captured once on mount and held in component state for
  // the lifetime of this screen.
  const params=new URLSearchParams(loc.search);
  const[token]=useState(params.get("token")||"");

  // step: loading → auth (or claiming) → done | error
  const[step,setStep]=useState("loading");
  const[authMode,setAuthMode]=useState("signup");
  const[email,setEmail]=useState("");
  const[password,setPassword]=useState("");
  const[passwordConfirm,setPasswordConfirm]=useState("");
  const[firstName,setFirstName]=useState("");
  const[familyName,setFamilyName]=useState("");
  const[phone,setPhone]=useState("");
  const[acceptedLegal,setAcceptedLegal]=useState(false);
  const[legalViewer,setLegalViewer]=useState(null);
  const[busy,setBusy]=useState(false);
  const[errMsg,setErrMsg]=useState("");
  const[doneMsg,setDoneMsg]=useState("");

  // Single source of truth for the claim attempt — used both by
  // the auto-claim path (already-signed-in user) and the post-
  // auth-submit path (sign in / sign up then claim).
  const doClaim=useCallback(async()=>{
    setStep("claiming");
    setErrMsg("");
    try{
      await claimStaffInvite(token);
      // Stamp legal acceptance now that the public.users row
      // exists. Best-effort — failure is non-fatal (the
      // re-acceptance gate fires on next session refresh if
      // missed). Only stamp when sign-up flow accepted; sign-in
      // flow assumes the user already accepted on prior signup.
      if(acceptedLegal){
        try{await recordLegalAcceptance({termsVersion:"default",privacyPolicyVersion:"default"});}catch(_){/* non-fatal */}
      }
      await refresh();
      setStep("done");
      setDoneMsg("You're in! Redirecting…");
      setTimeout(()=>nav("/app",{replace:true}),900);
    }catch(e){
      setStep("error");
      setErrMsg((e&&e.message)||"Claim failed.");
    }
  },[token,acceptedLegal,refresh,nav]);

  // Mount-time decision: if no token → error; if signed-in →
  // claim; if not → auth.
  useEffect(()=>{
    if(!token){
      setStep("error");
      setErrMsg("Invalid invite link — no token in URL. Ask the shop owner to send a fresh link.");
      return;
    }
    if(user){
      doClaim();
    }else{
      setStep("auth");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[token,user]);

  const onSubmit=async e=>{
    e.preventDefault();
    setErrMsg("");
    if(!email.trim()||!email.includes("@")){setErrMsg("Valid email required.");return;}
    if(password.length<8){setErrMsg("Password must be 8+ characters.");return;}
    if(authMode==="signup"){
      if(!firstName.trim()){setErrMsg("First name required.");return;}
      if(!familyName.trim()){setErrMsg("Family name required.");return;}
      if(password!==passwordConfirm){setErrMsg("Passwords don't match.");return;}
      if(!acceptedLegal){setErrMsg("You must accept the Terms of Service and Privacy Policy.");return;}
    }
    setBusy(true);
    try{
      if(authMode==="signin"){
        const r=await signIn({identifier:email.trim(),password});
        if(!r.ok){setErrMsg(translateAuthError(r.error));return;}
      }else{
        const r=await signUpForInvite({
          email:email.trim(),
          password,
          firstName:firstName.trim(),
          familyName:familyName.trim(),
          phone:normalisePhone(phone)||undefined,
        });
        if(!r.ok){setErrMsg(translateAuthError(r.error));return;}
      }
      // Auth resolved (assuming auto-confirm is on). Refresh so
      // useAuth() reflects the new session before doClaim's
      // refresh runs.
      await refresh();
      await doClaim();
    }finally{setBusy(false);}
  };

  const tabBtn=(mode,label)=>{
    const active=authMode===mode;
    return <button type="button" onClick={()=>{setAuthMode(mode);setErrMsg("");}} style={{
      ...A.secondary,
      marginTop:0,
      flex:1,
      fontWeight:active?"bold":"normal",
      background:active?"#eef6ff":"#fff",
      borderColor:active?"#cde":"#ccc",
      color:active?"#26568f":"#444",
    }}>{label}</button>;
  };

  return <AuthLayout
    title={
      step==="loading"?"Loading…":
      step==="claiming"?"Joining shop…":
      step==="done"?doneMsg||"Done":
      step==="error"?"Invite problem":
      authMode==="signin"?"Sign in to claim invite":"Create account to claim invite"
    }
    subtitle={
      step==="auth"?"You've been invited to join a Loot Ledger shop.":undefined
    }
    footer={step==="auth"?<>Already have an account or want to start a new shop instead? <Link to="/login" style={A.link}>Sign in</Link> or <Link to="/signup" style={A.link}>create your own</Link>.</>:null}
  >
    {(step==="loading"||step==="claiming")&&<div style={{textAlign:"center",padding:"20px 0",color:"#666"}}>Working…</div>}

    {step==="done"&&<div style={A.info}>{doneMsg}</div>}

    {step==="error"&&<>
      <div style={A.error}>{errMsg||"Something went wrong."}</div>
      <button type="button" style={A.secondary} onClick={()=>nav("/login")}>Go to sign in</button>
    </>}

    {step==="auth"&&<form onSubmit={onSubmit}>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        {tabBtn("signup","Create account")}
        {tabBtn("signin","Sign in")}
      </div>

      <label style={A.label} htmlFor="ci-em">Email</label>
      <input id="ci-em" style={A.input} type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/>

      {authMode==="signup"&&<>
        <div style={{display:"flex",gap:10}}>
          <div style={{flex:1}}>
            <label style={A.label} htmlFor="ci-fn">First name</label>
            <input id="ci-fn" style={A.input} type="text" autoComplete="given-name" value={firstName} onChange={e=>setFirstName(e.target.value)}/>
          </div>
          <div style={{flex:1}}>
            <label style={A.label} htmlFor="ci-ln">Family name</label>
            <input id="ci-ln" style={A.input} type="text" autoComplete="family-name" value={familyName} onChange={e=>setFamilyName(e.target.value)}/>
          </div>
        </div>
        <label style={A.label} htmlFor="ci-ph">Phone (optional)</label>
        <input id="ci-ph" style={A.input} type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="0412 345 678"/>
      </>}

      <label style={A.label} htmlFor="ci-pw">Password</label>
      <PasswordField id="ci-pw" value={password} onChange={setPassword} autoComplete={authMode==="signin"?"current-password":"new-password"} placeholder={authMode==="signin"?"":"8+ characters"}/>

      {authMode==="signup"&&<>
        <label style={A.label} htmlFor="ci-pw2">Confirm password</label>
        <PasswordField id="ci-pw2" value={passwordConfirm} onChange={setPasswordConfirm} autoComplete="new-password"/>
        {password&&passwordConfirm&&password!==passwordConfirm&&<div style={{...A.helper,color:"#933"}}>Passwords don't match.</div>}

        <label style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:12,marginTop:14,marginBottom:6,cursor:"pointer",lineHeight:1.5,color:"#444"}}>
          <input type="checkbox" checked={acceptedLegal} onChange={e=>setAcceptedLegal(e.target.checked)} style={{marginTop:3}}/>
          <span>
            I have read and agree to the{" "}
            <button type="button" onClick={()=>setLegalViewer("tos")} style={{...A.link,background:"none",border:"none",padding:0,cursor:"pointer",font:"inherit"}}>Terms of Service</button>
            {" "}and{" "}
            <button type="button" onClick={()=>setLegalViewer("privacy")} style={{...A.link,background:"none",border:"none",padding:0,cursor:"pointer",font:"inherit"}}>Privacy Policy</button>.
          </span>
        </label>
      </>}

      {errMsg&&<div style={A.error}>{errMsg}</div>}

      <button type="submit" style={A.primary} disabled={busy||(authMode==="signup"&&!acceptedLegal)}>
        {busy?"Working…":(authMode==="signin"?"Sign in & claim":"Create account & claim")}
      </button>
    </form>}

    {legalViewer&&<LegalDocsViewer kind={legalViewer} settings={{}} onClose={()=>setLegalViewer(null)}/>}
  </AuthLayout>;
}
