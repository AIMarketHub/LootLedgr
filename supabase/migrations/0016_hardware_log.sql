-- LootLedger — Phase 5.2-A: hardware command audit log
-- (2026-05-10).
-- ================================================================
--
-- Captures every hardware driver call (Live or Mock) for
-- debugging at the shop. Mirrors the audit_log RLS pattern
-- (0007_audit_log.sql): shop_id text + current_shop_id()
-- gating, admin override via current_is_admin(), no UPDATE /
-- DELETE policies (the log is immutable).
--
-- Driver tree under src/lib/hardware/ writes one row per
-- command (printer.print, scale.read, scanner.barcode,
-- signature.normalize, cashDrawer.kick) via the helper
-- src/lib/hardware/log.js → sbFetch("hardware_log", POST).
-- The /admin/diagnostics page reads recent rows per device
-- to surface "last run" state.
--
-- ================================================================
-- COMMITTED SHAPE (5.2-A scope — locked)
-- ================================================================
-- - shop_id is text (NOT uuid) for parity with the rest of
--   the per-tenant tables (transactions / catalog / stock /
--   audit_log all use text). Cast happens in the app via
--   getCurrentShopId() which returns text.
-- - user_id is uuid REFERENCES auth.users(id) and is required
--   (every hardware command originates from a signed-in user;
--   no legacy backfill path exists).
-- - device_type is CHECK-constrained to the five 5.2-A
--   driver names. Adding a new driver in a future commit is
--   a CHECK-constraint update, not a schema rewrite.
-- - mode is CHECK-constrained to ('live','mock') — every row
--   declares which branch produced it so the diagnostics
--   surface can colour Live vs Mock differently.
-- - latency_ms is nullable (some commands return synchronously
--   with no measurable latency).
-- - error is nullable (success rows leave it NULL).
--
-- ================================================================
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   1. None mandatory. The table starts empty.
--   2. Verification queries (run as your admin user):
--        SELECT * FROM hardware_log LIMIT 1;
--          → empty result, no error.
--        SELECT count(*) FROM pg_policies WHERE tablename='hardware_log';
--          → 2.
--        SELECT indexname FROM pg_indexes WHERE tablename='hardware_log';
--          → hardware_log_pkey + 2 named indexes.
--   3. RLS sanity check (replace SHOP_TEXT_ID with your
--      shops.id::text):
--        INSERT INTO hardware_log (shop_id, user_id, device_type,
--          command, mode, succeeded)
--        VALUES ('SHOP_TEXT_ID', auth.uid(), 'printer',
--                'diagnose', 'mock', true);
--          → succeeds for the user of that shop;
--          → fails for any other shop's user (tenant isolation).
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. hardware_log — append-only command audit per shop.
-- ──────────────────────────────────────────────────────────────────
-- Idempotent: IF NOT EXISTS so re-running the migration is a no-op
-- once the table is in place.
CREATE TABLE IF NOT EXISTS hardware_log (
  id            bigserial   PRIMARY KEY,
  shop_id       text        NOT NULL,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  device_type   text        NOT NULL CHECK (
    device_type IN ('printer','scale','scanner','signature','cashDrawer')
  ),
  command       text        NOT NULL,
  params        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  result        jsonb,
  mode          text        NOT NULL CHECK (mode IN ('live','mock')),
  succeeded     boolean     NOT NULL,
  latency_ms    int,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────
-- 2. Indexes
-- ──────────────────────────────────────────────────────────────────
-- (shop_id, created_at DESC) — primary access pattern for the
-- diagnostics page "show me the last 50 hardware events for
-- this shop" view.
CREATE INDEX IF NOT EXISTS hardware_log_shop_id_created_at_idx
  ON hardware_log (shop_id, created_at DESC);

-- (shop_id, device_type, created_at DESC) — drives the "show
-- me the last printer attempt" / per-device drill-down on the
-- diagnostics page.
CREATE INDEX IF NOT EXISTS hardware_log_device_idx
  ON hardware_log (shop_id, device_type, created_at DESC);

-- ──────────────────────────────────────────────────────────────────
-- 3. Row Level Security
-- ──────────────────────────────────────────────────────────────────
-- Mirrors audit_log (0007_audit_log.sql:107-118):
--   - read-own-shop (admin override applies);
--   - write-own-shop (admin override applies);
--   - NO update or delete policies — the log is immutable.
ALTER TABLE hardware_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hardware_log_read_own"  ON hardware_log;
DROP POLICY IF EXISTS "hardware_log_write_own" ON hardware_log;

CREATE POLICY "hardware_log_read_own" ON hardware_log FOR SELECT
  TO authenticated
  USING (shop_id = current_shop_id() OR current_is_admin());

CREATE POLICY "hardware_log_write_own" ON hardware_log FOR INSERT
  TO authenticated
  WITH CHECK (shop_id = current_shop_id() OR current_is_admin());

-- ──────────────────────────────────────────────────────────────────
-- 4. Diagnostic query — uncomment to verify after running.
-- ──────────────────────────────────────────────────────────────────
-- SELECT
--   schemaname,
--   tablename,
--   policyname,
--   cmd,
--   permissive
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename = 'hardware_log'
-- ORDER BY cmd, policyname;
--
-- Expect: two rows — hardware_log_read_own (SELECT) and
-- hardware_log_write_own (INSERT). No UPDATE, no DELETE policy.
--
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'hardware_log'
-- ORDER BY indexname;
--
-- Expect: hardware_log_device_idx, hardware_log_pkey,
-- hardware_log_shop_id_created_at_idx.
