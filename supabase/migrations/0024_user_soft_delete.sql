-- LootLedger — users.is_active soft-delete + admin staff CRUD RPCs.
-- Phase 5.2 staff-workspace fix-forward 1.5 (2026-05-16).
-- ================================================================
--
-- Adds:
--   1. users.is_active flag (soft-delete column).
--   2. admin_set_staff_active RPC — owner/manager toggles
--      is_active for another user in the same shop. Manager
--      can't deactivate owners; owner can deactivate anyone
--      except their own row.
--   3. admin_update_staff_fields RPC — owner/manager updates
--      first_name / family_name / email of another user in
--      the same shop. role updates only when caller is owner.
--      Manager can't promote anyone past their own role.
--
-- Soft-delete semantics:
--   - Inactive users are hidden from tile views (StaffTiles,
--     /staff/today bulk editor) via client-side filter
--     (.eq("is_active", true)).
--   - Inactive users are signed out by AuthProvider on the
--     next refresh + bounced to login (client-side check).
--     Auth-side hook enforcement is a future hardening.
--   - Soft delete preserves staff_hours / audit_log /
--     transactions etc. — compliance and payroll history
--     intact, reactivating is a one-line UPDATE.
--
-- ================================================================
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--
--   1. Verify the column exists with the right shape:
--        SELECT column_name, data_type, is_nullable, column_default
--        FROM information_schema.columns
--        WHERE table_name = 'users'
--          AND column_name = 'is_active';
--      Expect: is_active boolean NO 'true'.
--
--   2. Verify all existing rows defaulted to true:
--        SELECT
--          count(*) FILTER (WHERE is_active = true)  AS active,
--          count(*) FILTER (WHERE is_active = false) AS inactive,
--          count(*)                                   AS total
--        FROM users;
--      Expect active = total, inactive = 0.
--
--   3. Verify the index exists:
--        SELECT indexname FROM pg_indexes
--        WHERE tablename = 'users' AND indexname = 'users_active_idx';
--      Expect 1 row.
--
--   4. Verify the two new RPCs are registered:
--        SELECT proname FROM pg_proc
--        WHERE proname IN ('admin_set_staff_active',
--                          'admin_update_staff_fields')
--        ORDER BY proname;
--      Expect 2 rows.
--
--   5. Direct unauthed RPC calls fail closed:
--        SELECT * FROM admin_set_staff_active(
--          '00000000-0000-0000-0000-000000000000'::uuid, false);
--        SELECT * FROM admin_update_staff_fields(
--          '00000000-0000-0000-0000-000000000000'::uuid,
--          'a','b','c@d.com',NULL);
--      Expect: ERROR Not authenticated.
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. is_active column + index
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS users_active_idx
  ON users (shop_id, is_active);

