---
id: security-privacy
title: Security & Privacy
status: draft
depends_on: [data-model]
last_updated: 2026-09-11
---

# Security & Privacy

Define how the Trip Companion PWA protects a 5-user private trip group. Treat every
control here as mandatory: this app stores passport scans, insurance details, medical
profiles, and real-time whereabouts for a small, known group of travelers.

Scope: Next.js 15 + Supabase (Postgres + RLS, Auth, Storage, Realtime) hosted on Vercel.
Canonical schema and RLS policies live in [docs/03-data-model-and-rls.md](03-data-model-and-rls.md);
known security pitfalls and fixes live in [docs/12-troubleshooting.md](12-troubleshooting.md).

## 1. Threat model

Realistic threats for a 5-user private trip app, ranked by likelihood × impact:

| # | Threat | Example scenario | Primary mitigation |
|---|--------|------------------|--------------------|
| T1 | Leaked link / URL sharing | A signed URL or screenshot link forwarded outside the group | Short-TTL signed URLs (1h), private buckets only, no public routes with sensitive data |
| T2 | Stolen / lost phone | Phone lost in Budapest; unlocked or session still valid | Session revocation via Supabase dashboard, short session lifetime, OS-level lock assumption documented |
| T3 | Overshared passport scan | One member uploads a passport scan to a shared view | PRIVATE-PER-USER classification, owner-only RLS on `trip-documents`, never render in shared views |
| T4 | Public bucket misconfiguration | `trip-media` accidentally set `public = true` | Migration-time assertion: all buckets private; CI check on bucket config; storage RLS policies |
| T5 | Session hijack / token theft | XSS or malicious extension steals the refresh token | React escaping (no `dangerouslySetInnerHTML`), CSP header, HTTPS-only cookies |
| T6 | Metadata / EXIF leak | Photo with GPS coordinates of accommodation shared beyond the group | Strip EXIF/GPS client-side by default on upload (opt-in to keep) |
| T7 | Allowlist bypass | A stranger guesses the magic-link flow and signs up | `allowed_emails` table + DB trigger rejecting non-allowlisted signups |

Assume the attacker is a curious stranger or a careless friend-of-a-friend, not a
nation state. Do not over-engineer; do not skip the basics below.

## 2. Authentication

Use **magic-link email OTP only**. No passwords, no social OAuth in MVP.

Flow:

1. User enters email on the login screen.
2. Server checks the email against `allowed_emails` **before** issuing an OTP.
3. Supabase Auth sends a one-time code / magic link to that email.
4. On first verified login, a row in `members` is created and linked to `auth.users`.

Enforce the allowlist at the database, not the client:

```sql
-- Reject signups for emails not present in allowed_emails.
create or replace function public.enforce_allowed_email()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.allowed_emails
    where lower(email) = lower(new.email)
  ) then
    raise exception 'Signup not allowed for this email';
  end if;
  return new;
end;
$$;

create trigger enforce_allowed_email_before_insert
  before insert on auth.users
  for each row execute function public.enforce_allowed_email();
```

- [ ] Seed `allowed_emails` with the 5 group emails from [docs/09-import-and-seed.md](09-import-and-seed.md) (source of truth: member spreadsheet).
- [ ] Test the trigger: attempt signup with a non-allowlisted email and confirm rejection.
- [ ] Configure session lifetime in Supabase dashboard: access token TTL 1h, refresh token TTL 30 days (covers pre-trip + trip + buffer).
- [ ] Enable automatic token refresh in the client (`autoRefreshToken: true`); never roll custom token storage.
- [ ] Document for users: sign-in requires access to their email inbox; no passwords exist to forget.

## 3. Authorization

- Apply **RLS on every table and on `storage.objects`**. No exceptions, no "internal" tables without policies.
- Follow the canonical policies in [docs/03-data-model-and-rls.md](03-data-model-and-rls.md); this doc does not duplicate them.
- Roles: `owner` (trip creator) and `member`. Owners manage members, polls, and retention settings; members manage their own private data. Encode role checks in RLS, not in UI conditionals.
- **Never trust the client.** Treat every `INSERT`/`UPDATE` as hostile: validate with `CHECK` constraints and RLS `WITH CHECK` clauses. UI hiding is convenience, not security.
- Use the publishable (anon) key in the browser only. The service-role key lives exclusively in server-only code (cron routes, admin scripts) and never ships to the client.

