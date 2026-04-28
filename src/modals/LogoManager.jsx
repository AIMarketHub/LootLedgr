// LootLedger — LogoManager modal.
// Mechanically extracted from src/App.tsx during Phase 2 step 10i
// (briefing §7.3). Markup preserved verbatim except for the
// touch-target enhancement on the per-thumbnail ✕ button — see
// next paragraph.
//
// Touch-target enhancement (folder-style component rule, memory:
// feedback_folder_components.md). The visible ✕ stays small (20×20)
// regardless of state so the folder doesn't visually overwhelm at
// scale. When the thumbnail is the *active* logo (the one currently
// in use, gold border), the ✕ button gains a transparent
// 12px-padding hit zone, making the touch box 44×44 to satisfy
// briefing §5.8. Inactive thumbnails keep the small hit area —
// fine for a precision pointer, and the user typically clicks the
// thumbnail itself first to make it active before deleting.
//
// The modal is rendered as a custom overlay rather than via the
// Modal primitive — different layout (smaller card, no header X
// button, "Close" at the bottom). Behaviour preserved from the
// original logoPinMode block in App.tsx.

import React from "react";
import {T,c} from "../theme.js";
import {uid} from "../lib/utils.js";

const VISUAL=20;
const HIT=44;
const PAD=Math.round((HIT-VISUAL)/2);  // 12

export default function LogoManager({
  settings,setSettings,
  logoLib,setLogoLib,
  logoDel,setLogoDel,
  pop,
  logoPinMode,setLogoPinMode,
}){
  if(!logoPinMode)return null;
  return <div style={{position:"fixed",inset:0,background:"#000000e0",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setLogoPinMode(false)}>
    <div style={{...c.card({padding:24}),maxWidth:400,width:"100%"}} onClick={e=>e.stopPropagation()}>
      <div style={{fontSize:14,fontWeight:"bold",color:T.white,marginBottom:16}}>🖼 Logo Manager</div>
      <div style={{marginBottom:14}}>
        <label style={{...c.btn(T.gold,T.bg),display:"inline-block",cursor:"pointer",marginBottom:10}}>Upload Logo<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{display:"none"}} onChange={e=>{const f=e.target.files&&e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{const data=ev.target.result;const entry={id:uid(),data,isLogo:true};setLogoLib(p=>[entry,...p]);setSettings(p=>({...p,logoImg:data}));pop("Logo updated.","ok");setLogoPinMode(false);};r.readAsDataURL(f);e.target.value="";  }}/></label>
        {(logoLib||[]).length>0&&<div>
          <div style={{fontSize:11,color:T.muted,marginBottom:8}}>Saved logos:</div>
          {logoDel&&<div style={{...c.bnr("warn"),marginBottom:10,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <img src={logoDel.data} alt="" style={{width:32,height:32,borderRadius:"50%",objectFit:"cover",flexShrink:0}}/>
            <span style={{flex:1,minWidth:140,fontSize:12}}>Delete this image? This cannot be undone.</span>
            <button style={c.btn(T.red,T.white,{fontSize:11,padding:"6px 12px"})} onClick={()=>{const wasActive=settings.logoImg===logoDel.data;setLogoLib(p=>p.filter(x=>x.id!==logoDel.id));if(wasActive)setSettings(p=>({...p,logoImg:""}));pop("Logo deleted.","ok");setLogoDel(null);}}>Delete</button>
            <button style={c.bsm()} onClick={()=>setLogoDel(null)}>Cancel</button>
          </div>}
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {(logoLib||[]).map(l=>{
              const isActive=settings.logoImg===l.data;
              const expand=isActive&&l.id!=="default-logo";
              return <div key={l.id} style={{position:"relative",cursor:"pointer"}} onClick={()=>{setSettings(p=>({...p,logoImg:l.data}));pop("Logo selected.","ok");setLogoPinMode(false);}}>
                <img src={l.data} alt="logo" style={{width:56,height:56,borderRadius:"50%",objectFit:"cover",border:"2px solid "+(isActive?T.gold:T.border)}}/>
                {l.id!=="default-logo"&&<button
                  title={expand?"Delete this image (large hit area)":"Delete this image"}
                  onClick={e=>{e.stopPropagation();setLogoDel(l);}}
                  style={{
                    position:"absolute",
                    top:expand?-(4+PAD):-4,
                    right:expand?-(4+PAD):-4,
                    width:expand?HIT:VISUAL,
                    height:expand?HIT:VISUAL,
                    padding:expand?PAD:0,
                    background:expand?"transparent":T.red,
                    color:expand?"transparent":T.white,
                    border:expand?"none":"1px solid "+T.bg,
                    borderRadius:expand?0:"50%",
                    cursor:"pointer",
                    fontSize:11,
                    lineHeight:expand?"normal":"18px",
                    fontWeight:"bold",
                    display:expand?"flex":"block",
                    alignItems:"center",
                    justifyContent:"center",
                  }}
                >
                  {expand
                    ? <span style={{display:"inline-flex",width:VISUAL,height:VISUAL,alignItems:"center",justifyContent:"center",borderRadius:"50%",background:T.red,color:T.white,border:"1px solid "+T.bg,fontSize:11,lineHeight:1,fontWeight:"bold"}}>✕</span>
                    : "✕"}
                </button>}
              </div>;
            })}
          </div>
        </div>}
      </div>
      <button style={c.bsm()} onClick={()=>setLogoPinMode(false)}>Close</button>
    </div>
  </div>;
}
