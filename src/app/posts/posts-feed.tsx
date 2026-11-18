"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/social/client";
import type { PostDTO } from "@/lib/social/types";
import { PostCard } from "./post-card";

export function PostsFeed({
  initialPosts,
  initialCursor,
}: {
  initialPosts: PostDTO[];
  initialCursor: string | null;
}) {
  const [posts, setPosts] = useState<PostDTO[]>(initialPosts);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/posts?cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const data: { posts: PostDTO[]; nextCursor: string | null } =
        await res.json();
      if (!Array.isArray(data.posts)) throw new Error("Bad response");
      setPosts((prev) => [...prev, ...data.posts]);
      setCursor(data.nextCursor);
    } catch {
      setError("Couldn't load more posts. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <ul className="space-y-5">
        {posts.map((post) => (
          <li key={post.id}>
            <PostCard post={post} />
          </li>
        ))}
      </ul>
      {cursor !== null && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="inline-flex h-9 cursor-pointer items-center justify-center rounded-full border border-line px-4 text-sm transition-colors hover:bg-line disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
          {error && (
            <p role="alert" className="mt-3 text-sm text-muted">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
