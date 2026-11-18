# Social layer spec: posts, likes, comments, email-OTP login

Status: planned. Owner: shellhaki. Implementation: orchestrated Muse Code agents (see section 12), verified by Claude.

## 1. Goals

- Haki can publish short text **posts** (like X). Anyone can read them, copy a link to one, and like or comment.
- Visitors can **like** and **comment** on: posts, projects, articles, gallery items. Nothing else.
- Liking or commenting requires being **signed in**. Reading, counting and sharing never require it.
- Sign-in is **passwordless email OTP**: enter email, get a 6-digit code, enter it. Same flow for new and returning people. New people become newsletter subscribers (section 3.4).
- Sessions persist with a short-lived access token plus a rotating refresh token. If the session is lost, the visitor only re-enters their email and a fresh code.
- UX must never block reading. Sign-in appears only after an explicit like or comment attempt, and the attempted action completes automatically afterwards.

Non-goals (v1): passwords, social logins, replies to comments, editing comments, images in posts, notifications, moderation queues, per-user profiles pages.

## 2. Architecture

- Next.js App Router (see AGENTS.md: this Next version differs from older docs; read `node_modules/next/dist/docs/` before using Next APIs).
- Neon Postgres via `getSql()` in `src/lib/db.ts`. Email via `sendMail` in `src/lib/mail.ts`. Rate limiting via `rateLimited` in `src/lib/rate-limit.ts`.
- Layers per feature: `store.ts` (only place with SQL) -> logic modules (pure, take store functions via import so tests can `vi.mock` the store) -> route handlers (thin: parse, validate, call logic, map errors) -> UI.
- Route handlers set cookies. Server Components may only **read** the access cookie, never refresh. Client code refreshes through `/api/auth/me` (section 4).
- No new runtime dependencies. Crypto with `node:crypto`. Dev dependencies for tests only (already installed): vitest, jsdom, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom, @vitest/coverage-v8.

## 3. Data model (`db/schema.sql`, idempotent, already applied)

```sql
alter table subscribers add column if not exists display_name text;
alter table subscribers add column if not exists email_verified_at timestamptz;

otp_codes(id uuid pk, email text, code_hash text, expires_at timestamptz,
          attempts int default 0, used_at timestamptz, created_at timestamptz default now())
sessions(id uuid pk, subscriber_id uuid fk -> subscribers on delete cascade,
         family_id uuid, refresh_hash text unique, created_at, family_created_at,
         expires_at, rotated_at, revoked_at, user_agent text)
posts(id uuid pk, body text check (char_length(body) between 1 and 500), created_at, updated_at)
likes(subscriber_id uuid fk cascade, target_type text, target_id text, created_at,
      primary key (subscriber_id, target_type, target_id))
comments(id uuid pk, subscriber_id uuid fk cascade, target_type text, target_id text,
         body text check (char_length(body) between 1 and 1000), created_at, deleted_at)
```

`target_type` is one of `post | project | article | gallery`. `target_id` is text because article ids are Medium hex ids, the rest are uuids.

### 3.4 Identity and newsletter rules

- A viewer is a `subscribers` row. Email is never shown publicly. Comments show `display_name`.
- Successful OTP verification sets `email_verified_at`.
- New email: create row, `status='active'`, `confirmed_at=now()` (OTP proved ownership, no second confirm email).
- Existing `pending`: becomes `active`.
- Existing `unsubscribed`: **stays unsubscribed** (respect opt-out) but the person can still sign in, like and comment.
- `display_name` is optional input after first verification (2-30 chars). If skipped it defaults to first 2 letters of the email local part plus `***`.

## 4. Auth design

### 4.1 OTP
- Code: 6 digits from `crypto.randomInt`. Stored as `HMAC-SHA256(AUTH_SECRET, email + ":" + code)` hex. Never stored or logged in plain text.
- Valid 10 minutes, single use, max 5 wrong attempts per code (then code is dead). A new request invalidates older unused codes for that email.
- Request limits: 1 per email per 60 s, 5 per email per hour, 10 per IP per hour. Response is always `{ ok: true }` for a well-formed email (no account enumeration). Over limit: 429.
- Email subject `Your shellhaki code: 123456`, plain text plus simple HTML, says it expires in 10 minutes and to ignore if not requested.
- Comparison with `timingSafeEqual`.

### 4.2 Tokens and cookies
- Access token cookie `viewer_at`: `v1.<subscriberId>.<expUnix>.<hmac>`; HMAC-SHA256 with `AUTH_SECRET`; lifetime 15 min.
- Refresh token cookie `viewer_rt`: `<sessionId>.<secret>` where secret is 32 random bytes (hex). DB stores `sha256(secret)` only. Lifetime 30 days, **rotated on every refresh**. Absolute cap 90 days from `family_created_at`.
- **Reuse detection**: presenting a refresh token whose session is already rotated revokes the whole family (`revoked_at` on all rows with that `family_id`) and returns 401.
- Cookie flags: `httpOnly`, `sameSite=lax`, `secure` in production, `path=/`. `maxAge` 15 min / 30 days.
- Logout revokes the session family and clears both cookies.

