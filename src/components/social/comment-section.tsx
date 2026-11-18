"use client";

import { useEffect, useId, useState } from "react";
import { useViewer } from "@/components/social/viewer-provider";
import { apiFetch } from "@/lib/social/client";
import { targetKey, type CommentDTO, type TargetType } from "@/lib/social/types";
import { button, ghostButton, input } from "@/lib/ui";

// Keep every exported name, prop type and signature (WP3 owns this file).
export type CommentSectionProps = {
  targetType: TargetType;
  targetId: string;
  defaultOpen?: boolean;
};

const PAGE_SIZE = 20;
const MAX_BODY = 1000;

type ListResponse = {
  comments?: CommentDTO[];
  nextCursor?: string | null;
  error?: string;
};

async function fetchPage(
  targetType: TargetType,
  targetId: string,
  cursor: string | null,
): Promise<{ comments: CommentDTO[]; nextCursor: string | null }> {
  const params = new URLSearchParams({ targetType, targetId });
  if (cursor) params.set("cursor", cursor);
  const res = await apiFetch(`/api/comments?${params.toString()}`, { method: "GET" });
  const json = (await res.json().catch(() => null)) as ListResponse | null;
  if (!res.ok || !json || !Array.isArray(json.comments)) {
    throw new Error(json?.error ?? "Could not load comments.");
  }
  return { comments: json.comments, nextCursor: json.nextCursor ?? null };
}

export function CommentSection({ targetType, targetId, defaultOpen = false }: CommentSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section aria-label="Comments" className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex min-h-9 cursor-pointer items-center rounded-full border border-line px-4 text-sm transition-colors hover:bg-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        {open ? "Hide comments" : "Comments"}
      </button>

      {open && (
        <div id={panelId} className="mt-3">
          {/* A new target remounts the list: fresh load, no syncing effects. */}
          <CommentList key={targetKey(targetType, targetId)} targetType={targetType} targetId={targetId} />
        </div>
      )}
    </section>
  );
}

function CommentList({ targetType, targetId }: { targetType: TargetType; targetId: string }) {
  const { viewer, requireSignIn } = useViewer();
  const panelId = useId();

  // Mounts only when the section opens, so nothing is fetched on render
  // while collapsed (AC-U1, AC-U6). `loading` starts true: no effect needs
  // to set state synchronously.
  const [comments, setComments] = useState<CommentDTO[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchPage(targetType, targetId, null).then(
      (page) => {
        if (!live) return;
        setComments(page.comments);
        setNextCursor(page.nextCursor);
        setLoading(false);
      },
      (err: unknown) => {
        if (!live) return;
        setError(err instanceof Error ? err.message : "Could not load comments.");
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
  }, [targetType, targetId]);

  async function loadMore() {
    if (loadingMore || !nextCursor) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchPage(targetType, targetId, nextCursor);
      setComments((prev) => [...(prev ?? []), ...page.comments]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more comments.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (body.length === 0 || body.length > MAX_BODY || posting) return;
    setPostError(null);
    // Signed-out submit opens the dialog; the draft posts automatically
    // after sign-in with no second click (AC-U2).
    let signedIn = viewer;
    if (!signedIn) {
      signedIn = await requireSignIn();
      if (!signedIn) return;
    }
    setPosting(true);
    try {
      const res = await apiFetch("/api/comments", {
        method: "POST",
        body: JSON.stringify({ targetType, targetId, body }),
      });
      const json = (await res.json().catch(() => null)) as (CommentDTO & {
        error?: string;
      }) | null;
      if (!res.ok || !json || typeof json.id !== "string") {
        throw new Error(
          (json as { error?: string } | null)?.error ?? "Could not post your comment.",
        );
      }
      setComments((prev) => [json as CommentDTO, ...(prev ?? [])]);
      setDraft("");
    } catch (err) {
      setPostError(err instanceof Error ? err.message : "Could not post your comment.");
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await apiFetch(`/api/comments/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? "Could not delete that comment.");
      }
      setComments((prev) => (prev ?? []).filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that comment.");
    } finally {
      setDeletingId(null);
    }
  }

  const trimmedLen = draft.trim().length;

  return (
    <div className="space-y-4">
      {loading && <p className="text-sm text-muted">Loading comments…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-pill px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      )}

      {comments !== null && comments.length === 0 && !loading && (
        <p className="text-sm text-muted">No comments yet. Be the first to reply.</p>
      )}

      {comments !== null && comments.length > 0 && (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-xl border border-line bg-background px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{comment.author.displayName}</p>
                {comment.mine && (
                  <button
                    type="button"
                    onClick={() => void remove(comment.id)}
                    disabled={deletingId === comment.id}
                    aria-label={`Delete your comment from ${comment.author.displayName}`}
                    className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-full px-2 text-xs text-muted transition-colors hover:bg-pill hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                  >
                    {deletingId === comment.id ? "Deleting…" : "Delete"}
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm break-words whitespace-pre-wrap">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className={ghostButton}
        >
          {loadingMore ? "Loading…" : `Load more comments (${PAGE_SIZE} at a time)`}
        </button>
      )}

      <form onSubmit={submit} noValidate className="space-y-2">
        <label htmlFor={`comment-draft-${panelId}`} className="mb-1 block text-sm text-muted">
          {viewer ? "Add a comment" : "Sign in to join the discussion"}
        </label>
        <textarea
          id={`comment-draft-${panelId}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY))}
          rows={3}
          maxLength={MAX_BODY}
          placeholder={viewer ? "Write something kind…" : "Write a comment…"}
          aria-describedby={`comment-count-${panelId}`}
          className={`${input} min-h-9 resize-y`}
        />
        <div className="flex min-h-9 flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={posting || trimmedLen === 0 || trimmedLen > MAX_BODY}
            className={button}
          >
            {posting ? "Posting…" : viewer ? "Post comment" : "Sign in to comment"}
          </button>
          <span id={`comment-count-${panelId}`} className="text-xs text-muted">
            {trimmedLen}/{MAX_BODY}
          </span>
        </div>
        {postError && (
          <p role="alert" className="rounded-lg bg-pill px-3 py-2 text-sm text-red-500">
            {postError}
          </p>
        )}
      </form>
    </div>
  );
}