-- ──────────────────────────────────────────────────────────────────
-- 2. admin_set_staff_active — toggle is_active on a target user
-- ──────────────────────────────────────────────────────────────────
-- Caller must be owner or manager and in the same shop as target.
-- Manager cannot deactivate an owner. Caller cannot deactivate
-- their own row (use the dashboard sign-out instead).
-- Audit row written in the same transaction.
CREATE OR REPLACE FUNCTION admin_set_staff_active(
  p_user_id uuid,
  p_active  boolean
)
RETURNS users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_shop text;
  v_caller_role text;
  v_target_shop text;
  v_target_role text;
  v_was_active  boolean;
  v_row         users;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own active status';
  END IF;

  SELECT shop_id::text, role
    INTO v_caller_shop, v_caller_role
    FROM users WHERE id = auth.uid();
  IF v_caller_shop IS NULL THEN
    RAISE EXCEPTION 'No shop for caller';
  END IF;
  IF v_caller_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Owner or manager only';
  END IF;

  SELECT shop_id::text, role, is_active
    INTO v_target_shop, v_target_role, v_was_active
    FROM users WHERE id = p_user_id;
  IF v_target_shop IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;
  IF v_target_shop <> v_caller_shop THEN
    RAISE EXCEPTION 'Target user belongs to a different shop';
  END IF;

  -- Manager can't toggle an owner.
  IF v_caller_role = 'manager' AND v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Manager cannot change an owner';
  END IF;

  UPDATE users SET is_active = p_active
    WHERE id = p_user_id
    RETURNING * INTO v_row;

  INSERT INTO audit_log
    (shop_id, actor, event_type, target_table, target_id, payload)
  VALUES
    (v_caller_shop, auth.uid(),
     CASE WHEN p_active THEN 'staff_reactivated' ELSE 'staff_deactivated' END,
     'users', p_user_id::text,
     jsonb_build_object(
       'before_active', v_was_active,
       'after_active',  p_active,
       'target_role',   v_target_role
     ));

  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION admin_set_staff_active(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_set_staff_active(uuid, boolean) TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 3. admin_update_staff_fields — name / email / (role) update
-- ──────────────────────────────────────────────────────────────────
-- Owner / manager can update first_name, family_name, email of any
-- staff in their shop. role is updatable only by an owner; passing
-- a non-NULL p_role from a manager is a hard error. Caller cannot
-- update their own row via this RPC (use the Profile → Settings
-- tab for personal changes).
--
-- Audit row written with the before/after snapshots.
CREATE OR REPLACE FUNCTION admin_update_staff_fields(
  p_user_id     uuid,
  p_first_name  text,
  p_family_name text,
  p_email       text,
  p_role        text
)
RETURNS users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_shop text;
  v_caller_role text;
  v_target_shop text;
  v_existing    users;
  v_row         users;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Use Profile → Settings to change your own fields';
  END IF;

  SELECT shop_id::text, role
    INTO v_caller_shop, v_caller_role
    FROM users WHERE id = auth.uid();
  IF v_caller_shop IS NULL THEN
    RAISE EXCEPTION 'No shop for caller';
  END IF;
  IF v_caller_role NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Owner or manager only';
  END IF;

  -- Manager attempting role change → reject.
  IF p_role IS NOT NULL AND v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Owner only can change role';
  END IF;

  -- Validate role value if provided.
  IF p_role IS NOT NULL AND p_role NOT IN ('owner', 'manager', 'staff') THEN
    RAISE EXCEPTION 'Invalid role value: %', p_role;
  END IF;

  -- Validate email shape if provided + non-empty.
  IF p_email IS NOT NULL AND p_email <> '' AND p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Invalid email format';
  END IF;

  -- Capture target.
  SELECT * INTO v_existing FROM users WHERE id = p_user_id;
  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;
  IF v_existing.shop_id::text <> v_caller_shop THEN
    RAISE EXCEPTION 'Target user belongs to a different shop';
  END IF;

  -- Update — coalesce so callers can pass NULL to leave unchanged
  -- (frontend always passes the current value, so this is mostly
  -- a defensive habit).
  UPDATE users
    SET first_name  = COALESCE(p_first_name,  first_name),
        family_name = COALESCE(p_family_name, family_name),
        email       = COALESCE(NULLIF(p_email, ''), email),
        role        = COALESCE(p_role,        role)
    WHERE id = p_user_id
    RETURNING * INTO v_row;

  INSERT INTO audit_log
    (shop_id, actor, event_type, target_table, target_id, payload)
  VALUES
    (v_caller_shop, auth.uid(),
     'staff_fields_updated',
     'users', p_user_id::text,
     jsonb_build_object(
       'before', jsonb_build_object(
         'first_name',  v_existing.first_name,
         'family_name', v_existing.family_name,
         'email',       v_existing.email,
         'role',        v_existing.role
       ),
       'after', jsonb_build_object(
         'first_name',  v_row.first_name,
         'family_name', v_row.family_name,
         'email',       v_row.email,
         'role',        v_row.role
       )
     ));

  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION admin_update_staff_fields(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_update_staff_fields(uuid, text, text, text, text) TO authenticated;
