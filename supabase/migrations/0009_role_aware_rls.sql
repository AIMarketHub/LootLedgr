-- LootLedger — Phase 3 commit 3c: role-aware RLS + audit_log
-- write tightening (2026-05-07).
-- ================================================================
--
-- 3a (audit_log table) and 3b (manager role + created_by columns)
-- are already live in dev DB. 3c brings the policy layer up to
-- match:
--
--   - tenant_* on the five doc tables get role-aware delete gates
--     (staff cannot delete; manager-or-owner can) and per-actor
--     INSERT checks where the table has an actor column.
--   - tfs_screen_log gets actor enforcement on insert.
--   - audit_log INSERT tightens: actor must equal auth.uid()
--     unless event_type='legacy_import' (the 3e backfill marker).
--
-- "NULL OR match" pattern on actor columns lets legacy app writes
-- keep working until 3d migrates every write path. Once 3d is
-- live and verified, a follow-up could harden to "= auth.uid()"
-- with no NULL escape, but that's NOT 3c.
--
-- ================================================================
-- INVESTIGATION RESULTS (3c prep, 2026-05-07)
-- ================================================================
-- - tenant_* policy names from 0003:191-205 confirmed: tenant_
--   select / tenant_insert / tenant_update / tenant_delete (created
--   with double-quoted identifiers; equivalent to unquoted lowercase
--   for DROP IF EXISTS / CREATE since names are already lowercase).
-- - tfs_screen_log_write_own confirmed from 0006:155-167.
-- - audit_log_write_own confirmed from 0007.
-- - Style note: 0006 and 0007 used `TO authenticated` on the
--   policies this migration replaces. The replacements below match
--   the spec verbatim (no TO clause). Semantic is preserved because
--   current_shop_id() / auth.uid() return NULL for anon callers, so
--   the WITH CHECK fails for anon regardless. Flagged as a future
--   defense-in-depth review item; out of scope for 3c.
-- ================================================================
--
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   1. Apply 0007 and 0008 first if not already applied (they
--      should be live by now per the latest save block; this
--      migration assumes audit_log + created_by columns exist).
--   2. Run the 9-query verification suite at the bottom of this
--      file. The spec walks through actor mismatch, NULL actor,
--      legacy_import, and tenant select sanity.
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. Helper: current_user_can_delete()
-- ──────────────────────────────────────────────────────────────────
-- Owner and manager can delete; staff cannot. Used by tenant_delete
-- policies on the five doc tables. SECURITY DEFINER + STABLE so it
-- runs cleanly inside an RLS body and Postgres can per-statement
-- cache the result. CREATE OR REPLACE is naturally idempotent.
CREATE OR REPLACE FUNCTION current_user_can_delete()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT current_user_role() IN ('owner','manager');
$$;

-- ──────────────────────────────────────────────────────────────────
-- 2. tenant_select + tenant_delete on the five doc tables.
-- ──────────────────────────────────────────────────────────────────
-- INSERT and UPDATE are handled per-table below because the actor
-- column name (and presence) differs across these tables. SELECT
-- and DELETE are uniform, so we drive them from a DO loop.
--
-- DROP-then-CREATE keeps the migration idempotent: re-running
-- replaces the existing policies with the same definitions.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transactions','catalog','stock','clients','settings'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_select ON %I', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_insert ON %I', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_update ON %I', t);
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_delete ON %I', t);

    EXECUTE format($f$
      CREATE POLICY tenant_select ON %I FOR SELECT
      USING (shop_id = current_shop_id() OR current_is_admin())
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY tenant_delete ON %I FOR DELETE
      USING (
        (shop_id = current_shop_id() AND current_user_can_delete())
        OR current_is_admin()
      )
    $f$, t);
  END LOOP;
END$$;

-- ──────────────────────────────────────────────────────────────────
-- 3. Per-table INSERT and UPDATE policies.
-- ──────────────────────────────────────────────────────────────────
-- The DO loop above already DROPped tenant_insert / tenant_update
-- on every doc table, so the CREATEs below land cleanly on a
-- fresh slate (idempotent re-runs hit the same DROP first).

-- transactions / stock / clients — INSERT enforces created_by
-- = auth.uid() OR NULL. UPDATE remains shop-scope only (planned
-- harden after 3d ships).
CREATE POLICY tenant_insert ON transactions FOR INSERT
  WITH CHECK (
    (shop_id = current_shop_id()
     AND (created_by IS NULL OR created_by = auth.uid()))
    OR current_is_admin()
  );
CREATE POLICY tenant_update ON transactions FOR UPDATE
  USING (shop_id = current_shop_id() OR current_is_admin())
  WITH CHECK (shop_id = current_shop_id() OR current_is_admin());

CREATE POLICY tenant_insert ON stock FOR INSERT
  WITH CHECK (
    (shop_id = current_shop_id()
     AND (created_by IS NULL OR created_by = auth.uid()))
    OR current_is_admin()
  );
CREATE POLICY tenant_update ON stock FOR UPDATE
  USING (shop_id = current_shop_id() OR current_is_admin())
  WITH CHECK (shop_id = current_shop_id() OR current_is_admin());

CREATE POLICY tenant_insert ON clients FOR INSERT
  WITH CHECK (
    (shop_id = current_shop_id()
     AND (created_by IS NULL OR created_by = auth.uid()))
    OR current_is_admin()
  );
CREATE POLICY tenant_update ON clients FOR UPDATE
  USING (shop_id = current_shop_id() OR current_is_admin())
  WITH CHECK (shop_id = current_shop_id() OR current_is_admin());

