-- LootLedger — Phase 3 commit 3a: audit_log table (2026-05-07).
-- ================================================================
--
-- Foundation for the unified override / audit trail. Three legacy
-- audit shapes coexist today (per docs/handover/section-9-audit.md
-- Gap 6 + the Phase 3 recon save block):
--
--   1. tfs_screen_log (real table, 0006_tfs_list.sql:128-170)
--   2. client.data.blacklistOverrides JSONB array
--   3. settings.data.{tos|privacy|aml}.versions[].savedBy
--
-- Plus the generic admin-PIN gate (src/lib/adminGate.js) which
-- currently writes nothing — Section 9 Gap 6's residual gap that
-- this Phase 3 work closes.
--
-- This migration creates audit_log only. App-side writers and the
-- legacy backfill ship in later Phase 3 commits (3d / 3e).
--
-- ================================================================
-- COMMITTED SHAPE (3a scope — locked)
-- ================================================================
-- - actor is nullable. 3c tightens with a role-aware policy that
--   refuses inserts where actor is NULL on non-legacy events; 3a
--   leaves it open so 3e's backfill can land without inventing a
--   fake auth.uid().
-- - event_type is plain text — no enum, no CHECK. Postgres enum
--   evolution is painful and we want 3d to populate this organically.
--   Reserved values (informational; not enforced):
--     admin_pin_gate_passed, admin_pin_gate_failed,
--     tfs_override, blacklist_override, structuring_override,
--     ttr_filed, smr_filed, police_notice_logged,
--     legal_doc_approved, legal_doc_drafted,
--     client_archived, client_restored, client_deleted,
--     staff_invited, staff_role_changed, staff_removed,
--     settings_changed, legacy_import.
-- - target_table / target_id are not real FKs — coupling them
--   with CASCADE rules would force the audit log to lose history
--   when the target row is deleted, which defeats the point.
-- - reason is a top-level column (not just inside payload) because
--   every override carries one and we want it queryable.
-- - delete_after defaults to 7 years (matches tfs_screen_log).
--
-- ================================================================
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   1. None mandatory. The table starts empty.
--   2. Verification queries (run as your admin user):
--        SELECT * FROM audit_log LIMIT 1;
--          → empty result, no error.
--        SELECT count(*) FROM pg_policies WHERE tablename='audit_log';
--          → 2.
--        SELECT indexname FROM pg_indexes WHERE tablename='audit_log';
--          → audit_log_pkey + 3 named indexes.
--   3. RLS sanity check (replace SHOP_UUID with your shops.id):
--        INSERT INTO audit_log (shop_id, event_type)
--        VALUES ('SHOP_UUID', 'test');
--          → succeeds for the user of that shop;
--          → fails (insufficient_privilege) for any other shop's user.
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. audit_log — unified per-shop override / audit trail.
-- ──────────────────────────────────────────────────────────────────
-- Idempotent: IF NOT EXISTS so re-running the migration is a no-op
-- once the table is in place.
CREATE TABLE IF NOT EXISTS audit_log (
  id            bigserial   PRIMARY KEY,
  shop_id       text        NOT NULL,
  actor         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_label   text,
  event_type    text        NOT NULL,
  target_table  text,
  target_id     text,
  payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  delete_after  timestamptz NOT NULL DEFAULT (now() + interval '7 years')
);

-- ──────────────────────────────────────────────────────────────────
-- 2. Indexes
-- ──────────────────────────────────────────────────────────────────
-- (shop_id, created_at DESC) — primary access pattern for the
-- per-shop audit history view (newest first, scoped to one shop).
CREATE INDEX IF NOT EXISTS audit_log_shop_id_created_at_idx
  ON audit_log (shop_id, created_at DESC);

-- (shop_id, event_type, created_at DESC) — drives "show me every
-- TFS override in the last 90 days" style filtering.
CREATE INDEX IF NOT EXISTS audit_log_event_type_idx
  ON audit_log (shop_id, event_type, created_at DESC);

-- (shop_id, target_table, target_id) — drives "what's the audit
-- trail for transaction X" / "for client Y" reverse lookups.
CREATE INDEX IF NOT EXISTS audit_log_target_idx
  ON audit_log (shop_id, target_table, target_id);

-- ──────────────────────────────────────────────────────────────────
-- 3. Row Level Security
-- ──────────────────────────────────────────────────────────────────
-- Mirrors tfs_screen_log (0006_tfs_list.sql:153-167):
--   - read-own-shop (admin override applies);
--   - write-own-shop (admin override applies);
--   - NO update or delete policies — the log is immutable.
-- Phase 3 commit 3c will add a tighter write policy that refuses
-- inserts where actor is NULL on non-legacy events; for 3a the
-- write check is shop-scope only so 3e backfill can land first.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_read_own"  ON audit_log;
DROP POLICY IF EXISTS "audit_log_write_own" ON audit_log;

CREATE POLICY "audit_log_read_own" ON audit_log FOR SELECT
  TO authenticated
  USING (shop_id = current_shop_id() OR current_is_admin());

CREATE POLICY "audit_log_write_own" ON audit_log FOR INSERT
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
--   AND tablename = 'audit_log'
-- ORDER BY cmd, policyname;
--
-- Expect: two rows — audit_log_read_own (SELECT) and
-- audit_log_write_own (INSERT). No UPDATE, no DELETE policy.
--
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'audit_log'
-- ORDER BY indexname;
--
-- Expect: audit_log_event_type_idx, audit_log_pkey,
-- audit_log_shop_id_created_at_idx, audit_log_target_idx.
