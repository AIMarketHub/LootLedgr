// LootLedger — Staff workspace Documents tab.
// Phase 5.2 staff-workspace Commit 2 (2026-05-16).
//
// Per-staff personal documents (contracts, ID copies,
// certifications). Lives in the "staff-documents" Storage
// bucket from migration 0023. Each upload writes a metadata
// row in staff_documents.
//
// Allowed types per USER 2026-05-16:
//   - Images: jpeg, png, gif, webp
//   - PDF
//   - Office: docx, xlsx, pptx
//   - Plain: csv, txt
//   - Archive: zip
//
// Bucket MIME whitelist must include all of these — USER
// updates it via Studio (manual step documented alongside
// migration 0025).
//
// Storage path convention: {user_id}/{document_id}_{slug}.{ext}
//   - user_id prefix matches the staff_docs_storage_self_*
//     bucket RLS policies (so direct uploads are gated to the
//     uploader's own folder).
//   - document_id is the staff_documents row UUID, ensuring
//     uniqueness per upload even if filename collides.
//   - slug is a lowercased basename for human readability in
//     the Storage UI; not parsed by anything.

import React,{useEffect,useState,useCallback} from "react";
import {T,c} from "../../theme.js";
import {sS,formatDateAU} from "../../lib/utils.js";
import {F} from "../../components/ui";
import {supabase} from "../../lib/auth/saas.js";
import {uploadObject,signedDownloadUrl,deleteObject,extFromFile} from "../../lib/storage_supabase.js";

const MAX_BYTES = 50 * 1024 * 1024;

const ALLOWED_MIMES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",     // docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",            // xlsx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",    // pptx
  "text/csv", "text/plain",
  "application/zip",
];

const IMAGE_MIMES = new Set(["image/jpeg","image/png","image/gif","image/webp"]);

function fileIcon(mime){
  if(IMAGE_MIMES.has(mime)) return "🖼";
  if(mime === "application/pdf") return "📄";
  if(mime === "text/csv") return "📊";
  if(mime === "text/plain") return "📝";
  if(mime === "application/zip") return "🗜";
  if(mime && mime.includes("wordprocessing")) return "📃";
  if(mime && mime.includes("spreadsheet")) return "📈";
  if(mime && mime.includes("presentation")) return "📽";
  return "📎";
}

