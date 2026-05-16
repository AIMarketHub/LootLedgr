// LootLedger — Staff workspace Email tab.
// Phase 5.2 staff-workspace Commit 2 (2026-05-16).
//
// Compose-and-send via the existing 5.2-E SMTP2GO pipeline.
// The send-email Edge Function holds the API key; this UI is
// just a thin form on top.
//
// Recipients:
//   - Autocomplete from the user's own staff_contacts table.
//   - Free-text fallback for one-off addresses.
//   - Multi-recipient via chips (comma to commit).
//
// Attachments:
//   - Pick from the user's own staff_documents (the Documents
//     tab's content).
//   - Each selected attachment gets a 7-day signed URL and is
//     appended to the body as a hyperlink. Not multipart —
//     SMTP2GO supports multipart but it's out of scope for this
//     commit per the guardrails.

import React,{useEffect,useState,useCallback,useMemo} from "react";
import {T,c} from "../../theme.js";
import {sS} from "../../lib/utils.js";
import {F} from "../../components/ui";
import {useAuth} from "../../components/AuthProvider.jsx";
import {supabase} from "../../lib/auth/saas.js";
import {sendEmail} from "../../lib/email.js";
import {signedDownloadUrl} from "../../lib/storage_supabase.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ATTACHMENT_URL_TTL_SECONDS = 7 * 24 * 3600; // 7 days

