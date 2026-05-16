// LootLedger — email send helper.
// Phase 5.2-E (2026-05-12). Thin wrapper around
// supabase.functions.invoke('send-email', ...) so call
// sites don't need to know about the Edge Function
// envelope.
//
// Edge Function lives at supabase/functions/send-email/.
// It holds the SMTP2GO API key server-side; the client
// never sees it.
//
// Returns the Edge Function's response shape:
//   { ok: true,  id: "<smtp2go email_id>" }
//   { ok: false, error: "<reason>" }
//
// Network / unexpected failures are caught and surfaced
// as { ok: false, error: ... } so call sites can branch
// on `r.ok` uniformly.

import {supabase} from "./auth/saas.js";

/**
 * Send an email through the send-email Edge Function.
 *
 * @param {Object} args
 * @param {string} args.to        Recipient email (required)
 * @param {string} args.subject   Subject line (required; capped 200 chars by the function)
 * @param {string} args.body      Plain-text body (required; capped 100KB)
 * @param {string} [args.htmlBody] Optional rich HTML body. When omitted, the
 *                                 Edge Function uses `body` for both the
 *                                 text and HTML renditions (pre-existing
 *                                 single-body behaviour).
 * @param {string} [args.replyTo] Optional Reply-To header
 * @param {string} [args.template] Optional template tag (recorded in email_log.template)
 * @param {string} [args.fromName] Optional display name shown alongside the
 *                                 bare FROM address. Sanitised server-side.
 *                                 When omitted, the function uses the
 *                                 SMTP2GO_FROM_ADDRESS default unchanged
 *                                 (EOD + timesheet emails skip this).
 * @returns {Promise<{ok: boolean, id?: string, error?: string}>}
 */
export async function sendEmail({to,subject,body,htmlBody,replyTo,template,fromName}){
  if(!to||!subject||!body){
    return{ok:false,error:"Missing required fields (to, subject, body)"};
  }
  try{
    const{data,error}=await supabase.functions.invoke("send-email",{
      body:{to:to,subject:subject,body:body,htmlBody:htmlBody||null,replyTo:replyTo||null,template:template||null,fromName:fromName||null},
    });
    if(error){
      return{ok:false,error:(error&&error.message)||String(error)};
    }
    if(data&&typeof data==="object"){
      return data;
    }
    return{ok:false,error:"Unexpected Edge Function response"};
  }catch(e){
    return{ok:false,error:(e&&e.message)||String(e)};
  }
}
