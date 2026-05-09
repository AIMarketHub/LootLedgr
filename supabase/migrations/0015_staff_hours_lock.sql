-- LootLedger — Phase 3.5-A-2.5: staff_hours lock-for-processing
-- + duplicate-day server guard (2026-05-09).
-- ================================================================
--
-- Two changes on top of 3.5-A-1:
--   1. Add locked / locked_at / locked_by columns to staff_hours.
--      Once a row is locked, upsert_staff_hours and
--      delete_staff_hours refuse modifications.
--   2. Two new RPCs (lock_staff_hours, unlock_staff_hours).
--      Lock requires the CALLER'S PIN; unlock requires the ROW
--      OWNER'S PIN (the staff member whose hours those are).
--      The unlock UI surfaces a red "contact accountant"
--      warning — that warning is the operational safeguard;
--      the PIN gate is just identity verification.
--
-- The duplicate-day "are you sure you want to overwrite"
-- confirmation is enforced in the UI layer (3.5-A-2.5 app code)
-- because the server-side ON CONFLICT clause stays — Postgres
-- needs it for concurrency. The UI shows the existing-vs-new
-- diff and requires explicit "Overwrite existing" before
-- calling the upsert RPC.
--
-- ================================================================
-- INVESTIGATION RESULTS (3.5-A-2.5 prep)
-- ================================================================
-- - audit_log.event_type has no CHECK constraint per 3a; free
--   to add 'staff_hours_locked' and 'staff_hours_unlocked'.
-- - users.pin from 0011 (3d-4-a). Compare via plaintext (matches
--   3d-4-b lock-screen unlock posture).
-- - 3a/3c audit_log_write_own RLS WITH CHECK accepts
--   actor=auth.uid() — both new event_types pass.
-- ================================================================
--
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   1. Run the verification queries at the bottom of this file
--      (3 columns + 2 new RPCs + count of pre-existing rows
--      that defaulted to locked=false).
--   2. Real RPC tests run from the dev app via the new
--      lockStaffHours / unlockStaffHours wrappers.
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. Lock columns on staff_hours
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE staff_hours
  ADD COLUMN IF NOT EXISTS locked    boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS locked_by uuid         REFERENCES auth.users(id) ON DELETE SET NULL;

-- ──────────────────────────────────────────────────────────────────
-- 2. upsert_staff_hours — re-emit with lock check
-- ──────────────────────────────────────────────────────────────────
-- Same logic as 0014 plus an early refusal when the existing row
-- is locked. Keeps the per-row before+after audit_log payload.
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

  SELECT shop_id::text, role, pin
    INTO v_caller_shop, v_caller_role, v_caller_pin
    FROM users WHERE id = auth.uid();

  IF v_caller_shop IS NULL THEN
    RAISE EXCEPTION 'No shop for caller';
  END IF;

  IF v_caller_pin IS NULL THEN
    RAISE EXCEPTION 'Set a per-staff PIN before logging hours';
  END IF;
  IF p_pin IS NULL OR p_pin <> v_caller_pin THEN
    RAISE EXCEPTION 'Incorrect PIN';
  END IF;

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

  IF p_break_minutes IS NULL OR p_break_minutes < 0
     OR p_break_minutes > 1440 THEN
    RAISE EXCEPTION 'Break minutes must be between 0 and 1440';
  END IF;

  SELECT * INTO v_existing FROM staff_hours
    WHERE shop_id = v_caller_shop
      AND user_id = p_user_id
      AND work_date = p_work_date;

  -- 3.5-A-2.5 — lock check.
  IF v_existing.id IS NOT NULL AND v_existing.locked THEN
    RAISE EXCEPTION 'Entry locked. Unlock before editing.';
  END IF;

  v_event := CASE
    WHEN v_existing.id IS NULL THEN 'staff_hours_created'
    ELSE 'staff_hours_updated'
  END;

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

-- ──────────────────────────────────────────────────────────────────
-- 3. delete_staff_hours — re-emit with lock check
-- ──────────────────────────────────────────────────────────────────
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

  -- 3.5-A-2.5 — lock check.
  IF v_existing.locked THEN
    RAISE EXCEPTION 'Entry locked. Unlock before deleting.';
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

