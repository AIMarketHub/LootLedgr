-- LootLedger — Phase 5.2-PRE-2 v2: cross-shop SELECT policies
-- for platform admins (2026-05-11)
-- ================================================================
--
-- 0020 introduced the platform_admins table + the
-- current_is_platform_admin() helper, plus an additive
-- shops_platform_admin_read policy on the shops table. This
-- migration extends the same additive pattern to the other
-- tables the new platform admin pages need to read across
-- shops:
--
--   - audit_log     (cross-shop audit log viewer)
--   - hardware_log  (cross-shop diagnostics view)
--   - users         (cross-shop user management)
--
-- All three already permit `current_is_admin()` (the legacy
-- email-based admins allowlist from 0003) to read across
-- shops. We're NOT removing those policies — both gates
-- coexist (Postgres OR's permissive policies). The platform
-- owner is in BOTH tables today, so they already had access;
-- this migration future-proofs for additional platform admins
-- granted via the new platform_admins table without an entry
-- in the legacy admins table.
--
-- ================================================================
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   1. Verify the three new policies:
--        SELECT tablename, policyname, cmd FROM pg_policies
--        WHERE policyname LIKE '%_platform_admin_read'
--        ORDER BY tablename;
--      Expect 4 rows (shops from 0020 + audit_log + hardware_log
--      + users from this migration).
--   2. Sanity check as platform admin (signed in as Guillaume
--      Weber):
--        SELECT count(*) FROM audit_log;
--          → cross-shop count.
--        SELECT count(*) FROM hardware_log;
--          → cross-shop count.
--        SELECT count(*) FROM users;
--          → all users on the platform.
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. audit_log — additive platform_admin SELECT
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_log_platform_admin_read" ON audit_log;
CREATE POLICY "audit_log_platform_admin_read" ON audit_log
  FOR SELECT
  TO authenticated
  USING (current_is_platform_admin());

-- ──────────────────────────────────────────────────────────────────
-- 2. hardware_log — additive platform_admin SELECT
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "hardware_log_platform_admin_read" ON hardware_log;
CREATE POLICY "hardware_log_platform_admin_read" ON hardware_log
  FOR SELECT
  TO authenticated
  USING (current_is_platform_admin());

-- ──────────────────────────────────────────────────────────────────
-- 3. users — additive platform_admin SELECT
-- ──────────────────────────────────────────────────────────────────
-- Note: this is the public.users table (one row per app user
-- linking auth.users → shops + role + name). RLS on auth.users
-- is managed by Supabase service role and is not editable here.
-- Last-sign-in info from auth.users requires a service-role
-- query; the cross-shop Users.jsx page uses Supabase Studio
-- deep-links for that.
DROP POLICY IF EXISTS "users_platform_admin_read" ON users;
CREATE POLICY "users_platform_admin_read" ON users
  FOR SELECT
  TO authenticated
  USING (current_is_platform_admin());

-- ──────────────────────────────────────────────────────────────────
-- 4. Diagnostic — uncomment to verify after running.
-- ──────────────────────────────────────────────────────────────────
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE policyname LIKE '%_platform_admin_read'
-- ORDER BY tablename, policyname;
--
-- Expect 4 rows:
--   audit_log     audit_log_platform_admin_read     SELECT
--   hardware_log  hardware_log_platform_admin_read  SELECT
--   shops         shops_platform_admin_read         SELECT  (from 0020)
--   users         users_platform_admin_read         SELECT
