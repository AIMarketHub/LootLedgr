// LootLedger — IdPhotoCapture.
// Phase 2.7.6. ID-photo-first capture flow used when creating a new
// client record (NewTx step 4 auto-create path, and the Clients
// screen's "Create new" path from ClientSearch's 0-matches popup).
//
// Flow:
//   1. Staff captures or uploads a photo of the customer's ID.
//   2. Photo preview, with "Use This Photo" / "Retake" buttons.
//   3. On confirm, the ID-autofill dispatcher fires
//      extractIdFields(photo, settings) and the result + photo
//      flow back to the parent through onCapture(photo, fields).
//
// Provider abstraction (memory: project_ai_architecture.md): the
// dispatcher reads settings.idAutofillProvider and routes. With
// "none" / unset, fields come back as {} and the parent shows a
// blank manual KYC form. With a configured provider whose body is
// still a 2.7.3 stub, extract() throws "Not implemented" and we
// surface that as a warn toast — staff falls back to manual entry.
//
// Privacy notice (memory: project_ai_architecture.md — privacy
// posture in architecture, not prompt): the active provider's
// privacyNotice surfaces above the capture buttons every time
// staff takes a photo, not just in Settings. Cloud providers get
// the warn-style banner; on-device gets the info-style banner.

import React,{useState,useRef} from "react";
import {T,c} from "../theme.js";
import {sS} from "../lib/utils.js";
import {checkPhotoSize} from "../lib/storage.js";
import {extractIdFields,getProvider} from "../lib/idAutofill/index.js";

export default function IdPhotoCapture({settings,pop,onCapture,onCancel}){
  const[photo,setPhoto]=useState(null);
  const[busy,setBusy]=useState(false);
  const captureRef=useRef(null);
  const uploadRef=useRef(null);

  const provider=getProvider(settings);
  const privacyNotice=provider?provider.privacyNotice:null;
  const isCloud=provider&&provider.dataHandlingPosture!=="on-device";

  const onFile=e=>{
    const f=e.target.files&&e.target.files[0];
    if(!f)return;
    const r=new FileReader();
    r.onload=ev=>checkPhotoSize(ev.target.result,d=>setPhoto(d));
    r.readAsDataURL(f);
    e.target.value="";
  };

  const useThisPhoto=async()=>{
    setBusy(true);
    let fields={};
    try{
      fields=await extractIdFields(photo,settings)||{};
    }catch(e){
      pop&&pop("Autofill: "+sS(e.message)+" — fall back to manual entry.","warn");
      fields={};
    }finally{
      setBusy(false);
      onCapture&&onCapture(photo,fields);
    }
  };

  const retake=()=>setPhoto(null);

  return <div>
    <div style={{fontSize:13,fontWeight:"bold",color:T.white,marginBottom:6}}>📷 Capture ID Document</div>
    <div style={{fontSize:11,color:T.muted,marginBottom:14}}>Photo of the customer's ID first — KYC fields populate from the image where the autofill provider can read them. Staff reviews and corrects on the next step.</div>

    {privacyNotice&&<div style={{...c.bnr(isCloud?"warn":"info"),marginBottom:14}}>{privacyNotice}</div>}

    {!photo&&<div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
      <button style={c.btn(T.gold,T.bg)} onClick={()=>captureRef.current&&captureRef.current.click()}>📷 Capture from Camera</button>
      <button style={c.btn(T.border,T.text)} onClick={()=>uploadRef.current&&uploadRef.current.click()}>📂 Upload Photo</button>
      <input ref={captureRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" capture="environment" style={{display:"none"}} onChange={onFile}/>
      <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{display:"none"}} onChange={onFile}/>
    </div>}

    {photo&&<div style={{marginBottom:14}}>
      <div style={{...c.card({padding:10}),marginBottom:10}}>
        <img src={photo} alt="ID preview" style={{maxWidth:"100%",maxHeight:320,borderRadius:6,border:"1px solid "+T.border,display:"block"}}/>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button style={c.btn(T.green,T.bg)} onClick={useThisPhoto} disabled={busy}>{busy?"Reading…":"Use This Photo →"}</button>
        <button style={c.bsm()} onClick={retake} disabled={busy}>↺ Retake</button>
        {onCancel&&<button style={c.bsm()} onClick={onCancel} disabled={busy}>Cancel</button>}
      </div>
    </div>}

    {!photo&&onCancel&&<button style={c.bsm()} onClick={onCancel}>Cancel</button>}
  </div>;
}