### 4.3 Endpoints
| Method and path | Body | Success | Errors |
|---|---|---|---|
| `POST /api/auth/otp/request` | `{email}` | 200 `{ok:true}` | 400 invalid email, 429 limits, 503 not configured |
| `POST /api/auth/otp/verify` | `{email, code, displayName?}` | 200 `{viewer, isNew}` + sets both cookies | 400 malformed, 401 `invalid_or_expired`, 429 |
| `POST /api/auth/refresh` | none | 200 `{viewer}` + rotates cookies | 401 and clears cookies |
| `POST /api/auth/logout` | none | 200 `{ok:true}`, clears cookies | none |
| `GET /api/auth/me` | none | 200 `{viewer: Viewer \| null}`; if access cookie expired but a valid refresh exists, it refreshes inline and sets cookies | never 401 |
| `PATCH /api/auth/me` | `{displayName}` | 200 `{viewer}` | 401 not signed in, 400 invalid |

Every mutating route (POST, PUT, PATCH, DELETE) under `/api/auth`, `/api/likes`, `/api/comments` calls `assertSameOrigin(req)`: requires `Content-Type: application/json` when there is a body and, if an `Origin` header is present, it must equal the request origin (else 403).

## 5. Engagement design

- Target validity: `post|project|gallery` must exist in DB; `article` must be a 6-32 char hex id present in the cached Medium feed. Invalid target -> 404.
- **Likes**: `PUT /api/likes {targetType,targetId}` (idempotent insert) and `DELETE /api/likes {targetType,targetId}` (idempotent delete). Both return the fresh `EngagementSummary`. Needs viewer (401).
- **Summaries (batch, public)**: `GET /api/engagement?targets=project:<id>,article:<id>` (max 50) returns `{ [ "type:id" ]: EngagementSummary }`. `liked` is true only when a viewer cookie is valid, else false.
- **Comments**: `GET /api/comments?targetType&targetId&cursor?` newest first, 20 per page, returns `{comments: CommentDTO[], nextCursor: string|null}`, deleted ones excluded. `POST /api/comments {targetType,targetId,body}` needs viewer, body trimmed 1-1000 chars, at most 2 URLs, 5 comments per minute per viewer. `DELETE /api/comments/[id]` soft-deletes (`deleted_at`), allowed for the author or an admin session (`isAdmin()` from `src/lib/admin-auth.ts`).
- Comment text is always rendered as plain text (React escaping), never as HTML.
- **Posts**: public `listPosts({cursor?, limit})` and `getPost(id)` in `src/lib/social/posts.ts` (server, cached with tag `posts`). Admin only: `POST /api/admin/posts {body}`, `PATCH /api/admin/posts/[id] {body}`, `DELETE /api/admin/posts/[id]`, all using `adminRoute` from `src/lib/api.ts`; they call `revalidateTag("posts", { expire: 0 })`.

## 6. Shared contracts (`src/lib/social/types.ts`, already in repo, do not change without Claude's approval)

`TARGET_TYPES`, `TargetType`, `Viewer {id,email,displayName}` (email only ever returned to that viewer), `EngagementSummary {likes,comments,liked}`, `CommentDTO`, `PostDTO`, `targetKey(type,id)`, `isTargetType(x)`.

## 7. UI design

Principles: reading never blocked; no modal on load; sign-in only after an explicit like or comment; the pending action resumes after sign-in; optimistic updates with rollback; fully keyboard and screen-reader usable; works at 320px.

Components (public API fixed so integration can proceed in parallel):

