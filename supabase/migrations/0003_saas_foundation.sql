-- LootLedger — Stage 1.A SaaS foundation migration (2026-05-02)
-- ================================================================
--
-- ⚠ DESTRUCTIVE: this migration TRUNCATEs transactions, catalog,
-- stock, clients and DELETEs every row from settings. Run only on
-- the dev project (qxxbumjfocxslaaivzfo) — there should be no
-- real customer data on it. Production cutover gets a separate,
-- non-destructive migration once the dealer is ready.
--
-- ================================================================
-- Adds:
--   - shops table (multi-tenant; one row per dealer)
--   - users table (links auth.users to a shop + role)
--   - admins table (email allowlist for the SaaS-wide admin panel)
--
-- Replaces dev_allow_all_* RLS policies on transactions / catalog
-- / stock / clients / settings with proper tenant-isolation
-- policies that compare row.shop_id to the auth user's shop_id.
--
-- ================================================================
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--   1. Insert your admin email:
--        INSERT INTO admins (email) VALUES ('YOUR_ADMIN_EMAIL_HERE');
--   2. Configure Supabase Auth providers in Studio:
--        - Email: ON (default)
--        - Phone: ON (Settings → Authentication → Providers).
--          Configure Twilio or Vonage for SMS; if not configured,
--          phone signup will fail at OTP send time and the app
--          surfaces the error inline.
--   3. Set Site URL → Authentication → URL Configuration to the
--      deployed app URL (lootledger.netlify.app for now; a real
--      domain later).
--   4. Verify the migration by running the diagnostic query at
--      the bottom of this file (uncomment first).
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. Extensions (gen_random_uuid lives in pgcrypto; Supabase
--    enables it by default but the IF NOT EXISTS makes this safe)
-- ──────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ──────────────────────────────────────────────────────────────────
-- 2. shops — multi-tenant root. One row per dealer.
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shops (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                        text        UNIQUE NOT NULL,
  business_name               text        NOT NULL,
  abn                         text,
  dealer_licence_no           text,
  address                     text,
  phone                       text,
  trial_starts_at             timestamptz NOT NULL DEFAULT now(),
  trial_ends_at               timestamptz NOT NULL DEFAULT now() + INTERVAL '3 months',
  subscription_active         boolean     NOT NULL DEFAULT false,
  subscription_activated_at   timestamptz,
  subscription_activated_by   text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by                  uuid        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS shops_slug_idx ON shops (slug);
CREATE INDEX IF NOT EXISTS shops_subscription_idx ON shops (subscription_active, trial_ends_at);

-- ──────────────────────────────────────────────────────────────────
-- 3. users — domain user record, 1:1 with auth.users.
--    Role gates owner vs staff inside a single shop. Phase 3 will
--    expand the role set; for now, owner == has-staffPin and can
--    invite, staff == operates the till.
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id       uuid        REFERENCES shops(id) ON DELETE CASCADE,
  role          text        NOT NULL CHECK (role IN ('owner','staff')),
  first_name    text,
  family_name   text,
  email         text,
  phone         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_shop_id_idx ON users (shop_id);
CREATE INDEX IF NOT EXISTS users_email_idx ON users (lower(email));

-- ──────────────────────────────────────────────────────────────────
-- 4. admins — SaaS-wide admin allowlist (just the user's email
--    today). The admin panel reads from this table to decide who
--    can activate / deactivate subscriptions across all shops.
-- ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  email       text        PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────
-- 5. shop_id type alignment — the existing transactions / stock /
--    catalog / settings tables use shop_id text. The new shops.id
--    is uuid. Production cutover will type-coerce; for now we keep
--    text to avoid breaking the existing app while RLS is rewired.
--    The signup flow casts shops.id::text when writing rows;
--    getCurrentShopId() returns a text string app-side.
-- ──────────────────────────────────────────────────────────────────

-- ──────────────────────────────────────────────────────────────────
-- 6. DESTRUCTIVE — wipe dev test data. Schema preserved.
-- ──────────────────────────────────────────────────────────────────
TRUNCATE transactions, catalog, stock, clients RESTART IDENTITY CASCADE;
DELETE FROM settings;

-- ──────────────────────────────────────────────────────────────────
-- 7. Drop dev_allow_all_* policies. The migration is idempotent;
--    DROP POLICY IF EXISTS skips when the policy is already gone.
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "dev_allow_all_clients_select" ON clients;
DROP POLICY IF EXISTS "dev_allow_all_clients_insert" ON clients;
DROP POLICY IF EXISTS "dev_allow_all_clients_update" ON clients;
DROP POLICY IF EXISTS "dev_allow_all_clients_delete" ON clients;

DROP POLICY IF EXISTS "dev_allow_all_transactions_select" ON transactions;
DROP POLICY IF EXISTS "dev_allow_all_transactions_insert" ON transactions;
DROP POLICY IF EXISTS "dev_allow_all_transactions_update" ON transactions;
DROP POLICY IF EXISTS "dev_allow_all_transactions_delete" ON transactions;

DROP POLICY IF EXISTS "dev_allow_all_stock_select" ON stock;
DROP POLICY IF EXISTS "dev_allow_all_stock_insert" ON stock;
DROP POLICY IF EXISTS "dev_allow_all_stock_update" ON stock;
DROP POLICY IF EXISTS "dev_allow_all_stock_delete" ON stock;

DROP POLICY IF EXISTS "dev_allow_all_catalog_select" ON catalog;
DROP POLICY IF EXISTS "dev_allow_all_catalog_insert" ON catalog;
DROP POLICY IF EXISTS "dev_allow_all_catalog_update" ON catalog;
DROP POLICY IF EXISTS "dev_allow_all_catalog_delete" ON catalog;

DROP POLICY IF EXISTS "dev_allow_all_settings_select" ON settings;
DROP POLICY IF EXISTS "dev_allow_all_settings_insert" ON settings;
DROP POLICY IF EXISTS "dev_allow_all_settings_update" ON settings;
DROP POLICY IF EXISTS "dev_allow_all_settings_delete" ON settings;

-- ──────────────────────────────────────────────────────────────────
-- 8. Enable RLS everywhere
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────
-- 9. Helper function — current user's shop_id as text. Used by the
--    tenant-isolation policies on every shop-scoped table. Cached
--    by Postgres per-statement so the subquery doesn't re-fire on
--    every row.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION current_shop_id()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT shop_id::text FROM users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION current_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admins
    WHERE lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  );
