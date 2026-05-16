// LootLedger — send-email Edge Function.
// Phase 5.2-E (2026-05-12). Server-side envoy holding the
// SMTP2GO API key so the client never sees it. Validates the
// caller's JWT, validates the payload, writes a queued row
// to email_log, POSTs to SMTP2GO, then updates the log row
// with the result.
//
// Deno-based per the Supabase Edge Function convention.
//
// Deploy:
//   supabase functions deploy send-email
//
// Secrets (set via Studio → Edge Functions → send-email →
// Secrets, or via `supabase secrets set`):
//   SMTP2GO_API_KEY        — required, generated in SMTP2GO
//                            console under Sending → API Keys
//   SMTP2GO_FROM_ADDRESS   — optional override, default
//                            "LootLedger <noreply@lootledger.au>"
//
// Standard Supabase-provided env (no manual set needed):
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY
//
// Request shape (POST /functions/v1/send-email):
//   Authorization: Bearer <user-JWT>
//   Body: { to, subject, body, htmlBody?, replyTo?, template?, fromName? }
//
// Response shape:
//   200 { ok: true, id: "<smtp2go email_id>", logId: "<email_log row uuid | null>" }
//   4xx { ok: false, error: "<reason>" }
//   5xx { ok: false, error: "<reason>" }
//
// 2026-05-16 — added logId to the 200 response. id is the
// SMTP2GO send identifier (string, non-UUID). logId is the
// email_log row's uuid PK and is the right thing to store as
// an FK in downstream audit tables (timesheet_submissions
// .email_log_id, etc.). logId may be null when the queued-row
// insert at the top of this function failed; callers must
// treat it as optional.
//
// 2026-05-15 — added optional htmlBody parameter (Phase 5.2
// Commit 1, staff workspace + EOD email enhancement). When
// htmlBody is supplied, body is the plain-text fallback and
// htmlBody is the rich HTML rendition. When htmlBody is
// omitted, the function falls back to the pre-existing
// behaviour (body is used for both text_body and html_body).
//
// 2026-05-16 — added optional fromName parameter. When supplied,
// the SMTP2GO sender field becomes "<fromName> <bareEmail>" so
// recipient email clients show the staff member's name in the
// inbox preview alongside the noreply@ address. When omitted,
// the function falls back to SMTP2GO_FROM_ADDRESS unchanged
// (EOD reports and weekly timesheets stay on the legacy display).
// fromName is sanitised — angle brackets, quotes and control
// characters are stripped to prevent header injection.

// @ts-ignore — Deno runtime; types resolve at deploy.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

