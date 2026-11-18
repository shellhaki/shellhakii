"use client";

import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CommentSection } from "@/components/social/comment-section";
import { EngagementBar } from "@/components/social/engagement-bar";
import type { Media } from "@/lib/media";

type Filter = "all" | "image" | "video";

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Pictures" },
  { value: "video", label: "Videos" },
];

export function GalleryGrid({ media }: { media: Media[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const deepLinked = useRef(false);
  const wasOpen = useRef(false);

  const items = useMemo(
    () => (filter === "all" ? media : media.filter((m) => m.kind === filter)),
    [media, filter],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open !== null && !dialog.open) dialog.showModal();
    if (open === null && dialog.open) dialog.close();
  }, [open]);

  const current = open !== null ? items[open] : null;

  // Deep link: open the lightbox when the URL carries ?item=<id>.
  // Runs once on mount only; reads the query in an effect (not during
  // render) because the page is statically prerendered. State applies in a
  // microtask so the effect body itself only syncs with the browser.
  useEffect(() => {
    if (deepLinked.current) return;
    deepLinked.current = true;
    const id = new URLSearchParams(window.location.search).get("item");
    if (!id) return;
    const index = media.findIndex((m) => m.id === id);
    if (index === -1) return;
    queueMicrotask(() => {
      setFilter("all");
      setOpen(index);
      document.getElementById(`media-${id}`)?.scrollIntoView?.({ block: "center" });
    });
  }, [media]);

  // Keep the address bar in sync while the lightbox is open. replaceState
  // (never pushState) so the back button is not polluted.
  useEffect(() => {
    if (current) {
      wasOpen.current = true;
      window.history.replaceState(null, "", `/gallery?item=${current.id}`);
    } else if (wasOpen.current) {
      window.history.replaceState(null, "", "/gallery");
    }
  }, [current]);

  const step = (d: number) =>
    setOpen((i) => (i === null ? i : (i + d + items.length) % items.length));

  return (
    <div>
      <div className="flex justify-center gap-2" role="group" aria-label="Filter media">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
              filter === f.value
                ? "border-foreground bg-foreground text-background"
                : "border-line hover:bg-line"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="mt-16 text-center text-muted">Nothing here yet.</p>
      ) : (
        <ul className="mt-8 columns-2 gap-3 md:columns-3">
          {items.map((m, i) => (
            <li key={m.id} id={`media-${m.id}`} className="mb-3 break-inside-avoid">
              <button
                type="button"
                onClick={() => setOpen(i)}
                aria-label={m.caption ?? `Open ${m.kind}`}
                className="group relative block w-full cursor-zoom-in overflow-hidden rounded-xl bg-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                style={m.width && m.height ? { aspectRatio: `${m.width} / ${m.height}` } : undefined}
              >
                {m.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.url}
                    alt={m.caption ?? ""}
                    width={m.width ?? undefined}
                    height={m.height ?? undefined}
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                ) : (
                  <>
                    <video
                      src={`${m.url}#t=0.1`}
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                      onMouseLeave={(e) => e.currentTarget.pause()}
                      className="size-full object-cover"
                    />
                    <span className="pointer-events-none absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white">
                      <Play className="size-3.5 fill-current" aria-hidden />
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <dialog
        ref={dialogRef}
        aria-label="Media viewer"
        onClose={() => setOpen(null)}
        onClick={(e) => e.target === e.currentTarget && setOpen(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") step(-1);
          if (e.key === "ArrowRight") step(1);
        }}
        className="m-0 h-dvh max-h-none w-dvw max-w-none bg-transparent p-0 backdrop:bg-black/90"
      >
        {/* Engagement for the current item. The `dark` class pins the panel to
            the dark tokens so it stays readable on the black backdrop in
            either theme. */}
        {current && (
          <div className="dark fixed left-1/2 top-4 z-10 w-fit max-w-[calc(100dvw-5rem)] -translate-x-1/2 rounded-2xl bg-black/70 px-4 py-2 text-white backdrop-blur">
            <EngagementBar
              targetType="gallery"
              targetId={current.id}
              shareUrl={`/gallery?item=${current.id}`}
            />
            <div className="max-h-[50dvh] overflow-y-auto">
              <CommentSection targetType="gallery" targetId={current.id} />
            </div>
          </div>
        )}

        {current && (
          <div
            className="flex size-full items-center justify-center p-4 pt-24 sm:p-12"
            onClick={(e) => e.target === e.currentTarget && setOpen(null)}
          >
            {current.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.url}
                alt={current.caption ?? ""}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            ) : (
              <video
                key={current.id}
                src={current.url}
                controls
                autoPlay
                playsInline
                className="max-h-full max-w-full rounded-lg"
              />
            )}
            {current.caption && (
              <p className="absolute inset-x-0 bottom-4 text-center text-sm text-white/80">
                {current.caption}
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen(null)}
          aria-label="Close"
          className="fixed right-4 top-4 flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="size-5" aria-hidden />
        </button>
        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous"
              className="fixed left-3 top-1/2 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next"
              className="fixed right-3 top-1/2 flex size-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </>
        )}
      </dialog>
    </div>
  );
}
