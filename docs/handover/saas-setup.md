# SaaS Stage 1.A — setup + verification

**Status as of 2026-05-02:** all seven commits of Stage 1.A landed on `origin/dev`. The code-side work is done; what's left are the Supabase Studio steps that can only be run by hand from your account, plus the smoke test to prove tenant isolation actually holds.

This document is the punch list. Run it top-to-bottom before exposing the dev URL to the Ballarat dealer.

---

## 1. Run the migration

The destructive schema reset lives at `supabase/migrations/0003_saas_foundation.sql`. It TRUNCATEs `transactions / catalog / stock / clients` and DELETEs every row from `settings`, then creates the new `shops / users / admins` tables and rewires RLS for tenant isolation.

Steps:

1. Open the dev project SQL editor: <https://app.supabase.com/project/qxxbumjfocxslaaivzfo/sql>
2. Paste the contents of `0003_saas_foundation.sql` into a new query.
3. Click **Run**.
4. Verify no errors. Common red flags:
   - "permission denied for schema auth" — Supabase doesn't actually expose the auth schema for direct DDL; you don't need to. The `REFERENCES auth.users(id)` clauses are read-only references and work fine from the migration.
   - "type uuid does not exist" — `pgcrypto` extension missing. The migration enables it (`CREATE EXTENSION IF NOT EXISTS pgcrypto`); if it still complains, run that line manually first.

5. After the migration runs, uncomment the diagnostic SELECT block at the bottom of the file and re-run. Expected:
   - 4 policies per shop-scoped table (transactions / catalog / stock / clients / settings).
   - No rows where `policyname` starts with `dev_allow_all_`.
   - Policies on `shops`, `users`, `admins`.
   - `SELECT count(*) FROM transactions / catalog / stock / clients / settings` all return 0.

---

## 2. Bootstrap the first admin

The `admins` table starts empty. RLS allows admin self-modify only, so the first admin has to be added by hand from the SQL editor (which runs as the service role, bypassing RLS).

```sql
INSERT INTO admins (email) VALUES ('YOUR_EMAIL@example.com');
```

Use the lowercase form of the email you'll sign up with in step 4. If you've already created an auth account, this email must match exactly (case-insensitive) — `current_is_admin()` does a `lower()` comparison.

Verify:

```sql
SELECT * FROM admins;
```

---

## 3. Configure Supabase Auth providers

Studio → **Authentication** → **Providers**:

- **Email** — already enabled by default. No action needed.
- **Phone** — toggle ON if you want phone signup to work. Configure an SMS provider:
  - **Twilio** — needs Account SID + Auth Token + a phone number.
  - **Vonage / MessageBird** — alternative providers.
  - If no SMS provider is configured, phone signup will fail at OTP send time. The app surfaces the error inline ("Signup failed: …") so the user sees it; they can fall back to email signup.

Studio → **Authentication** → **URL Configuration**:

- **Site URL** — set to the deployed app URL.
  - Dev: `https://lootledger.netlify.app`
  - Prod (later): the real domain, e.g. `https://lootledger.com.au`
- **Redirect URLs** — add the same plus any subdomains you'll use:
  - `https://lootledger.netlify.app/**`
  - `https://*.lootledger.com.au/**` (when subdomains go live)

Studio → **Authentication** → **Email Templates** — leave the defaults for Stage 1.A; Stage 2 customises the templates with shop branding.

---

## 4. Smoke test — RLS / tenant isolation

This is the proof that the multi-tenant cut is correct. The app-side code in commits 1-6 won't ship customer data into the wrong tenant by accident, but RLS is the durable enforcement layer; it has to be verified.

### Sign up two test accounts

1. Open the deployed app at `/signup` (or `localhost:5173/signup` if running `npm run dev`).
2. Sign up **Shop A**:
   - Business name: `Test Shop A`
   - ABN: a real-format 11-digit ABN that passes the checksum (e.g. `51824753556` — example only; use any valid one).
   - Email: `test-a@example.com`
   - Phone: `0411111111`
   - Password: `testtest8`
3. After signup the app routes you into the dashboard. Confirm the topbar strip reads `Shop: test-shop-a — Test Shop A`.
4. Run a transaction through the New Tx flow. Save & Approve. Confirm it lands in History.
5. Sign out (top-right of the strip).
6. Sign up **Shop B** with a different email + business name (e.g. `test-b@example.com` / `Test Shop B`).
7. Confirm Shop B's History is **empty** — the transaction from Shop A should not appear.
8. Run a transaction in Shop B. Sign out.
9. Sign back into Shop A. Confirm Shop A's transaction is still there and Shop B's is **not** visible.

### Verify at the database level

In Studio SQL editor (service-role; sees everything):

```sql
SELECT shop_id, count(*) FROM transactions GROUP BY shop_id;
```

Expected: two rows, one per shop. Counts match what you entered.

```sql
SELECT id, slug, business_name, trial_ends_at, subscription_active FROM shops;
```

Expected: two rows. `trial_ends_at` is roughly today + 3 months. `subscription_active` is false.

### Test the admin panel

