"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { post, readDimensions, uploadFile } from "./upload";
import { button } from "@/lib/ui";

type Item = { name: string; status: "pending" | "uploading" | "done" | "error"; error?: string };

export function MediaUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

  function patch(i: number, next: Partial<Item>) {
    setItems((cur) => cur.map((it, idx) => (idx === i ? { ...it, ...next } : it)));
  }

  async function onUpload() {
    const files = Array.from(inputRef.current?.files ?? []);
    if (!files.length) return;

    setBusy(true);
    setItems(files.map((f) => ({ name: f.name, status: "pending" })));

    for (const [i, file] of files.entries()) {
      patch(i, { status: "uploading" });
      try {
        const dims = await readDimensions(file);
        const key = await uploadFile(file, "media");
        await post("/api/admin/media", { key, ...dims });
        patch(i, { status: "done" });
      } catch (err) {
        patch(i, {
          status: "error",
          error: err instanceof Error ? err.message : "Failed",
        });
      }
    }

    if (inputRef.current) inputRef.current.value = "";
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime"
        aria-label="Choose images or videos"
        className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-line file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-foreground"
      />
      <button type="button" onClick={onUpload} disabled={busy} className={button}>
        {busy ? "Uploading…" : "Upload"}
      </button>
      {items.length > 0 && (
        <ul className="space-y-1 text-sm" aria-live="polite">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2">
              <span className="truncate">{it.name}</span>
              <span
                className={it.status === "error" ? "text-red-500" : "text-muted"}
              >
                {it.status === "error" ? it.error : it.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