function htmlEscape(s){
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function EmailTab({userId, pop}){
  const auth = useAuth();
  const fromAddress = "noreply@lootledger.au";
  const replyToAddress = (auth && auth.user && auth.user.email) || "";

  const [contacts, setContacts] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [recipients, setRecipients] = useState([]); // array of email strings
  const [recipientInput, setRecipientInput] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState([]); // array of staff_documents rows
  const [attachPickerOpen, setAttachPickerOpen] = useState(false);

  const [sending, setSending] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const load = useCallback(async () => {
    if(!userId) return;
    setLoading(true);
    const [contactsRes, docsRes] = await Promise.all([
      supabase.from("staff_contacts")
        .select("id, name, email, role_tag")
        .eq("user_id", userId)
        .not("email", "is", null)
        .order("name", {ascending: true}),
      supabase.from("staff_documents")
        .select("id, title, storage_path, mime_type, size_bytes")
        .eq("user_id", userId)
        .order("uploaded_at", {ascending: false}),
    ]);
    setContacts(Array.isArray(contactsRes.data) ? contactsRes.data : []);
    setDocuments(Array.isArray(docsRes.data) ? docsRes.data : []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Autocomplete suggestions filtered by the current input text.
  const suggestions = useMemo(() => {
    const q = recipientInput.trim().toLowerCase();
    if(!q) return [];
    return contacts.filter(c => {
      if(!c.email) return false;
      if(recipients.indexOf(c.email) !== -1) return false;
      return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
    }).slice(0, 8);
  }, [recipientInput, contacts, recipients]);

  const addRecipientFromInput = () => {
    const v = recipientInput.trim();
    if(!v) return;
    if(!EMAIL_RE.test(v)){
      pop && pop("Not a valid email shape: " + v, "warn");
      return;
    }
    if(recipients.indexOf(v) === -1){
      setRecipients(r => [...r, v]);
    }
    setRecipientInput("");
    setShowSuggest(false);
  };

  const addRecipient = (email) => {
    if(recipients.indexOf(email) !== -1) return;
    setRecipients(r => [...r, email]);
    setRecipientInput("");
    setShowSuggest(false);
  };

  const removeRecipient = (email) => {
    setRecipients(r => r.filter(x => x !== email));
  };

  const toggleAttachment = (doc) => {
    setAttachments(a => {
      const idx = a.findIndex(x => x.id === doc.id);
      if(idx >= 0) return a.filter(x => x.id !== doc.id);
      return [...a, doc];
    });
  };

  const onSend = async () => {
    setErrMsg("");
    if(recipients.length === 0){
      // Allow user to send to whatever's in the input — addRecipient first.
      if(recipientInput.trim()){
        addRecipientFromInput();
        // Bail this cycle; user can click Send again now that the chip is added.
        return;
      }
      setErrMsg("At least one recipient required.");
      return;
    }
    if(!subject.trim()){ setErrMsg("Subject required."); return; }
    if(!body.trim()){ setErrMsg("Body required."); return; }

    setSending(true);

    // Resolve signed URLs for each selected attachment (7-day TTL).
    const attachLinks = [];
    for(const doc of attachments){
      const r = await signedDownloadUrl("staff-documents", doc.storage_path, ATTACHMENT_URL_TTL_SECONDS);
      if(r.ok){
        attachLinks.push({title: doc.title, url: r.url});
      } else {
        attachLinks.push({title: doc.title, url: null, err: r.error});
      }
    }

    // Build plain-text body.
    const txtLines = [body.trim()];
    if(attachLinks.length > 0){
      txtLines.push("");
      txtLines.push("Attachments (links valid 7 days):");
      attachLinks.forEach(a => {
        if(a.url) txtLines.push("  • " + a.title + " — " + a.url);
        else      txtLines.push("  • " + a.title + " — (link generation failed: " + a.err + ")");
      });
    }
    const plainBody = txtLines.join("\n");

    // Build HTML body.
    const htmlLines = [];
    htmlLines.push('<div style="font-family:Arial,sans-serif;color:#222;font-size:14px;line-height:1.5;max-width:680px">');
    htmlLines.push('<div style="white-space:pre-wrap">' + htmlEscape(body.trim()) + '</div>');
    if(attachLinks.length > 0){
      htmlLines.push('<div style="margin-top:18px;padding-top:10px;border-top:1px solid #eee">');
      htmlLines.push('<div style="font-weight:bold;font-size:13px;margin-bottom:6px">📎 Attachments <span style="font-weight:normal;color:#666">(links valid 7 days)</span></div>');
      htmlLines.push('<ul style="padding-left:18px;margin:0">');
      attachLinks.forEach(a => {
        if(a.url){
          htmlLines.push('<li style="margin:4px 0"><a href="' + htmlEscape(a.url) + '" style="color:#1a6bbd">' + htmlEscape(a.title) + '</a></li>');
        } else {
          htmlLines.push('<li style="margin:4px 0;color:#c00">' + htmlEscape(a.title) + ' — link generation failed</li>');
        }
      });
      htmlLines.push('</ul>');
      htmlLines.push('</div>');
    }
    htmlLines.push('</div>');
    const htmlBody = htmlLines.join("\n");

    // Send to each recipient. SMTP2GO supports multi-recipient
    // in a single call but our Edge Function takes one `to`
    // string. Loop here.
    let sent = 0, failed = 0;
    for(const to of recipients){
      const r = await sendEmail({
        to,
        subject: subject.trim(),
        body: plainBody,
        htmlBody,
        replyTo: replyToAddress || null,
        template: "staff_compose",
      });
      if(r && r.ok){ sent++; }
      else {
        failed++;
        pop && pop("Send failed to " + to + ": " + sS((r && r.error) || "unknown"), "err");
      }
    }
    setSending(false);
    if(sent > 0){
      pop && pop("Email sent to " + sent + " recipient" + (sent === 1 ? "" : "s") + (failed > 0 ? " (" + failed + " failed)" : "") + ".", "ok");
      // Clear form on full success.
      if(failed === 0){
        setRecipients([]); setSubject(""); setBody(""); setAttachments([]);
      }
    } else {
      setErrMsg("All sends failed. Check your network + try again.");
    }
  };

  return <div>
    <div style={{fontSize:13, fontWeight:"bold", color:T.white, marginBottom:14}}>✉ Send Email</div>

    <div style={{...c.card({padding:12}), marginBottom:14}}>
      <div style={{fontSize:11, color:T.muted, lineHeight:1.5}}>
        <strong style={{color:T.gold}}>From:</strong> <span style={{color:T.white}}>{fromAddress}</span>
        <span style={{color:T.muted}}> (replies go to <strong style={{color:T.white}}>{replyToAddress || "your account email"}</strong>)</span>
      </div>
    </div>

    {/* Recipients with chips + autocomplete */}
    <div style={{marginBottom:14}}>
      <label style={c.lbl}>To</label>
      <div style={{display:"flex", flexWrap:"wrap", gap:6, padding:8, border:"1px solid " + T.border, borderRadius:4, background:T.surface, alignItems:"center"}}>
        {recipients.map(em => (
          <span key={em} style={{display:"inline-flex", alignItems:"center", gap:4, padding:"4px 8px", background:T.goldBg || "#332600", border:"1px solid " + T.gold, borderRadius:4, fontSize:11, color:T.white}}>
            {em}
            <button onClick={() => removeRecipient(em)} style={{background:"none", border:"none", color:T.gold, cursor:"pointer", padding:0, fontSize:13, lineHeight:1}} title="Remove">×</button>
          </span>
        ))}
        <input
          type="text"
          value={recipientInput}
          onChange={e => { setRecipientInput(e.target.value); setShowSuggest(true); }}
          onFocus={() => setShowSuggest(true)}
          onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
          onKeyDown={e => {
            if(e.key === "Enter" || e.key === ","){ e.preventDefault(); addRecipientFromInput(); }
            else if(e.key === "Backspace" && !recipientInput && recipients.length > 0){
              setRecipients(r => r.slice(0, -1));
            }
          }}
          placeholder={recipients.length === 0 ? "name@example.com or contact name" : ""}
          style={{flex:"1 1 200px", minWidth:160, border:"none", outline:"none", background:"transparent", color:T.text, fontSize:12, padding:"4px 0"}}
        />
      </div>
      {showSuggest && suggestions.length > 0 ? <div style={{position:"relative"}}>
        <div style={{position:"absolute", top:0, left:0, right:0, background:T.surface, border:"1px solid " + T.border, borderRadius:4, zIndex:10, maxHeight:200, overflow:"auto", boxShadow:"0 4px 8px rgba(0,0,0,0.2)"}}>
          {suggestions.map(s => (
            <div key={s.id}
              onMouseDown={e => e.preventDefault()}
              onClick={() => addRecipient(s.email)}
              style={{padding:"8px 12px", cursor:"pointer", fontSize:12, color:T.text, borderBottom:"1px solid " + T.border + "33"}}
              onMouseEnter={e => e.currentTarget.style.background = T.bg}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <strong style={{color:T.white}}>{sS(s.name)}</strong>
              <span style={{color:T.muted}}> · {sS(s.email)}</span>
            </div>
          ))}
        </div>
      </div> : null}
    </div>

    <F label="Subject" value={subject} onChange={setSubject} placeholder="Subject line"/>

    <div style={{marginTop:8}}>
      <label style={c.lbl}>Body</label>
      <textarea
        style={{...c.inp(), minHeight:160, resize:"vertical", fontFamily:"inherit"}}
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Type your message…"
      />
    </div>

    {/* Attachments */}
    <div style={{marginTop:14}}>
      <div style={{display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
        <label style={c.lbl}>Attachments</label>
        <button style={c.bsm()} onClick={() => setAttachPickerOpen(o => !o)}>📎 Attach from My Documents</button>
        <span style={{fontSize:10, color:T.muted}}>links valid 7 days</span>
      </div>
      {attachments.length > 0 ? <div style={{display:"flex", flexWrap:"wrap", gap:6, marginTop:6}}>
        {attachments.map(a => (
          <span key={a.id} style={{display:"inline-flex", alignItems:"center", gap:4, padding:"4px 8px", background:T.goldBg || "#332600", border:"1px solid " + T.gold, borderRadius:4, fontSize:11, color:T.white}}>
            📎 {sS(a.title)}
            <button onClick={() => toggleAttachment(a)} style={{background:"none", border:"none", color:T.gold, cursor:"pointer", padding:0, fontSize:13, lineHeight:1}} title="Remove">×</button>
          </span>
        ))}
      </div> : null}
      {attachPickerOpen ? <div style={{...c.card({padding:10}), marginTop:8, maxHeight:240, overflow:"auto"}}>
        {loading ? <div style={{fontSize:11, color:T.muted}}>Loading…</div> : documents.length === 0 ? <div style={{fontSize:11, color:T.muted, fontStyle:"italic"}}>No documents in your library. Upload some from the Documents tab.</div> : documents.map(doc => {
          const selected = attachments.some(x => x.id === doc.id);
          return <div key={doc.id}
            onClick={() => toggleAttachment(doc)}
            style={{padding:"8px 6px", cursor:"pointer", fontSize:12, color:T.text, borderBottom:"1px solid " + T.border + "33", display:"flex", justifyContent:"space-between", alignItems:"center"}}
          >
            <span><strong style={{color:T.white}}>{sS(doc.title)}</strong> <span style={{color:T.muted, fontSize:10}}>· {sS(doc.mime_type || "")}</span></span>
            <span style={{color: selected ? T.gold : T.muted, fontSize:14}}>{selected ? "✓" : "+"}</span>
          </div>;
        })}
      </div> : null}
    </div>

    {errMsg ? <div style={{...c.bnr("block"), marginTop:14}}>{errMsg}</div> : null}

    <div style={{display:"flex", gap:10, marginTop:14, justifyContent:"flex-end"}}>
      <button style={c.btn(T.gold, T.bg, {fontSize:12, padding:"10px 18px"})} onClick={onSend} disabled={sending}>{sending ? "Sending…" : "📤 Send"}</button>
    </div>
  </div>;
}