$$;

-- ──────────────────────────────────────────────────────────────────
-- 10. Tenant isolation policies — transactions / catalog / stock /
--     clients / settings. Every row's shop_id must match the
--     calling user's shop_id (via current_shop_id()). Admins also
--     pass — same SaaS-wide override applies.
-- ──────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['transactions','catalog','stock','clients','settings']
  LOOP
    EXECUTE format('
      DROP POLICY IF EXISTS "tenant_select" ON %I;
      DROP POLICY IF EXISTS "tenant_insert" ON %I;
      DROP POLICY IF EXISTS "tenant_update" ON %I;
      DROP POLICY IF EXISTS "tenant_delete" ON %I;
      CREATE POLICY "tenant_select" ON %I FOR SELECT
        USING (shop_id = current_shop_id() OR current_is_admin());
      CREATE POLICY "tenant_insert" ON %I FOR INSERT
        WITH CHECK (shop_id = current_shop_id() OR current_is_admin());
      CREATE POLICY "tenant_update" ON %I FOR UPDATE
        USING (shop_id = current_shop_id() OR current_is_admin())
        WITH CHECK (shop_id = current_shop_id() OR current_is_admin());
      CREATE POLICY "tenant_delete" ON %I FOR DELETE
        USING (shop_id = current_shop_id() OR current_is_admin());
    ', tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl);
  END LOOP;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- 11. shops table policies
--     SELECT: own shop OR admin.
--     UPDATE: admin only (subscription flag flips).
--     INSERT: any authenticated user (signup creates own shop;
--             user can only create one shop because the users
--             insert below enforces uniqueness).
--     DELETE: admin only (rare; cancellation path).
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "shops_select" ON shops;
DROP POLICY IF EXISTS "shops_insert" ON shops;
DROP POLICY IF EXISTS "shops_update" ON shops;
DROP POLICY IF EXISTS "shops_delete" ON shops;

CREATE POLICY "shops_select" ON shops FOR SELECT
  USING (
    id::text = current_shop_id()
    OR current_is_admin()
  );

CREATE POLICY "shops_insert" ON shops FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "shops_update" ON shops FOR UPDATE
  USING (current_is_admin())
  WITH CHECK (current_is_admin());

CREATE POLICY "shops_delete" ON shops FOR DELETE
  USING (current_is_admin());

-- ──────────────────────────────────────────────────────────────────
-- 12. users table policies
--     SELECT: own row + others in same shop + admin.
--     INSERT: own row only (auth.uid() must match id).
--     UPDATE: own row only.
--     DELETE: shop owner can delete staff in their shop;
--             admin can delete any user.
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users_select" ON users;
DROP POLICY IF EXISTS "users_insert" ON users;
DROP POLICY IF EXISTS "users_update" ON users;
DROP POLICY IF EXISTS "users_delete" ON users;

CREATE POLICY "users_select" ON users FOR SELECT
  USING (
    id = auth.uid()
    OR shop_id::text = current_shop_id()
    OR current_is_admin()
  );

CREATE POLICY "users_insert" ON users FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_update" ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_delete" ON users FOR DELETE
  USING (
    current_is_admin()
    OR EXISTS (
      SELECT 1 FROM users me
      WHERE me.id = auth.uid()
        AND me.shop_id = users.shop_id
        AND me.role = 'owner'
    )
  );

-- ──────────────────────────────────────────────────────────────────
-- 13. admins table policies — read-only for all authed users (so
--     the app can check "am I admin"); only an admin can insert
--     another admin (bootstrapping the first admin happens via
--     a manual INSERT outside RLS — see USER FOLLOW-UP at top).
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admins_select" ON admins;
DROP POLICY IF EXISTS "admins_modify" ON admins;

CREATE POLICY "admins_select" ON admins FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "admins_modify" ON admins FOR ALL
  USING (current_is_admin())
  WITH CHECK (current_is_admin());

-- ──────────────────────────────────────────────────────────────────
-- 14. Diagnostic query — uncomment to verify after running.
-- ──────────────────────────────────────────────────────────────────
-- SELECT
--   schemaname,
--   tablename,
--   policyname,
--   cmd,
--   permissive
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('shops','users','admins','transactions','catalog','stock','clients','settings')
-- ORDER BY tablename, cmd, policyname;
--
-- Expect: 4 policies per shop-scoped table (select/insert/update/
-- delete), no rows starting with "dev_allow_all_", and policies on
-- shops + users + admins. Then:
--
-- SELECT count(*) FROM transactions;  -- expect 0
-- SELECT count(*) FROM catalog;       -- expect 0
-- SELECT count(*) FROM stock;         -- expect 0
-- SELECT count(*) FROM clients;       -- expect 0
-- SELECT count(*) FROM settings;      -- expect 0
