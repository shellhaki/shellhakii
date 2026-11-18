# fix-share-links: give projects and gallery items real permalinks

Report file: `.orch/fix-share-links.report.md`. First read `specs/tasks/_common.md` (rules still apply), then this whole file.

## The bug (reproduced by the orchestrator)

Project cards and the gallery lightbox render `<EngagementBar>` without a `shareUrl`, so "copy link" copies the page URL (`/projects`, `/gallery`) instead of the item. There are no item pages for projects or gallery media, so we add anchor and query permalinks.

## You own
- `src/components/project-card.tsx`, `src/components/project-card.test.tsx`
- `src/app/gallery/gallery-grid.tsx`, and a new `src/app/gallery/gallery-grid.test.tsx` if it does not exist

Do not touch anything else. Another agent is changing `ShareButton` and `EngagementBar` in parallel. The contract you rely on: `EngagementBar` accepts `shareUrl?: string`, and site-relative values are turned into absolute URLs at click time. Just pass the relative strings below.

## Exact changes

### Projects (`project-card.tsx`)
- Root `<article>` gets `id={`project-${p.id}`}` and the class `scroll-mt-24` (so the sticky header doesn't cover it when the anchor scrolls).
- Pass `shareUrl={`/projects#project-${p.id}`}` to `EngagementBar`.
- Nothing else changes: same classes, same structure, same comment toggle.

### Gallery (`gallery-grid.tsx`)
- Each grid tile `<li>` gets `id={`media-${m.id}`}`.
- The lightbox `EngagementBar` gets `shareUrl={`/gallery?item=${current.id}`}`.
- Deep link: on mount, read `new URLSearchParams(window.location.search).get("item")` inside a `useEffect` (not during render; the page is statically prerendered, so do NOT use `useSearchParams`). If it matches the id of an item in `media`:
  1. Set the filter to `"all"`.
  2. Open the lightbox at that item's index.
  3. Scroll its tile into view with `document.getElementById(`media-${id}`)?.scrollIntoView({ block: "center" })`.
  If it matches nothing, do nothing. Run this once on mount only.
- While the lightbox is open, keep the address bar in sync with `window.history.replaceState(null, "", `/gallery?item=${id}`)` whenever the current item changes. On close, use `replaceState(null, "", "/gallery")`. Use `replaceState`, never `pushState`, so the back button is not polluted.
- Nothing else changes visually.

## Tests (Vitest + Testing Library, jsdom; polyfill `HTMLDialogElement.prototype.showModal` and `close` in the test file if missing)
- `PL-1`: the project card root has `id="project-<id>"` and the class `scroll-mt-24`.
- `PL-2`: the project card passes `shareUrl="/projects#project-<id>"` to `EngagementBar`. Mock `@/components/social/engagement-bar` and assert the props.
- `PL-3`: gallery tiles have `id="media-<id>"`.
- `PL-4`: opening an item gives the lightbox `EngagementBar` `shareUrl="/gallery?item=<id>"` and calls `history.replaceState` with that path. Closing replaces with `/gallery`.
- `PL-5`: mounting with `?item=<existing id>` (set via `window.history.replaceState` before render) opens the lightbox on that item.
- `PL-6`: mounting with `?item=<unknown>` leaves the lightbox closed and throws no error.
- Existing tests in these files keep passing (update them only if they assert something this task deliberately changes).

## Definition of done
```
npx tsc --noEmit
npx eslint src/components/project-card.tsx src/app/gallery
npx vitest run src/components/project-card.test.tsx src/app/gallery
```
All green, then write the report and stop.
