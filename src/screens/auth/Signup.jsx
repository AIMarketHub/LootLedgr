// LootLedger — Signup screen (Stage 1.A).
// Utilitarian multi-field form. Both email and phone required.
// ABN validated by the 11-digit checksum algorithm. Password
// minimum 8 characters. On success, the user is signed in (the
// signUp call leaves a session in place) and routed to /app
// with a quick "trial runs until X" notice carried in toast
// state — the dashboard then surfaces the trial timer.

import React,{useState} from "react";
import {Link,useNavigate} from "react-router-dom";
import AuthLayout,{authStyles as A} from "./AuthLayout.jsx";
import {signUp} from "../../lib/auth/saas.js";
import {useAuth} from "../../components/AuthProvider.jsx";

// AU ABN — 11 digits with weighted modulo-89 checksum.
// https://abr.business.gov.au/Help/AbnFormat
function abnValid(abn){
  const digits=String(abn||"").replace(/\s+/g,"");
  if(!/^\d{11}$/.test(digits))return false;
  const w=[10,1,3,5,7,9,11,13,15,17,19];
  const arr=digits.split("").map(d=>parseInt(d,10));
  arr[0]-=1;
  const sum=arr.reduce((a,n,i)=>a+n*w[i],0);
  return sum%89===0;
}

// Lenient AU phone normaliser. Accepts "0412345678", "+61412345678",
// "+61 412 345 678", "0412 345 678". Returns "+614xxxxxxxx" or null.
function normalisePhone(input){
  const digits=String(input||"").replace(/[^0-9]/g,"");
  if(digits.startsWith("61")&&digits.length===11)return "+"+digits;
  if(digits.startsWith("0")&&digits.length===10)return "+61"+digits.slice(1);
  if(digits.length===9)return "+61"+digits;
  return null;
}

export default function Signup(){
  const[firstName,setFirstName]=useState("");
  const[familyName,setFamilyName]=useState("");
  const[businessName,setBusinessName]=useState("");
  const[abn,setAbn]=useState("");
  const[email,setEmail]=useState("");
  const[phone,setPhone]=useState("");
  const[password,setPassword]=useState("");
  const[err,setErr]=useState("");
  const[info,setInfo]=useState("");
  const[busy,setBusy]=useState(false);
  const nav=useNavigate();
  const{refresh}=useAuth();

  const validate=()=>{
    if(!firstName.trim())return "First name is required.";
    if(!familyName.trim())return "Family name is required.";
    if(!businessName.trim())return "Business name is required.";
    if(!abn.trim())return "ABN is required.";
    if(!abnValid(abn))return "ABN doesn't pass the 11-digit checksum. Check the number.";
    if(!email.trim()||!email.includes("@"))return "Valid email required.";
    const p=normalisePhone(phone);
    if(!p)return "Valid AU phone required (e.g. 0412 345 678).";
    if(password.length<8)return "Password must be at least 8 characters.";
    return null;
  };

  const onSubmit=async e=>{
    e.preventDefault();
    setErr("");setInfo("");
    const v=validate();
    if(v){setErr(v);return;}
    setBusy(true);
    const r=await signUp({
      email:email.trim(),
      phone:normalisePhone(phone),
      password,
      firstName:firstName.trim(),
      familyName:familyName.trim(),
      businessName:businessName.trim(),
      abn:abn.replace(/\s+/g,""),
    });
    setBusy(false);
    if(!r.ok){
      // Friendly nudge on the most common failure (email already
      // registered).
      if(/already|registered|exists/i.test(r.error))setErr("That email is already registered. Try signing in instead.");
      else setErr(r.error||"Signup failed.");
      return;
    }
    await refresh();
    nav("/app",{replace:true});
  };

  return <AuthLayout
    title="Create account"
    subtitle="3-month free trial — no credit card"
    footer={<>Already have an account? <Link to="/login" style={A.link}>Sign in</Link></>}
  >
    <form onSubmit={onSubmit}>
      <div style={{display:"flex",gap:10}}>
        <div style={{flex:1}}>
          <label style={A.label} htmlFor="su-fn">First name</label>
          <input id="su-fn" style={A.input} type="text" autoComplete="given-name" value={firstName} onChange={e=>setFirstName(e.target.value)}/>
        </div>
        <div style={{flex:1}}>
          <label style={A.label} htmlFor="su-ln">Family name</label>
          <input id="su-ln" style={A.input} type="text" autoComplete="family-name" value={familyName} onChange={e=>setFamilyName(e.target.value)}/>
        </div>
      </div>
      <label style={A.label} htmlFor="su-bn">Business name</label>
      <input id="su-bn" style={A.input} type="text" value={businessName} onChange={e=>setBusinessName(e.target.value)} placeholder="e.g. Ballarat Gold &amp; Silver"/>
      <div style={A.helper}>Used to derive your shop's subdomain (e.g. ballarat.lootledger.com.au).</div>

      <label style={A.label} htmlFor="su-abn">ABN</label>
      <input id="su-abn" style={A.input} type="text" inputMode="numeric" value={abn} onChange={e=>setAbn(e.target.value)} placeholder="11 digits"/>

      <label style={A.label} htmlFor="su-em">Email</label>
      <input id="su-em" style={A.input} type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/>

      <label style={A.label} htmlFor="su-ph">Phone</label>
      <input id="su-ph" style={A.input} type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="0412 345 678"/>

      <label style={A.label} htmlFor="su-pw">Password</label>
      <input id="su-pw" style={A.input} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="8+ characters"/>

      {err&&<div style={A.error}>{err}</div>}
      {info&&<div style={A.info}>{info}</div>}

      <button type="submit" style={A.primary} disabled={busy}>{busy?"Creating…":"Create account & start trial"}</button>
    </form>
  </AuthLayout>;
}