## 4. Data classification

| Class | Examples | Storage location | Who can read | Who can write |
|-------|----------|------------------|--------------|---------------|
| PUBLIC-IN-APP | Itinerary items, places, day plans, transit notes | Postgres tables (`schedule_items`, `places`) | All trip members | All members (per RLS) |
| MEMBERS-ONLY | Expenses, phone numbers, masked reservation refs (`1385•••93`), polls, checklist state | Postgres tables (`expenses`, `members`, `polls`) | All trip members | Owning member / all members per feature RLS |
| PRIVATE-PER-USER | Passport scans, insurance policy numbers, medical profile | `trip-documents` bucket + `medical_profiles` table | Owning user only (emergency-only fields per visibility enum) | Owning user only |
| SECRETS | Supabase service-role key, Vercel env vars, API keys | `.env.local` / Vercel env (gitignored) | Server-side code only | Project admin only |

Rules:

- [ ] Assert in every migration review: no column or bucket crosses classes silently.
- [ ] Render MEMBERS-ONLY and PRIVATE-PER-USER data only behind an authenticated session; no static prerender of these pages.
- [ ] Keep SECRETS out of the repo; verify `.gitignore` covers `.env.local` and any `*.key` files.

## 5. Sensitive data rules (hard rules)

1. **Mask reservation numbers in UI.** Display the Arkia reservation as `1385•••93`.
   Store the full value in Postgres (MEMBERS-ONLY); mask at the presentation layer via
   a shared `maskReservation()` util — never via per-component string slicing.
2. **Passport scans and insurance policy numbers** live in the `trip-documents` bucket
   under owner-only RLS. Never render them in shared views (media wall, today, route).
3. **Medical profile is opt-in.** A member creates it explicitly; absence is the default.
   Use a `visibility` enum: `private` | `members` | `emergency_only`. Log **every read**
   of a medical profile to `app_events` (actor, subject, timestamp, context).
4. **Never store Gmail links, OAuth tokens, or URLs with identifying query params.**
   Paste booking facts (times, refs, addresses) as data, not links.
5. **Strip EXIF/GPS metadata from uploads by default.** Compress + transcode client-side
   (see [docs/08-integrations-and-apis.md](08-integrations-and-apis.md) §8) which drops
   metadata; offer an explicit opt-in toggle to preserve location for the media wall map.

- [ ] Implement `maskReservation()` and snapshot-test its output (`1385•••93`).
- [ ] Implement the `app_events` insert on medical-profile read inside the data-access layer, not the component.

## 6. Storage security

- Buckets: `trip-media` and `trip-documents`. **Both private. No public buckets, ever.**
- Access via **signed URLs with TTL 1 hour**. Generate on demand server-side or via RLS-safe
  client calls; do not cache signed URLs beyond their TTL.
- Validate **MIME type server-side** (magic bytes via a storage webhook or edge function),
  not by file extension. Accepted image types: JPEG, PNG, WebP, HEIC.
- Size limits: images ≤ 15 MB pre-compression; reject larger uploads client- and server-side.
- Path scheme (enforced by storage RLS policies):

```text
trips/{tripId}/{kind}/{userId}/{uuid}
-- kind ∈ { media, documents }
-- documents paths: RLS allows read/write only where auth.uid() = userId
```

- Remember: uploads to a private bucket require **both** `SELECT` and `INSERT` policies on
  `storage.objects` — a missing `SELECT` policy makes uploads fail silently on some client
  versions. See [docs/12-troubleshooting.md](12-troubleshooting.md).

- [ ] Write migration asserting `public = false` for both buckets; fail CI if violated.
- [ ] Write storage RLS policies per the path scheme and test with two different users.

## 7. Client security

- Ship no secrets in `NEXT_PUBLIC_*` beyond the Supabase URL and publishable key.
  Anything else prefixed `NEXT_PUBLIC_` is public by definition — treat it as such.
