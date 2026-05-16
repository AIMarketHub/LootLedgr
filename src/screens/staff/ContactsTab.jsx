// LootLedger — Staff workspace Contacts tab.
// Phase 5.2 staff-workspace Commit 2 (2026-05-16).
//
// Per-user contact rolodex stored in staff_contacts table.
// Fields:
//   name     (required)
//   email    (optional, shape-validated when present)
//   phone    (optional, free-text — added by migration 0025)
//   role_tag (enum: staff / boss / client / other)
//   notes    (optional, multi-line)
//
// CSV import auto-detects Google Contacts and Apple Contacts
// export shapes; otherwise falls back to a small manual-mapping
// UI. Parsing is RFC 4180 via src/lib/csv_parse.js (no PapaParse
// dependency).
//
// Permissions: staff_contacts RLS (from migration 0023) is
// user_id = auth.uid() — strict per-user ownership. Platform
// admin gets cross-shop read for support.

import React,{useEffect,useState,useCallback} from "react";
import {T,c} from "../../theme.js";
import {sS,formatDateAU} from "../../lib/utils.js";
import {F,SF} from "../../components/ui";
import {supabase} from "../../lib/auth/saas.js";
import {parseCsv,pickField} from "../../lib/csv_parse.js";

const ROLE_OPTIONS = [
  {value: "staff",  label: "Staff"},
  {value: "boss",   label: "Boss"},
  {value: "client", label: "Client"},
  {value: "other",  label: "Other"},
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Common header candidates per field (Google + Apple + Outlook).
// pickField walks them in order and returns the first non-empty
// value found in the row.
const HEADER_MAP = {
  name: [
    "Name",                                  // Google primary
    "First Name",                            // Apple-ish (concat below if needed)
    "Display Name",                          // Outlook
    "Full Name",
  ],
  firstName: ["Given Name", "First Name"],
  lastName:  ["Family Name", "Last Name", "Surname"],
  email: [
    "E-mail 1 - Value",                      // Google
    "E-mail Address",                        // Outlook
    "Email",
    "Email 1",
    "Primary Email",
  ],
  phone: [
    "Phone 1 - Value",                       // Google
    "Mobile Phone",                          // Outlook
    "Business Phone",
    "Home Phone",
    "Phone",
    "Phone Number",
  ],
  notes: [
    "Notes",
    "Note",
  ],
};

// Try to extract a name from a CSV row. Falls back to first+last
// concat when there's no single "Name" column.
function extractName(row){
  const n = pickField(row, HEADER_MAP.name);
  if(n) return n;
  const f = pickField(row, HEADER_MAP.firstName);
  const l = pickField(row, HEADER_MAP.lastName);
  return (f + " " + l).trim();
}

function detectFormat(headers){
  // Google contacts export has columns like "E-mail 1 - Value".
  const isGoogle = headers.some(h => /E-mail 1 - Value|Phone 1 - Value|Given Name/i.test(h));
  if(isGoogle) return "Google Contacts";
  // Apple contacts vCard CSV exports often have "Email" + "First
  // Name" + "Last Name".
  const hasEmail = headers.some(h => /^Email$/i.test(h));
  const hasFirst = headers.some(h => /^First Name$/i.test(h));
  if(hasEmail && hasFirst) return "Apple Contacts";
  // Outlook.
  const isOutlook = headers.some(h => /E-mail Address|Display Name|Mobile Phone/i.test(h));
  if(isOutlook) return "Outlook";
  return null;
}

function newId(){
  if(typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "con-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
}

export default function ContactsTab({userId, pop}){
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  // Add / edit form state.
  const [editing, setEditing] = useState(null); // null | "new" | row
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleTag, setRoleTag] = useState("other");
  const [notes, setNotes] = useState("");
  const [formBusy, setFormBusy] = useState(false);

  // CSV import state.
  const [importing, setImporting] = useState(null);
  // importing shape: {detectedFormat, headers, rows, mapping, busy}

  const load = useCallback(async () => {
    if(!userId) return;
    setLoading(true);
    setErrMsg("");
    const {data, error} = await supabase.from("staff_contacts")
      .select("id, name, email, phone, role_tag, notes, created_at")
      .eq("user_id", userId)
      .order("name", {ascending: true});
    setLoading(false);
    if(error){
      setErrMsg("Could not load contacts: " + sS(error.message));
      setContacts([]);
      return;
    }
    setContacts(Array.isArray(data) ? data : []);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing("new");
    setName(""); setEmail(""); setPhone(""); setRoleTag("other"); setNotes("");
  };

  const openEdit = (row) => {
    setEditing(row);
    setName(sS(row.name));
    setEmail(sS(row.email));
    setPhone(sS(row.phone));
    setRoleTag(sS(row.role_tag) || "other");
    setNotes(sS(row.notes));
  };

  const closeForm = () => { setEditing(null); };

  const onSave = async () => {
    const cleanName = String(name || "").trim();
    if(!cleanName){ pop && pop("Name required.", "warn"); return; }
    const cleanEmail = String(email || "").trim();
    if(cleanEmail && !EMAIL_RE.test(cleanEmail)){
      pop && pop("Invalid email shape.", "warn"); return;
    }
    setFormBusy(true);
    try{
      if(editing === "new"){
        const {error} = await supabase.from("staff_contacts").insert({
          id: newId(),
          user_id: userId,
          name: cleanName,
          email: cleanEmail || null,
          phone: String(phone || "").trim() || null,
          role_tag: roleTag || "other",
          notes: String(notes || "").trim() || null,
        });
        if(error) throw error;
        pop && pop("Contact added.", "ok");
      } else {
        const {error} = await supabase.from("staff_contacts").update({
          name: cleanName,
          email: cleanEmail || null,
          phone: String(phone || "").trim() || null,
          role_tag: roleTag || "other",
          notes: String(notes || "").trim() || null,
        }).eq("id", editing.id);
        if(error) throw error;
        pop && pop("Contact updated.", "ok");
      }
      setEditing(null);
      await load();
    } catch(e){
      pop && pop("Save failed: " + sS(e && e.message), "err");
    } finally { setFormBusy(false); }
  };

  const onDelete = async (row) => {
    if(typeof window !== "undefined" && window.confirm){
      if(!window.confirm("Delete contact " + sS(row.name) + "?")) return;
    }
    const {error} = await supabase.from("staff_contacts").delete().eq("id", row.id);
    if(error){
      pop && pop("Delete failed: " + sS(error.message), "err");
      return;
    }
    pop && pop("Contact deleted.", "ok");
    await load();
  };

  // ── CSV import ─────────────────────────────────────────────
  const pickCsv = (e) => {
    const f = e.target.files && e.target.files[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target.result || "");
      try{
        const {headers, rows} = parseCsv(text);
        if(headers.length === 0){
          pop && pop("CSV file is empty or unreadable.", "warn");
          return;
        }
        const detectedFormat = detectFormat(headers);
        setImporting({detectedFormat, headers, rows, busy: false});
      } catch(err){
        pop && pop("Could not parse CSV: " + sS(err && err.message), "err");
      }
    };
    reader.onerror = () => pop && pop("Could not read CSV file.", "err");
    reader.readAsText(f);
    e.target.value = "";
  };

  const onConfirmImport = async () => {
    if(!importing) return;
    const {rows} = importing;
    setImporting(p => ({...p, busy: true}));
    let imported = 0, skipped = 0;
    const batch = [];
    rows.forEach(r => {
      const n = extractName(r);
      if(!n){ skipped++; return; }
      const e = pickField(r, HEADER_MAP.email);
      const p = pickField(r, HEADER_MAP.phone);
      const note = pickField(r, HEADER_MAP.notes);
      batch.push({
        id: newId(),
        user_id: userId,
        name: n.trim(),
        email: (e && EMAIL_RE.test(e)) ? e.trim() : null,
        phone: p ? p.trim() : null,
        role_tag: "other",
        notes: note ? note.trim() : null,
      });
    });
    if(batch.length === 0){
      pop && pop("No rows with a usable Name. Nothing imported.", "warn");
      setImporting(null);
      return;
    }
    // Insert in chunks of 100 to keep request size sane.
    const chunk = 100;
    for(let i = 0; i < batch.length; i += chunk){
      const slice = batch.slice(i, i + chunk);
      const {error} = await supabase.from("staff_contacts").insert(slice);
      if(error){
        pop && pop("Import failed at row " + (i + 1) + ": " + sS(error.message), "err");
        setImporting(p => ({...p, busy: false}));
        return;
      }
      imported += slice.length;
    }
    pop && pop("Imported " + imported + " contact" + (imported === 1 ? "" : "s") + (skipped > 0 ? " (" + skipped + " skipped — no name)" : "") + ".", "ok");
    setImporting(null);
    await load();
  };

  return <div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
      <div style={{fontSize:13,fontWeight:"bold",color:T.white}}>📇 My Contacts</div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button style={c.bsm(T.goldBg, T.gold)} onClick={openNew}>+ Add contact</button>
        <label style={{...c.bsm(), display:"inline-block", cursor:"pointer"}}>
          📋 Import CSV
          <input type="file" accept=".csv,text/csv" style={{display:"none"}} onChange={pickCsv}/>
        </label>
        <button style={c.bsm()} onClick={load} disabled={loading}>↻ Reload</button>
      </div>
    </div>

    {errMsg ? <div style={{...c.bnr("block"), marginBottom:10}}>{errMsg}</div> : null}

    {editing ? <div style={{...c.card({padding:14}), marginBottom:14, borderColor:T.gold}}>
      <div style={{fontSize:12, fontWeight:"bold", color:T.gold, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.05em"}}>
        {editing === "new" ? "Add contact" : "Edit contact"}
      </div>
      <div style={c.g2(10)}>
        <F label="Name *" value={name} onChange={setName} placeholder="e.g. Jane Smith"/>
        <SF label="Role tag" value={roleTag} onChange={setRoleTag} options={ROLE_OPTIONS}/>
      </div>
      <div style={c.g2(10)}>
        <F label="Email" value={email} onChange={setEmail} placeholder="jane@example.com"/>
        <F label="Phone" value={phone} onChange={setPhone} placeholder="0400 000 000"/>
      </div>
      <div style={{marginTop:8}}>
        <label style={c.lbl}>Notes</label>
        <textarea
          style={{...c.inp(), minHeight:60, resize:"vertical", fontFamily:"inherit"}}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Optional"
        />
      </div>
      <div style={{display:"flex", gap:10, marginTop:14, justifyContent:"flex-end"}}>
        <button style={c.bsm()} onClick={closeForm} disabled={formBusy}>Cancel</button>
        <button style={c.btn(T.gold, T.bg, {fontSize:12, padding:"8px 14px"})} onClick={onSave} disabled={formBusy || !name}>{formBusy ? "Saving…" : (editing === "new" ? "Add" : "Save changes")}</button>
      </div>
    </div> : null}

    {importing ? <div style={{...c.card({padding:14}), marginBottom:14, borderColor:T.gold}}>
      <div style={{fontSize:12, fontWeight:"bold", color:T.gold, marginBottom:10, textTransform:"uppercase", letterSpacing:"0.05em"}}>CSV import preview</div>
      <div style={{fontSize:11, color:T.muted, marginBottom:10}}>
        Detected format: <strong style={{color:T.white}}>{importing.detectedFormat || "Unknown"}</strong>
        {" · "}{importing.rows.length} row{importing.rows.length === 1 ? "" : "s"}
        {importing.detectedFormat ? "" : " (auto-detect failed — will use 'Name' / 'Email' / 'Phone' / 'Notes' columns if present)"}
      </div>
      <div style={{fontSize:11, color:T.muted, marginBottom:6}}>First 3 rows preview:</div>
      <div style={{maxHeight:200, overflow:"auto", border:"1px solid " + T.border, borderRadius:4, padding:8, background:T.surface, marginBottom:10}}>
        {importing.rows.slice(0, 3).map((r, i) => {
          const n = extractName(r);
          const e = pickField(r, HEADER_MAP.email);
          const p = pickField(r, HEADER_MAP.phone);
          return <div key={i} style={{fontSize:11, fontFamily:"monospace", color:T.text, padding:"4px 0", borderBottom: i < 2 ? "1px solid " + T.border + "33" : "none"}}>
            <strong>{sS(n) || "(no name — will be skipped)"}</strong>
            {e ? " · " + sS(e) : ""}
            {p ? " · " + sS(p) : ""}
          </div>;
        })}
      </div>
      <div style={{fontSize:10, color:T.muted, marginBottom:10, lineHeight:1.4}}>
        Rows with no name will be skipped. All imported contacts default to role tag "other" — edit individually after.
      </div>
      <div style={{display:"flex", gap:10, justifyContent:"flex-end"}}>
        <button style={c.bsm()} onClick={() => setImporting(null)} disabled={importing.busy}>Cancel</button>
        <button style={c.btn(T.gold, T.bg, {fontSize:12, padding:"8px 14px"})} onClick={onConfirmImport} disabled={importing.busy}>{importing.busy ? "Importing…" : ("Import " + importing.rows.length + " row" + (importing.rows.length === 1 ? "" : "s"))}</button>
      </div>
    </div> : null}

    {loading ? <div style={{fontSize:11, color:T.muted}}>Loading…</div> : null}
    {!loading && contacts.length === 0 ? <div style={{fontSize:11, color:T.muted, fontStyle:"italic", padding:"12px 0"}}>No contacts yet. Add one or import from CSV.</div> : null}

    <div style={{display:"flex", flexDirection:"column", gap:6}}>
      {contacts.map(row => (
        <div key={row.id} style={{...c.card({padding:12}), display:"flex", gap:10, alignItems:"center", flexWrap:"wrap"}}>
          <div style={{flex:"1 1 240px", minWidth:0}}>
            <div style={{fontSize:13, color:T.white, fontWeight:"bold"}}>{sS(row.name)}</div>
            <div style={{fontSize:11, color:T.muted, marginTop:2}}>
              <span style={{color: row.role_tag === "client" ? T.green : row.role_tag === "boss" ? T.gold : T.muted, fontWeight:"bold", letterSpacing:"0.05em"}}>{sS(row.role_tag).toUpperCase()}</span>
              {row.email ? " · " + sS(row.email) : ""}
              {row.phone ? " · " + sS(row.phone) : ""}
            </div>
            {row.notes ? <div style={{fontSize:10, color:T.muted, marginTop:4, fontStyle:"italic"}}>{sS(row.notes).slice(0, 120)}{row.notes.length > 120 ? "…" : ""}</div> : null}
          </div>
          <div style={{display:"flex", gap:6}}>
            <button style={c.bsm()} onClick={() => openEdit(row)} title="Edit">✏</button>
            <button style={c.bsm(T.red, T.white)} onClick={() => onDelete(row)} title="Delete">🗑</button>
          </div>
        </div>
      ))}
    </div>
  </div>;
}
