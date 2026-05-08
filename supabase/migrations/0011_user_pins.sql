-- LootLedger — Phase 3 commit 3d-4-a: per-user PINs + job titles
-- + RPCs (2026-05-08).
-- ================================================================
--
-- Adds the SQL foundation for per-staff PIN unlock and the legacy
-- staffList[].role -> users.job_title migration. App-side UI
-- (Staff modal rewrite + ClaimInvite + per-staff PIN unlock at
-- the lock screen) ships in 3d-4-b after this migration is
-- applied + verified.
--
-- Columns:
--   users.pin          text NULL — per-staff PIN, 4-12 digits,
--                                  plaintext (matches the
--                                  settings.staffPin storage
--                                  posture). Future hashed
--                                  migration is local to this
--                                  table.
--   users.job_title    text NULL — decorative job title (e.g.
--                                  "Buyer", "Goldsmith"). Prints
--                                  on receipts. Replaces the
--                                  legacy localStorage
--                                  staffList[].role freetext.
--                                  Distinct from users.role
--                                  (Supabase enum, RLS-enforced).
--
-- RPCs (all SECURITY DEFINER so the existing users_update RLS
-- policy "own row only" stays restrictive while the RPCs handle
-- the legitimate cross-row + format-validated paths):
--   set_my_pin(p_pin)               — any authed user rotates
--                                     their own PIN. Audit row.
--   set_staff_pin(p_user_id, p_pin) — owner only, rotates a
--                                     staff member's PIN.
--                                     Recovery path for "staff
--                                     forgot their PIN". Audit
--                                     row.
--   set_my_job_title(p_title)       — any authed user updates
--                                     their own job title. No
--                                     audit row (cosmetic).
--
-- ================================================================
-- INVESTIGATION RESULTS (3d-4-a prep, 2026-05-08)
-- ================================================================
-- - users.id is uuid (0003:73 — REFERENCES auth.users(id)).
--   set_staff_pin's p_user_id uuid parameter matches.
-- - users_update RLS policy is "own row only" (0003:262-264).
--   SECURITY DEFINER on the RPCs lets owner write a staff row
--   without widening the table policy.
-- - No pre-existing pin or job_title columns on users (0003 base
--   columns + 0005 legal-acceptance trio = 11 columns). The
--   ADD COLUMN IF NOT EXISTS guards are belt-and-braces.
-- ================================================================
--
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   1. Run the 7-query verification suite at the bottom of this
--      file. Headline: columns exist + nullable; CHECK constraint
--      enforces 4-12 digit format; three RPCs registered; bad
--      input rejected; unauthed RPC calls fail closed.
--   2. No data backfill. App-side migration in 3d-4-b can copy
--      legacy staffList[] entries into users.pin / job_title
--      where the dealer wants to preserve them.
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. Columns: pin + job_title
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pin       text,
  ADD COLUMN IF NOT EXISTS job_title text;

-- ──────────────────────────────────────────────────────────────────
-- 2. PIN format CHECK constraint
-- ──────────────────────────────────────────────────────────────────
-- Matches the app-side normalizePin shape: 4-12 ASCII digits,
-- no whitespace, no other characters. NULL allowed (PIN unset).
-- DROP-then-ADD for idempotency.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pin_format_check;
ALTER TABLE users
  ADD CONSTRAINT users_pin_format_check
  CHECK (pin IS NULL OR pin ~ '^[0-9]{4,12}$');

-- ──────────────────────────────────────────────────────────────────
-- 3. set_my_pin — caller rotates their own PIN
-- ──────────────────────────────────────────────────────────────────
-- Validates format, writes audit_log row with actor=auth.uid().
-- p_pin = NULL clears the PIN (returns the user to "no PIN set"
-- state; the lock-screen falls back to the shop-level Admin PIN).
CREATE OR REPLACE FUNCTION set_my_pin(p_pin text)
RETURNS users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user    users;
  v_shop_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Format validation (NULL means clear; '' rejected as invalid).
  IF p_pin IS NOT NULL AND p_pin !~ '^[0-9]{4,12}$' THEN
    RAISE EXCEPTION 'PIN must be 4-12 digits';
  END IF;

  UPDATE users SET pin = p_pin
    WHERE id = auth.uid()
    RETURNING * INTO v_user;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  v_shop_id := v_user.shop_id::text;

  INSERT INTO audit_log
    (shop_id, actor, event_type, target_table, target_id, payload)
  VALUES
    (v_shop_id, auth.uid(),
     'staff_pin_changed', 'users', auth.uid()::text,
     jsonb_build_object('cleared', p_pin IS NULL));

  RETURN v_user;
END
$$;