- Prevent XSS by relying on React's default escaping. **Do not use
  `dangerouslySetInnerHTML`** anywhere; if rich text ever appears, sanitize with an
  allowlist sanitizer first (and open an ADR).
- Add a Content-Security-Policy header (start restrictive, loosen only on evidence):

```text
default-src 'self';
img-src 'self' blob: data: https://zgvpchdqudheiohlrrvm.supabase.co;
connect-src 'self' https://zgvpchdqudheiohlrrvm.supabase.co wss://zgvpchdqudheiohlrrvm.supabase.co;
style-src 'self' 'unsafe-inline';
script-src 'self';
frame-ancestors 'none'
```

- [ ] Grep the codebase for `dangerouslySetInnerHTML` in CI; fail on any hit.

## 8. Transport & security headers

Serve HTTPS only (Vercel default) and set headers in `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(self), geolocation=(self), microphone=()" }
      ]
    }
  ]
}
```

- [ ] Verify headers on the deployed URL with `curl -I` or securityheaders.com after first deploy.

## 9. Account & data lifecycle

- **Member leaves / is removed**: revoke their sessions immediately and delete their
  `members` row (or set `left_at`); RLS then denies all further reads. Retain their
  historical expenses and checklist marks so group totals stay correct.
- **Right to export**: provide per-user CSV export of their own data (expenses, documents
  list, medical profile). Build it as a simple server route; no fancy UI in MVP.
- **Right to delete**: on request, delete the user's private documents, medical profile,
  and auth row. Keep anonymized expense rows (payer nulled) to preserve group balances.
- **Post-trip retention** (group decision — decide before the trip):
  - [ ] Decide media retention: keep `trip-media` for _N_ months after 2026-10-08, then archive or delete. Suggested: 6 months.
  - [ ] Decide document retention: delete `trip-documents` (passports, insurance) within 1 month after return. Suggested default.
  - [ ] Record the decision here and in [docs/11-acceptance-criteria.md](11-acceptance-criteria.md).

## 10. Incident response

**Lost / stolen phone (T2):**

1. Open the Supabase dashboard → Authentication → Users.
2. Find the affected user; sign out all sessions for that user (`Sign out all devices`).
3. If compromise is suspected, remove the member's access (§9) and re-add on a new device.
4. Re-issue: user logs in again via magic link on a replacement device.

**Leaked publishable or service-role key:**

1. Identify which key leaked (client bundle ⇒ publishable; server log/repo ⇒ service-role).
2. Rotate the key in Supabase dashboard → Project Settings → API.
3. Update Vercel env vars and redeploy; update `.env.local` for all developers.
4. Review `app_events` and storage access logs for the exposure window.
5. Follow the detailed steps in [docs/12-troubleshooting.md](12-troubleshooting.md)
   (the known publishable-key `401` issue is documented there).

**Public bucket discovered (T4):**

1. Set bucket to private immediately.
2. Rotate any signed URLs that were shared; audit storage logs for external fetches.
3. Add the CI bucket assertion from §6 so it cannot recur.

## 11. Security acceptance checklist

Run before launch and after any schema change. Cross-link: [docs/11-acceptance-criteria.md](11-acceptance-criteria.md).

- [ ] RLS tests pass for every table (member can read shared data, cannot read other users' private rows).
- [ ] `storage.objects` RLS tested with two users: user B cannot read user A's `documents` path.
- [ ] No public buckets (migration assertion + dashboard check).
- [ ] Non-allowlisted email signup rejected by the DB trigger.
- [ ] Reservation number renders masked (`1385•••93`) on every screen that shows it.
- [ ] EXIF/GPS strip verified: upload a geotagged photo, download it, confirm metadata gone.
- [ ] Medical-profile read writes a row to `app_events`.
- [ ] Signed URLs expire after 1 hour and regenerate cleanly.
- [ ] Security headers verified on the deployed URL.
- [ ] CSV export and per-user delete tested on a staging account.

## Out of scope

- End-to-end encryption of member content (Supabase RLS is the trust boundary).
- Penetration testing / formal audit.
- GDPR DPO appointment (5 friends, private use; still honor export/delete rights above).
