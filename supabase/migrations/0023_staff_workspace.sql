-- LootLedger — Staff workspace foundation + invoice manager
-- (2026-05-15). Commit 1 of 3.
-- ================================================================
--
-- Foundation migration for the staff workspace redesign:
--   - User-level lockout columns + master key + admin rights flag.
--   - staff_documents table (Commit 2 surfaces).
--   - staff_contacts table  (Commit 2 surfaces).
--   - invoices table         (this commit's Invoice Manager).
--   - verify_staff_pin RPC   (this commit's tile PIN gate with
--                             3-strike server-side lockout).
--
-- Numbering: 0023 (last applied was 0022_email_log). All new
-- tables use the established multi-tenant pattern:
--   shop_id-scoped RLS via current_shop_id().
--   Role checks via current_user_role() (from 0008).
--   Platform admin read-all via current_is_platform_admin()
--     (from 0020).
--
-- ================================================================
-- DESIGN DECISIONS (locked 2026-05-15 with USER)
-- ================================================================
-- 1. PIN storage stays plaintext on users.pin (0011 column).
--    No pin_hash column — that's a separate future cleanup.
--    verify_staff_pin RPC compares plaintext, same posture as
--    the existing upsert_staff_hours / lock_staff_hours RPCs.
--
-- 2. RLS uses current_user_role() + current_shop_id() (0008 +
--    0003 helpers). No user_roles join table — roles live on
--    users.role.
--
-- 3. Supabase Storage is being introduced as a new dependency
--    by this commit. Two buckets are required (created via
--    Studio — see USER STEPS below). Bucket RLS mirrors the
--    table RLS so direct REST calls and signed-URL flows both
--    respect tenancy.
--
-- 4. verify_staff_pin handles lockout server-side: 3 wrong
--    attempts → 10-minute lock on the target user. Both
--    success and fail are audit-logged. The lockout is on the
--    target (the staff whose PIN is being tried), not the
--    caller — a tile on a shared device can be tried by
--    anyone but locks the target if abused.
--
-- ================================================================
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--
--   1. Verify schema with the queries at the bottom of this file.
--      Expect:
--      - 4 new columns on users (pin_failed_attempts,
--        pin_locked_until, master_key_encrypted, has_admin_rights).
--      - 3 new tables (staff_documents, staff_contacts, invoices).
--      - RLS enabled on all 3 with the documented policy counts.
--      - 1 new RPC (verify_staff_pin) registered.
--
--   2. Create 2 Supabase Storage buckets via Studio
--      (Studio → Storage → New bucket). Both PRIVATE
--      (public toggle OFF). File size limit 50 MB.
--
--        a. staff-documents
--           Allowed MIME types: image/*, application/pdf
--           After creation, run the RLS policy block at the
--           bottom of this file (commented STORAGE_RLS_STAFF
--           section). Storage RLS is on storage.objects, not
--           on the bucket itself.
--
--        b. invoices
--           Allowed MIME types: image/*, application/pdf
--           Same: after creation, run the STORAGE_RLS_INVOICES
--           block at the bottom of this file.
--
--   3. Re-deploy the send-email Edge Function from Studio
--      (Edge Functions → send-email → ... → Edit → paste new
--      index.ts → Deploy). Phase 5.2-E shipped the Edge
--      Function with body used for both text and HTML;
--      Commit 1's email enhancement adds an optional
--      htmlBody parameter so the EOD email can carry a rich
--      HTML report alongside the plain-text fallback.
--      Existing callers (single-body) still work unchanged.
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. users — lockout state + master key + admin rights flag
-- ──────────────────────────────────────────────────────────────────
-- pin_failed_attempts: bumped by verify_staff_pin on a wrong PIN.
--   Reset on a correct PIN. Implicitly resets when the lock
--   expires (the next correct PIN clears it).
-- pin_locked_until: set when failed attempts reach the threshold.
--   verify_staff_pin returns {ok:false, locked_until:...} while
--   now() < pin_locked_until. After expiry, the next attempt
--   starts fresh.
-- master_key_encrypted: owner-only column (Commit 3 will surface
--   it). Stored encrypted so the owner can reveal it; non-owners
--   never read it. NULL until Commit 3 generates it.
-- has_admin_rights: manager-grade admin flag (Commit 3). NULL-safe
--   default false so existing rows don't gain rights silently.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_failed_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_locked_until    timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS master_key_encrypted text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_admin_rights    boolean NOT NULL DEFAULT false;

-- ──────────────────────────────────────────────────────────────────
-- 2. staff_documents (Commit 2 surface — schema this commit)
-- ──────────────────────────────────────────────────────────────────
-- Personal documents for each staff member (contracts,
-- certifications, ID copies, etc.). Lives in the "staff-documents"
-- Storage bucket; this table is the metadata index. RLS gives
-- the row owner full control; shop owner has read-only audit
-- access; platform admin has cross-shop read.
CREATE TABLE IF NOT EXISTS staff_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id      text NOT NULL,
  title        text NOT NULL,
  storage_path text NOT NULL,
  mime_type    text,
  size_bytes   bigint,
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_documents_user_idx
  ON staff_documents (user_id, uploaded_at DESC);

ALTER TABLE staff_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_documents_self_read"  ON staff_documents;
DROP POLICY IF EXISTS "staff_documents_self_write" ON staff_documents;
DROP POLICY IF EXISTS "staff_documents_self_delete" ON staff_documents;
DROP POLICY IF EXISTS "staff_documents_owner_read" ON staff_documents;
DROP POLICY IF EXISTS "staff_documents_platform_admin_read" ON staff_documents;

CREATE POLICY "staff_documents_self_read" ON staff_documents
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "staff_documents_self_write" ON staff_documents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND shop_id = current_shop_id());

CREATE POLICY "staff_documents_self_delete" ON staff_documents
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Shop owner can read all documents in their shop (audit /
-- compliance). Refined in Commit 3 once manager-with-admin
-- vs manager-without lands.
CREATE POLICY "staff_documents_owner_read" ON staff_documents
  FOR SELECT TO authenticated
  USING (shop_id = current_shop_id() AND current_user_role() = 'owner');

CREATE POLICY "staff_documents_platform_admin_read" ON staff_documents
  FOR SELECT TO authenticated
  USING (current_is_platform_admin());

-- ──────────────────────────────────────────────────────────────────
-- 3. staff_contacts (Commit 2 surface — schema this commit)
-- ──────────────────────────────────────────────────────────────────
-- Personal contact rolodex for each staff member. Lives entirely
-- under the row owner — only the staff who created the contact
-- can read or modify it. Platform admin gets cross-shop read for
-- support / migration purposes.
CREATE TABLE IF NOT EXISTS staff_contacts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  email      text,
  role_tag   text CHECK (role_tag IS NULL OR role_tag IN ('staff', 'boss', 'client', 'other')),
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_contacts_user_idx
  ON staff_contacts (user_id, name);

ALTER TABLE staff_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_contacts_self_read"   ON staff_contacts;
DROP POLICY IF EXISTS "staff_contacts_self_write"  ON staff_contacts;
DROP POLICY IF EXISTS "staff_contacts_self_update" ON staff_contacts;
DROP POLICY IF EXISTS "staff_contacts_self_delete" ON staff_contacts;
DROP POLICY IF EXISTS "staff_contacts_platform_admin_read" ON staff_contacts;

CREATE POLICY "staff_contacts_self_read" ON staff_contacts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "staff_contacts_self_write" ON staff_contacts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "staff_contacts_self_update" ON staff_contacts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "staff_contacts_self_delete" ON staff_contacts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "staff_contacts_platform_admin_read" ON staff_contacts
  FOR SELECT TO authenticated
  USING (current_is_platform_admin());

-- ──────────────────────────────────────────────────────────────────
-- 4. invoices (this commit's surface — Invoice Manager)
-- ──────────────────────────────────────────────────────────────────
-- Shop-level expense invoices (Bunnings receipts, office supplies,
-- subcontractor bills, etc.). Image / PDF stored in the "invoices"
-- Storage bucket; this table is the metadata index. Visible to
-- everyone in the shop because it powers the Settings → Accounting
-- → Invoice Manager and the EOD "Add Invoice" shortcut.
CREATE TABLE IF NOT EXISTS invoices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      text NOT NULL,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title        text NOT NULL,
  amount       numeric(12, 2) NOT NULL,
  storage_path text,
  mime_type    text,
  size_bytes   bigint,
  invoice_date date DEFAULT CURRENT_DATE,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_shop_idx
  ON invoices (shop_id, invoice_date DESC);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_shop_read"   ON invoices;
DROP POLICY IF EXISTS "invoices_shop_write"  ON invoices;
DROP POLICY IF EXISTS "invoices_shop_update" ON invoices;
DROP POLICY IF EXISTS "invoices_shop_delete" ON invoices;
DROP POLICY IF EXISTS "invoices_platform_admin_read" ON invoices;

CREATE POLICY "invoices_shop_read" ON invoices
  FOR SELECT TO authenticated
  USING (shop_id = current_shop_id());

CREATE POLICY "invoices_shop_write" ON invoices
  FOR INSERT TO authenticated
  WITH CHECK (shop_id = current_shop_id());

CREATE POLICY "invoices_shop_update" ON invoices
  FOR UPDATE TO authenticated
  USING (shop_id = current_shop_id())
  WITH CHECK (shop_id = current_shop_id());

CREATE POLICY "invoices_shop_delete" ON invoices
  FOR DELETE TO authenticated
  USING (shop_id = current_shop_id());

CREATE POLICY "invoices_platform_admin_read" ON invoices
  FOR SELECT TO authenticated
  USING (current_is_platform_admin());

-- ──────────────────────────────────────────────────────────────────
-- 5. verify_staff_pin — tile PIN gate with server-side lockout
-- ──────────────────────────────────────────────────────────────────
-- Returns a jsonb result so the client can branch on:
--   {ok:true}                            — PIN matched
--   {ok:false, error:'locked',
--    locked_until:'2026-05-15T10:30:00'} — target currently locked
--   {ok:false, error:'no_pin'}           — target has no PIN set
--   {ok:false, error:'wrong',
--    remaining:N}                        — N attempts remaining
--                                          before lockout
--   {ok:false, error:'wrong',
--    locked_until:'2026-05-15T10:30:00'} — wrong PIN that triggered
--                                          the lockout
--
-- Audit events:
--   'staff_pin_verify_ok'     — successful verify
--   'staff_pin_verify_fail'   — wrong PIN (pre-lockout)
--   'staff_pin_locked'        — wrong PIN that triggered lockout
--   'staff_pin_verify_blocked'— attempt while still locked
--
-- The lockout counters are on the TARGET user (the one whose tile
-- was clicked) — abuse locks that user, not the caller. Same-shop
-- check prevents cross-shop probing.
CREATE OR REPLACE FUNCTION verify_staff_pin(
  p_target_user_id uuid,
  p_pin            text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_shop text;
  v_target_shop text;
  v_target_pin  text;
  v_failed      integer;
  v_lock_until  timestamptz;
  v_remaining   integer;
  v_max_fails   constant integer := 3;
  v_lock_mins   constant integer := 10;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Caller's shop.
  SELECT shop_id::text INTO v_caller_shop
    FROM users WHERE id = auth.uid();
  IF v_caller_shop IS NULL THEN
    RAISE EXCEPTION 'No shop for caller';
  END IF;

  -- Target user — load shop, pin, lockout state in one fetch.
  SELECT shop_id::text, pin, pin_failed_attempts, pin_locked_until
    INTO v_target_shop, v_target_pin, v_failed, v_lock_until
    FROM users WHERE id = p_target_user_id;
  IF v_target_shop IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;
  IF v_target_shop <> v_caller_shop THEN
    RAISE EXCEPTION 'Target user belongs to a different shop';
  END IF;

  -- Currently locked?
  IF v_lock_until IS NOT NULL AND v_lock_until > now() THEN
    INSERT INTO audit_log
      (shop_id, actor, event_type, target_table, target_id, payload)
    VALUES
      (v_caller_shop, auth.uid(), 'staff_pin_verify_blocked',
       'users', p_target_user_id::text,
       jsonb_build_object('locked_until', v_lock_until));
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'locked',
      'locked_until', v_lock_until
    );
  END IF;

  -- No PIN set on target.
  IF v_target_pin IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'no_pin'
    );
  END IF;

  -- Successful match.
  IF p_pin IS NOT NULL AND p_pin = v_target_pin THEN
    UPDATE users
      SET pin_failed_attempts = 0,
          pin_locked_until    = NULL
      WHERE id = p_target_user_id;

    INSERT INTO audit_log
      (shop_id, actor, event_type, target_table, target_id, payload)
    VALUES
      (v_caller_shop, auth.uid(), 'staff_pin_verify_ok',
       'users', p_target_user_id::text,
       jsonb_build_object('self', p_target_user_id = auth.uid()));

    RETURN jsonb_build_object('ok', true);
  END IF;

  -- Wrong PIN. Increment + maybe lock.
  v_failed := COALESCE(v_failed, 0) + 1;

  IF v_failed >= v_max_fails THEN
    v_lock_until := now() + make_interval(mins => v_lock_mins);

    UPDATE users
      SET pin_failed_attempts = v_failed,
          pin_locked_until    = v_lock_until
      WHERE id = p_target_user_id;

    INSERT INTO audit_log
      (shop_id, actor, event_type, target_table, target_id, payload)
    VALUES
      (v_caller_shop, auth.uid(), 'staff_pin_locked',
       'users', p_target_user_id::text,
       jsonb_build_object(
         'failed_attempts', v_failed,
         'locked_until',    v_lock_until
       ));

    RETURN jsonb_build_object(
      'ok', false,
      'error', 'wrong',
      'locked_until', v_lock_until
    );
  ELSE
    UPDATE users
      SET pin_failed_attempts = v_failed
      WHERE id = p_target_user_id;

    INSERT INTO audit_log
      (shop_id, actor, event_type, target_table, target_id, payload)
    VALUES
      (v_caller_shop, auth.uid(), 'staff_pin_verify_fail',
       'users', p_target_user_id::text,
       jsonb_build_object('failed_attempts', v_failed));

    v_remaining := v_max_fails - v_failed;
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'wrong',
      'remaining', v_remaining
    );
  END IF;
END
$$;

REVOKE ALL ON FUNCTION verify_staff_pin(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_staff_pin(uuid, text) TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 6. Verification queries (manual — copy into Studio after run).
-- ──────────────────────────────────────────────────────────────────
-- 1) New columns on users:
--      SELECT column_name, data_type, is_nullable, column_default
--      FROM information_schema.columns
--      WHERE table_name='users'
--        AND column_name IN (
--          'pin_failed_attempts','pin_locked_until',
--          'master_key_encrypted','has_admin_rights')
--      ORDER BY column_name;
--    Expect 4 rows:
--      has_admin_rights boolean NO default false
--      master_key_encrypted text YES (null default)
--      pin_failed_attempts integer NO default 0
--      pin_locked_until timestamptz YES (null default)
--
-- 2) New tables exist with RLS enabled:
--      SELECT tablename, rowsecurity
--      FROM pg_tables
--      WHERE tablename IN ('staff_documents','staff_contacts','invoices')
--      ORDER BY tablename;
--    Expect 3 rows, all rowsecurity=true.
--
-- 3) Policy counts:
--      SELECT tablename, count(*)::int AS policy_count
--      FROM pg_policies
--      WHERE tablename IN ('staff_documents','staff_contacts','invoices')
--      GROUP BY tablename
--      ORDER BY tablename;
--    Expect:
--      staff_documents → 5 (self_read, self_write, self_delete,
--                          owner_read, platform_admin_read)
--      staff_contacts  → 5 (self_read, self_write, self_update,
--                          self_delete, platform_admin_read)
--      invoices        → 5 (shop_read, shop_write, shop_update,
--                          shop_delete, platform_admin_read)
--
-- 4) verify_staff_pin RPC registered:
--      SELECT proname FROM pg_proc WHERE proname='verify_staff_pin';
--    Expect 1 row.
--
-- 5) Direct unauthed RPC call from Studio fails closed:
--      SELECT * FROM verify_staff_pin(
--        '00000000-0000-0000-0000-000000000000'::uuid, '1234');
--    Expect: ERROR Not authenticated. Real auth tests happen from
--    the dev app via the verifyStaffPin wrapper.
--
-- 6) Pre-existing rows on users defaulted correctly:
--      SELECT
--        count(*) FILTER (WHERE pin_failed_attempts = 0)        AS zero_fails,
--        count(*) FILTER (WHERE has_admin_rights = false)       AS no_admin,
--        count(*) FILTER (WHERE master_key_encrypted IS NULL)   AS no_key,
--        count(*)                                               AS total
--      FROM users;
--    Expect zero_fails = no_admin = no_key = total.

-- ──────────────────────────────────────────────────────────────────
-- STORAGE_RLS_STAFF — paste into Studio AFTER creating the
-- "staff-documents" bucket. Storage RLS is on storage.objects.
-- Path convention: '{user_id}/{document_id}.{ext}'.
-- ──────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "staff_docs_storage_self_read"   ON storage.objects;
-- DROP POLICY IF EXISTS "staff_docs_storage_self_write"  ON storage.objects;
-- DROP POLICY IF EXISTS "staff_docs_storage_self_delete" ON storage.objects;
-- DROP POLICY IF EXISTS "staff_docs_storage_owner_read"  ON storage.objects;
-- DROP POLICY IF EXISTS "staff_docs_storage_platform_admin_read" ON storage.objects;
--
-- CREATE POLICY "staff_docs_storage_self_read" ON storage.objects
--   FOR SELECT TO authenticated
--   USING (
--     bucket_id = 'staff-documents'
--     AND (storage.foldername(name))[1] = auth.uid()::text
--   );
--
-- CREATE POLICY "staff_docs_storage_self_write" ON storage.objects
--   FOR INSERT TO authenticated
--   WITH CHECK (
--     bucket_id = 'staff-documents'
--     AND (storage.foldername(name))[1] = auth.uid()::text
--   );
--
-- CREATE POLICY "staff_docs_storage_self_delete" ON storage.objects
--   FOR DELETE TO authenticated
--   USING (
--     bucket_id = 'staff-documents'
--     AND (storage.foldername(name))[1] = auth.uid()::text
--   );
--
-- CREATE POLICY "staff_docs_storage_owner_read" ON storage.objects
--   FOR SELECT TO authenticated
--   USING (
--     bucket_id = 'staff-documents'
--     AND current_user_role() = 'owner'
--     AND EXISTS (
--       SELECT 1 FROM staff_documents sd
--       WHERE sd.storage_path = storage.objects.name
--         AND sd.shop_id = current_shop_id()
--     )
--   );
--
-- CREATE POLICY "staff_docs_storage_platform_admin_read" ON storage.objects
--   FOR SELECT TO authenticated
--   USING (
--     bucket_id = 'staff-documents'
--     AND current_is_platform_admin()
--   );

-- ──────────────────────────────────────────────────────────────────
-- STORAGE_RLS_INVOICES — paste into Studio AFTER creating the
-- "invoices" bucket. Path convention: '{shop_id}/{invoice_id}.{ext}'.
-- ──────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "invoices_storage_shop_read"   ON storage.objects;
-- DROP POLICY IF EXISTS "invoices_storage_shop_write"  ON storage.objects;
-- DROP POLICY IF EXISTS "invoices_storage_shop_delete" ON storage.objects;
-- DROP POLICY IF EXISTS "invoices_storage_platform_admin_read" ON storage.objects;
--
-- CREATE POLICY "invoices_storage_shop_read" ON storage.objects
--   FOR SELECT TO authenticated
--   USING (
--     bucket_id = 'invoices'
--     AND (storage.foldername(name))[1] = current_shop_id()
--   );
--
-- CREATE POLICY "invoices_storage_shop_write" ON storage.objects
--   FOR INSERT TO authenticated
--   WITH CHECK (
--     bucket_id = 'invoices'
--     AND (storage.foldername(name))[1] = current_shop_id()
--   );
--
-- CREATE POLICY "invoices_storage_shop_delete" ON storage.objects
--   FOR DELETE TO authenticated
--   USING (
--     bucket_id = 'invoices'
--     AND (storage.foldername(name))[1] = current_shop_id()
--   );
--
-- CREATE POLICY "invoices_storage_platform_admin_read" ON storage.objects
--   FOR SELECT TO authenticated
--   USING (
--     bucket_id = 'invoices'
--     AND current_is_platform_admin()
--   );
