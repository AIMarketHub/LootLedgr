# Admin PIN — Supabase manual-reset fallback

**Audience:** verified shop owner only.
**When to use:** the Admin PIN is forgotten AND the recovery passphrase paper is unavailable AND (post Phase 3) the SMS recovery branch is unavailable. This is the destructive last resort.

This is the very last fallback. It is ONLY appropriate after the in-app recovery flows have been ruled out:

1. **Try the lock-screen "Forgot PIN" → Use Recovery Passphrase first.** That path is non-destructive, leaves the recovery bundle intact, and lets the dealer keep using the same paper passphrase forever.
2. **Once Phase 3 lands, try the SMS recovery branch second.** Also non-destructive.
3. **Only if BOTH of the above fail AND the user is a verified owner**, follow this manual reset. Doing this on someone else's behalf without owner authorisation is a serious access-control breach.

## What this procedure does

It clears the four `adminRecovery*` settings keys plus `staffPin` and turns `requirePin` off. The dealer is then dropped back to the unprotected app and can re-run first-time setup to create a brand-new recovery bundle with a brand-new passphrase. **The previous passphrase becomes invalid.**

## Step-by-step (Supabase Studio)

1. Log into the Supabase project (lootledger-dev for testing, lootledger-prod for live).
2. Open SQL Editor.
3. Run the query below. **Read it first.** It updates the singleton settings row only — there is exactly one settings record per shop in this schema (briefing §6.4).

```sql
update settings
set data = data
  || jsonb_build_object(
      'staffPin', '',
      'adminRecoverySalt', '',
      'adminRecoveryPassphraseEncrypted', '',
      'adminRecoveryPassphraseHash', '',
      'requirePin', false
    ),
    updated_at = now()
where shop_id = 'YOUR_SHOP_ID';
```

> Replace `'YOUR_SHOP_ID'` with the actual shop_id from `select shop_id from settings limit 1;` if you are unsure. There is normally only one row.

4. Optionally also clear `adminRecoveryPhone` if it is suspect:

```sql
update settings
set data = data || jsonb_build_object('adminRecoveryPhone', '')
where shop_id = 'YOUR_SHOP_ID';
```

5. Tell the dealer to refresh the app. The app will load with `requirePin = false`, no lock screen, no Admin gate prompts on destructive actions.
6. **Immediately have the dealer run first-time setup again** by toggling Settings → Security → "Require PIN to open app" back ON. The setup modal will generate a new passphrase. The dealer must save the new paper / password-manager copy before clicking Save and Activate.

## Caveats

- The previous recovery passphrase is now invalid. Anyone holding the old paper has nothing of value — but anyone who somehow had a copy of the OLD encrypted bundle could still attempt offline brute force against it. This is fine in practice (PBKDF2 100k iterations + AES-GCM is hardened against quick attacks), but this is the best argument for setting a non-trivial PIN.
- This procedure does NOT clear per-staff PINs in `staffList`. They remain stored against each staff record. Phase 3 will introduce real auth and these PINs become the staff-level input layer.
- Running this against `lootledger-prod` is operationally serious. Confirm with the owner in writing that they have exhausted the in-app recovery paths and accept the destructive nature.
- After Phase 3 lands, the SMS recovery branch will be the better second-line answer. Keep this manual procedure as the emergency-only third line.

## Related items

- `docs/sophiie-training/Sophiie - PIN recovery.txt` — staff-facing training for the in-app recovery paths.
- `src/lib/auth/passphrase.js` — the crypto substrate; comments explain which fields rotate on which operation.
- Locked roadmap memory `project_roadmap.md` — Stage 2.4 (Phase 3) is when SMS recovery, lockouts, and the audit_log table land.
