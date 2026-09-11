---
id: troubleshooting
title: Troubleshooting
status: draft
depends_on: [architecture]
last_updated: 2026-09-11
---

# 12 — Troubleshooting

Symptom → cause → fix, with copy-paste commands. Environment facts: Supabase project
`zgvpchdqudheiohlrrvm` (`https://zgvpchdqudheiohlrrvm.supabase.co`), CLI 2.108.0 linked,
Next.js 15 on Vercel, pnpm 10, Node 22. Architecture: [02-architecture.md](02-architecture.md).

## 1. Supabase publishable key returns 401 on `/rest/v1/` — CURRENT ISSUE (BLOCKER)

**Symptom**

```bash
curl -i "https://zgvpchdqudheiohlrrvm.supabase.co/rest/v1/" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY"
# → HTTP/2 401
```

The project's current publishable key (`sb_publishable_F0cM2o…` — full value in `.env.local`) is rejected
on `/rest/v1/`. This blocks every data task — fix first, per [10-implementation-roadmap.md](10-implementation-roadmap.md) T-001.

**Verify**

```bash
# from repo root — .env.local exports NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
source .env.local 2>/dev/null
# IMPORTANT (resolved 2026-09-11): the OpenAPI root /rest/v1/ requires a SECRET key on
# projects using sb_publishable_* keys — a 401 there is EXPECTED and does NOT mean the
# publishable key is broken. Probe a data endpoint instead:
curl -s -o /dev/null -w "REST: %{http_code}\n" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  "https://zgvpchdqudheiohlrrvm.supabase.co/rest/v1/trips"
# expected: REST: 200 (table exists) or 404 PGRST205 (authenticated, table absent) — both prove the key works
curl -s -o /dev/null -w "Auth: %{http_code}\n" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  "https://zgvpchdqudheiohlrrvm.supabase.co/auth/v1/health"
# expected: Auth: 200
```

> **Root cause record (2026-09-11)**: the original 401 report came from probing the
> `/rest/v1/` OpenAPI root. With the new `sb_publishable_*` key system that endpoint
> answers `401 {"hint":"Only secret API keys can be used for this endpoint."}`. The
> publishable key itself was valid all along (verified against `/rest/v1/trips` → 404
> PGRST205 and `/auth/v1/health` → 200). No rotation was needed; the key was re-copied
> from the management API into `.env.local` as a hygiene step.

**Causes**

1. **Key format migration**: Supabase moved from legacy `anon` JWTs (`eyJ…`) to `sb_publishable_…`
   strings. Older tooling/docs (and some supabase-js versions) that treat the key as a JWT fail.
2. **Rotated keys**: the key in `.env.local` predates a dashboard rotation — old string is dead.
3. Key copied with trailing whitespace/newline into `.env.local` or Vercel.

**Fix**

```bash
# 1. Supabase dashboard → Project Settings → API → copy the CURRENT publishable key
#    (or "Rotate" if unsure), then:
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<new-key>"   # paste carefully, no quotes/spaces
# 2. Update both places:
#    - .env.local (local)
#    - vercel envs:  pnpm vercel env rm NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
#                    pnpm vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
#    then redeploy (deployments cache old env values).
# 3. Re-verify with the curl above → must print 200.
```

- Pin `@supabase/supabase-js` to **v2.7x+**, which natively supports `sb_publishable_` keys:
  `pnpm list @supabase/supabase-js` — upgrade if older.
- Legacy `anon` JWT keys keep working; do not mix formats across `.env.local` / Vercel / dashboard.
- If 401 persists with a freshly copied key: check project status (Settings → General → pause/billing),
  then Supabase status page. Last resort: open a Supabase support ticket.
- [ ] Record the resolution outcome here (root cause + date) once fixed.

## 2. Magic link email not arriving

**Symptom**: login form says "sent", no email within ~1 minute (check spam first).

**Causes & fixes**

1. **Spam/promotions folder** — first check, and have members whitelist the sender.
2. **Built-in SMTP rate limits** — Supabase's default email service allows only a few messages per hour.
   Configure custom SMTP (Project Settings → Auth → SMTP) before onboarding all members
   (task in [10-implementation-roadmap.md](10-implementation-roadmap.md) R5).
