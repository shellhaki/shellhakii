# WP3: UI core (provider, auth dialog, engagement bar, comments)

Report file: `.orch/wp3.report.md`. First read `specs/tasks/_common.md`, then `specs/social-spec.md` (sections 4.3, 5, 6, 7, 9 "UI core"). Look at `src/app/contact/contact-form.tsx` and `src/app/gallery/gallery-grid.tsx` (native `<dialog>` usage) for the visual language and conventions.

## You own
- `src/components/social/**` (replace the stubs; keep every exported name, prop type and signature: `ViewerProvider`, `useViewer`, `ViewerContextValue`, `EngagementBar`, `EngagementBarProps`, `CommentSection`, `CommentSectionProps`)
- `src/lib/social/client.ts` (replace the stub, keep `apiFetch(url, init)`)
- tests next to them

The backend (WP1, WP2) is being built in parallel. Code against the endpoint contracts in the spec and mock `fetch` in tests. Do not import server-only modules.

## Build
- `client.ts`: `apiFetch` sends `credentials: "same-origin"` and JSON headers for bodies; on a 401 it calls `GET /api/auth/me` exactly once (shared in-flight promise so concurrent 401s trigger a single refresh), then retries the original request once; never loops (AC-U7).
- `viewer-provider.tsx`: provider and `useViewer` as specified. Render the auth dialog from the provider. `requireSignIn()` returns a promise that resolves with the viewer or null; concurrent calls share the same dialog.
- `auth-dialog.tsx`: native `<dialog>`, 3 steps (email, code, optional display name), resend countdown (60 s), inline errors with `role="alert"`, focus management (autofocus the active input, restore focus to the trigger on close), `Esc` and "Not now" close. Copy: friendly, short.
- `like-button.tsx`, `share-button.tsx`, `engagement-bar.tsx`, `comment-section.tsx` as specified in spec 7. `EngagementBar` fetches summaries through a coalescing batch loader (module-level queue flushed after a short timeout, chunks of 50, one `GET /api/engagement?targets=...` per flush) (AC-U8). Likes are optimistic with rollback and an error message (AC-U4). Clicking like or comment while signed out calls `requireSignIn()` and then performs the action automatically (AC-U2). Nothing is written or shown modally on render (AC-U1).
- Styling: Tailwind with the existing tokens, matches the site (dark and light), works at 320px, tap targets at least 36px, visible `focus-visible` outlines, respects reduced motion.
- Accessibility: accessible names for every control (AC-U9), `aria-pressed` on like, an `aria-live="polite"` region for "Link copied" and errors.

## Acceptance criteria you must prove with tests
AC-U1 to AC-U9, AC-G3.
