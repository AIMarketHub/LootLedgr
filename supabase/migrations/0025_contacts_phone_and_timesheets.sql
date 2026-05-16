-- LootLedger — phone column on staff_contacts + timesheet_submissions.
-- Phase 5.2 staff-workspace Commit 2 (2026-05-16).
-- ================================================================
--
-- Two changes:
--   1. staff_contacts.phone column (per USER decision 2026-05-16
--      that Contacts needs phone alongside email).
--   2. timesheet_submissions table — records every weekly timesheet
--      a staff sends to the accountant. hours_snapshot captures the
--      exact rows submitted; discrepancies captures the comparison
--      engine's output at send time so audits can reconstruct what
--      the system flagged.
--
-- audit_log RLS (read access for staff to see their own
-- staff_hours audit trail in the Comparison Engine surface) is
-- ALREADY satisfied by the audit_log_read_own policy from
-- migration 0007 — it permits reading any row whose shop_id
-- matches current_shop_id(). No new policy needed.
--
-- ================================================================
-- USER FOLLOW-UP STEPS (after running this migration in Studio):
--
--   1. Verify the phone column:
--        SELECT column_name, data_type
--        FROM information_schema.columns
--        WHERE table_name = 'staff_contacts' AND column_name = 'phone';
--      Expect 1 row: phone text.
--
--   2. Verify timesheet_submissions table + RLS:
--        SELECT tablename, rowsecurity
--        FROM pg_tables WHERE tablename = 'timesheet_submissions';
--      Expect 1 row, rowsecurity = true.
--        SELECT count(*) FROM pg_policies
--        WHERE tablename = 'timesheet_submissions';
--      Expect 4 (self_read, self_write, owner_read,
--      platform_admin_read).
--
--   3. Verify the unique index:
--        SELECT indexname FROM pg_indexes
--        WHERE tablename = 'timesheet_submissions'
--          AND indexname = 'timesheet_submissions_unique_idx';
--      Expect 1 row.
--
--   4. Manual Storage bucket MIME whitelist update (Studio →
--      Storage → staff-documents → Edit → Allowed MIME types).
--      Add the Office + text + zip types listed in Commit 2's
--      spec so the Documents tab can accept docx / xlsx / pptx /
--      csv / txt / zip in addition to images and PDFs.
-- ================================================================

-- ──────────────────────────────────────────────────────────────────
-- 1. staff_contacts.phone
-- ──────────────────────────────────────────────────────────────────
ALTER TABLE staff_contacts
  ADD COLUMN IF NOT EXISTS phone text;

-- ──────────────────────────────────────────────────────────────────
-- 2. timesheet_submissions
-- ──────────────────────────────────────────────────────────────────
-- hours_snapshot: jsonb array of {date, start, end, break, note}
--   captured at send time. Immutable record of what the staff
--   actually submitted.
-- discrepancies: jsonb output of timesheet_compare.js at send
--   time. Captures the comparison the staff saw before clicking
--   Send.
-- email_log_id: FK to the row the send-email Edge Function
--   created in email_log. Set after the SMTP2GO send succeeds.
CREATE TABLE IF NOT EXISTS timesheet_submissions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id         text        NOT NULL,
  week_start_date date        NOT NULL,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  hours_snapshot  jsonb       NOT NULL,
  discrepancies   jsonb,
  sent_to_email   text        NOT NULL,
  email_log_id    uuid        REFERENCES email_log(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS timesheet_submissions_unique_idx
  ON timesheet_submissions (user_id, week_start_date);

CREATE INDEX IF NOT EXISTS timesheet_submissions_shop_idx
  ON timesheet_submissions (shop_id, week_start_date DESC);

ALTER TABLE timesheet_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "timesheet_submissions_self_read"  ON timesheet_submissions;
DROP POLICY IF EXISTS "timesheet_submissions_self_write" ON timesheet_submissions;
DROP POLICY IF EXISTS "timesheet_submissions_owner_read" ON timesheet_submissions;
DROP POLICY IF EXISTS "timesheet_submissions_platform_admin_read" ON timesheet_submissions;

CREATE POLICY "timesheet_submissions_self_read" ON timesheet_submissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "timesheet_submissions_self_write" ON timesheet_submissions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND shop_id = current_shop_id());

CREATE POLICY "timesheet_submissions_owner_read" ON timesheet_submissions
  FOR SELECT TO authenticated
  USING (shop_id = current_shop_id() AND current_user_role() = 'owner');

CREATE POLICY "timesheet_submissions_platform_admin_read" ON timesheet_submissions
  FOR SELECT TO authenticated
  USING (current_is_platform_admin());
