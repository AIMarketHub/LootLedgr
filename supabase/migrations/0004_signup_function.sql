-- LootLedger — Stage 1.A SaaS foundation: signup_shop function.
-- (2026-05-03)
--
-- Why this migration exists:
--   The first dealer signup attempt failed with
--     new row violates row-level security policy for table "shops"
--   The signup flow in src/lib/auth/saas.js was inserting into
--   shops + users client-side after auth.signUp() resolved.
--   shops.RLS policy "shops_insert" requires auth.uid() IS NOT
--   NULL — true once signed in — but the freshly-created session
--   token wasn't yet attached to the PostgREST request when the
--   client ran the INSERT. Race between the auth-state propagation
--   and the immediate-follow-up REST call.
--
-- Fix: a SECURITY DEFINER function that does the shop + users
-- inserts atomically inside Postgres. The function runs with the
-- privileges of its owner (postgres / table owner), so it bypasses
-- the shops_insert RLS check. We re-impose correctness inside the
-- function: the auth.uid() check confirms the caller is signed in,
-- and the EXISTS-check prevents a user from creating a second shop
-- if they retry after a partial failure.
--
-- Idempotent — CREATE OR REPLACE FUNCTION + GRANT EXECUTE both
-- safe to re-run.
--
-- ================================================================

CREATE OR REPLACE FUNCTION signup_shop(
  p_business_name text,
  p_abn text,
  p_first_name text,
  p_family_name text,
  p_email text,
  p_phone text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_shop_id   uuid;
  v_slug      text;
  v_attempt   int  := 0;
  v_base_slug text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_business_name IS NULL OR length(trim(p_business_name)) = 0 THEN
    RAISE EXCEPTION 'Business name is required';
  END IF;

  -- Verify user doesn't already have a shop. Stops a retry path
  -- from spawning a second shop if the user managed to insert
  -- a users row on a previous (failed) attempt.
  IF EXISTS (SELECT 1 FROM users WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'User already has a shop';
  END IF;

  -- Generate a kebab-case ASCII slug from the business name and
  -- dedupe by appending -2, -3 ... until a free one is found.
  v_base_slug := lower(regexp_replace(p_business_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF length(v_base_slug) < 2 THEN
    v_base_slug := 'shop';
  END IF;
  IF length(v_base_slug) > 40 THEN
    v_base_slug := substring(v_base_slug from 1 for 40);
  END IF;

  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM shops WHERE slug = v_slug) LOOP
    v_attempt := v_attempt + 1;
    v_slug := v_base_slug || '-' || v_attempt;
    IF v_attempt > 100 THEN
      RAISE EXCEPTION 'Could not generate unique slug after 100 attempts';
    END IF;
  END LOOP;

  -- Create the shop. trial_starts_at / trial_ends_at /
  -- subscription_active default per the 0003 migration.
  INSERT INTO shops (business_name, abn, slug, phone, created_by)
  VALUES (
    trim(p_business_name),
    NULLIF(trim(p_abn), ''),
    v_slug,
    NULLIF(trim(p_phone), ''),
    v_user_id
  )
  RETURNING id INTO v_shop_id;

  -- Create the users row linking auth.users.id → shops.id.
  INSERT INTO users (id, shop_id, role, first_name, family_name, email, phone)
  VALUES (
    v_user_id,
    v_shop_id,
    'owner',
    NULLIF(trim(p_first_name), ''),
    NULLIF(trim(p_family_name), ''),
    NULLIF(trim(p_email), ''),
    NULLIF(trim(p_phone), '')
  );

  RETURN json_build_object(
    'shop_id', v_shop_id,
    'slug',    v_slug,
    'role',    'owner'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION signup_shop(text,text,text,text,text,text) TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   1. None. The function is callable from the client immediately.
--   2. Verify with:
--        SELECT proname, pronargs FROM pg_proc
--        WHERE proname = 'signup_shop';
--      Expect one row, pronargs = 6.
-- ──────────────────────────────────────────────────────────────────
