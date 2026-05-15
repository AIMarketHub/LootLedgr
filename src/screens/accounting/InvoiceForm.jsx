// LootLedger — Invoice Manager form.
// Phase 5.2 Commit 1 (2026-05-15).
//
// Add or edit a single invoice row. Used by:
//   - Settings → Accounting → Invoice Manager → "+ Add Invoice"
//   - Settings → Accounting → Invoice Manager → "✏ Edit" row
//   - EOD modal → "📋 Add Invoice" button
//
// Image upload: jpg / png / webp / pdf, max 50 MB. Image lives in
// the "invoices" Storage bucket at "{shop_id}/{invoice_id}.{ext}".
// The metadata row is in public.invoices. Camera capture is wired
// via <input type="file" capture="environment"> which opens the
// rear camera on mobile.

import React,{useState} from "react";
import {T,c} from "../../theme.js";
import {sS} from "../../lib/utils.js";
import {F} from "../../components/ui";
import {supabase} from "../../lib/auth/saas.js";
import {uploadObject,deleteObject,extFromFile} from "../../lib/storage_supabase.js";

const MAX_BYTES=50*1024*1024;
const ALLOWED_MIMES=["image/jpeg","image/png","image/webp","application/pdf"];

function todayIso(){
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const dd=String(d.getDate()).padStart(2,"0");
  return y+"-"+m+"-"+dd;
}

