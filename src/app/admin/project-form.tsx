"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Project } from "@/lib/projects";
import { button, ghostButton, input } from "@/lib/ui";
import { patch, post, uploadFile } from "./upload";

/** Create form, or edit form when `project` is given. */
export function ProjectForm({
  project,
  onDone,
}: {
  project?: Project;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const thumb = data.get("thumbnail");
    const hasNewThumb = thumb instanceof File && thumb.size > 0;

    setBusy(true);
    setMessage(null);
    try {
      const newKey = hasNewThumb ? await uploadFile(thumb, "projects") : undefined;
      const fields = {
        title: data.get("title"),
        summary: data.get("summary"),
        url: data.get("url"),
        repoUrl: data.get("repoUrl"),
        tags: String(data.get("tags") ?? "").split(","),
      };

      if (project) {
        await patch(`/api/admin/projects/${project.id}`, {
          ...fields,
          position: Number(data.get("position")) || 0,
          // New file replaces; "remove" clears; otherwise leave untouched.
          ...(newKey
            ? { thumbnailKey: newKey }
            : data.get("removeThumbnail")
              ? { thumbnailKey: null }
              : {}),
        });
        onDone?.();
      } else {
        await post("/api/admin/projects", { ...fields, thumbnailKey: newKey });
        form.reset();
        setMessage({ ok: true, text: "Project added." });
      }
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        name="title"
        placeholder="Title"
        required
        maxLength={120}
        defaultValue={project?.title}
        className={input}
      />
      <textarea
        name="summary"
        placeholder="One-line summary"
        required
        maxLength={400}
        rows={2}
        defaultValue={project?.summary}
        className={input}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="url"
          type="url"
          placeholder="Live URL (optional)"
          defaultValue={project?.url ?? ""}
          className={input}
        />
        <input
          name="repoUrl"
          type="url"
          placeholder="Repo URL (optional)"
          defaultValue={project?.repoUrl ?? ""}
          className={input}
        />
      </div>
      <input
        name="tags"
        placeholder="Tags, comma separated (go, docker)"
        defaultValue={project?.tags.join(", ")}
        className={input}
      />
      {project && (
        <div>
          <label htmlFor={`pos-${project.id}`} className="mb-1 block text-sm text-muted">
            Order (lower shows first)
          </label>
          <input
            id={`pos-${project.id}`}
            name="position"
            type="number"
            defaultValue={project.position}
            className={`${input} sm:w-32`}
          />
        </div>
      )}
      <div>
        <label htmlFor={`thumb-${project?.id ?? "new"}`} className="mb-1 block text-sm text-muted">
          {project?.thumbnailUrl ? "Replace thumbnail" : "Thumbnail (optional)"}
        </label>
        {project?.thumbnailUrl && (
          <div className="mb-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={project.thumbnailUrl} alt="" className="size-14 rounded-lg object-cover" />
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="removeThumbnail" /> Remove current
            </label>
          </div>
        )}
        <input
          id={`thumb-${project?.id ?? "new"}`}
          name="thumbnail"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-line file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:text-foreground"
        />
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className={button}>
          {busy ? "Saving…" : project ? "Save changes" : "Add project"}
        </button>
        {project && (
          <button type="button" onClick={onDone} disabled={busy} className={ghostButton}>
            Cancel
          </button>
        )}
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
