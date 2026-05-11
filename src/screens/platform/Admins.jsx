// LootLedger — Platform Admin / grant + revoke.
// Phase 5.2-PRE-2 v2 (2026-05-11). UI for managing the
// platform_admins table introduced by migration 0020.
// RLS in 0020 already restricts SELECT/INSERT to platform
// admins.
//
// Grant flow:
//   1. Operator types email of an existing user in the
//      app (the user must already have signed up — we
//      don't create auth.users from here).
//   2. Lookup user_id from public.users WHERE email = X.
//   3. INSERT into platform_admins (user_id, granted_by,
//      notes). granted_by stamped to the current admin
//      via the AuthProvider.
//
// Revoke flow:
//   1. Operator clicks Revoke on a row.
//   2. Confirm dialog.
//   3. DELETE FROM platform_admins WHERE id = X.
//   4. Refuses to revoke the LAST remaining admin (would
//      lock everyone out). UI shows the count and disables
//      the revoke button on the only-row case.

import React,{useEffect,useState} from "react";
import {supabase} from "../../lib/auth/saas.js";
import {useAuth} from "../../components/AuthProvider.jsx";

const fmtTs=iso=>{
  if(!iso)return"—";
  const d=new Date(iso);
  if(isNaN(d.getTime()))return"—";
  const pad=n=>String(n).padStart(2,"0");
  return pad(d.getDate())+"-"+pad(d.getMonth()+1)+"-"+d.getFullYear()+" "+pad(d.getHours())+":"+pad(d.getMinutes());
};

const styles={
  h1:{fontSize:22,margin:"0 0 16px",fontWeight:"bold"},
  controls:{display:"flex",gap:8,marginBottom:14},
  primary:{padding:"8px 14px",background:"#1a6b2a",color:"#fff",border:"none",borderRadius:4,fontSize:13,fontWeight:"bold",cursor:"pointer",fontFamily:"inherit"},
  table:{width:"100%",background:"#fff",border:"1px solid #ddd",borderRadius:6,borderCollapse:"separate",borderSpacing:0,fontSize:13},
  th:{padding:"10px 12px",textAlign:"left",fontSize:11,letterSpacing:"0.05em",textTransform:"uppercase",color:"#666",borderBottom:"1px solid #ddd",background:"#fafafa"},
  td:{padding:"10px 12px",borderBottom:"1px solid #eee",verticalAlign:"top"},
  err:{padding:"10px 12px",background:"#fee",border:"1px solid #fcc",borderRadius:4,color:"#933",fontSize:13,marginBottom:14},
  ok:{padding:"10px 12px",background:"#dff5e3",border:"1px solid #bce6c4",borderRadius:4,color:"#1a6b2a",fontSize:13,marginBottom:14},
  revokeBtn:{padding:"6px 12px",background:"#fff",color:"#7a3838",border:"1px solid #c88",borderRadius:4,fontSize:12,cursor:"pointer",fontFamily:"inherit"},
  revokeBtnDisabled:{padding:"6px 12px",background:"#f4f4f4",color:"#aaa",border:"1px solid #ddd",borderRadius:4,fontSize:12,cursor:"not-allowed",fontFamily:"inherit"},
  modalBg:{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999},
  modalCard:{background:"#fff",borderRadius:8,padding:24,minWidth:380,maxWidth:480,boxShadow:"0 10px 40px rgba(0,0,0,0.3)"},
  modalTitle:{margin:"0 0 16px",fontSize:16,fontWeight:"bold"},
  label:{display:"block",fontSize:11,color:"#666",letterSpacing:"0.06em",textTransform:"uppercase",fontWeight:"bold",marginBottom:6},
  input:{width:"100%",padding:"8px 12px",border:"1px solid #ccc",borderRadius:4,fontSize:13,fontFamily:"inherit",boxSizing:"border-box",marginBottom:12},
  textarea:{width:"100%",padding:"8px 12px",border:"1px solid #ccc",borderRadius:4,fontSize:13,fontFamily:"inherit",boxSizing:"border-box",marginBottom:12,minHeight:60,resize:"vertical"},
  modalActions:{display:"flex",gap:8,justifyContent:"flex-end"},
  cancelBtn:{padding:"8px 14px",background:"#fff",color:"#666",border:"1px solid #ccc",borderRadius:4,fontSize:13,cursor:"pointer",fontFamily:"inherit"},
};

