# WP1: auth core (email OTP, sessions, cookies, auth routes)

Report file: `.orch/wp1.report.md`. First read `specs/tasks/_common.md`, then `specs/social-spec.md` (sections 3.4, 4, 8, 9 "Auth core").

## You own
- `src/lib/auth/**` (replace the stubs `session.ts` and `origin.ts`; keep their exported names and signatures: `getViewer`, `assertSameOrigin`)
- `src/app/api/auth/**`
- tests next to them

## Build
- `src/lib/auth/config.ts`: `getAuthSecret()` throws `AuthConfigError` when `AUTH_SECRET` is missing or shorter than 32 chars; routes map it to 503 `{error:"Sign-in is not configured."}` (AC-A13).
- `src/lib/auth/store.ts`: the ONLY file with SQL (`getSql()` from `@/lib/db`, tagged templates, same style as `src/lib/subscribers.ts`). Functions for: OTP insert/invalidate/lookup/increment attempts/mark used; subscriber upsert by email (rules in spec 3.4, return `{subscriber, isNew}`); subscriber by id; session insert/find by id/mark rotated/revoke family/revoke one. Keep functions small and individually mockable.
- `src/lib/auth/otp.ts`: `generateOtp`, `hashOtp(email, code)`, `requestOtp(email, ip)` (rate limits via `rateLimited`, sends mail via `sendMail`, stores only the hash), `verifyOtp(email, code)` (attempts, expiry, single use, timing-safe compare). Return discriminated results, never throw for normal failures.
- `src/lib/auth/tokens.ts`: sign and verify the access token `v1.<subscriberId>.<exp>.<hmac>`; generate refresh secret; sha256 helper. Pure functions, injectable clock (`now: number = Date.now()` parameter) so tests do not need fake timers.
- `src/lib/auth/session.ts`: `getViewer()` (reads `viewer_at` via `cookies()` from `next/headers`, validates, loads the subscriber, returns `Viewer` or null), `startSession(subscriberId, userAgent)`, `refreshSession(refreshToken)` with rotation, reuse detection and the 90-day cap, `endSession`, cookie helpers that set and clear both cookies with the flags from spec 4.2.
- `src/lib/auth/origin.ts`: `assertSameOrigin(req)` throws `HttpError` (from `@/lib/api`) with status 403 when the `Origin` header is present and differs from the request URL origin, or when a request with a body is not `application/json`.
- Routes under `src/app/api/auth/`: `otp/request`, `otp/verify`, `refresh`, `logout`, `me` (GET and PATCH). Thin handlers, strict validation (email regex like `src/app/api/subscribe/route.ts`, code `^\d{6}$`, display name 2-30 chars trimmed without control characters). Use a small shared helper to map `HttpError`/`AuthConfigError`/unexpected errors to JSON responses like `adminRoute` does.
- `GET /api/auth/me` must refresh inline (spec AC-A10) and never return 401.

## Acceptance criteria you must prove with tests
AC-A1 to AC-A14, AC-G2, AC-G3.

## Notes
- Hash the OTP with `HMAC-SHA256(AUTH_SECRET, email + ":" + code)`. Lowercase and trim emails everywhere.
- Never reveal whether an email exists or is subscribed.
- Use `NextResponse.json` and set cookies on the response (or `cookies()` in route handlers); make sure tests can read `Set-Cookie`.