- `src/components/social/viewer-provider.tsx`: `<ViewerProvider>` and `useViewer(): { viewer: Viewer|null, status: "loading"|"ready", signOut(): Promise<void>, requireSignIn(): Promise<Viewer|null> }`. On mount calls `GET /api/auth/me`. `requireSignIn()` resolves immediately if signed in, else opens the auth dialog and resolves with the viewer after success or `null` if dismissed.
- `src/components/social/auth-dialog.tsx` (rendered by the provider): native `<dialog>`; step 1 email; step 2 6-digit code (autofocus, `inputMode=numeric`, `autocomplete=one-time-code`, paste friendly, resend after 60 s countdown, back link); step 3 optional display name for new viewers with "Skip". Inline errors. Esc or "Not now" closes.
- `src/components/social/engagement-bar.tsx`: `<EngagementBar targetType targetId shareUrl? initial? onCommentsClick? />` shows like button with count, comment button with count, share button. Fetches its summary lazily if `initial` is omitted (batched via a tiny request coalescer so a list of 12 cards makes 1 request).
- `src/components/social/like-button.tsx`, `share-button.tsx` (copies the permalink with `navigator.clipboard`, falls back to a hidden textarea plus `execCommand` when the API is missing, and announces "Link copied" in an `aria-live` region; no `navigator.share`).
- `src/components/social/comment-section.tsx`: `<CommentSection targetType targetId defaultOpen? />` collapsible, loads on open, composer with counter, disabled-looking "Sign in to comment" affordance that triggers `requireSignIn()` only on click, delete own comment, load more.
- `src/lib/social/client.ts`: `apiFetch(url, init)` that on 401 calls `/api/auth/me` once to refresh, retries once, never loops.

Integration points (done by integration agent): `ViewerProvider` in `src/app/layout.tsx`; `EngagementBar` on `ProjectCard`, article page header/footer, gallery lightbox (current item), post cards; `CommentSection` on article page, gallery lightbox (collapsed), post permalink (open), project card (collapsed, expands inline). New pages `/posts` (feed with "Load more") and `/posts/[id]` (permalink, `generateMetadata` uses body, not found handling). New nav item "Posts" (nav must still fit 320px width). Admin: composer (textarea, 500 counter, publish) and recent posts list with delete in a new `posts-section.tsx` rendered by the dashboard.

## 8. Environment

New required env var `AUTH_SECRET` (random 32+ bytes hex). Missing -> auth routes return 503 with a clear message. Add to `.env.example` and Vercel.

## 9. Acceptance criteria (every one must map to at least one named test)

Test names start with the AC id, e.g. `it("AC-A3: rejects a code after 5 wrong attempts", ...)`.

### Auth core (WP1)
- AC-A1 OTP is 6 digits and generated with a CSPRNG; hash differs per email; plain code never stored or logged.
- AC-A2 Request returns `{ok:true}` for unknown and known emails alike; malformed email -> 400.
- AC-A3 Code expires after 10 min; single use; dead after 5 wrong attempts; new request invalidates old codes.
- AC-A4 Request rate limits (60 s per email, 5/h per email, 10/h per IP) return 429.
- AC-A5 Verify with a correct code creates or activates the subscriber, keeps `unsubscribed` unsubscribed, sets `email_verified_at`, returns `isNew` correctly, and sets both cookies with the right flags.
- AC-A6 Wrong or expired code -> 401 `invalid_or_expired` with no cookies; comparison is timing safe.
- AC-A7 Access token validates until expiry, rejects tampered payload, wrong secret, wrong version.
- AC-A8 Refresh rotates the token, issues new cookies, extends expiry, honors the 90-day cap.
- AC-A9 Reusing a rotated refresh token revokes the whole family and returns 401.
- AC-A10 `GET /api/auth/me` returns `viewer:null` when signed out, transparently refreshes when only the refresh cookie is valid, and never returns 401.
- AC-A11 Logout revokes the family and clears cookies; subsequent refresh fails.
- AC-A12 `assertSameOrigin` rejects cross-origin and non-JSON mutating requests.
- AC-A13 Missing `AUTH_SECRET` -> 503 with a clear message; nothing throws unhandled.
- AC-A14 `PATCH /api/auth/me` validates display name (2-30 chars, trimmed, no control chars).

### Engagement (WP2)
- AC-E1 Like and unlike are idempotent; counts are correct; two viewers counted separately.
- AC-E2 Unauthenticated like or comment -> 401.
- AC-E3 Invalid target type or nonexistent target -> 404 or 400 as specified; article ids validated against the feed.
- AC-E4 Batch summary returns counts for up to 50 targets, rejects more, `liked` reflects the viewer only.
- AC-E5 Comment validation: trimmed, 1-1000 chars, at most 2 URLs, 5 per minute per viewer.
- AC-E6 Comments list is newest first, paginated by cursor, excludes soft-deleted.
- AC-E7 Only the author or admin can delete a comment; others get 403; unknown id 404.
- AC-E8 Post create/edit/delete are admin only (401 otherwise), validate 1-500 chars, revalidate tag `posts`.
- AC-E9 `listPosts` orders newest first with cursor pagination; `getPost` returns null for unknown id.
- AC-E10 All mutating routes enforce `assertSameOrigin`.