REVOKE ALL ON FUNCTION set_my_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_my_pin(text) TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 4. set_staff_pin — owner rotates a staff member's PIN
-- ──────────────────────────────────────────────────────────────────
-- Owner only (manager has invite power but not credential-modify
-- power — matches the 3d-1 invite role-restriction pattern).
-- Recovery path for "staff forgot their PIN": owner sets a temp
-- PIN, staff signs in and rotates via set_my_pin.
CREATE OR REPLACE FUNCTION set_staff_pin(p_user_id uuid, p_pin text)
RETURNS users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_shop text;
  v_caller_role text;
  v_target_shop text;
  v_user        users;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Caller's shop + role.
  SELECT shop_id::text, role
    INTO v_caller_shop, v_caller_role
    FROM users WHERE id = auth.uid();

  IF v_caller_shop IS NULL THEN
    RAISE EXCEPTION 'No shop for caller';
  END IF;

  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Owner only';
  END IF;

  -- Target user must belong to the same shop.
  SELECT shop_id::text INTO v_target_shop
    FROM users WHERE id = p_user_id;

  IF v_target_shop IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  IF v_target_shop <> v_caller_shop THEN
    RAISE EXCEPTION 'Target user belongs to a different shop';
  END IF;

  -- Format validation.
  IF p_pin IS NOT NULL AND p_pin !~ '^[0-9]{4,12}$' THEN
    RAISE EXCEPTION 'PIN must be 4-12 digits';
  END IF;

  UPDATE users SET pin = p_pin
    WHERE id = p_user_id
    RETURNING * INTO v_user;

  INSERT INTO audit_log
    (shop_id, actor, event_type, target_table, target_id, payload)
  VALUES
    (v_caller_shop, auth.uid(),
     'staff_pin_reset_by_owner', 'users', p_user_id::text,
     jsonb_build_object('cleared', p_pin IS NULL));

  RETURN v_user;
END
$$;

REVOKE ALL ON FUNCTION set_staff_pin(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_staff_pin(uuid, text) TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 5. set_my_job_title — caller updates their own job title
-- ──────────────────────────────────────────────────────────────────
-- Decorative; prints on receipts. NULLIF treats empty string as
-- clear (so the UI can pass "" to remove a previously-set title).
-- No audit row — job title is cosmetic; audit overhead would be
-- noise.
CREATE OR REPLACE FUNCTION set_my_job_title(p_title text)
RETURNS users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user users;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE users SET job_title = NULLIF(p_title, '')
    WHERE id = auth.uid()
    RETURNING * INTO v_user;

  RETURN v_user;
END
$$;

REVOKE ALL ON FUNCTION set_my_job_title(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_my_job_title(text) TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 6. Verification queries (manual — copy into Studio after run).
-- ──────────────────────────────────────────────────────────────────
-- 1) Columns exist with correct types:
--      SELECT column_name, data_type, is_nullable
--      FROM information_schema.columns
--      WHERE table_name='users'
--        AND column_name IN ('pin','job_title')
--      ORDER BY column_name;
--    Expect 2 rows: job_title text YES, pin text YES.
--
-- 2) CHECK constraint exists with the correct definition:
--      SELECT pg_get_constraintdef(oid) FROM pg_constraint
--      WHERE conname='users_pin_format_check';
--    Expect: CHECK ((pin IS NULL) OR (pin ~ '^[0-9]{4,12}$'::text))
--    (canonical form may vary).
--
-- 3) Three RPCs registered:
--      SELECT proname FROM pg_proc
--      WHERE proname IN ('set_my_pin','set_staff_pin','set_my_job_title')
--      ORDER BY proname;
--    Expect 3 rows.
--
-- 4) Format check rejects bad input (direct UPDATE bypasses RPC):
--      UPDATE users SET pin='abc' WHERE id=auth.uid();
--      -- expect: ERROR violates check constraint users_pin_format_check
--      UPDATE users SET pin='123' WHERE id=auth.uid();
--      -- expect: same error (3 digits < 4 minimum)
--
-- 5) Format check accepts valid input:
--      UPDATE users SET pin='1234' WHERE id=auth.uid();
--      -- expect: succeeds (or 0 rows in Studio if auth.uid() is NULL).
--      UPDATE users SET pin=NULL WHERE id=auth.uid();
--      -- cleanup; NULL allowed.
--
-- 6) RPCs fail closed for unauthed callers (Studio session):
--      SELECT * FROM set_my_pin('1234');
--      -- expect: ERROR Not authenticated
--      SELECT * FROM set_staff_pin(
--        '00000000-0000-0000-0000-000000000000', '1234');
--      -- expect: ERROR Not authenticated
--    (Real authentication test happens in 3d-4-b via the dev app.)
--
-- 7) No audit_log spillover from the failed unauthed RPC calls:
--      SELECT count(*) FROM audit_log
--      WHERE event_type IN
--        ('staff_pin_changed','staff_pin_reset_by_owner');
--    Expect 0 (the RPC raises before the INSERT).
