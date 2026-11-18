# Rules for every work package

You are one of four parallel agents. Each works in its own git worktree (your current directory). Claude (the orchestrator) will review and merge your work, so stay inside your lane.

## Read first
1. `AGENTS.md`: this Next.js version has breaking changes. Before using any Next API, read the relevant file under `node_modules/next/dist/docs/` (it is available in your worktree).
2. `specs/social-spec.md`: the whole file. It is the source of truth for behavior, contracts and acceptance criteria (AC ids).
3. Existing patterns to reuse instead of reinventing: `src/lib/api.ts` (HttpError, adminRoute, readJson, text), `src/lib/db.ts` (getSql), `src/lib/mail.ts` (sendMail, siteUrl, escapeHtml), `src/lib/rate-limit.ts`, `src/lib/admin-auth.ts`, `src/app/api/subscribe/route.ts` and `src/app/api/contact/route.ts` (route style), `src/lib/ui.ts` (button classes), Tailwind tokens in `src/app/globals.css` (`text-muted`, `border-line`, `bg-pill`, `font-serif`).

## Hard rules
- Edit or create ONLY the paths listed under "You own" in your task file, plus your own `*.test.ts(x)` files next to the code. Everything else is read-only, including stubs owned by another package (they compile today; the real versions will be merged later).
- Do NOT change `package.json`, lockfile, `vitest.config.ts`, `vitest.setup.ts`, `tsconfig.json`, `db/schema.sql`, `src/lib/social/types.ts`, `.env*`.
- Do NOT commit, push, run `next dev` or `next build`, touch the network, or connect to any database. Tests must mock the store layer and `fetch`.
- No `any`, no `@ts-ignore`, no `eslint-disable` (except the existing `@next/next/no-img-element` pattern). Never log secrets, OTP codes, tokens or email addresses.
- Match the existing code style (TypeScript strict, small functions, comments only where the why is not obvious).
- If you need something outside your lane, do not hack around it. Work against the documented contract, and list it under "Requests" in your report.

## Tests
- Vitest. Test names start with the AC id: `it("AC-A3: rejects a code after 5 wrong attempts", ...)`. Every AC assigned to you must be covered by at least one test.
- Component tests start with `// @vitest-environment jsdom`. jsdom may lack `HTMLDialogElement.showModal`/`close`; polyfill inside your test file if needed.
- Mock modules with `vi.mock(...)`. Route handler tests call the exported handler with a real `Request`.

## Definition of done (run these in your worktree until all are green)
Route types (`RouteContext`, `PageProps`) are generated, not committed: run `npx next typegen` once after you add or rename a route or page.
```
npx tsc --noEmit
npm run lint
npx vitest run <your test paths>
npx vitest run --coverage --coverage.include=<your logic paths>   # >= 85% lines on logic files
```

## Finish
Write `.orch/<wp>.report.md` with: summary, files created or changed, a table mapping every AC to its test names, deviations from the spec (with reasons), requests for the orchestrator, and the output summary of the four commands above. Then stop. Do not start extra work.