### UI core (WP3)
- AC-U1 No dialog or network write happens on render; signed-out like click opens the auth dialog.
- AC-U2 After successful sign-in the original like or comment completes without a second click.
- AC-U3 Auth dialog: email validation, code step with resend countdown, wrong code shows an inline error and keeps focus, Esc and "Not now" close it and resolve `requireSignIn()` with null.
- AC-U4 Like is optimistic and rolls back with an error message on failure; count updates; `aria-pressed` reflects state.
- AC-U5 Share copies the exact permalink, announces "Link copied" via `aria-live`, falls back when clipboard API is missing.
- AC-U6 Comment section loads only when opened, shows the composer with counter and limit, signed-out affordance triggers sign-in on click only, delete own comment, load more works.
- AC-U7 A 401 triggers exactly one silent refresh and one retry; never loops.
- AC-U8 EngagementBar coalesces summary requests for many instances into one batch call.
- AC-U9 All controls have accessible names; dialog traps focus and restores it on close.

### Integration (WP4)
- AC-I1 `/posts` renders posts newest first with engagement bars and a working "Load more"; empty state when none.
- AC-I2 `/posts/[id]` renders one post with its comments open, correct metadata, and 404 for unknown id.
- AC-I3 Admin composer enforces 1-500 chars with live counter, publishes via the admin API, refreshes the list, and delete asks to confirm.
- AC-I4 `EngagementBar` appears on project cards, article pages, gallery lightbox and posts, and `CommentSection` on article pages, gallery lightbox, project cards and post permalinks, without breaking existing layouts.
- AC-I5 Nav includes "Posts" and still fits at 320px width without horizontal scroll.
- AC-I6 `ViewerProvider` is mounted once in the root layout; pages remain statically prerenderable where they were before (build output unchanged for `/`, `/projects`, `/gallery`, `/articles`).

### Global
- AC-G1 `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build` all pass.
- AC-G2 No secret, OTP, token or email address appears in logs or API responses to other viewers.
- AC-G3 No `any`, no `@ts-ignore`, no `eslint-disable` except the existing `@next/next/no-img-element` pattern.

## 10. Test plan

- Runner: Vitest, `npm test` (watch off), `npm run test:coverage`. Config in `vitest.config.ts`, setup in `vitest.setup.ts` (jest-dom matchers, RTL cleanup, no-op mocks for `next/cache`, `server-only` aliased to an empty module).
- Logic and route tests mock the store module with `vi.mock("@/lib/auth/store")` and friends; no test touches the network or a real database.
- Route handler tests call the exported `POST`/`GET` with a real `Request` and assert status, JSON and `Set-Cookie`.
- Component tests use React Testing Library and `user-event`, with `fetch` mocked per test.
- Coverage target: at least 85% lines for `src/lib/auth/**` and `src/lib/social/**` logic files.
- SQL itself is verified separately by Claude with a smoke script against the real database and the Resend test address (`delivered+...@resend.dev`), then cleaned up.

## 11. Work packages (parallel, disjoint files)

| WP | Scope | Owns (may create or edit) |
|---|---|---|
| WP1 auth-core | OTP, sessions, cookies, auth routes, origin check | `src/lib/auth/**`, `src/app/api/auth/**` |
| WP2 engagement | likes, comments, posts logic, routes | `src/lib/social/engagement.ts`, `targets.ts`, `posts.ts`, `comments.ts`, `store.ts`, `src/app/api/likes/**`, `src/app/api/comments/**`, `src/app/api/engagement/**`, `src/app/api/admin/posts/**` |
| WP3 ui-core | provider, dialog, bar, buttons, comments UI, client fetch | `src/components/social/**`, `src/lib/social/client.ts` |
| WP4 integration | pages, admin composer, wiring into existing UI, nav, layout | `src/app/posts/**`, `src/app/admin/posts-section.tsx`, edits to `src/app/layout.tsx`, `src/app/admin/dashboard.tsx`, `src/components/project-card.tsx`, `src/components/nav.tsx`, `src/app/gallery/gallery-grid.tsx`, `src/app/articles/[id]/page.tsx` |

Stubs with the final public signatures already exist for every module (they compile; real code replaces them). Each agent edits only what it owns plus its own tests (`*.test.ts(x)` next to the code).

## 12. Orchestration method

1. Claude writes this spec, contracts, stubs, test tooling and the schema, and snapshots the working tree.
2. One git worktree per WP, branched from the snapshot, `node_modules` symlinked.
3. One visible Terminal window per WP runs `muse exec --prompt-file specs/tasks/<wp>.md`, then writes `.orch/<wp>.exit` and closes.
4. Claude waits for a single background watcher (no polling), then verifies each WP: file ownership respected, `tsc`, lint, tests, coverage, diff review, then merges the patches into the main tree.
5. Claude runs the integrated checks (AC-G1..G3), smoke-tests SQL against the real database, screenshots the UI, fixes small issues, and re-delegates large ones.
6. Claude writes the playbook for reuse as a skill (`specs/muse-orchestration-playbook.md`).
