// LootLedger — Platform Admin / Cross-shop user management.
// Phase 5.2-PRE-2 v2 (2026-05-11). Lists every user across
// every shop, joined to shop business_name. RLS in 0021
// permits platform admins to read public.users across shops.
//
// auth.users mutations (disable, force password reset) require
// the service-role key which a client app shouldn't carry. So
// the per-row actions deep-link to Supabase Studio's auth UI
// instead. A future Edge Function could wrap these and let
// us call them from the app — out of scope for this commit.
//
// last_sign_in_at lives on auth.users (also service-role).
// Shown as "—" until that's wired in.

import React,{useEffect,useState,useMemo} from "react";
import {supabase} from "../../lib/auth/saas.js";

const SUPABASE_PROJECT_REF=(import.meta.env.VITE_SUPABASE_URL||"").match(/https?:\/\/([^.]+)\.supabase\.co/);
const STUDIO_URL=SUPABASE_PROJECT_REF?("https://supabase.com/dashboard/project/"+SUPABASE_PROJECT_REF[1]+"/auth/users"):null;

const styles={
  h1:{fontSize:22,margin:"0 0 16px",fontWeight:"bold"},
  filter:{width:"100%",padding:"10px 12px",border:"1px solid #ccc",borderRadius:4,fontSize:14,marginBottom:14,boxSizing:"border-box",fontFamily:"inherit"},
  table:{width:"100%",background:"#fff",border:"1px solid #ddd",borderRadius:6,borderCollapse:"separate",borderSpacing:0,fontSize:13},
  th:{padding:"10px 12px",textAlign:"left",fontSize:11,letterSpacing:"0.05em",textTransform:"uppercase",color:"#666",borderBottom:"1px solid #ddd",background:"#fafafa"},
  td:{padding:"10px 12px",borderBottom:"1px solid #eee",verticalAlign:"top"},
  roleBadge:(role)=>{
    const map={
      owner:["#1a3b6b","#d2e0f5","#a8c2e6"],
      manager:["#7a5e1a","#fdf3d2","#ecd790"],
      staff:["#1a6b2a","#dff5e3","#bce6c4"],
    };
    const v=map[role]||["#666","#f4f4f4","#ddd"];
    return{display:"inline-block",padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:"bold",letterSpacing:"0.04em",textTransform:"uppercase",color:v[0],background:v[1],border:"1px solid "+v[2]};
  },
  link:{color:"#c9a84c",fontWeight:600,textDecoration:"none",fontSize:12},
  err:{padding:"10px 12px",background:"#fee",border:"1px solid #fcc",borderRadius:4,color:"#933",fontSize:13,marginBottom:14},
  note:{padding:"10px 12px",background:"#f0f4ff",border:"1px solid #c8d8f0",borderRadius:4,color:"#1a3b6b",fontSize:12,marginBottom:14,lineHeight:1.5},
};

export default function Users(){
  const[users,setUsers]=useState([]);
  const[shops,setShops]=useState([]);
  const[loading,setLoading]=useState(true);
  const[err,setErr]=useState("");
  const[filter,setFilter]=useState("");

  useEffect(()=>{
    let cancelled=false;
    Promise.all([
      supabase.from("users").select("id, shop_id, role, first_name, family_name, email, phone, created_at"),
      supabase.from("shops").select("id, business_name, subdomain"),
    ]).then(([uRes,sRes])=>{
      if(cancelled)return;
      if(uRes.error){setErr(uRes.error.message||"users query failed");setUsers([]);}
      else setUsers(uRes.data||[]);
      if(sRes&&!sRes.error)setShops(sRes.data||[]);
      setLoading(false);
    }).catch(e=>{
      if(cancelled)return;
      setErr("Could not load users: "+(e&&e.message||"unknown"));
      setLoading(false);
    });
    return()=>{cancelled=true;};
  },[]);

  const shopName=id=>{
    if(!id)return"—";
    const s=shops.find(x=>String(x.id)===String(id));
    return s?s.business_name:id;
  };

  const filtered=useMemo(()=>{
    const q=filter.trim().toLowerCase();
    if(!q)return users;
    return users.filter(u=>(
      String(u.email||"").toLowerCase().includes(q)||
      String(u.first_name||"").toLowerCase().includes(q)||
      String(u.family_name||"").toLowerCase().includes(q)||
      String(u.role||"").toLowerCase().includes(q)||
      String(shopName(u.shop_id)).toLowerCase().includes(q)
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[users,shops,filter]);

  const studioUserUrl=userId=>STUDIO_URL?(STUDIO_URL+"?selected="+userId):null;

  return <>
    <h1 style={styles.h1}>Users — Cross-shop</h1>

    <div style={styles.note}>
      Account actions (disable, force password reset, view auth metadata) require the Supabase service-role key,
      which a client app shouldn't carry. The per-row "Studio →" link opens the user's record in Supabase Studio's
      Auth panel where those actions can be performed safely.
    </div>

    <input style={styles.filter} type="text" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter by email, name, role, or shop…"/>

    {err&&<div style={styles.err}>{err}</div>}

    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>Email</th>
          <th style={styles.th}>Name</th>
          <th style={styles.th}>Shop</th>
          <th style={styles.th}>Role</th>
          <th style={styles.th}>Last sign-in</th>
          <th style={styles.th}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {loading&&<tr><td colSpan={6} style={{...styles.td,textAlign:"center",color:"#888"}}>Loading…</td></tr>}
        {!loading&&filtered.length===0&&!err&&<tr><td colSpan={6} style={{...styles.td,textAlign:"center",color:"#888"}}>No users match the filter.</td></tr>}
        {filtered.map(u=>{
          const name=((u.first_name||"")+" "+(u.family_name||"")).trim()||"—";
          const studioLink=studioUserUrl(u.id);
          return <tr key={u.id}>
            <td style={styles.td}><strong>{u.email||"—"}</strong></td>
            <td style={styles.td}>{name}</td>
            <td style={styles.td}>{shopName(u.shop_id)}</td>
            <td style={styles.td}><span style={styles.roleBadge(u.role)}>{u.role||"unknown"}</span></td>
            <td style={styles.td}><span style={{color:"#888"}}>—</span></td>
            <td style={styles.td}>
              {studioLink
                ?<a style={styles.link} href={studioLink} target="_blank" rel="noreferrer">Studio →</a>
                :<span style={{color:"#888",fontSize:11}}>Studio link unavailable (set VITE_SUPABASE_URL)</span>}
            </td>
          </tr>;
        })}
      </tbody>
    </table>
  </>;
}