3. **Redirect URL not allowlisted** — Project Settings → Auth → URL Configuration must include:
   `http://localhost:3000/**` and `https://<vercel-domain>/**`. A blocked redirect silently swallows
   the flow.
4. **Workaround**: enable email OTP (6-digit code) as an alternative path — same Auth settings;
   the login UI should support both (see [04-security-and-privacy.md](04-security-and-privacy.md)).

- [ ] Test one magic link per real member address by 2026-09-20 (all 5) — see doc 11 sign-off.

## 3. Storage upload fails: 403 "new row violates row-level security"

**Symptom**: insert into a bucket succeeds partially or fails; error mentions RLS on `storage.objects`.
Also: upload "works" but the file is unreadable / the client throws after insert.

**Cause**: `storage.objects` policies are incomplete. The API returns object metadata after insert, which
requires **SELECT** — a missing SELECT policy makes uploads fail or silently break
([04-security-and-privacy.md](04-security-and-privacy.md) §storage). You need SELECT **and** INSERT
(and UPDATE/DELETE as appropriate) per role.

**Fix** — example for the per-user `trip-documents` layout (`<uid>/filename` paths):

```sql
-- documents: owner-only, private bucket
create policy "trip_documents_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'trip-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "trip_documents_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'trip-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "trip_documents_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'trip-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
-- trip-media: same shape, but bucket_id = 'trip-media' and folder[1] = trip scoping per 03 doc
```

Also verify:

- Both buckets are **private** (`public = false`) — no public buckets, ever (CI assertion).
- MIME allowlist on the bucket (e.g. `image/*`, `application/pdf`) — rejects unexpected types early.
- Upload via `supabase.storage.from('trip-documents').upload(`${uid}/${name}`, file)`; access only via
  short-TTL signed URLs.

## 4. PWA not installable

**Symptom**: no install prompt on Android Chrome; Lighthouse PWA checks fail.

**Causes & fixes**

1. Manifest missing/unreachable → serve `app/manifest.ts` output at `/manifest.webmanifest`; check
   `name`, `short_name`, `start_url`, `display: standalone`.
2. Icons wrong: need 192px + 512px PNG (plus a `maskable` 512) — exact spec in
   [07-pwa-and-offline.md](07-pwa-and-offline.md).
3. Not HTTPS (or localhost) — Vercel is HTTPS by default; never test install from plain HTTP LAN.
4. Service worker not registered / no fetch handler → check `navigator.serviceWorker.ready` in console.
5. Already-installed or previously-dismissed prompt: Chrome will not re-fire `beforeinstallprompt`
   — use a fresh profile/incognito to test.

**iOS Safari**: no install prompt, ever. Manual: Share → **Add to Home Screen**. Keep the in-app
instructions page (Phase 2 task T-026) and its screenshots updated.

## 5. Stale content after deploy

**Symptom**: a deployed fix doesn't appear for members; old UI persists after refresh.

**Cause**: service worker cache serving an old precache revision.

**Fix**

- SW must version its precache (build-id) and handle the update flow: on `updatefound`, show an
  in-app "update available → refresh" prompt; new SW calls `skipWaiting()` only after user consent,
  or immediately for bug fixes ([07-pwa-and-offline.md](07-pwa-and-offline.md)).
- Verify what's live:

```bash
curl -s https://<vercel-domain>/sw.js | head -5          # deployed SW revision
# DevTools → Application → Service Workers → "Update on reload" while debugging
```

- Manual escape hatch for a member: pull-to-refresh twice, or DevTools → Application → Clear storage.
  A plain reload does **not** bypass the SW.

## 6. Realtime not updating

**Symptom**: poll votes / expenses / media don't appear live for other members.

**Causes & fixes**

1. **RLS blocks the broadcast** — `postgres_changes` respects RLS: if the subscribing user can't SELECT
   the row, no event arrives. Confirm the table's SELECT policy covers all trip members
   ([03-data-model-and-rls.md](03-data-model-and-rls.md)).
2. **Table not in the `supabase_realtime` publication**:

```sql
select * from pg_publication_tables where pubname = 'supabase_realtime';
alter publication supabase_realtime add table polls, poll_options, votes, expenses, media_items;
```

3. **Subscribing before auth** — create/join channels after the session resolves; re-subscribe on
   `SIGNED_IN`. Token refresh mid-session can drop channels — handle `CHANNEL_ERROR` by resubscribe.