export default function InvoiceForm({shopId,userId,existing,onSaved,onCancel,pop}){
  const isEdit=!!(existing&&existing.id);
  const[title,setTitle]=useState((existing&&existing.title)||"");
  const[amount,setAmount]=useState((existing&&existing.amount!=null)?String(existing.amount):"");
  const[invoiceDate,setInvoiceDate]=useState((existing&&existing.invoice_date)||todayIso());
  const[notes,setNotes]=useState((existing&&existing.notes)||"");
  const[file,setFile]=useState(null);
  const[busy,setBusy]=useState(false);
  const[errMsg,setErrMsg]=useState("");

  const pickFile=(e)=>{
    const f=e.target.files&&e.target.files[0];
    if(!f){setFile(null);return;}
    if(f.size>MAX_BYTES){
      setErrMsg("File is "+(f.size/1024/1024).toFixed(1)+" MB — limit is 50 MB.");
      setFile(null);
      e.target.value="";
      return;
    }
    if(ALLOWED_MIMES.indexOf(f.type)===-1&&f.type){
      setErrMsg("Unsupported file type: "+f.type+". Allowed: JPG, PNG, WebP, PDF.");
      setFile(null);
      e.target.value="";
      return;
    }
    setErrMsg("");
    setFile(f);
  };

  const submit=async()=>{
    if(!shopId){setErrMsg("No shop in context.");return;}
    const cleanTitle=String(title||"").trim();
    if(!cleanTitle){setErrMsg("Title is required.");return;}
    const cleanAmount=Number(String(amount||"").replace(/[^0-9.\-]/g,""));
    if(!isFinite(cleanAmount)){setErrMsg("Amount must be a number.");return;}

    setBusy(true);
    setErrMsg("");

    let storagePath=isEdit?existing.storage_path:null;
    let mimeType=isEdit?existing.mime_type:null;
    let sizeBytes=isEdit?existing.size_bytes:null;

    // Reserve an id up-front so the storage path can use it.
    let invoiceId=isEdit?existing.id:null;
    if(!invoiceId){
      invoiceId=(typeof crypto!=="undefined"&&crypto.randomUUID)
        ?crypto.randomUUID()
        :("inv-"+Date.now()+"-"+Math.random().toString(36).slice(2,8));
    }

    if(file){
      const ext=extFromFile(file);
      const path=shopId+"/"+invoiceId+"."+ext;
      const up=await uploadObject("invoices",path,file,{upsert:isEdit});
      if(!up.ok){
        setBusy(false);
        setErrMsg("Upload failed: "+up.error);
        return;
      }
      // If editing AND the old path differs (different extension),
      // remove the old object. Best-effort: don't block on failure.
      if(isEdit&&existing.storage_path&&existing.storage_path!==path){
        await deleteObject("invoices",existing.storage_path);
      }
      storagePath=path;
      mimeType=file.type||null;
      sizeBytes=file.size||null;
    }

    const row={
      id:invoiceId,
      shop_id:shopId,
      created_by:isEdit?existing.created_by:userId,
      title:cleanTitle,
      amount:cleanAmount,
      storage_path:storagePath,
      mime_type:mimeType,
      size_bytes:sizeBytes,
      invoice_date:invoiceDate||null,
      notes:String(notes||"").trim()||null,
    };

    let dbErr=null;
    if(isEdit){
      const{error}=await supabase.from("invoices").update({
        title:row.title,
        amount:row.amount,
        storage_path:row.storage_path,
        mime_type:row.mime_type,
        size_bytes:row.size_bytes,
        invoice_date:row.invoice_date,
        notes:row.notes,
      }).eq("id",row.id);
      dbErr=error;
    }else{
      const{error}=await supabase.from("invoices").insert(row);
      dbErr=error;
    }

    setBusy(false);
    if(dbErr){
      setErrMsg("Save failed: "+(dbErr.message||"unknown"));
      return;
    }
    pop&&pop(isEdit?"Invoice updated.":"Invoice added.","ok");
    if(typeof onSaved==="function")onSaved(row);
  };

  return <div style={{padding:14}}>
    <div style={{fontSize:14,fontWeight:"bold",color:T.white,marginBottom:14}}>
      {isEdit?"✏ Edit invoice":"📋 Add invoice"}
    </div>

    <div style={c.g2(10)}>
      <F label="Title" value={title} onChange={setTitle} placeholder="e.g. Bunnings — workshop supplies"/>
      <F label="Amount (AUD)" type="number" value={amount} onChange={setAmount} placeholder="42.50"/>
    </div>
    <div style={{marginTop:8}}>
      <F label="Invoice date" type="date" value={invoiceDate} onChange={setInvoiceDate}/>
    </div>
    <div style={{marginTop:8}}>
      <label style={c.lbl}>Notes (optional)</label>
      <textarea
        style={{...c.inp(),minHeight:60,resize:"vertical",fontFamily:"inherit"}}
        value={notes}
        onChange={e=>setNotes(e.target.value)}
        placeholder="Anything to record — payment method, supplier, etc."
      />
    </div>

    <div style={{marginTop:14}}>
      <div style={c.lbl}>Image / PDF (optional, max 50 MB)</div>
      <div style={{display:"flex",gap:10,marginTop:6,flexWrap:"wrap"}}>
        <label style={{...c.bsm(),display:"inline-block",cursor:"pointer"}}>
          📁 Pick file
          <input type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            style={{display:"none"}}
            onChange={pickFile}
          />
        </label>
        <label style={{...c.bsm(),display:"inline-block",cursor:"pointer"}}>
          📷 Camera
          <input type="file"
            accept="image/*"
            capture="environment"
            style={{display:"none"}}
            onChange={pickFile}
          />
        </label>
        {file?<span style={{fontSize:11,color:T.muted,alignSelf:"center"}}>
          {sS(file.name)} ({(file.size/1024).toFixed(0)} KB)
        </span>:isEdit&&existing.storage_path?<span style={{fontSize:11,color:T.muted,alignSelf:"center"}}>
          (Existing file will be kept unless replaced.)
        </span>:null}
      </div>
    </div>

    {errMsg?<div style={{...c.bnr("block"),marginTop:12}}>{errMsg}</div>:null}

    <div style={{display:"flex",gap:10,marginTop:18,justifyContent:"flex-end"}}>
      <button style={c.bsm()} onClick={()=>!busy&&onCancel&&onCancel()} disabled={busy}>Cancel</button>
      <button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"8px 14px"})} onClick={submit} disabled={busy||!title||!amount}>
        {busy?"Saving…":(isEdit?"Save changes":"Add invoice")}
      </button>
    </div>
  </div>;
}