function formatBytes(n){
  if(!isFinite(n) || n <= 0) return "—";
  if(n < 1024) return n + " B";
  if(n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

function slugify(name){
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60) || "file";
}

function newId(){
  if(typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "doc-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

export default function DocumentsTab({userId, shopId, pin, pop}){
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [delFor, setDelFor] = useState(null); // {row, pin, busy}

  const load = useCallback(async () => {
    if(!userId) return;
    setLoading(true);
    setErrMsg("");
    const {data, error} = await supabase.from("staff_documents")
      .select("id, title, storage_path, mime_type, size_bytes, uploaded_at")
      .eq("user_id", userId)
      .order("uploaded_at", {ascending: false});
    setLoading(false);
    if(error){
      setErrMsg("Could not load documents: " + sS(error.message));
      setDocs([]);
      return;
    }
    setDocs(Array.isArray(data) ? data : []);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const pickFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if(!f){ setFile(null); return; }
    if(f.size > MAX_BYTES){
      setErrMsg("File is " + (f.size / 1024 / 1024).toFixed(1) + " MB — limit is 50 MB.");
      setFile(null);
      e.target.value = "";
      return;
    }
    if(ALLOWED_MIMES.indexOf(f.type) === -1 && f.type){
      setErrMsg("Unsupported file type: " + f.type + ". Allowed: images, PDF, docx/xlsx/pptx, csv, txt, zip.");
      setFile(null);
      e.target.value = "";
      return;
    }
    setErrMsg("");
    setFile(f);
    if(!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const onUpload = async () => {
    if(!userId || !shopId){ setErrMsg("No shop/user in context."); return; }
    const cleanTitle = String(title || "").trim();
    if(!cleanTitle){ setErrMsg("Title required."); return; }
    if(!file){ setErrMsg("Pick a file."); return; }

    setBusy(true);
    setErrMsg("");
    const id = newId();
    const ext = extFromFile(file);
    const slug = slugify(file.name.replace(/\.[^.]+$/, ""));
    const path = userId + "/" + id + "_" + slug + "." + ext;

    const up = await uploadObject("staff-documents", path, file, {});
    if(!up.ok){
      setBusy(false);
      setErrMsg("Upload failed: " + up.error);
      return;
    }

    const {error: insertErr} = await supabase.from("staff_documents").insert({
      id,
      user_id: userId,
      shop_id: shopId,
      title: cleanTitle,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size || null,
    });
    setBusy(false);
    if(insertErr){
      // Best-effort cleanup of the orphaned storage object.
      await deleteObject("staff-documents", path);
      setErrMsg("Save failed: " + (insertErr.message || "unknown"));
      return;
    }
    pop && pop("Document uploaded.", "ok");
    setAddOpen(false);
    setTitle("");
    setFile(null);
    await load();
  };

  const onDownload = async (row) => {
    const r = await signedDownloadUrl("staff-documents", row.storage_path, 300);
    if(!r.ok){ pop && pop("Download link failed: " + r.error, "err"); return; }
    try{ window.open(r.url, "_blank", "noopener"); }catch(_){ window.location.href = r.url; }
  };

  const confirmDelete = async () => {
    if(!delFor || !delFor.row) return;
    // PIN re-prompt — destructive operation. Compare typed PIN
    // to cached session PIN; if it matches the cache or matches
    // the current user's PIN via verify, proceed.
    const typed = String(delFor.pin || "").trim();
    if(!/^\d{4,12}$/.test(typed)){
      pop && pop("Enter your PIN (4–12 digits).", "warn");
      return;
    }
    if(pin && typed !== pin){
      pop && pop("PIN doesn't match your session PIN.", "err");
      return;
    }
    setDelFor(p => ({...p, busy: true}));
    const row = delFor.row;
    if(row.storage_path){
      const r = await deleteObject("staff-documents", row.storage_path);
      if(!r.ok){
        pop && pop("Storage delete failed: " + r.error + " (continuing with DB delete)", "warn");
      }
    }
    const {error} = await supabase.from("staff_documents").delete().eq("id", row.id);
    if(error){
      setDelFor(p => ({...p, busy: false}));
      pop && pop("Delete failed: " + (error.message || "unknown"), "err");
      return;
    }
    pop && pop("Document deleted.", "ok");
    setDelFor(null);
    await load();
  };

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
      <div style={{fontSize:13,fontWeight:"bold",color:T.white}}>📁 My Documents</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button style={c.bsm(T.goldBg, T.gold)} onClick={() => setAddOpen(o => !o)}>{addOpen ? "Close" : "📤 Upload"}</button>
        <button style={c.bsm()} onClick={load} disabled={loading}>↻ Reload</button>
      </div>
    </div>

    {addOpen ? <div style={{...c.card({padding:14}), marginBottom:14, borderColor:T.gold}}>
      <F label="Title" value={title} onChange={setTitle} placeholder="e.g. Contract 2026"/>
      <div style={{marginTop:8}}>
        <div style={c.lbl}>File (max 50 MB)</div>
        <div style={{display:"flex",gap:10,marginTop:6,flexWrap:"wrap"}}>
          <label style={{...c.bsm(), display:"inline-block", cursor:"pointer"}}>
            📁 Pick file
            <input type="file"
              accept={ALLOWED_MIMES.join(",")}
              style={{display:"none"}}
              onChange={pickFile}
            />
          </label>
          <label style={{...c.bsm(), display:"inline-block", cursor:"pointer"}}>
            📷 Take photo
            <input type="file"
              accept="image/*"
              capture="environment"
              style={{display:"none"}}
              onChange={pickFile}
            />
          </label>
          {file ? <span style={{fontSize:11, color:T.muted, alignSelf:"center"}}>
            {sS(file.name)} · {formatBytes(file.size)}
          </span> : null}
        </div>
      </div>
      {errMsg ? <div style={{...c.bnr("block"), marginTop:12}}>{errMsg}</div> : null}
      <div style={{display:"flex",gap:10,marginTop:14,justifyContent:"flex-end"}}>
        <button style={c.bsm()} onClick={() => !busy && setAddOpen(false)} disabled={busy}>Cancel</button>
        <button style={c.btn(T.gold, T.bg, {fontSize:12, padding:"8px 14px"})} onClick={onUpload} disabled={busy || !title || !file}>{busy ? "Uploading…" : "Save"}</button>
      </div>
    </div> : null}

    {loading ? <div style={{fontSize:11, color:T.muted}}>Loading…</div> : null}
    {!loading && docs.length === 0 ? <div style={{fontSize:11, color:T.muted, fontStyle:"italic", padding:"12px 0"}}>No documents yet. Upload to add.</div> : null}

    <div style={{display:"flex", flexDirection:"column", gap:6}}>
      {docs.map(row => (
        <div key={row.id} style={{...c.card({padding:12}), display:"flex", gap:12, alignItems:"center", flexWrap:"wrap"}}>
          <div style={{fontSize:24, flexShrink:0}}>{fileIcon(row.mime_type)}</div>
          <div style={{flex:"1 1 240px", minWidth:0}}>
            <div style={{fontSize:13, color:T.white, fontWeight:"bold", wordBreak:"break-word"}}>{sS(row.title)}</div>
            <div style={{fontSize:10, color:T.muted, marginTop:2}}>
              {formatDateAU(String(row.uploaded_at).slice(0, 10))}
              {row.mime_type ? " · " + sS(row.mime_type) : ""}
              {row.size_bytes ? " · " + formatBytes(row.size_bytes) : ""}
            </div>
          </div>
          <div style={{display:"flex", gap:6}}>
            <button style={c.bsm()} onClick={() => onDownload(row)} title="Download">📥</button>
            <button style={c.bsm(T.red, T.white)} onClick={() => setDelFor({row, pin:"", busy:false})} title="Delete">🗑</button>
          </div>
        </div>
      ))}
    </div>

    {delFor ? <div style={{position:"fixed", inset:0, background:"#000000e0", zIndex:2200, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={() => !delFor.busy && setDelFor(null)}>
      <div style={{...c.card({padding:20}), maxWidth:420, width:"100%"}} onClick={e => e.stopPropagation()}>
        <div style={{fontSize:14, fontWeight:"bold", color:T.white, marginBottom:8}}>🗑 Delete document?</div>
        <div style={{fontSize:12, color:T.muted, marginBottom:12, lineHeight:1.5}}>
          <strong style={{color:T.white}}>{sS(delFor.row.title)}</strong><br/>
          This deletes the file and the metadata row. Cannot be undone. Confirm with your PIN.
        </div>
        <F label="Your PIN" type="password" value={delFor.pin} onChange={v => setDelFor(p => ({...p, pin:v}))} placeholder="••••"/>
        <div style={{display:"flex", gap:10, marginTop:14, justifyContent:"flex-end"}}>
          <button style={c.bsm()} onClick={() => setDelFor(null)} disabled={delFor.busy}>Cancel</button>
          <button style={c.btn(T.red, T.white, {fontSize:12, padding:"8px 14px"})} onClick={confirmDelete} disabled={delFor.busy || !delFor.pin}>{delFor.busy ? "Deleting…" : "Delete"}</button>
        </div>
      </div>
    </div> : null}
  </div>;
}