-- catalog — no actor column (per 3b decision; shop-shared row).
-- INSERT/UPDATE mirror 0003 shape: shop-scope only.
CREATE POLICY tenant_insert ON catalog FOR INSERT
  WITH CHECK (shop_id = current_shop_id() OR current_is_admin());
CREATE POLICY tenant_update ON catalog FOR UPDATE
  USING (shop_id = current_shop_id() OR current_is_admin())
  WITH CHECK (shop_id = current_shop_id() OR current_is_admin());

-- settings — last_updated_by enforced on both INSERT and UPDATE
-- (settings is mutated, not appended; every save sets the column).
CREATE POLICY tenant_insert ON settings FOR INSERT
  WITH CHECK (
    (shop_id = current_shop_id()
     AND (last_updated_by IS NULL OR last_updated_by = auth.uid()))
    OR current_is_admin()
  );
CREATE POLICY tenant_update ON settings FOR UPDATE
  USING (shop_id = current_shop_id() OR current_is_admin())
  WITH CHECK (
    (shop_id = current_shop_id()
     AND (last_updated_by IS NULL OR last_updated_by = auth.uid()))
    OR current_is_admin()
  );

-- ──────────────────────────────────────────────────────────────────
-- 4. tfs_screen_log INSERT policy — enforce created_by.
-- ──────────────────────────────────────────────────────────────────
-- Read policy unchanged (tfs_screen_log_read_own from 0006). No
-- update or delete policy by design; log entries are immutable.
DROP POLICY IF EXISTS tfs_screen_log_write_own ON tfs_screen_log;
CREATE POLICY tfs_screen_log_write_own ON tfs_screen_log FOR INSERT
  WITH CHECK (
    (shop_id = current_shop_id()
     AND (created_by IS NULL OR created_by = auth.uid()))
    OR current_is_admin()
  );

-- ──────────────────────────────────────────────────────────────────
-- 5. audit_log INSERT policy — actor enforcement.
-- ──────────────────────────────────────────────────────────────────
-- Actor must equal auth.uid() unless the event is the 3e legacy
-- backfill marker (event_type='legacy_import'), which is the only
-- path that may insert NULL actor.
--
-- Read policy unchanged (audit_log_read_own from 0007). No update
-- or delete policy; log entries are immutable.
DROP POLICY IF EXISTS audit_log_write_own ON audit_log;
CREATE POLICY audit_log_write_own ON audit_log FOR INSERT
  WITH CHECK (
    (
      shop_id = current_shop_id()
      AND (
        (event_type = 'legacy_import' AND actor IS NULL)
        OR actor = auth.uid()
      )
    )
    OR current_is_admin()
  );

-- ──────────────────────────────────────────────────────────────────
-- 6. Verification queries (manual — copy into Studio after run).
-- ──────────────────────────────────────────────────────────────────
-- 1) Helper returns true for owner:
--      SELECT current_user_can_delete();
--    Expect: true (signed-in shop owner).
--
-- 2) Policy inventory across the five doc tables:
--      SELECT tablename, policyname, cmd
--      FROM pg_policies
--      WHERE tablename IN
--        ('transactions','catalog','stock','clients','settings')
--      ORDER BY tablename, policyname;
--    Expect: 4 policies per table = 20 rows.
--
-- 3) INSERT with mismatched created_by must fail:
--      INSERT INTO transactions (id, shop_id, data, created_by)
--      VALUES ('test_3c_mismatch',
--              current_shop_id(),
--              '{}'::jsonb,
--              '00000000-0000-0000-0000-000000000000');
--    Expect: ERROR new row violates row-level security policy.
--
-- 4) INSERT with created_by = auth.uid() succeeds; owner can DELETE:
--      INSERT INTO transactions (id, shop_id, data, created_by)
--      VALUES ('test_3c_match',
--              current_shop_id(),
--              '{}'::jsonb,
--              auth.uid());
--      DELETE FROM transactions WHERE id='test_3c_match';
--    Expect: both succeed.
--
-- 5) INSERT with NULL created_by still works (legacy path):
--      INSERT INTO transactions (id, shop_id, data)
--      VALUES ('test_3c_null', current_shop_id(), '{}'::jsonb);
--      DELETE FROM transactions WHERE id='test_3c_null';
--    Expect: both succeed.
--
-- 6) audit_log: mismatched actor fails:
--      INSERT INTO audit_log (shop_id, actor, event_type)
--      VALUES (current_shop_id(),
--              '00000000-0000-0000-0000-000000000000',
--              'admin_pin_gate_passed');
--    Expect: ERROR RLS violation.
--
-- 7) audit_log: actor=auth.uid() succeeds (leave row, immutable):
--      INSERT INTO audit_log (shop_id, actor, event_type)
--      VALUES (current_shop_id(), auth.uid(),
--              'admin_pin_gate_passed');
--    Expect: success.
--
-- 8) audit_log: NULL actor refused for non-legacy; allowed for
--    legacy_import:
--      INSERT INTO audit_log (shop_id, event_type)
--      VALUES (current_shop_id(), 'admin_pin_gate_passed');
--      -- expect: ERROR RLS violation.
--      INSERT INTO audit_log (shop_id, event_type)
--      VALUES (current_shop_id(), 'legacy_import');
--      -- expect: success.
--
-- 9) Sanity: tenant_select still works:
--      SELECT count(*) FROM transactions;
--    Expect: shop's normal count, no error.
