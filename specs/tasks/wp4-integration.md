# WP4: integration (pages, admin composer, wiring)

Report file: `.orch/wp4.report.md`. First read `specs/tasks/_common.md`, then `specs/social-spec.md` (sections 5, 7, 9 "Integration"). Study the existing pages you will touch before editing them.

## You own
- `src/app/posts/**` (new `/posts` and `/posts/[id]`), `src/app/admin/posts-section.tsx` (new), plus targeted edits to: `src/app/layout.tsx`, `src/app/admin/dashboard.tsx`, `src/components/project-card.tsx`, `src/components/nav.tsx`, `src/lib/site.ts` (the `nav` array only), `src/app/gallery/gallery-grid.tsx`, `src/app/articles/[id]/page.tsx`
- tests next to them (extract pure presentational components such as `PostCard` or `PostsFeed` so they can be tested with Testing Library; test async server pages by awaiting the component and rendering the result with mocked data)

The backend and UI core are being built in parallel by other agents. Today these exist as stubs with the FINAL signatures: `listPosts` and `getPost` in `@/lib/social/posts`; `ViewerProvider`, `useViewer`, `EngagementBar`, `CommentSection` in `@/components/social/*`; `apiFetch` in `@/lib/social/client`. Import and use them exactly as the spec describes and mock them in tests. Do not edit those files.

## Build
- Mount `<ViewerProvider>` once in `src/app/layout.tsx` around the page content (AC-I6). Keep the existing structure, fonts and metadata.
- `/posts`: server component reads `listPosts()`, renders `PostCard`s (text with preserved line breaks and linkified URLs rendered safely as plain `<a>`, full date, `EngagementBar` with `shareUrl` set to `/posts/<id>`), "Load more" client behavior using `GET /api/posts?cursor=` is NOT available: use a server action or pass the cursor to a client component that calls `apiFetch("/api/posts?cursor=...")`. If you need a public `GET /api/posts` route, add it under `src/app/api/posts/route.ts` (you own that path) delegating to `listPosts` (AC-I1).
- `/posts/[id]`: `getPost`, `notFound()` when null, `generateMetadata` from the body, `EngagementBar` plus `CommentSection defaultOpen` (AC-I2). Handle params with `Suspense` where Next requires it (see how `src/app/articles/[id]/page.tsx` does it).
- Admin: `posts-section.tsx` with composer (textarea, live counter to 500, disabled when empty or over), publish via `POST /api/admin/posts` using helpers from `src/app/admin/upload.ts`, list of recent posts with confirm-before-delete using the existing `DeleteButton`, render it from `dashboard.tsx` (AC-I3).
- Wire engagement: `EngagementBar` on `ProjectCard` (and an inline collapsible `CommentSection`), on the article page near title and footer plus `CommentSection`, in the gallery lightbox for the current item (bar always, comments collapsed) (AC-I4). Server components cannot hold state; add small client wrappers if needed. Do not change how existing pages prerender (AC-I6).
- Nav: add "Posts" (icon from lucide-react, place after Home or after Projects) and keep it fitting at 320px (AC-I5): reduce padding or gaps if needed, never wrap or scroll horizontally. Add the item to the `nav` array in `src/lib/site.ts` and the matching icon in `nav.tsx`.

## Acceptance criteria you must prove with tests
AC-I1 to AC-I5, AC-G3. (AC-I6 and AC-G1 are verified by the orchestrator with `next build`.)
