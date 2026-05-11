# Secondary Domain 301 Redirects (Future Setup)

Five secondary URLs should 301-redirect to `lootledger.au`
for canonical branding + SEO consolidation:

| Source | Target | Owner | Status |
|---|---|---|---|
| `lootledger.com.au` | `lootledger.au` | platform | not redirected |
| `lootledger.net` | `lootledger.au` | platform | not redirected |
| `lootledgr.au` | `lootledger.au` | platform | not redirected |
| `lootledgr.com.au` | `lootledger.au` | platform | not redirected |
| `lootledgr.netlify.app` | `lootledger.au` | platform (legacy demo) | password-protected, not redirected |

**Not on the list (intentional):**
- `lootledger.netlify.app` stays as a Netlify subdomain mirror of the apex Netlify project. Useful as an escape hatch if DNS at `lootledger.au` ever fails. No redirect.

**Status as of 2026-05-11:** 0 of 5 redirected. Not blocking any sub-phase of Phase 5.2. Walk through this doc manually when ready.

---

## Setup pattern per secondary domain

Each domain needs DNS records at its registrar plus a Netlify project (or a Netlify _redirects rule on an existing project) that issues the 301.

### A. VentraIP DNS setup (for the 4 owned domains)

Same pattern that lootledger.au went through this morning:

1. Log into VentraIP → My Services → `[domain]` → Manage DNS.
2. Enable DNS Hosting if not already enabled (one-way switch — be sure).
3. Configure 2 records (delete any existing parking records first):

   | Type | Name | Value | TTL |
   |---|---|---|---|
   | A | `[domain]` | `75.2.60.5` | `3600` |
   | CNAME | `www` | `lootledger.netlify.app` | `3600` |

4. Wait 5–30 min for propagation. Verify via `nslookup [domain]` returning Netlify IPs.

### B. Netlify project setup

**Recommended:** one minimal Netlify project per secondary domain. Each project contains only a `public/_redirects` file:

```
/*    https://lootledger.au/:splat    301!
```

This catches all paths and 301-redirects to the same path on `lootledger.au`. The trailing `!` forces the redirect even if the destination exists (required for cross-domain redirects on Netlify).

Steps per domain:

1. Create a new Netlify site, deploy from a one-file repo containing the `_redirects` above. Or use Netlify's drag-and-drop for an even simpler one-shot deploy.
2. In the new site's Settings → Domain management → Add a custom domain → enter `[domain]`.
3. Netlify auto-provisions SSL via Let's Encrypt (DNS-01) once it sees the DNS records pointing at it. Cert ready in ~10 min.
4. Verify in browser: `https://[domain]/anything` → 301 → `https://lootledger.au/anything` with green padlock.

Repeat for each of the 4 owned domains.

### C. Legacy `lootledgr.netlify.app` (no 'e')

This is the legacy demo project ("lootledgr" without 'e') in your existing Netlify team. Currently password-protected. To 301-redirect it:

1. Open the `lootledgr` Netlify project.
2. Add a `public/_redirects` file (or update the existing `netlify.toml`) containing:

   ```
   /*    https://lootledger.au/:splat    301!
   ```

3. Push to the branch that `lootledgr` deploys from (probably `main`).
4. Verify after deploy. Optionally remove the password protection at this point (the redirect makes content irrelevant).

Eventually (per `memory/project_lootledger.md`): terminate the `lootledgr` project entirely at end of production migration. The 301 redirect is a transitional state.

---

## Verification checklist (per domain)

After setup completes for any one domain:

- [ ] `nslookup [domain]` returns the Netlify load-balancer IP (`75.2.60.5` or similar).
- [ ] `https://[domain]/` resolves with green padlock (Let's Encrypt cert).
- [ ] `https://[domain]/` returns HTTP 301 to `https://lootledger.au/`.
- [ ] `https://[domain]/some/path?query=1` redirects to `https://lootledger.au/some/path?query=1` (path + query preserved).
- [ ] Update the status table at the top of this doc.

---

## Notes

- The platform-owner is responsible for DNS work; Claude Code does not have credentials.
- All 5 setups can be done in parallel — no dependency between them.
- If a secondary domain is re-registered at a different registrar later, the same DNS record pair (apex A + www CNAME) applies; only the registrar UI differs.
