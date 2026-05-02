// LootLedger — Forgot Password screen (Stage 1.A).
// Single email field. Calls Supabase's resetPasswordForEmail
// which sends a magic-link reset email. The email itself is
// templated by Supabase Studio (Authentication → Email Templates);
// Stage 2 customises the template.

import React,{useState} from "react";
import {Link} from "react-router-dom";
import AuthLayout,{authStyles as A} from "./AuthLayout.jsx";
import {resetPasswordViaEmail} from "../../lib/auth/saas.js";

export default function ForgotPassword(){
  const[email,setEmail]=useState("");
  const[err,setErr]=useState("");
  const[info,setInfo]=useState("");
  const[busy,setBusy]=useState(false);

  const onSubmit=async e=>{
    e.preventDefault();
    setErr("");setInfo("");
    if(!email||!email.includes("@")){setErr("Valid email required.");return;}
    setBusy(true);
    const r=await resetPasswordViaEmail(email.trim());
    setBusy(false);
    if(!r.ok){setErr(r.error||"Could not send reset email.");return;}
    setInfo("Check your email for a reset link. It may take a minute to arrive — also check spam.");
  };

  return <AuthLayout
    title="Reset password"
    subtitle="We'll email you a reset link."
    footer={<><Link to="/login" style={A.link}>Back to sign in</Link></>}
  >
    <form onSubmit={onSubmit}>
      <label style={A.label} htmlFor="fp-em">Email</label>
      <input id="fp-em" style={A.input} type="email" autoComplete="email" autoFocus value={email} onChange={e=>setEmail(e.target.value)}/>
      {err&&<div style={A.error}>{err}</div>}
      {info&&<div style={A.info}>{info}</div>}
      <button type="submit" style={A.primary} disabled={busy||!email}>{busy?"Sending…":"Send reset link"}</button>
    </form>
  </AuthLayout>;
}
