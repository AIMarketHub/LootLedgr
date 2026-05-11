// LootLedger — Platform Admin app shell.
// Phase 5.2-PRE-2 v2 (2026-05-11). Replaces the minimal MVP
// shops dashboard from 464f26f with a multi-section nav +
// content area. Mounted via Router.jsx admin-mode branch
// when host = admin.lootledger.au.
//
// Layout:
//   ┌───────────────────────────────────────────────────────┐
//   │  Logo  Platform Admin           signed in · sign out  │
//   ├──────────────┬────────────────────────────────────────┤
//   │  OVERVIEW    │                                        │
//   │  · Shops     │       <Outlet/> renders the current    │
//   │  · Health    │       route's page component.          │
//   │  OPERATIONS  │                                        │
//   │  · TFS List  │                                        │
//   │  · ...       │                                        │
//   └──────────────┴────────────────────────────────────────┘

import React from "react";
import {NavLink,Outlet} from "react-router-dom";
import {useAuth} from "../../components/AuthProvider.jsx";
import {signOut} from "../../lib/auth/saas.js";
import Logo from "../../components/Logo.jsx";

const NAV_GROUPS=[
  {label:"Overview",items:[
    {to:"/shops",label:"Shops"},
    {to:"/health",label:"Health"},
  ]},
  {label:"Operations",items:[
    {to:"/tfs",label:"TFS List"},
    {to:"/subscriptions",label:"Subscriptions"},
    {to:"/diagnostics",label:"Diagnostics"},
    {to:"/jobs",label:"Background Jobs"},
  ]},
  {label:"Support",items:[
    {to:"/search",label:"Search"},
    {to:"/audit",label:"Audit Log"},
    {to:"/users",label:"Users"},
    {to:"/impersonate",label:"Impersonate"},
  ]},
  {label:"Administration",items:[
    {to:"/admins",label:"Platform Admins"},
    {to:"/shop-create",label:"Shop Creation"},
    {to:"/flags",label:"Feature Flags"},
    {to:"/security",label:"Security"},
    {to:"/austrac",label:"AUSTRAC Status"},
    {to:"/aged-audit",label:"Aged Audit"},
  ]},
];

const styles={
  page:{minHeight:"100vh",background:"#f5f5f5",color:"#222",fontFamily:"system-ui, -apple-system, Segoe UI, Roboto, sans-serif",display:"flex",flexDirection:"column"},
  topbar:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 20px",background:"#fff",borderBottom:"1px solid #ddd",gap:14,flexWrap:"wrap",flexShrink:0},
  brand:{display:"flex",alignItems:"center",gap:12},
  brandTitle:{fontSize:16,fontWeight:"bold",margin:0},
  topRight:{fontSize:12,color:"#666"},
  signOutBtn:{background:"none",border:"none",color:"#c9a84c",fontWeight:600,cursor:"pointer",padding:0,fontFamily:"inherit",fontSize:12},
  body:{display:"flex",flex:1,minHeight:0},
  sidebar:{width:200,background:"#fff",borderRight:"1px solid #ddd",padding:"16px 0",overflowY:"auto",flexShrink:0},
  navGroup:{marginBottom:14},
  navGroupLabel:{fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:"#888",fontWeight:"bold",padding:"4px 18px",margin:0},
  navItem:{display:"block",padding:"7px 18px",fontSize:13,color:"#333",textDecoration:"none",borderLeft:"3px solid transparent"},
  navItemActive:{display:"block",padding:"7px 18px",fontSize:13,color:"#1a3b6b",textDecoration:"none",borderLeft:"3px solid #c9a84c",background:"#fdf3d2",fontWeight:600},
  content:{flex:1,padding:"20px 24px",overflowY:"auto",minWidth:0},
};

export default function Shell(){
  const{user}=useAuth();

  const onSignOut=async()=>{
    try{await signOut();}catch(e){}
    window.location.replace("https://lootledger.au/login");
  };

  return <div style={styles.page}>
    <div style={styles.topbar}>
      <div style={styles.brand}>
        <Logo height={32}/>
        <h1 style={styles.brandTitle}>Platform Admin</h1>
      </div>
      <div style={styles.topRight}>
        Signed in as <strong>{user&&user.email}</strong> ·{" "}
        <button onClick={onSignOut} style={styles.signOutBtn}>Sign out</button>
      </div>
    </div>
    <div style={styles.body}>
      <nav style={styles.sidebar}>
        {NAV_GROUPS.map(g=>(
          <div key={g.label} style={styles.navGroup}>
            <div style={styles.navGroupLabel}>{g.label}</div>
            {g.items.map(it=>(
              <NavLink
                key={it.to}
                to={it.to}
                style={({isActive})=>isActive?styles.navItemActive:styles.navItem}
              >{it.label}</NavLink>
            ))}
          </div>
        ))}
      </nav>
      <main style={styles.content}>
        <Outlet/>
      </main>
    </div>
  </div>;
}