-- ──────────────────────────────────────────────────────────────────
-- 4. lock_staff_hours — caller's PIN; sets locked=true
-- ──────────────────────────────────────────────────────────────────
-- The caller doesn't have to be the row owner. Any authed user
-- in the shop can lock a row (typically the EOD operator).
-- Refuses if already locked (idempotent re-locks are noise).
CREATE OR REPLACE FUNCTION lock_staff_hours(
  p_pin text,
  p_id  uuid
)
RETURNS staff_hours
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_shop text;
  v_caller_pin  text;
  v_existing    staff_hours;
  v_row         staff_hours;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT shop_id::text, pin
    INTO v_caller_shop, v_caller_pin
    FROM users WHERE id = auth.uid();

  IF v_caller_shop IS NULL THEN
    RAISE EXCEPTION 'No shop for caller';
  END IF;

  IF v_caller_pin IS NULL THEN
    RAISE EXCEPTION 'Set a PIN before locking hours';
  END IF;
  IF p_pin IS NULL OR p_pin <> v_caller_pin THEN
    RAISE EXCEPTION 'Incorrect PIN';
  END IF;

  SELECT * INTO v_existing FROM staff_hours
    WHERE id = p_id AND shop_id = v_caller_shop;

  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Hours entry not found';
  END IF;

  IF v_existing.locked THEN
    RAISE EXCEPTION 'Entry already locked';
  END IF;

  UPDATE staff_hours
    SET locked    = true,
        locked_at = now(),
        locked_by = auth.uid()
    WHERE id = p_id
    RETURNING * INTO v_row;

  INSERT INTO audit_log
    (shop_id, actor, event_type, target_table, target_id, payload)
  VALUES
    (v_caller_shop, auth.uid(), 'staff_hours_locked',
     'staff_hours', p_id::text,
     jsonb_build_object(
       'target_user_id', v_row.user_id::text,
       'work_date',      v_row.work_date::text
     ));

  RETURN v_row;
END
$$;

-- ──────────────────────────────────────────────────────────────────
-- 5. unlock_staff_hours — ROW OWNER'S PIN; clears lock
-- ──────────────────────────────────────────────────────────────────
-- p_pin must match the pin of the user whose hours are stored
-- in this row, NOT the caller. Caller can be any authed user in
-- the shop. The "contact accountant" warning is shown by the UI;
-- the PIN gate is just identity verification (the row owner has
-- to physically be present and tap their PIN).
CREATE OR REPLACE FUNCTION unlock_staff_hours(
  p_pin text,
  p_id  uuid
)
RETURNS staff_hours
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_shop  text;
  v_existing     staff_hours;
  v_owner_pin    text;
  v_row          staff_hours;
  v_legacy_at    timestamptz;
  v_legacy_by    uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT shop_id::text INTO v_caller_shop
    FROM users WHERE id = auth.uid();

  IF v_caller_shop IS NULL THEN
    RAISE EXCEPTION 'No shop for caller';
  END IF;

  SELECT * INTO v_existing FROM staff_hours
    WHERE id = p_id AND shop_id = v_caller_shop;

  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Hours entry not found';
  END IF;

  IF NOT v_existing.locked THEN
    RAISE EXCEPTION 'Entry is not locked';
  END IF;

  -- Row owner's PIN — pulled from the user the row belongs to.
  SELECT pin INTO v_owner_pin
    FROM users WHERE id = v_existing.user_id;

  IF v_owner_pin IS NULL THEN
    RAISE EXCEPTION
      'Row owner has no PIN set; ask them to set one in Settings';
  END IF;
  IF p_pin IS NULL OR p_pin <> v_owner_pin THEN
    RAISE EXCEPTION 'Incorrect PIN (row owner''s PIN required)';
  END IF;

  v_legacy_at := v_existing.locked_at;
  v_legacy_by := v_existing.locked_by;

  UPDATE staff_hours
    SET locked    = false,
        locked_at = NULL,
        locked_by = NULL
    WHERE id = p_id
    RETURNING * INTO v_row;

  INSERT INTO audit_log
    (shop_id, actor, event_type, target_table, target_id, payload)
  VALUES
    (v_caller_shop, auth.uid(), 'staff_hours_unlocked',
     'staff_hours', p_id::text,
     jsonb_build_object(
       'target_user_id',     v_row.user_id::text,
       'work_date',          v_row.work_date::text,
       'legacy_locked_at',   v_legacy_at,
       'legacy_locked_by',   v_legacy_by,
       'caller_id',          auth.uid()::text
     ));

  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION lock_staff_hours(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lock_staff_hours(text, uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION unlock_staff_hours(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION unlock_staff_hours(text, uuid)
  TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 6. Verification queries (manual — copy into Studio after run).
-- ──────────────────────────────────────────────────────────────────
-- 1) New columns exist:
--      SELECT column_name, data_type, is_nullable
--      FROM information_schema.columns
--      WHERE table_name='staff_hours'
--        AND column_name IN ('locked','locked_at','locked_by')
--      ORDER BY column_name;
--    Expect 3 rows: locked boolean NO, locked_at timestamptz YES,
--    locked_by uuid YES.
--
-- 2) New RPCs registered:
--      SELECT proname FROM pg_proc
--      WHERE proname IN
--        ('lock_staff_hours','unlock_staff_hours','upsert_staff_hours','delete_staff_hours')
--      ORDER BY proname;
--    Expect 4 rows.
--
-- 3) Pre-existing rows defaulted to locked=false:
--      SELECT count(*) FILTER (WHERE locked=false) AS unlocked,
--             count(*) FILTER (WHERE locked=true)  AS locked
--      FROM staff_hours;
--    Expect: all rows in unlocked count, 0 locked (the column
--    default applied to the existing rows).
--
-- 4) Direct unauthed RPC call from Studio fails closed:
--      SELECT * FROM lock_staff_hours('1234',
--        '00000000-0000-0000-0000-000000000000'::uuid);
--    Expect: ERROR Not authenticated. Real test from the dev app
--    via the lockStaffHours / unlockStaffHours wrappers.
