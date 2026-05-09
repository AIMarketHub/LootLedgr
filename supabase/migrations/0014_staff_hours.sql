-- LootLedger — Phase 3.5-A-1: staff_hours table + PIN-gated
-- mutation RPCs + audit hooks (2026-05-09).
-- ================================================================
--
-- Per-user, per-date hours log. Drives the EOD "Staff hours
-- today" sub-section, the Staff modal "My Hours" 7-day catch-up
-- grid, and the XLSX export's STAFF HOURS section (currently a
-- placeholder block — replaced by 3.5-A-3).
--
-- ARCHITECTURE
-- ============
-- Reads via direct RLS-gated SELECT (read-own-shop).
-- Writes ONLY through SECURITY DEFINER RPCs that:
--   1. Validate caller's per-staff PIN against users.pin.
--   2. Validate caller's role for cross-user writes (only
--      owner/manager can write hours for another user).
--   3. Perform the upsert (ON CONFLICT (shop_id, user_id,
--      work_date) DO UPDATE — atomic across concurrent writers).
--   4. Write audit_log row in the same transaction.
--
-- The table has NO INSERT/UPDATE/DELETE RLS policies. Direct
-- writes from the JS SDK fail closed; the RPC is the only path.
--
-- ================================================================
-- INVESTIGATION RESULTS (3.5-A-1 prep, 2026-05-09)
-- ================================================================
-- - gen_random_uuid() is Postgres 13+ built-in (resolved without
--   the extensions schema). Same path as 0010/0012 hotfix.
-- - current_user_role() helper from 0008 (3b) — SECURITY DEFINER
--   STABLE, returns text.
-- - users.pin from 0011 (3d-4-a) — text NULL with regex CHECK.
-- - audit_log_write_own RLS (0009) accepts actor=auth.uid();
--   the new event_types staff_hours_created / _updated /
--   _deleted are not the legacy_import carve-out, so each RPC
--   supplies actor=auth.uid() correctly.
-- ================================================================
--
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   1. Run the verification queries at the bottom of this file
--      (table + indexes + 1 SELECT policy + 2 RPCs registered;
--      empty count to start).
--   2. Real RPC tests run from the dev app post-3.5-A-2 (Studio
--      sessions are unauthed so RPC calls fail with "Not
--      authenticated" — that's the expected fail-closed shape).
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. staff_hours — per-user, per-date log
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_hours (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id       text        NOT NULL,
  user_id       uuid        NOT NULL
                  REFERENCES auth.users(id) ON DELETE CASCADE,
  work_date     date        NOT NULL,
  start_time    time,
  end_time      time,
  break_minutes integer     NOT NULL DEFAULT 0
                  CHECK (break_minutes >= 0
                         AND break_minutes <= 1440),
  note          text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid        REFERENCES auth.users(id)
                  ON DELETE SET NULL
);

-- One row per (shop, user, date). Drives the upsert ON CONFLICT
-- target inside upsert_staff_hours below.
CREATE UNIQUE INDEX IF NOT EXISTS staff_hours_unique
  ON staff_hours (shop_id, user_id, work_date);

-- Per-shop date scan (EOD report, XLSX export).
CREATE INDEX IF NOT EXISTS staff_hours_shop_date_idx
  ON staff_hours (shop_id, work_date DESC);

-- Per-user date scan (Staff modal "My Hours" 7-day grid).
CREATE INDEX IF NOT EXISTS staff_hours_user_date_idx
  ON staff_hours (user_id, work_date DESC);

-- ──────────────────────────────────────────────────────────────────
-- 2. RLS — read-own-shop. Writes ONLY via the SECURITY DEFINER
--    RPCs below (no INSERT/UPDATE/DELETE policies = direct writes
--    fail closed for non-superusers).
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE staff_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_hours_read_own" ON staff_hours;
CREATE POLICY "staff_hours_read_own" ON staff_hours FOR SELECT
  USING (shop_id = current_shop_id() OR current_is_admin());

-- ──────────────────────────────────────────────────────────────────
-- 3. upsert_staff_hours — PIN-gated INSERT-or-UPDATE
-- ──────────────────────────────────────────────────────────────────
-- Self-edit: any caller for their own user_id (PIN required).
-- Cross-user edit: owner / manager only (PIN required).
-- ON CONFLICT (shop_id, user_id, work_date) DO UPDATE handles
-- concurrent writes atomically — last writer wins.
-- audit_log row written in the same transaction.
CREATE OR REPLACE FUNCTION upsert_staff_hours(
  p_pin           text,
  p_user_id       uuid,
  p_work_date     date,
  p_start_time    time,
  p_end_time      time,
  p_break_minutes integer,
  p_note          text
)
RETURNS staff_hours
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_shop  text;
  v_caller_role  text;
  v_caller_pin   text;
  v_target_shop  text;
  v_existing     staff_hours;
  v_row          staff_hours;
  v_event        text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Caller's shop, role, pin.
  SELECT shop_id::text, role, pin
    INTO v_caller_shop, v_caller_role, v_caller_pin
    FROM users WHERE id = auth.uid();

  IF v_caller_shop IS NULL THEN
    RAISE EXCEPTION 'No shop for caller';
  END IF;

  -- PIN check. Caller must have a PIN set + provide it.
  IF v_caller_pin IS NULL THEN
    RAISE EXCEPTION 'Set a per-staff PIN before logging hours';
  END IF;
  IF p_pin IS NULL OR p_pin <> v_caller_pin THEN
    RAISE EXCEPTION 'Incorrect PIN';
  END IF;

  -- Cross-user write check: target user differs from caller.
  IF p_user_id <> auth.uid() THEN
    IF v_caller_role NOT IN ('owner','manager') THEN
      RAISE EXCEPTION
        'Only owner or manager can edit another staff hours';
    END IF;
    SELECT shop_id::text INTO v_target_shop
      FROM users WHERE id = p_user_id;
    IF v_target_shop IS NULL OR v_target_shop <> v_caller_shop THEN
      RAISE EXCEPTION 'Target user not in this shop';
    END IF;
  END IF;

  -- Validate inputs.
  IF p_break_minutes IS NULL OR p_break_minutes < 0
     OR p_break_minutes > 1440 THEN
    RAISE EXCEPTION 'Break minutes must be between 0 and 1440';
  END IF;

  -- Capture existing row for audit before+after diff.
  SELECT * INTO v_existing FROM staff_hours
    WHERE shop_id = v_caller_shop
      AND user_id = p_user_id
      AND work_date = p_work_date;

  v_event := CASE
    WHEN v_existing.id IS NULL THEN 'staff_hours_created'
    ELSE 'staff_hours_updated'
  END;

  -- Atomic upsert. ON CONFLICT keys match the unique index above.
  INSERT INTO staff_hours
    (shop_id, user_id, work_date, start_time, end_time,
     break_minutes, note, updated_at, updated_by)
  VALUES
    (v_caller_shop, p_user_id, p_work_date, p_start_time,
     p_end_time, p_break_minutes, NULLIF(p_note, ''),
     now(), auth.uid())
  ON CONFLICT (shop_id, user_id, work_date) DO UPDATE
    SET start_time    = EXCLUDED.start_time,
        end_time      = EXCLUDED.end_time,
        break_minutes = EXCLUDED.break_minutes,
        note          = EXCLUDED.note,
        updated_at    = EXCLUDED.updated_at,
        updated_by    = EXCLUDED.updated_by
    RETURNING * INTO v_row;

  -- Audit row. payload carries before+after for diff visibility.
  INSERT INTO audit_log
    (shop_id, actor, event_type, target_table, target_id, payload)
  VALUES
    (v_caller_shop, auth.uid(), v_event,
     'staff_hours', v_row.id::text,
     jsonb_build_object(
       'target_user_id', p_user_id::text,
       'work_date',      p_work_date::text,
       'before', CASE WHEN v_existing.id IS NULL THEN NULL
                      ELSE jsonb_build_object(
                        'start_time',    v_existing.start_time,
                        'end_time',      v_existing.end_time,
                        'break_minutes', v_existing.break_minutes,
                        'note',          v_existing.note
                      ) END,
       'after', jsonb_build_object(
         'start_time',    v_row.start_time,
         'end_time',      v_row.end_time,
         'break_minutes', v_row.break_minutes,
         'note',          v_row.note
       )
     ));

  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION upsert_staff_hours(
  text, uuid, date, time, time, integer, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_staff_hours(
  text, uuid, date, time, time, integer, text)
  TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 4. delete_staff_hours — owner-only, PIN-gated
-- ──────────────────────────────────────────────────────────────────
-- DELETE is more dangerous than UPDATE (loses history without an
-- audit trail of what was there) so it's gated tighter: owner role
-- only. The audit_log payload captures the before-state so the
-- record isn't truly gone.
CREATE OR REPLACE FUNCTION delete_staff_hours(
  p_pin text,
  p_id  uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_shop text;
  v_caller_role text;
  v_caller_pin  text;
  v_existing    staff_hours;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT shop_id::text, role, pin
    INTO v_caller_shop, v_caller_role, v_caller_pin
    FROM users WHERE id = auth.uid();

  IF v_caller_shop IS NULL THEN
    RAISE EXCEPTION 'No shop for caller';
  END IF;

  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Owner only';
  END IF;

  IF v_caller_pin IS NULL THEN
    RAISE EXCEPTION 'Set a PIN before deleting hours';
  END IF;
  IF p_pin IS NULL OR p_pin <> v_caller_pin THEN
    RAISE EXCEPTION 'Incorrect PIN';
  END IF;

  SELECT * INTO v_existing FROM staff_hours
    WHERE id = p_id AND shop_id = v_caller_shop;

  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Hours entry not found';
  END IF;

  DELETE FROM staff_hours WHERE id = p_id;

  INSERT INTO audit_log
    (shop_id, actor, event_type, target_table, target_id, payload)
  VALUES
    (v_caller_shop, auth.uid(), 'staff_hours_deleted',
     'staff_hours', p_id::text,
     jsonb_build_object(
       'target_user_id', v_existing.user_id::text,
       'work_date',      v_existing.work_date::text,
       'before', jsonb_build_object(
         'start_time',    v_existing.start_time,
         'end_time',      v_existing.end_time,
         'break_minutes', v_existing.break_minutes,
         'note',          v_existing.note
       )
     ));

  RETURN p_id;
END
$$;

REVOKE ALL ON FUNCTION delete_staff_hours(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_staff_hours(text, uuid)
  TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 5. Verification queries (manual — copy into Studio after run).
-- ──────────────────────────────────────────────────────────────────
-- 1) Table + indexes + 1 SELECT policy + 2 RPCs all in place:
--      SELECT
--        (SELECT count(*) FROM information_schema.tables
--          WHERE table_name='staff_hours')              AS table_exists,
--        (SELECT count(*) FROM pg_indexes
--          WHERE tablename='staff_hours')               AS indexes,
--        (SELECT count(*) FROM pg_policies
--          WHERE tablename='staff_hours')               AS policies,
--        (SELECT count(*) FROM pg_proc
--          WHERE proname IN ('upsert_staff_hours',
--                            'delete_staff_hours'))     AS rpcs;
--    Expect: { table_exists: 1, indexes: 4 (PK + 3 named),
--      policies: 1, rpcs: 2 }.
--
-- 2) Empty start.
--      SELECT count(*) FROM staff_hours;
--    Expect: 0.
--
-- 3) Direct RPC call from Studio fails closed (Studio is unauthed):
--      SELECT * FROM upsert_staff_hours(
--        '1234',
--        '00000000-0000-0000-0000-000000000000'::uuid,
--        '2026-05-09'::date,
--        '09:00'::time,
--        '17:00'::time,
--        30,
--        'test');
--    Expect: ERROR Not authenticated.
--    Real test happens in 3.5-A-2 from the dev app via the
--    upsertStaffHours wrapper (an authed JS SDK call carries
--    auth.uid() so the function gets past the first guard).
--
-- 4) audit_log not contaminated by the failed unauthed call:
--      SELECT count(*) FROM audit_log
--      WHERE event_type IN
--        ('staff_hours_created','staff_hours_updated',
--         'staff_hours_deleted');
--    Expect: 0.
