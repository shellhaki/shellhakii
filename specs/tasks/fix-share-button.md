# fix-share-button: absolute links and visible copy feedback

Report file: `.orch/fix-share-button.report.md`. First read `specs/tasks/_common.md` (rules still apply), then this whole file. You do not need the full spec.

## The bug (reproduced by the orchestrator)

1. Clicking share on a post copies `/posts/07531125-...`, a path without the site origin. Pasted into WhatsApp or X it is not a link.
2. Nothing visible changes after clicking. The only feedback is an `sr-only` live region, so sighted users never know it worked.
3. The live region says "Link copied" even when copying failed, and never resets, so a second click announces nothing.
4. `EngagementBar` computes a fallback URL from `window.location.href` during render. On the server that is `""`, and on list pages it is the list page URL, not the item.

## You own
- `src/components/social/share-button.tsx`, `src/components/social/share-button.test.tsx`
- `src/components/social/engagement-bar.tsx`, `src/components/social/engagement-bar.test.tsx` (only the share-related lines and tests)

Do not touch any other file. Another agent is updating the callers (`project-card.tsx`, `gallery-grid.tsx`) in parallel. They will pass site-relative `shareUrl` values such as `/projects#project-<id>` and `/gallery?item=<id>`.

## Exact behavior required

### URL resolution (in `ShareButton`, at click time, never during render)
- Prop becomes `url?: string`.
- Copied text = `new URL(url ?? window.location.href, window.location.origin).href`.
  - `"/posts/abc"` on `https://shellhaki.dev` copies `https://shellhaki.dev/posts/abc`
  - `"https://x.com/y"` copies `https://x.com/y` unchanged
  - `"/projects#project-1"` copies `https://shellhaki.dev/projects#project-1`
  - `undefined` copies the current `window.location.href`
- `EngagementBar`: delete the `const url = shareUrl ?? (typeof window ...)` line and pass `shareUrl` straight through: `<ShareButton url={shareUrl} />`.

### States
| State | Trigger | Icon | Visible text next to icon | `aria-label` on button | Live region text | Lasts |
|---|---|---|---|---|---|---|
| idle | initial / after timeout | `Link2` | none | `Copy link` | `""` | until click |
| copied | clipboard write (or fallback) succeeded | `Check` from lucide-react | `Copied` | `Link copied` | `Link copied` | 2000 ms, then idle |
| failed | both clipboard API and fallback failed | `Link2` | `Couldn't copy` in `text-red-500` | `Copy link` | `Couldn't copy link` | 3000 ms, then idle |

- Visible text: `<span className="text-xs">` placed inside the button after the icon, so the button grows and the user sees it. Button classes keep `min-h-9 min-w-9 rounded-full px-2.5`, plus `gap-1.5`.
- The button gets `data-state="idle" | "copied" | "failed"` (tests and styling hook).
- Clicking again while copied or failed starts a fresh cycle: copy again and restart the timer, without stacking timers. Clear the timer on unmount (use a `useRef` for the timeout id plus a cleanup effect).
- To re-announce on repeat clicks, set the live region to `""` and then to the message on the next tick (`setTimeout(..., 0)` or `requestAnimationFrame`), so screen readers speak it again.
- Copy order: `navigator.clipboard.writeText` when available. If it is missing or rejects, try the existing `fallbackCopy`. Only if both fail, use the failed state. Keep `fallbackCopy` as is.
- No layout jump in the bar: the button may widen, but the icon must not move vertically.

## Tests (Vitest + Testing Library, jsdom, `vi.useFakeTimers()` where timing matters)
Name them with the ids below and cover every row:
- `SB-1`: a relative url copies the absolute URL. Set the origin with `window.history.pushState({}, "", "/somewhere")`; jsdom's origin is `http://localhost:3000` or as configured, so assert against `window.location.origin + path`.
- `SB-2`: an absolute url is copied unchanged.
- `SB-3`: an undefined url copies `window.location.href` at click time, not at render. Change the location after render and before the click.
- `SB-4`: success shows the `Check` icon and the visible text `Copied`, sets `data-state="copied"`, sets aria-label `Link copied`, and returns to idle after 2000 ms.
- `SB-5`: clipboard rejects but the fallback succeeds, giving the copied state. Mock `document.execCommand` to return true.
- `SB-6`: both fail, giving visible `Couldn't copy`, `data-state="failed"` and live region `Couldn't copy link`, then idle after 3000 ms.
- `SB-7`: a second click while copied restarts the timer. Still copied at 2000 ms after the second click minus 1 ms, idle right after.
- `SB-8`: unmounting during the copied state leaves no pending timer and no React warning (`vi.getTimerCount()` is 0 after unmount).
- `EB-share`: `EngagementBar` with `shareUrl="/posts/abc"` passes it through, so clicking share copies `origin + "/posts/abc"`; with no `shareUrl`, nothing is computed at render.

Update or delete old share tests that contradict this behavior (for example ones asserting the sr-only text only).

## Definition of done
```
npx tsc --noEmit
npx eslint src/components/social
npx vitest run src/components/social
```
All green, then write the report and stop.
