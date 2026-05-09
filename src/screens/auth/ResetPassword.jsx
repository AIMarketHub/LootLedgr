// LootLedger — Password reset landing screen (Auth fix
// 2026-05-09). Target of the email link sent by ForgotPassword
// via supabase.auth.resetPasswordForEmail({redirectTo}).
//
// Flow:
//   1. User clicks the reset link in the email. URL is
//      `${origin}/reset-password#access_token=...&type=recovery
//        &refresh_token=...&...`
//   2. The supabase client (created with detectSessionInUrl:true
//      in src/lib/auth/saas.js:40-46) auto-detects the URL
//      fragment on page load and establishes a recovery session.
//      A PASSWORD_RECOVERY event fires on onAuthStateChange.
//   3. This screen renders a new-password form and calls
//      supabase.auth.updateUser({password}). On success: pop
//      "Password updated" and nav to /login so the user signs in
//      with the new credentials.
//
// Failure modes:
//   - Link expired or already used → updateUser throws "Auth
//     session missing" or similar. Surface via translateAuthError.
//   - User mistypes new password / confirm doesn't match → inline
//     validation, no Supabase round-trip.
//
// What this screen does NOT do:
//   - Sign the user in to /app directly. The recovery session is
//     transient; the proper landing post-update is /login with
//     the new password. This also gives the user a clear "OK,
//     password is set" confirmation step before they're signing
//     in for real.

import React,{useState,useEffect} from "react";
import {Link,useNavigate} from "react-router-dom";
import AuthLayout,{authStyles as A,PasswordField} from "./AuthLayout.jsx";
import {supabase} from "../../lib/auth/saas.js";
import {translateAuthError} from "../../lib/auth/errorMessages.js";

export default function ResetPassword(){
  const nav=useNavigate();
  const[hasRecoverySession,setHasRecoverySession]=useState(false);
  const[checking,setChecking]=useState(true);
  const[password,setPassword]=useState("");
  const[passwordConfirm,setPasswordConfirm]=useState("");
  const[err,setErr]=useState("");
  const[busy,setBusy]=useState(false);
  const[done,setDone]=useState(false);

  // On mount: check whether a session is present (the SDK
  // resolves the URL fragment synchronously-ish on createClient,
  // but we wait one tick to be safe). The PASSWORD_RECOVERY event
  // is the cleaner signal but also fires when a session is being
  // established mid-render — listening to both covers the cases.
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        const{data}=await supabase.auth.getSession();
        if(!cancelled)setHasRecoverySession(!!(data&&data.session));
      }catch(_){/* fall through */}
      finally{if(!cancelled)setChecking(false);}
    })();
    const sub=supabase.auth.onAuthStateChange((event,session)=>{
      if(event==="PASSWORD_RECOVERY"||event==="SIGNED_IN"){
        if(!cancelled)setHasRecoverySession(!!session);
      }
    });
    return()=>{cancelled=true;if(sub&&sub.data&&sub.data.subscription)sub.data.subscription.unsubscribe();};
  },[]);

  const onSubmit=async e=>{
    e.preventDefault();
    setErr("");
    if(password.length<8){setErr("Password must be at least 8 characters.");return;}
    if(password!==passwordConfirm){setErr("Passwords don't match.");return;}
    setBusy(true);
    try{
      const{error}=await supabase.auth.updateUser({password});
      if(error){setErr(translateAuthError(error.message||"Password update failed."));return;}
      setDone(true);
      // Sign out the recovery session so /login doesn't auto-
      // skip the password prompt. The user should explicitly
      // sign in with the new password.
      try{await supabase.auth.signOut();}catch(_){/* non-fatal */}
      setTimeout(()=>nav("/login",{replace:true}),1500);
    }finally{setBusy(false);}
  };

  return <AuthLayout
    title={done?"Password updated":"Set new password"}
    subtitle={
      done?"Redirecting to sign in…":
      checking?"Checking link…":
      hasRecoverySession?"Choose a new password for your account.":"This reset link is invalid or has expired."
    }
    footer={<><Link to="/login" style={A.link}>Back to sign in</Link></>}
  >
    {checking&&<div style={{textAlign:"center",padding:"20px 0",color:"#666"}}>Working…</div>}

    {!checking&&!hasRecoverySession&&!done&&<>
      <div style={A.error}>The reset link didn't carry a valid recovery session. Common causes: the link has been used already, expired, or was opened in a different browser than the one that requested it.</div>
      <Link to="/forgot" style={{...A.link,display:"block",textAlign:"center",marginTop:14}}>Request a new reset link</Link>
    </>}

    {!checking&&hasRecoverySession&&!done&&<form onSubmit={onSubmit}>
      <label style={A.label} htmlFor="rp-pw">New password</label>
      <PasswordField id="rp-pw" value={password} onChange={setPassword} autoComplete="new-password" placeholder="8+ characters" autoFocus/>

      <label style={A.label} htmlFor="rp-pw2">Confirm new password</label>
      <PasswordField id="rp-pw2" value={passwordConfirm} onChange={setPasswordConfirm} autoComplete="new-password"/>
      {password&&passwordConfirm&&password!==passwordConfirm&&<div style={{...A.helper,color:"#933"}}>Passwords don't match.</div>}

      {err&&<div style={A.error}>{err}</div>}

      <button type="submit" style={A.primary} disabled={busy||!password||!passwordConfirm}>
        {busy?"Updating…":"Set new password"}
      </button>
    </form>}

    {done&&<div style={A.info}>Password updated. Sign in with your new password.</div>}
  </AuthLayout>;
}
