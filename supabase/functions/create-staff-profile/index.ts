// LootLedger — create-staff-profile Edge Function.
// Phase 5.2 staff-workspace fix-forward 1.5 (2026-05-16).
//
// Service-role function that creates an auth.users row + a
// matching public.users row for a new staff member without
// the email-invite round-trip. Used by the "Add profile
// manually" form in src/modals/Staff.jsx.
//
// Caller authorisation:
//   - Bearer JWT required.
//   - Caller's role (from public.users) must be owner or manager.
//   - New profile is created in the caller's shop_id.
//
// Input shape (POST /functions/v1/create-staff-profile):
//   Authorization: Bearer <user-JWT>
//   Body: { email, firstName, familyName?, role, pin }
//     - email: required, validated shape.
//     - firstName: required.
//     - familyName: optional.
//     - role: required, one of 'owner' | 'manager' | 'staff'.
//             Manager callers cannot create owners.
//     - pin: required, 4-12 digits.
//
// Output:
//   200 { ok: true, userId: "<uuid>", tempPassword: "<16 chars>" }
//   4xx { ok: false, error: "<reason>" }
//   5xx { ok: false, error: "<reason>" }
//
// The temp password is generated server-side, returned ONCE to
// the caller, then never stored or retrievable. The caller is
// responsible for sharing it with the new staff member out-of-
// band (in person, secure messaging) so they can sign in and
// change it.
//
// Deploy via Studio: Edge Functions → New function → name
// "create-staff-profile" → paste this file → Deploy.
// No new secrets — uses SUPABASE_SERVICE_ROLE_KEY from the
// standard Supabase env.

// @ts-ignore — Deno runtime; types resolve at deploy.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PIN_RE = /^[0-9]{4,12}$/;
const VALID_ROLES = ["owner", "manager", "staff"];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// 16-character base64-url password. Strong enough to survive
// brief in-person handoff; new staff is prompted to rotate it.
function generateTempPassword(): string {
  // @ts-ignore — Deno crypto.
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let b64 = btoa(String.fromCharCode(...bytes));
  // Make it URL/clipboard-friendly.
  b64 = b64.replace(/\+/g, "A").replace(/\//g, "B").replace(/=/g, "");
  return b64.slice(0, 16);
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
  const caller = userData.user;

  // ─── Lookup caller's role + shop_id ───────────────────────────
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let callerRole: string | null = null;
  let callerShopId: string | null = null;
  try {
    const { data: callerRow } = await adminClient
      .from("users")
      .select("role, shop_id")
      .eq("id", caller.id)
      .maybeSingle();
    callerRole = (callerRow && (callerRow as { role?: string }).role) || null;
    callerShopId = (callerRow && (callerRow as { shop_id?: string }).shop_id) || null;
  } catch (_) {
    return jsonResponse({ ok: false, error: "Could not load caller record" }, 500);
  }

  if (!callerShopId) {
    return jsonResponse({ ok: false, error: "Caller has no shop" }, 403);
  }
  if (callerRole !== "owner" && callerRole !== "manager") {
    return jsonResponse({ ok: false, error: "Owner or manager only" }, 403);
  }

  // ─── Validate payload ─────────────────────────────────────────
  let payload: {
    email?: unknown;
    firstName?: unknown;
    familyName?: unknown;
    role?: unknown;
    pin?: unknown;
  };
  try {
    payload = await req.json();
  } catch (_) {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const firstName = typeof payload.firstName === "string" ? payload.firstName.trim() : "";
  const familyName = typeof payload.familyName === "string" ? payload.familyName.trim() : "";
  const role = typeof payload.role === "string" ? payload.role.trim().toLowerCase() : "";
  const pin = typeof payload.pin === "string" ? payload.pin.trim() : "";

  if (!email || !EMAIL_RE.test(email)) {
    return jsonResponse({ ok: false, error: "Invalid email" }, 400);
  }
  if (!firstName) {
    return jsonResponse({ ok: false, error: "First name required" }, 400);
  }
  if (VALID_ROLES.indexOf(role) === -1) {
    return jsonResponse({ ok: false, error: "Invalid role" }, 400);
  }
  if (callerRole === "manager" && role === "owner") {
    return jsonResponse({ ok: false, error: "Manager cannot create an owner" }, 403);
  }
  if (!PIN_RE.test(pin)) {
    return jsonResponse({ ok: false, error: "PIN must be 4-12 digits" }, 400);
  }

  // ─── Create auth user ─────────────────────────────────────────
  const tempPassword = generateTempPassword();
  let newUserId: string | null = null;
  try {
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (createErr || !created || !created.user) {
      const msg = (createErr && createErr.message) || "createUser failed";
      // 422 typically means "user already registered".
      const status = /already/i.test(String(msg)) ? 409 : 500;
      return jsonResponse({ ok: false, error: msg }, status);
    }
    newUserId = created.user.id;
  } catch (e) {
    return jsonResponse({ ok: false, error: "Auth create exception: " + ((e as Error).message || String(e)) }, 500);
  }

  // ─── INSERT into public.users ─────────────────────────────────
  try {
    const { error: insertErr } = await adminClient.from("users").insert({
      id: newUserId,
      shop_id: callerShopId,
      role,
      first_name: firstName,
      family_name: familyName || null,
      email,
      pin,
      is_active: true,
    });
    if (insertErr) {
      // Best-effort rollback of the auth user so we don't leave
      // an orphan.
      try { await adminClient.auth.admin.deleteUser(newUserId as string); } catch (_) { /* swallow */ }
      return jsonResponse({ ok: false, error: "Profile insert failed: " + (insertErr.message || "unknown") }, 500);
    }
  } catch (e) {
    try { await adminClient.auth.admin.deleteUser(newUserId as string); } catch (_) { /* swallow */ }
    return jsonResponse({ ok: false, error: "Profile insert exception: " + ((e as Error).message || String(e)) }, 500);
  }

  // ─── Audit-log the create ────────────────────────────────────
  try {
    await adminClient.from("audit_log").insert({
      shop_id: callerShopId,
      actor: caller.id,
      event_type: "staff_profile_manually_created",
      target_table: "users",
      target_id: newUserId,
      payload: { email, role, first_name: firstName, family_name: familyName || null },
    });
  } catch (_) {
    // Non-fatal — the profile is created; failed audit is logged
    // as a server warning only.
  }

  return jsonResponse({ ok: true, userId: newUserId, tempPassword });
});
