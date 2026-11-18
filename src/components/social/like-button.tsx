"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { useViewer } from "@/components/social/viewer-provider";
import { apiFetch } from "@/lib/social/client";
import type { EngagementSummary, TargetType } from "@/lib/social/types";

export type LikeButtonProps = {
  targetType: TargetType;
  targetId: string;
  liked: boolean;
  count: number;
  onUpdate?: (summary: EngagementSummary) => void;
};

export function LikeButton({ targetType, targetId, liked, count, onUpdate }: LikeButtonProps) {
  const { viewer, requireSignIn } = useViewer();
  const [override, setOverride] = useState<{ liked: boolean; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shownLiked = override?.liked ?? liked;
  const shownCount = override?.count ?? count;

  async function handleClick() {
    if (busy) return;
    setError(null);
    // Signed-out click opens the auth dialog; the like completes afterwards
    // with no second click (AC-U2).
    let signedIn = viewer;
    if (!signedIn) {
      signedIn = await requireSignIn();
      if (!signedIn) return;
    }
    const nextLiked = !shownLiked;
    const previous = { liked: shownLiked, count: shownCount };
    setOverride({ liked: nextLiked, count: shownCount + (nextLiked ? 1 : -1) });
    setBusy(true);
    try {
      const res = await apiFetch("/api/likes", {
        method: nextLiked ? "PUT" : "DELETE",
        body: JSON.stringify({ targetType, targetId }),
      });
      const json = (await res.json().catch(() => null)) as (EngagementSummary & {
        error?: string;
      }) | null;
      if (!res.ok || json === null || typeof json.likes !== "number") {
        throw new Error(json?.error ?? "Could not save your like. Try again.");
      }
      if (onUpdate) {
        // The parent owns the counts from here; drop the override.
        setOverride(null);
        onUpdate({ likes: json.likes, comments: json.comments, liked: json.liked });
      }
      // Without onUpdate the confirmed optimistic state stays as the truth.
    } catch (err) {
      // Roll back the optimistic update and say so (AC-U4).
      setOverride(previous);
      setError(err instanceof Error ? err.message : "Could not save your like. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        aria-pressed={shownLiked}
        aria-label={`${shownLiked ? "Unlike" : "Like"}, ${shownCount} likes`}
        className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-sm transition-colors hover:bg-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        <Heart
          aria-hidden
          className={`size-4 ${shownLiked ? "fill-red-500 text-red-500" : ""}`}
        />
        <span aria-hidden={false}>{shownCount}</span>
      </button>
      {error && (
        <span role="alert" className="text-xs text-red-500">
          {error}
        </span>
      )}
    </span>
  );
}