export default function Admins(){
  const{user}=useAuth();
  const[rows,setRows]=useState([]);
  const[users,setUsers]=useState([]);  // user_id → {email, first_name, family_name}
  const[loading,setLoading]=useState(true);
  const[err,setErr]=useState("");
  const[ok,setOk]=useState("");
  const[showGrant,setShowGrant]=useState(false);
  const[grantEmail,setGrantEmail]=useState("");
  const[grantNotes,setGrantNotes]=useState("");
  const[granting,setGranting]=useState(false);
  const[busyRevokeId,setBusyRevokeId]=useState(null);

  const load=async()=>{
    setLoading(true);
    setErr("");
    const adminsRes=await supabase.from("platform_admins").select("*").order("granted_at",{ascending:true});
    if(adminsRes.error){setErr(adminsRes.error.message||"platform_admins query failed");setRows([]);setLoading(false);return;}
    setRows(adminsRes.data||[]);
    const ids=(adminsRes.data||[]).map(r=>r.user_id).concat((adminsRes.data||[]).map(r=>r.granted_by).filter(Boolean));
    const uniqIds=Array.from(new Set(ids));
    if(uniqIds.length){
      const usersRes=await supabase.from("users").select("id, email, first_name, family_name").in("id",uniqIds);
      if(!usersRes.error)setUsers(usersRes.data||[]);
    }
    setLoading(false);
  };
  useEffect(()=>{load();},[]);

  const userById=id=>{
    if(!id)return null;
    return users.find(u=>String(u.id)===String(id))||null;
  };
  const userLabel=id=>{
    const u=userById(id);
    if(!u)return id?String(id).slice(0,8)+"…":"—";
    const name=((u.first_name||"")+" "+(u.family_name||"")).trim();
    return u.email+(name?" ("+name+")":"");
  };

  const onGrant=async()=>{
    setErr("");setOk("");
    const email=grantEmail.trim().toLowerCase();
    if(!email){setErr("Email required.");return;}
    setGranting(true);
    const lookup=await supabase.from("users").select("id, email").ilike("email",email).maybeSingle();
    if(lookup.error){setErr("User lookup failed: "+(lookup.error.message||"unknown"));setGranting(false);return;}
    if(!lookup.data){setErr("No user found with email "+email+". They must sign up at lootledger.au/signup first.");setGranting(false);return;}
    const ins=await supabase.from("platform_admins").insert({
      user_id:lookup.data.id,
      granted_by:(user&&user.id)||null,
      notes:grantNotes.trim()||null,
    });
    setGranting(false);
    if(ins.error){
      const msg=ins.error.message||"insert failed";
      if(/duplicate|unique/i.test(msg))setErr(email+" is already a platform admin.");
      else setErr("Grant failed: "+msg);
      return;
    }
    setOk("Granted platform admin to "+email+".");
    setShowGrant(false);
    setGrantEmail("");
    setGrantNotes("");
    await load();
  };

  const onRevoke=async(row)=>{
    setErr("");setOk("");
    if(rows.length<=1){setErr("Cannot revoke the last platform admin — would lock everyone out.");return;}
    const lbl=userLabel(row.user_id);
    if(typeof window!=="undefined"&&window.confirm){
      const okConfirm=window.confirm("Revoke platform admin from "+lbl+"?\n\nThey'll lose access to admin.lootledger.au.\n\nThis is logged via Supabase audit. To restore later, grant again from this page.");
      if(!okConfirm)return;
    }
    setBusyRevokeId(row.id);
    const del=await supabase.from("platform_admins").delete().eq("id",row.id);
    setBusyRevokeId(null);
    if(del.error){setErr("Revoke failed: "+(del.error.message||"unknown"));return;}
    setOk("Revoked platform admin from "+lbl+".");
    await load();
  };

  return <>
    <h1 style={styles.h1}>Platform Admins ({rows.length})</h1>

    <div style={styles.controls}>
      <button style={styles.primary} onClick={()=>{setShowGrant(true);setErr("");setOk("");}}>+ Grant new admin</button>
    </div>

    {err&&<div style={styles.err}>{err}</div>}
    {ok&&<div style={styles.ok}>{ok}</div>}

    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>User</th>
          <th style={styles.th}>Granted at</th>
          <th style={styles.th}>Granted by</th>
          <th style={styles.th}>Notes</th>
          <th style={styles.th}>Action</th>
        </tr>
      </thead>
      <tbody>
        {loading&&<tr><td colSpan={5} style={{...styles.td,textAlign:"center",color:"#888"}}>Loading…</td></tr>}
        {!loading&&rows.length===0&&!err&&<tr><td colSpan={5} style={{...styles.td,textAlign:"center",color:"#888"}}>No platform admins. (How are you reading this page?)</td></tr>}
        {rows.map(r=>{
          const isOnly=rows.length<=1;
          return <tr key={r.id}>
            <td style={styles.td}><strong>{userLabel(r.user_id)}</strong></td>
            <td style={styles.td}>{fmtTs(r.granted_at)}</td>
            <td style={styles.td}>{userLabel(r.granted_by)}</td>
            <td style={styles.td}>{r.notes||"—"}</td>
            <td style={styles.td}>
              <button
                style={isOnly?styles.revokeBtnDisabled:styles.revokeBtn}
                disabled={isOnly||busyRevokeId===r.id}
                onClick={()=>onRevoke(r)}
                title={isOnly?"Cannot revoke the last platform admin":""}
              >{busyRevokeId===r.id?"…":"Revoke"}</button>
            </td>
          </tr>;
        })}
      </tbody>
    </table>

    {showGrant&&<div style={styles.modalBg} onClick={()=>!granting&&setShowGrant(false)}>
      <div style={styles.modalCard} onClick={e=>e.stopPropagation()}>
        <h2 style={styles.modalTitle}>Grant platform admin</h2>
        <label style={styles.label}>User email</label>
        <input
          style={styles.input}
          type="email"
          value={grantEmail}
          onChange={e=>setGrantEmail(e.target.value)}
          placeholder="user@example.com"
          autoFocus
          disabled={granting}
        />
        <label style={styles.label}>Notes (optional)</label>
        <textarea
          style={styles.textarea}
          value={grantNotes}
          onChange={e=>setGrantNotes(e.target.value)}
          placeholder="Why is this user being granted platform admin?"
          disabled={granting}
        />
        {err&&<div style={styles.err}>{err}</div>}
        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={()=>setShowGrant(false)} disabled={granting}>Cancel</button>
          <button style={styles.primary} onClick={onGrant} disabled={granting||!grantEmail.trim()}>{granting?"Granting…":"Grant"}</button>
        </div>
      </div>
    </div>}
  </>;
}
