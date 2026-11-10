"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { post, uploadFile } from "./upload";
import { button, input } from "@/lib/ui";

export function ProjectForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const thumb = data.get("thumbnail");

    setBusy(true);
    setMessage(null);
    try {
      const thumbnailKey =
        thumb instanceof File && thumb.size > 0
          ? await uploadFile(thumb, "projects")
          : undefined;

      await post("/api/admin/projects", {
        title: data.get("title"),
        summary: data.get("summary"),
        url: data.get("url"),
        repoUrl: data.get("repoUrl"),
        tags: String(data.get("tags") ?? "").split(","),
        thumbnailKey,
      });

      form.reset();
      setMessage({ ok: true, text: "Project added." });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <input name="title" placeholder="Title" required maxLength={120} className={input} />
      <textarea
        name="summary"
        placeholder="One-line summary"
        required
        maxLength={400}
        rows={2}
        className={input}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="url" type="url" placeholder="Live URL (optional)" className={input} />
        <input name="repoUrl" type="url" placeholder="Repo URL (optional)" className={input} />
      </div>
      <input name="tags" placeholder="Tags, comma separated (go, docker)" className={input} />
      <div>
        <label htmlFor="thumbnail" className="mb-1 block text-sm text-muted">
          Thumbnail (optional)
        </label>
        <input
          id="thumbnail"
          name="thumbnail"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-line file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-foreground"
        />
      </div>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy} className={button}>
          {busy ? "Saving…" : "Add project"}
        </button>
        {message && (
          <p
            role={message.ok ? "status" : "alert"}
            className={`text-sm ${message.ok ? "text-muted" : "text-red-500"}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
