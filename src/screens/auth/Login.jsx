// LootLedger — Login screen (Stage 1.A).
// Utilitarian. Single field for email-or-phone identifier
// (auto-detected by "@" presence), password, Sign In. Forgot
// password + Sign Up links underneath.

import React,{useState} from "react";
import {Link,useNavigate,useLocation} from "react-router-dom";
import AuthLayout,{authStyles as A,PasswordField} from "./AuthLayout.jsx";
import {signIn} from "../../lib/auth/saas.js";
import {useAuth} from "../../components/AuthProvider.jsx";

export default function Login(){
  const[identifier,setIdentifier]=useState("");
  const[password,setPassword]=useState("");
  const[err,setErr]=useState("");
  const[busy,setBusy]=useState(false);
  const nav=useNavigate();
  const loc=useLocation();
  const{refresh}=useAuth();
  const next=(loc.state&&loc.state.from)||"/app";

  const onSubmit=async e=>{
    e.preventDefault();
    setErr("");
    setBusy(true);
    const r=await signIn({identifier:identifier.trim(),password});
    setBusy(false);
    if(!r.ok){setErr(r.error||"Sign in failed.");return;}
    await refresh();
    nav(next,{replace:true});
  };

  return <AuthLayout
    title="Sign In"
    subtitle="Email or phone"
    footer={<>
      <div style={{marginBottom:6}}><Link to="/forgot" style={A.link}>Forgot password?</Link></div>
      <div>Don't have an account? <Link to="/signup" style={A.link}>Sign up</Link></div>
    </>}
  >
    <form onSubmit={onSubmit}>
      <label style={A.label} htmlFor="auth-id">Email or phone</label>
      <input id="auth-id" style={A.input} type="text" autoComplete="username" autoFocus value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="you@example.com or +614…"/>
      <label style={A.label} htmlFor="auth-pw">Password</label>
      <PasswordField id="auth-pw" autoComplete="current-password" value={password} onChange={setPassword}/>
      {err&&<div style={A.error}>{err}</div>}
      <button type="submit" style={A.primary} disabled={busy||!identifier||!password}>{busy?"Signing in…":"Sign In"}</button>
    </form>
  </AuthLayout>;
}
