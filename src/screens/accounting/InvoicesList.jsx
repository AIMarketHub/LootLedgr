// LootLedger — Invoices list / manager.
// Phase 5.2 Commit 1 (2026-05-15).
//
// Renders the per-shop invoices in a sortable / filterable list.
// Used in Settings → Accounting → Invoice Manager. Also accepts an
// optional onAdd callback so the parent can mount the InvoiceForm
// inline rather than as a separate modal.
//
// Operations: download (signed URL), edit (calls onEdit), delete
// (confirm + remove row + remove storage object). All ops are
// scoped to the current shop via RLS — staff in other shops can't
// read or write these rows even if they guess the table name.

import React,{useEffect,useState,useCallback} from "react";
import {T,c} from "../../theme.js";
import {sS,fmtAUD,formatDateAU} from "../../lib/utils.js";
import {F} from "../../components/ui";
import {supabase} from "../../lib/auth/saas.js";
import {signedDownloadUrl,deleteObject} from "../../lib/storage_supabase.js";

export default function InvoicesList({shopId,onAdd,onEdit,pop,reloadKey}){
  const[rows,setRows]=useState([]);
  const[loading,setLoading]=useState(true);
  const[errMsg,setErrMsg]=useState("");
  const[search,setSearch]=useState("");
  const[delFor,setDelFor]=useState(null); // {row, busy}

  const load=useCallback(async()=>{
    if(!shopId){setLoading(false);return;}
    setLoading(true);
    const{data,error}=await supabase.from("invoices")
      .select("id, title, amount, storage_path, mime_type, size_bytes, invoice_date, notes, created_at, created_by")
      .eq("shop_id",shopId)
      .order("invoice_date",{ascending:false,nullsFirst:false})
      .order("created_at",{ascending:false});
    setLoading(false);
    if(error){
      setErrMsg("Could not load invoices: "+sS(error.message));
      setRows([]);
      return;
    }
    setErrMsg("");
    setRows(Array.isArray(data)?data:[]);
  },[shopId]);

  useEffect(()=>{load();},[load,reloadKey]);

  const onDownload=async(row)=>{
    if(!row.storage_path){pop&&pop("No file attached to this invoice.","info");return;}
    const r=await signedDownloadUrl("invoices",row.storage_path,300);
    if(!r.ok){pop&&pop("Download link failed: "+r.error,"err");return;}
    try{window.open(r.url,"_blank","noopener");}catch(_){window.location.href=r.url;}
  };

  const confirmDelete=async()=>{
    if(!delFor||!delFor.row)return;
    setDelFor(p=>({...p,busy:true}));
    const row=delFor.row;
    if(row.storage_path){
      const r=await deleteObject("invoices",row.storage_path);
      if(!r.ok){
        // Non-fatal — log but still try to delete the DB row.
        pop&&pop("Storage delete failed: "+r.error+" (DB row will still be removed)","warn");
      }
    }
    const{error}=await supabase.from("invoices").delete().eq("id",row.id);
    if(error){
      setDelFor(p=>({...p,busy:false}));
      pop&&pop("Delete failed: "+(error.message||"unknown"),"err");
      return;
    }
    pop&&pop("Invoice deleted.","ok");
    setDelFor(null);
    await load();
  };

  const filtered=rows.filter(r=>{
    if(!search.trim())return true;
    const q=search.trim().toLowerCase();
    return sS(r.title).toLowerCase().includes(q)
      || sS(r.notes).toLowerCase().includes(q);
  });

  return <div>
    <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap",marginBottom:10}}>
      <div style={{flex:1,minWidth:200}}>
        <F label="Search title / notes" value={search} onChange={setSearch} placeholder="bunnings, electricity, …"/>
      </div>
      {typeof onAdd==="function"?<button style={c.btn(T.gold,T.bg,{fontSize:12,padding:"10px 14px"})} onClick={onAdd}>＋ Add invoice</button>:null}
      <button style={c.bsm()} onClick={load} disabled={loading}>↻ Reload</button>
    </div>

    {errMsg?<div style={{...c.bnr("block"),marginBottom:10}}>{errMsg}</div>:null}
    {loading?<div style={{fontSize:11,color:T.muted}}>Loading…</div>:null}
    {!loading&&filtered.length===0?<div style={{fontSize:11,color:T.muted,fontStyle:"italic",padding:"12px 0"}}>{rows.length===0?"No invoices yet. Click ＋ Add invoice to record one.":"No matches for that search."}</div>:null}

    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {filtered.map(r=>(
        <div key={r.id} style={{...c.card({padding:12}),display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{flex:"1 1 240px",minWidth:0}}>
            <div style={{fontSize:13,color:T.white,fontWeight:"bold"}}>{sS(r.title)}</div>
            <div style={{fontSize:11,color:T.muted,marginTop:2}}>
              {r.invoice_date?formatDateAU(r.invoice_date):"(no date)"}
              {r.storage_path?" · "+sS(r.mime_type||"file"):" · no file"}
              {r.notes?" · "+sS(r.notes).slice(0,80)+(r.notes.length>80?"…":""):""}
            </div>
          </div>
          <div style={{fontSize:14,fontWeight:"bold",color:T.green,minWidth:90,textAlign:"right"}}>{fmtAUD(r.amount)}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {r.storage_path?<button style={c.bsm()} onClick={()=>onDownload(r)} title="Download attached file">⬇</button>:null}
            {typeof onEdit==="function"?<button style={c.bsm()} onClick={()=>onEdit(r)} title="Edit">✏</button>:null}
            <button style={c.bsm(T.red,T.white)} onClick={()=>setDelFor({row:r,busy:false})} title="Delete">❌</button>
          </div>
        </div>
      ))}
    </div>

    {delFor&&<div style={{position:"fixed",inset:0,background:"#000000e0",zIndex:2200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>!delFor.busy&&setDelFor(null)}>
      <div style={{...c.card({padding:20}),maxWidth:400,width:"100%"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:14,fontWeight:"bold",color:T.white,marginBottom:8}}>Delete this invoice?</div>
        <div style={{fontSize:12,color:T.muted,marginBottom:14}}>
          <strong style={{color:T.white}}>{sS(delFor.row.title)}</strong> · {fmtAUD(delFor.row.amount)}<br/>
          This deletes the row and any attached file. Cannot be undone.
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button style={c.bsm()} onClick={()=>setDelFor(null)} disabled={delFor.busy}>Cancel</button>
          <button style={c.btn(T.red,T.white,{fontSize:12,padding:"8px 14px"})} onClick={confirmDelete} disabled={delFor.busy}>{delFor.busy?"Deleting…":"Delete"}</button>
        </div>
      </div>
    </div>}
  </div>;
}
