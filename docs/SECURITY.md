# Security

## Authentication

- Email + password. Passwords hashed with **bcrypt (cost 12)**; the hash field is
  `select: false` and never mapped into any DTO.
- Unknown email and wrong password return the same `401 INVALID_CREDENTIALS`, and login
  always performs one bcrypt comparison (dummy hash) to avoid user enumeration by timing.
- On success the API sets `bl_session` — an **HS256 JWT** (`sub`, `role`, `csrf`, `exp`,
  default 8h) in an **HTTP-only** cookie. JavaScript never sees the session token.
- Every request re-loads the user: deactivated users and role changes invalidate sessions.
- Expired sessions return `401 SESSION_EXPIRED`; the web app redirects to `/login?expired=1`.
- Demo passwords come from `SEED_*_PASSWORD` env vars (defaults only outside production).

## Cookies

| Attribute         | Value                                                                                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HttpOnly`        | always                                                                                                                                                                                                                                   |
| `Secure`          | `COOKIE_SECURE` (default: true in production)                                                                                                                                                                                            |
| `SameSite`        | `COOKIE_SAMESITE` — `lax` when web and API share a site (e.g. `localhost:3000` + `localhost:4000`, or `app.example.com` + `api.example.com`); `none` (+Secure) when they are on different sites (e.g. `*.vercel.app` + `*.onrender.com`) |
| `Domain` / `Path` | `COOKIE_DOMAIN` (optional) / `/`                                                                                                                                                                                                         |

The env validation refuses `SameSite=None` without `Secure`.

## CSRF

Synchronizer token bound to the session: the login and `/auth/me` responses include a
`csrfToken` that is also embedded in the signed JWT. The SPA keeps it in memory and sends
it as `X-CSRF-Token` on every POST/PATCH; the API compares in constant time. A cross-site
page can make the browser send the cookie but cannot read or forge the token. In addition,
state-changing requests must be `application/json` (rejects simple form posts with 415),
and CORS only allows the configured origin to send the custom header.

## Authorisation

- Router-level `authorize('AUTHOR')` / `authorize('ADMIN')`.
- Author identity is **derived from the session** (`req.user.authorId`) — never from a
  request parameter. Every author query filters by it.
- Cross-author access returns **404**, not 403, so ids can't be probed.
- Internal notes live in a separate collection only read by admin endpoints; SSE events
  carry ids only and admin-only event types are never sent to authors.
- Mass assignment prevented by strict Zod schemas (`.strict()` on updates) and explicit
  `$set` field lists in services.

## Input validation & errors

- Zod validation for params (400), query (400) and bodies (422) with field-level details.
- Malformed JSON → 400; body limit 100 kB → 413; Mongo cast errors → 400; duplicate keys → 409.
- Unexpected errors → generic 500 with a `requestId`; stack traces only in server logs.
- User-generated content is rendered as text by React (no `dangerouslySetInnerHTML`).

## CORS & headers

- `cors` with an explicit allow-list (`CORS_ORIGINS`), `credentials: true`, limited methods
  and headers.
- `helmet` defaults on the API; the web app sets `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy`.

## Rate limiting

| Scope                             | Limit       |
| --------------------------------- | ----------- |
| Login (IP + email, failures only) | 10 / 15 min |
| AI endpoints (per admin)          | 20 / min    |
| Ticket creation (per author)      | 10 / 10 min |
| Global (per IP)                   | 600 / min   |

In-memory stores (single instance). Use a Redis store for multiple instances.

## Secrets & AI keys

- All secrets via environment variables, validated at startup (`config/env.ts`);
  `.env*` files are git-ignored; `.env.example` contains placeholders only.
- AI keys exist only in the API process; the frontend has no AI configuration besides
  displaying provider/model names returned by an admin endpoint.

## Logging & privacy

- Pino structured logs with request ids. HTTP logs contain method, URL and status only.
- Redaction for cookies, authorization headers, CSRF tokens, passwords, hashes, API keys,
  and `body` / `description` fields.
- AI failures log kind, model, task and latency — never prompts or ticket text.
- The AI run log stores metadata only (no prompts/outputs).
- Audit summaries for internal notes don't include the note text.

## Data handling in this repository

The BookLeaf-provided dataset (`data/bookleaf_sample_data.json`) is git-ignored and must be
supplied locally; tests use a synthetic fixture.

## Known limitations

- JWT sessions cannot be revoked individually before expiry (re-reading the user handles
  deactivation; a server-side session store would add per-session revocation).
- No MFA / password reset flow (out of scope for the brief).
- Rate limits and circuit breaker are per process.
- Attachments are not uploaded (UI only), so no file scanning is implemented.
- No CSP on the Next.js app yet (Ant Design's CSS-in-JS needs a nonce setup).
