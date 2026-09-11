# Email templates (Supabase Auth)

Hebrew (RTL) branded templates for the two login emails. Supabase hosts the
templates — these files are the version-controlled source; applying them is a
2-minute dashboard paste by the owner (no migration, no deploy).

## Files

| File | Supabase template slot | Subject line to set |
|---|---|---|
| `confirm-signup.html` | Confirm signup (first login) | `הכניסה לבודפשט 2026 — אישור כתובת המייל` |
| `magic-link.html` | Magic Link (returning logins) | `קוד הכניסה שלך לבודפשט 2026` |

## Apply steps (owner, dashboard)

1. Open Supabase Dashboard → project `zgvpchdqudheiohlrrvm` → Authentication → Email Templates.
2. Select **Confirm signup** → replace **Subject** and **Message body** with this repo's
   `confirm-signup.html` content → Save.
3. Select **Magic Link** → replace **Subject** and **Message body** with `magic-link.html` → Save.
4. Send yourself a test: request a link from `/login`, confirm the branded layout, the
   working button, and (magic link only) the 6-digit code box path.

## Rules

- Keep `{{ .ConfirmationURL }}` and `{{ .Token }}` placeholders byte-exact — Supabase
  renders them server-side.
- Keep the footer neutral ("ignore this email") — never hint at allowlist membership.
- Keep the same-browser warning in both templates: links are single-use and bound to the
  requesting browser (PKCE). The manual code path is the reliable fallback.
- After editing, update this README with the date + who applied it.
