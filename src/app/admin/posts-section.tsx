"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDate } from "@/lib/format";
import type { PostDTO } from "@/lib/social/types";
import { button, input } from "@/lib/ui";
import { DeleteButton } from "./delete-button";
import { post } from "./upload";

const MAX_BODY = 500;

export function PostsSection({ posts }: { posts: PostDTO[] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = body.trim();
  const tooLong = trimmed.length > MAX_BODY;
  const canPublish = !busy && trimmed.length > 0 && !tooLong;

  async function publish() {
    if (!canPublish) return;
    setBusy(true);
    setError(null);
    try {
      await post<{ id: string }>("/api/admin/posts", { body: trimmed });
      setBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="posts-h" className="space-y-6">
      <h2 id="posts-h" className="font-serif text-xl font-semibold">
        Posts
      </h2>

      <div className="space-y-3">
        <label
          htmlFor="post-body"
          className="block text-sm font-medium text-muted"
        >
          New post
        </label>
        <textarea
          id="post-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={MAX_BODY + 50}
          placeholder="Share a short thought…"
          aria-describedby="post-counter"
          className={`${input} min-h-20 resize-y`}
        />
        <div className="flex items-center justify-between gap-3">
          <p
            id="post-counter"
            aria-live="polite"
            className={`font-mono text-xs ${tooLong ? "text-red-500" : "text-muted"}`}
          >
            {trimmed.length} / {MAX_BODY}
          </p>
          <button
            type="button"
            onClick={publish}
            disabled={!canPublish}
            className={button}
          >
            {busy ? "Publishing…" : "Publish"}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
      </div>

      {posts.length > 0 && (
        <ul className="divide-y divide-line border-y border-line">
          {posts.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-muted">
                  {formatDate(p.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-line break-words text-sm">
                  {p.body}
                </p>
              </div>
              <DeleteButton
                url={`/api/admin/posts/${p.id}`}
                label={p.body.slice(0, 60)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
