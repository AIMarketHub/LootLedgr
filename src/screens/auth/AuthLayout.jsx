// LootLedger — shared shell for auth screens.
// Stage 1.A. Utilitarian: centered card on a light background,
// no app chrome. Stage 2 marketing pass replaces this with the
// branded landing-page treatment.

import React from "react";
import Logo from "../../components/Logo.jsx";

export default function AuthLayout({title,subtitle,children,footer}){
  return <div style={{
    minHeight:"100vh",
    background:"#f5f5f5",
    color:"#222",
    fontFamily:"system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    padding:"40px 16px",
    display:"flex",
    alignItems:"flex-start",
    justifyContent:"center",
  }}>
    <div style={{
      width:"100%",
      maxWidth:440,
      background:"#fff",
      border:"1px solid #ddd",
      borderRadius:8,
      padding:"32px 28px",
      boxShadow:"0 4px 20px rgba(0,0,0,0.06)",
    }}>
      <div style={{textAlign:"center",marginBottom:24}}>
        {/* Auth screens render on a white card on light grey bg →
            DARK variant (dark logo on light surface). The spec
            called this "light" by surface name; we use "dark" by
            asset color to actually be visible. */}
        <div style={{display:"flex",justifyContent:"center",marginBottom:10}}>
          <Logo height={64}/>
        </div>
        {/* 2026-05-08 typography swap — wordmark now dominates
            the action heading. The brand IS the page identity;
            "Sign In" / "Sign up" / "Forgot password" is the
            secondary action label. */}
        <div style={{fontSize:30,fontWeight:700,color:"#c9a84c",letterSpacing:"0.06em",marginBottom:4}}>LOOT LEDGER</div>
        {title&&<h1 style={{fontSize:17,margin:"14px 0 2px",fontWeight:600,color:"#555"}}>{title}</h1>}
        {subtitle&&<div style={{fontSize:13,color:"#666"}}>{subtitle}</div>}
      </div>
      {children}
      {footer&&<div style={{marginTop:20,paddingTop:16,borderTop:"1px solid #eee",fontSize:12,color:"#666",textAlign:"center"}}>{footer}</div>}
    </div>
  </div>;
}

// Shared form-control styles — kept inline so AuthLayout is the
// single source of truth for the auth visual register.
export const authStyles={
  label:{display:"block",fontSize:11,fontWeight:600,color:"#444",letterSpacing:"0.04em",textTransform:"uppercase",marginBottom:4,marginTop:12},
  input:{width:"100%",padding:"10px 12px",border:"1px solid #ccc",borderRadius:4,fontSize:14,boxSizing:"border-box",fontFamily:"inherit"},
  primary:{width:"100%",padding:"12px 16px",background:"#c9a84c",color:"#000",border:"none",borderRadius:4,fontSize:14,fontWeight:"bold",cursor:"pointer",marginTop:20,fontFamily:"inherit"},
  secondary:{width:"100%",padding:"10px 16px",background:"#fff",color:"#444",border:"1px solid #ccc",borderRadius:4,fontSize:13,cursor:"pointer",marginTop:8,fontFamily:"inherit"},
  link:{color:"#c9a84c",textDecoration:"none",fontWeight:600},
  error:{padding:"10px 12px",background:"#fee",border:"1px solid #fcc",borderRadius:4,fontSize:13,color:"#933",fontWeight:700,marginTop:14,marginBottom:4},
  info:{padding:"10px 12px",background:"#eef6ff",border:"1px solid #cde",borderRadius:4,fontSize:12,color:"#26568f",marginTop:14},
  helper:{fontSize:11,color:"#888",marginTop:4},
};

// Password input with an inline 👁 toggle that flips type between
// "password" (masked) and "text" (visible). Reusable across Login
// + Signup so both screens share the same affordance.
//
// `id` and `autoComplete` flow through to the underlying input so
// browsers do the right thing for password managers.
export function PasswordField({id,value,onChange,autoComplete,placeholder,autoFocus}){
  const[shown,setShown]=React.useState(false);
  return <div style={{position:"relative"}}>
    <input
      id={id}
      style={{...authStyles.input,paddingRight:42}}
      type={shown?"text":"password"}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={value}
      onChange={e=>onChange(e.target.value)}
    />
    <button
      type="button"
      onClick={()=>setShown(s=>!s)}
      aria-label={shown?"Hide password":"Show password"}
      style={{
        position:"absolute",
        right:6,
        top:"50%",
        transform:"translateY(-50%)",
        background:"none",
        border:"none",
        cursor:"pointer",
        fontSize:16,
        padding:"4px 8px",
        color:"#888",
        fontFamily:"inherit",
      }}
    >{shown?"🙈":"👁"}</button>
  </div>;
}