4. Client filter mismatch: `filter: 'trip_id=eq.<id>'` must match the seeded trip UUID
   ([09-import-and-seed.md](09-import-and-seed.md)).

## 7. Offline sync conflicts

**Symptom**: two members edited the same checklist item / expense offline; values diverge after sync.

**Policy**: **last-write-wins (LWW)** on row level, using server receipt time — documented in
[07-pwa-and-offline.md](07-pwa-and-offline.md). Checklists and expense *splits* are the risk spots;
the outbox replays mutations in order.

**Inspect the outbox**

```text
DevTools → Application → Storage → IndexedDB → <app-db> → object store: outbox
```

- Each record: queued mutation (table, op, payload, created_at, attempts). Failed entries retry on
  next Background Sync event (or app focus on iOS).
- If a mutation permanently fails (e.g. row deleted remotely), the outbox marks it failed and the UI
  surfaces it — do not silently drop.
- [ ] Add a one-line member-facing note in the app: "last edit wins" on shared lists.

## 8. Local dev environment issues

**Symptom**: wrong Node behavior, pnpm missing, weird Windows failures.

| Symptom | Fix |
|---|---|
| Node ≠ 22.x | `node -v` must print v22.x — use nvm-windows/fnm to switch; engines field enforces it. |
| pnpm missing / wrong major | `corepack enable && corepack prepare pnpm@10 --activate`; `pnpm -v` → 10.x. Never npm/yarn (repo rule). |
| Corepack signature prompt on Windows | `corepack enable` once from an elevated shell; answer the download prompt. |
| Windows path errors in scripts | prefer POSIX-style paths inside repo scripts; quote paths in Git Bash (`"C:\…"` with backslashes breaks — use forward slashes). |
| `supabase start` fails / Docker absent | Local stack is optional — the project is linked to the remote (`supabase/.temp/linked-project.json`); `pnpm supabase db push` targets remote. Never run seed against remote twice without the idempotency check ([09-import-and-seed.md](09-import-and-seed.md)). |
| Port 3000 busy | `pnpm dev -- -p 3001`; update the Auth redirect allowlist if you test magic links there ([§2](#2-magic-link-email-not-arriving)). |

## 9. Vercel deploy fails

**Symptom**: build error or runtime 500 on the Vercel deployment.

1. **Missing env vars** — Project → Settings → Environment Variables must define
   `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for Production **and**
   Preview. A missing var fails only at runtime — check Function logs, not just build.
2. **Node version mismatch** — Project → Settings → General → Node.js Version = 22.x (match `engines`).
3. **Read build logs** — deploy page → Building → full log; runtime errors: Deployments → Functions tab.
4. CLI fallback for logs:

```bash
pnpm vercel logs <deployment-url> --output json | tail
```

5. First deploy after env change **must be redeployed** — env edits don't retroactively apply.

## 10. Timezone bugs

**Symptom**: times shift by 2–3 hours, or a day flips for one member.

**Rules** (hard rule 4 / [03-data-model-and-rls.md](03-data-model-and-rls.md)):

1. Store **every** instant as `timestamptz` — never `timestamp`. Flight departures seeded with explicit
   offsets: `2026-10-04T16:35:00+03:00` (IL), `2026-10-08T10:25:00+02:00` (HU).
2. Render with `Intl.DateTimeFormat` with the **target** zone (`Europe/Budapest` on-trip screens,
   `Asia/Jerusalem` for IL-side reminders) — never the device's local zone by accident.
3. Trip dates (2026-10-04 → 2026-10-08): Israel is UTC+3 (IDT) and Budapest UTC+2 (CEST) on all trip
   days — DST changes later in October, so offsets are stable during the trip.
4. Day boundary = **Budapest local date**, everywhere (Today dashboard day selection included).

**Test checklist**

- [ ] IZ291 shows 16:35 (Israel time) and IZ292 shows 10:25 (Budapest time) with tz labels.
- [ ] An item at 2026-10-05T00:30+02:00 appears on Oct 5 for a member whose phone is set to
      Asia/Jerusalem (not Oct 5 02:30 reinterpreted).
- [ ] Date picker and stored value agree around midnight Budapest time.
- [ ] Offline-cached items render identical times after airplane-mode reload.
