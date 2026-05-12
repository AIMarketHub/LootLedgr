-- LootLedger — Phase 5.2-E: email send audit log
-- + accountant contact fields on shops (2026-05-12).
-- ================================================================
--
-- Architecture spec: §14 (Email / SMTP2GO) of
-- docs/project/project_phase_5_2_checkpoint.md.
--
-- Two concerns in one migration (small + tightly coupled):
--
--   1. email_log — append-only audit table. Every email
--      sent through the send-email Edge Function gets one
--      row (queued -> sent or failed). Lets the platform
--      admin see what's been sent + diagnose failures.
--
--   2. shops.accountant_email + shops.accountant_name —
--      per-shop accountant contact, used by the "Send to
--      accountant" button on the transaction detail modal
--      and on the EOD report.
--
-- ================================================================
-- COMMITTED SHAPE (5.2-E scope — locked)
-- ================================================================
-- - email_log.shop_id is uuid (REFERENCES shops(id)) and
--   nullable (ON DELETE SET NULL). New tables in 5.2 use uuid;
--   the legacy audit_log + hardware_log used text shop_id
--   because they predate the standardisation.
-- - body_preview holds first 200 chars only. The full body
--   is NOT stored (PII minimisation — accountant emails can
--   include client names + transaction details).
-- - smtp2go_id stamped from the SMTP2GO API response so we
--   can trace a row back to the provider for support cases.
-- - No UPDATE / DELETE policies — the log is immutable
--   from the client side. The Edge Function uses the
--   service-role key to do the queued -> sent / failed
--   status update; service role bypasses RLS.
--
-- ================================================================
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   1. Verify schema:
--        SELECT column_name, data_type, is_nullable
--        FROM information_schema.columns
--        WHERE table_name = 'email_log'
--        ORDER BY ordinal_position;
--      Expect: id, shop_id, sent_by, to_address, from_address,
--      reply_to, subject, body_preview, template, smtp2go_id,
--      status, error, sent_at.
--
--   2. Verify accountant columns on shops:
--        SELECT column_name FROM information_schema.columns
--        WHERE table_name = 'shops'
--          AND column_name IN ('accountant_email', 'accountant_name');
--      Expect 2 rows.
--
--   3. Verify RLS policies:
--        SELECT policyname, cmd FROM pg_policies
--        WHERE tablename = 'email_log'
--        ORDER BY policyname;
--      Expect: email_log_platform_admin_read (SELECT),
--      email_log_shop_read (SELECT). No INSERT / UPDATE /
--      DELETE policies (Edge Function writes via service
--      role).
--
--   4. Deploy the send-email Edge Function and set its
--      SMTP2GO_API_KEY secret (see commit message).
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. email_log table
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       uuid        REFERENCES shops(id) ON DELETE SET NULL,
  sent_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  to_address    text        NOT NULL,
  from_address  text        NOT NULL,
  reply_to      text,
  subject       text        NOT NULL,
  body_preview  text,
  template      text,
  smtp2go_id    text,
  status        text        NOT NULL CHECK (status IN ('queued','sent','failed')),
  error         text,
  sent_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_log_shop_idx
  ON email_log (shop_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS email_log_status_idx
  ON email_log (status, sent_at DESC)
  WHERE status <> 'sent';

CREATE INDEX IF NOT EXISTS email_log_template_idx
  ON email_log (template, sent_at DESC);

-- ──────────────────────────────────────────────────────────────────
-- 2. RLS on email_log
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_log_shop_read"           ON email_log;
DROP POLICY IF EXISTS "email_log_platform_admin_read" ON email_log;

-- Shop members read their own shop's email log. shop_id is
-- uuid; current_shop_id() returns text → cast for the compare.
CREATE POLICY "email_log_shop_read" ON email_log
  FOR SELECT
  TO authenticated
  USING (shop_id::text = current_shop_id());

-- Platform admins read everything.
CREATE POLICY "email_log_platform_admin_read" ON email_log
  FOR SELECT
  TO authenticated
  USING (current_is_platform_admin());

-- No INSERT / UPDATE / DELETE policies. The send-email Edge
-- Function uses the Supabase service-role key to write rows
-- (bypasses RLS). Clients can read their own shop's log; they
-- cannot insert directly.

-- ──────────────────────────────────────────────────────────────────
-- 3. accountant fields on shops
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS accountant_email text,
  ADD COLUMN IF NOT EXISTS accountant_name  text;

-- ──────────────────────────────────────────────────────────────────
-- 4. Diagnostic queries — uncomment to verify after running.
-- ──────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'email_log'
-- ORDER BY ordinal_position;
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'shops'
--   AND column_name IN ('accountant_email','accountant_name');
--
-- SELECT policyname, cmd FROM pg_policies
-- WHERE tablename = 'email_log'
-- ORDER BY policyname;
