-- LootLedger — Hotfix for create_staff_invite token generation
-- (2026-05-08).
-- ================================================================
--
-- At HEAD c5188c7, create_staff_invite (delivered in 0010) fails
-- at runtime with:
--   "function gen_random_bytes(integer) does not exist"
--
-- Root cause: Supabase puts pgcrypto in the `extensions` schema,
-- but the RPC's search_path is `public, pg_temp`. Even with
-- pgcrypto installed (verified — extversion 1.3 is present), the
-- RPC can't resolve gen_random_bytes without an explicit
-- `extensions.gen_random_bytes(...)` qualification.
--
-- Fix: switch to gen_random_uuid, a Postgres 13+ built-in (no
-- extension dependency). Same 32-char hex shape:
--   replace(gen_random_uuid()::text, '-', '')
-- 128 bits of entropy in either case; the token contract is
-- preserved.
--
-- This is a CREATE OR REPLACE on the RPC body only. No data
-- changes, no schema changes, no policy changes. The original
-- 0010 RPC body is preserved verbatim except for the v_token
-- assignment line.
--
-- ================================================================
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   1. Run the verification query at the bottom of this file —
--      should return a staff_invites row with a 32-char hex
--      token.
--   2. Cleanup the test invite:
--        DELETE FROM staff_invites
--        WHERE email='hotfix_test@example.com';
-- ================================================================

CREATE OR REPLACE FUNCTION create_staff_invite(
  p_email text,
  p_role  text
)
RETURNS staff_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id text;
  v_role    text;
  v_token   text;
  v_invite  staff_invites;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_role NOT IN ('owner','manager','staff') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  IF p_email IS NULL OR p_email = '' OR position('@' in p_email) = 0 THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;

  SELECT shop_id::text, role
    INTO v_shop_id, v_role
    FROM users WHERE id = auth.uid();

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'No shop for caller';
  END IF;

  IF v_role NOT IN ('owner','manager') THEN
    RAISE EXCEPTION 'Insufficient role: %', v_role;
  END IF;

  IF v_role = 'manager' AND p_role = 'owner' THEN
    RAISE EXCEPTION 'Manager cannot invite owner';
  END IF;

  -- Hotfix: gen_random_uuid is a Postgres 13+ built-in resolved
  -- in pg_catalog without needing the extensions schema in
  -- search_path. Strip dashes for the same 32-char hex shape the
  -- original gen_random_bytes(16) produced.
  v_token := replace(gen_random_uuid()::text, '-', '');

  INSERT INTO staff_invites
    (shop_id, email, role, token, created_by)
  VALUES
    (v_shop_id, lower(p_email), p_role, v_token, auth.uid())
  RETURNING * INTO v_invite;

  INSERT INTO audit_log
    (shop_id, actor, event_type, target_table, target_id, payload)
  VALUES
    (v_shop_id, auth.uid(), 'staff_invited',
     'staff_invites', v_invite.id::text,
     jsonb_build_object(
       'email', lower(p_email),
       'role', p_role
     ));

  RETURN v_invite;
END
$$;

REVOKE ALL ON FUNCTION create_staff_invite(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_staff_invite(text, text)
  TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- Verification (manual — run as the signed-in shop owner):
-- ──────────────────────────────────────────────────────────────────
--   SELECT * FROM create_staff_invite(
--     'hotfix_test@example.com', 'staff');
--   -- expect: a staff_invites row with a 32-char hex token.
--
--   DELETE FROM staff_invites
--   WHERE email='hotfix_test@example.com';
--   -- cleanup.