1. Sign in as your admin email (from step 2).
2. Navigate to `/admin` (or click the `Admin` link in the topbar strip — it appears for admin users).
3. Confirm both Test Shop A and Test Shop B are listed.
4. Click `Activate` on Shop A. The badge flips to `Subscribed`. The `subscription_activated_at` column populates.
5. Click `Deactivate`. The badge flips back to `Expired` (because the trial isn't yet expired this won't actually lock them out yet, but the flag is correct).

### Test the trial-expired gate

To exercise this without waiting 3 months, run in SQL editor:

```sql
UPDATE shops SET trial_ends_at = now() - INTERVAL '1 day' WHERE slug = 'test-shop-a';
```

Sign in as Shop A's owner. RequireAuth should bounce you to `/trial-expired`. Confirm the screen shows the expiry date and the `mailto:` link is pre-filled with shop info. Confirm clicking `Sign out` returns you to `/login`.

Reset for Shop A:

```sql
UPDATE shops SET trial_ends_at = now() + INTERVAL '3 months' WHERE slug = 'test-shop-a';
```

### Test cross-subdomain redirect (production only)

Once subdomains are live (custom domain configured + DNS pointed at Netlify):

1. Sign in via `lootledger.com.au/login` as a Shop A owner.
2. After login, the app should redirect the browser to `test-shop-a.lootledger.com.au/app`.
3. Manually navigate to `test-shop-b.lootledger.com.au/app` while signed in as Shop A.
4. RequireAuth's cross-subdomain check should redirect you back to `test-shop-a.lootledger.com.au/app` because `shop.slug` doesn't match the host's leftmost label.

In dev (`lootledger.netlify.app` / `localhost`) this check is skipped per `detectTenantHost()`'s `mode === "dev"` short-circuit.

---

## 5. Clean up after the smoke test

```sql
-- Wipe the two test shops so the dev project is clean again. The
-- ON DELETE CASCADE on users.shop_id and the per-shop RLS isolation
-- mean transactions/catalog/stock/clients/settings rows for those
-- shops disappear automatically when the shops row is deleted.
DELETE FROM shops WHERE slug LIKE 'test-shop-%';
-- The matching auth.users rows aren't cleaned up by the cascade —
-- they linger as "stranded auth accounts". Either delete them via
-- Studio → Authentication → Users, or leave them; the next signup
-- with the same email will fail until they're removed.
```

---

## 6. Known limitations / next steps

These are out of scope for Stage 1.A; tracked for the next sprint.

1. **Auth screens are utilitarian.** Stage 2 marketing pass replaces the visual register on Login / Signup / ForgotPassword / TrialExpired with branded design.
2. **Email templates are Supabase defaults.** Stage 2 customises the password-reset and confirmation emails with shop branding.
3. **Phone signup needs Twilio (or alternative).** Without it, the form will accept the phone but signup fails at OTP send. Email signup works regardless.
4. **No staff-invite flow.** The Signup form creates a single `owner` user per shop. Inviting `staff` role users is a Phase 3 task — the database schema supports it (users.role check constraint), the UI doesn't yet.
5. **Custom domain not configured.** Until the apex domain is live and DNS points at Netlify, every access goes through `lootledger.netlify.app` which the code treats as dev mode (no subdomain enforcement).
6. **App.tsx mount-time settings load runs before auth resolves.** The first render of `<App>` inside `<RequireAuth>` waits for auth to load (RequireAuth shows a Loading… spinner), so by the time App's `useEffect` fires, `getCurrentShopId()` returns the real id. If you see a `[storage] getCurrentShopId() called before auth context cached` warning in the console, file it — that means a code path bypassed RequireAuth.
7. **The `gf_*` localStorage cache still persists pre-SaaS data.** New users won't see leftovers (the migration TRUNCATEs the database; the localStorage cache is per-browser and won't transfer between accounts), but if you sign up Shop A then Shop B in the same browser, Shop B will briefly see Shop A's cached lists until the next Supabase load. Stage 2 adds a per-user namespace to the localStorage keys so this can't happen.

---

## 7. Cutover note (for production)

When Ballarat is ready to go live on the real domain:

1. The dev Supabase (`qxxbumjfocxslaaivzfo`) should NOT be the production database. Provision a fresh Supabase project for prod.
2. Run `0001_clients.sql`, `0002_unique_constraints.sql`, `0003_saas_foundation.sql` against prod **without** the destructive TRUNCATE in 0003 — comment those lines out before running on prod.
3. Add the production admin email to the prod `admins` table.
4. Configure prod Auth providers (same steps as dev).
5. Update the Netlify deploy's `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` env vars to point at prod.
6. Configure DNS:
   - `lootledger.com.au` → Netlify apex.
   - `*.lootledger.com.au` → Netlify wildcard subdomain.
   - Netlify needs the wildcard cert (Stage 1.A can use Netlify's free LetsEncrypt; production may want a paid wildcard).
7. Sign Ballarat up via `lootledger.com.au/signup`. Note their slug. Activate the subscription if going straight to paid (else let the trial run).
8. Hand the Ballarat dealer the URL: `https://ballarat.lootledger.com.au`.