const SMTP2GO_API_URL = "https://api.smtp2go.com/v3/email/send";
const SMTP2GO_API_KEY = Deno.env.get("SMTP2GO_API_KEY") || "";
const DEFAULT_FROM = Deno.env.get("SMTP2GO_FROM_ADDRESS") || "LootLedger <noreply@lootledger.au>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUBJECT_LIMIT = 200;
const BODY_LIMIT = 100000;
const PREVIEW_LIMIT = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(s: unknown): boolean {
  if (typeof s !== "string") return false;
  const v = s.trim();
  return v.length > 0 && v.length <= 320 && EMAIL_RE.test(v);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// @ts-ignore — Deno global.
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  // ─── Auth ─────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonResponse({ ok: false, error: "Missing or invalid Authorization header" }, 401);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData || !userData.user) {
    return jsonResponse({ ok: false, error: "Invalid session" }, 401);
  }
  const user = userData.user;

  // ─── Lookup caller's shop_id (uuid) for the email_log row ─────
  // Service-role client for log writes (bypasses RLS).
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let shopId: string | null = null;
  try {
    const { data: userRow } = await adminClient
      .from("users")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle();
    shopId = (userRow && (userRow as { shop_id?: string }).shop_id) || null;
  } catch (_) {
    // non-fatal — log row still useful with shop_id null
  }

  // ─── Validate payload ─────────────────────────────────────────
  let payload: {
    to?: unknown;
    subject?: unknown;
    body?: unknown;
    htmlBody?: unknown;
    replyTo?: unknown;
    template?: unknown;
    fromName?: unknown;
  };
  try {
    payload = await req.json();
  } catch (_) {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const to = typeof payload.to === "string" ? payload.to.trim() : "";
  const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
  const body = typeof payload.body === "string" ? payload.body : "";
  const htmlBody = typeof payload.htmlBody === "string" && payload.htmlBody.length > 0
    ? payload.htmlBody
    : null;
  const replyTo = typeof payload.replyTo === "string" && payload.replyTo.trim().length > 0
    ? payload.replyTo.trim()
    : null;
  const template = typeof payload.template === "string" ? payload.template.slice(0, 64) : null;
  // Sanitise fromName: strip <, >, ", \r, \n, and any other
  // control chars. Trim and cap at 100 chars. Anything left after
  // sanitising is the safe display name we put in front of the
  // bare address.
  const rawFromName = typeof payload.fromName === "string" ? payload.fromName : "";
  const fromName = rawFromName
    .replace(/[<>"\r\n\t]/g, "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .slice(0, 100);

  if (!to || !subject || !body) {
    return jsonResponse({ ok: false, error: "Missing required fields (to, subject, body)" }, 400);
  }
  if (!isValidEmail(to)) {
    return jsonResponse({ ok: false, error: "Invalid recipient email" }, 400);
  }
  if (replyTo && !isValidEmail(replyTo)) {
    return jsonResponse({ ok: false, error: "Invalid reply-to email" }, 400);
  }

  const cleanSubject = subject.slice(0, SUBJECT_LIMIT);
  const cleanBody = body.slice(0, BODY_LIMIT);
  // When htmlBody is supplied, use it for the HTML rendition;
  // otherwise mirror the plain body for both (pre-existing
  // behaviour, kept for callers that pass only `body`).
  const cleanHtmlBody = htmlBody !== null ? htmlBody.slice(0, BODY_LIMIT) : cleanBody;
  const preview = cleanBody.slice(0, PREVIEW_LIMIT);

  if (!SMTP2GO_API_KEY) {
    // Configured wrong — fail fast with a clear message.
    return jsonResponse({ ok: false, error: "SMTP2GO_API_KEY not configured on the Edge Function" }, 500);
  }

  // Build the SMTP2GO sender field. When fromName is supplied,
  // extract the bare address from DEFAULT_FROM (which may itself
  // already include a display name like "LootLedger <noreply@…>")
  // and reconstruct as "<fromName> <bareAddress>". Otherwise use
  // DEFAULT_FROM unchanged — preserves the legacy behaviour for
  // EOD reports + weekly timesheets.
  const bareFromMatch = DEFAULT_FROM.match(/<([^>]+)>/);
  const bareFromAddress = bareFromMatch ? bareFromMatch[1] : DEFAULT_FROM;
  const senderField = fromName
    ? (fromName + " <" + bareFromAddress + ">")
    : DEFAULT_FROM;

  // ─── Log queued state ─────────────────────────────────────────
  let logId: string | null = null;
  try {
    const { data: inserted } = await adminClient
      .from("email_log")
      .insert({
        shop_id: shopId,
        sent_by: user.id,
        to_address: to,
        from_address: senderField,
        reply_to: replyTo,
        subject: cleanSubject,
        body_preview: preview,
        template: template,
        status: "queued",
      })
      .select("id")
      .maybeSingle();
    logId = (inserted && (inserted as { id?: string }).id) || null;
  } catch (_) {
    // non-fatal — proceed with the send anyway, log the failure
    // mode later if anyone investigates.
  }

  // ─── Call SMTP2GO ─────────────────────────────────────────────
  let smtpResult: { ok: boolean; emailId?: string; error?: string };
  try {
    const smtpRes = await fetch(SMTP2GO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: SMTP2GO_API_KEY,
        to: [to],
        sender: senderField,
        subject: cleanSubject,
        text_body: cleanBody,
        html_body: cleanHtmlBody,
        custom_headers: replyTo ? [{ header: "Reply-To", value: replyTo }] : undefined,
      }),
    });

    type SmtpJson = {
      data?: {
        succeeded?: number;
        failed?: number;
        email_id?: string;
        error?: string;
        error_code?: string;
      };
      request_id?: string;
    };
    const smtpJson = (await smtpRes.json()) as SmtpJson;

    if (smtpRes.ok && smtpJson.data && smtpJson.data.email_id && (smtpJson.data.succeeded || 0) > 0) {
      smtpResult = { ok: true, emailId: smtpJson.data.email_id };
    } else {
      const errMsg = (smtpJson.data && (smtpJson.data.error || smtpJson.data.error_code))
        || ("SMTP2GO HTTP " + smtpRes.status);
      smtpResult = { ok: false, error: String(errMsg).slice(0, 500) };
    }
  } catch (e) {
    smtpResult = { ok: false, error: "Network error: " + ((e as Error).message || String(e)) };
  }

  // ─── Update log with result ───────────────────────────────────
  if (logId) {
    try {
      await adminClient
        .from("email_log")
        .update(
          smtpResult.ok
            ? { status: "sent", smtp2go_id: smtpResult.emailId }
            : { status: "failed", error: smtpResult.error },
        )
        .eq("id", logId);
    } catch (_) {
      // non-fatal
    }
  }

  if (smtpResult.ok) {
    return jsonResponse({ ok: true, id: smtpResult.emailId, logId: logId });
  }
  return jsonResponse({ ok: false, error: smtpResult.error }, 500);
});
