"use client";

import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
            <li key={m.id} className="mb-3 break-inside-avoid">
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
        {current && (
          <div
            className="flex size-full items-center justify-center p-4 sm:p-12"
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
