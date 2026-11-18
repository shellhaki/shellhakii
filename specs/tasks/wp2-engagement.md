# WP2: engagement (likes, comments, posts) backend

Report file: `.orch/wp2.report.md`. First read `specs/tasks/_common.md`, then `specs/social-spec.md` (sections 3, 5, 6, 9 "Engagement").

## You own
- `src/lib/social/engagement.ts`, `comments.ts`, `targets.ts`, `store.ts`, and `posts.ts` (replace the stub, keep exported names and signatures: `listPosts`, `getPost`)
- `src/app/api/likes/**`, `src/app/api/comments/**`, `src/app/api/engagement/**`, `src/app/api/admin/posts/**`
- tests next to them

You depend on WP1 only through two existing stubs: `getViewer()` from `@/lib/auth/session` (returns `Viewer | null`) and `assertSameOrigin(req)` from `@/lib/auth/origin`. Import them exactly like that and mock them in tests. Never read cookies yourself.

## Build
- `store.ts`: the ONLY file with SQL for this package. Batch queries (no N+1): one query for like counts, one for comment counts, one for the viewer's likes, for up to 50 targets. Keyset pagination for comments and posts with cursor `base64url("<createdAtISO>|<id>")`; reject malformed cursors with 400.
- `targets.ts`: `validateTarget(type, id)`: `post|project|gallery` must exist in the DB (uuid format check first); `article` id must match `^[0-9a-f]{6,32}$` and exist in `getArticles()` from `@/lib/medium`.
- `engagement.ts`: `setLike`, `removeLike`, `getSummaries(targets, viewerId|null)`; `comments.ts`: `listComments`, `addComment` (trim, 1-1000 chars, at most 2 URLs, 5 per minute per viewer using `rateLimited`), `deleteComment(id, viewer, isAdmin)`.
- `posts.ts`: `listPosts`, `getPost` (cached with `"use cache"`, `cacheLife`, `cacheTag("posts")` exactly like `getProjects` in `src/lib/projects.ts`), plus uncached write helpers `createPost`, `updatePost`, `deletePost` used by the admin routes.
- Routes: `PUT` and `DELETE /api/likes`, `GET /api/engagement`, `GET` and `POST /api/comments`, `DELETE /api/comments/[id]`, `POST /api/admin/posts`, `PATCH` and `DELETE /api/admin/posts/[id]`. Use `RouteContext<...>` typed params like `src/app/api/admin/projects/[id]/route.ts`. Admin post routes use `adminRoute` and call `revalidateTag("posts", { expire: 0 })`. Public mutating routes call `assertSameOrigin` first, then `getViewer()`; 401 when null. Map `HttpError` to JSON. All responses match the DTOs in `src/lib/social/types.ts`.

## Acceptance criteria you must prove with tests
AC-E1 to AC-E10, AC-G2, AC-G3.
