"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { LikeButton } from "@/components/social/like-button";
import { ShareButton } from "@/components/social/share-button";
import { apiFetch } from "@/lib/social/client";
import { targetKey, type EngagementSummary, type TargetType } from "@/lib/social/types";

// Keep every exported name, prop type and signature (WP3 owns this file).
export type EngagementBarProps = {
  targetType: TargetType;
  targetId: string;
  /** Absolute or site-relative permalink that the share button copies. */
  shareUrl?: string;
  initial?: EngagementSummary;
  onCommentsClick?: () => void;
};

// --- Coalescing batch loader (AC-U8) ---------------------------------------
// Instances enqueue their target; one flush per tick fetches up to 50 targets
// per GET /api/engagement request. Module-level so a list of cards shares it.

type Waiter = {
  resolve: (summary: EngagementSummary) => void;
  reject: (err: unknown) => void;
};

const pending = new Map<string, Waiter[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_DELAY_MS = 24;
const MAX_TARGETS = 50;

const emptySummary = (): EngagementSummary => ({ likes: 0, comments: 0, liked: false });

/** Test hook: drop queued waiters and cancel a scheduled flush. */
export function __resetEngagementLoader(): void {
  pending.clear();
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

async function flush(): Promise<void> {
  const keys = [...pending.keys()];
  const batch = new Map<string, Waiter[]>();
  for (const key of keys) {
    const waiters = pending.get(key);
    if (waiters) {
      batch.set(key, waiters);
      pending.delete(key);
    }
  }
  for (let i = 0; i < keys.length; i += MAX_TARGETS) {
    const chunk = keys.slice(i, i + MAX_TARGETS);
    try {
      const res = await apiFetch(`/api/engagement?targets=${encodeURIComponent(chunk.join(","))}`, {
        method: "GET",
      });
      const json = (await res.json().catch(() => null)) as Record<
        string,
        EngagementSummary | undefined
      > | null;
      if (!res.ok || json === null) throw new Error("engagement fetch failed");
      for (const key of chunk) {
        const summary = json[key] ?? emptySummary();
        for (const waiter of batch.get(key) ?? []) waiter.resolve(summary);
      }
    } catch (err) {
      for (const key of chunk) {
        for (const waiter of batch.get(key) ?? []) waiter.reject(err);
      }
    }
  }
}

function scheduleFlush(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DELAY_MS);
}

export function requestEngagementSummary(
  targetType: TargetType,
  targetId: string,
): Promise<EngagementSummary> {
  const key = targetKey(targetType, targetId);
  return new Promise<EngagementSummary>((resolve, reject) => {
    const waiters = pending.get(key) ?? [];
    waiters.push({ resolve, reject });
    pending.set(key, waiters);
    scheduleFlush();
  });
}

// --- Component --------------------------------------------------------------

export function EngagementBar(props: EngagementBarProps) {
  // A new target remounts the inner bar: fresh summary state, no syncing
  // effects, and no stale counts from the previous target.
  return <EngagementBarInner key={targetKey(props.targetType, props.targetId)} {...props} />;
}

function EngagementBarInner({
  targetType,
  targetId,
  shareUrl,
  initial,
  onCommentsClick,
}: EngagementBarProps) {
  const [summary, setSummary] = useState<EngagementSummary | null>(initial ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    // Mount-only load (or skip when initial is provided). All state updates
    // happen in the async continuation, never synchronously in the effect.
    if (initial) return;
    let live = true;
    requestEngagementSummary(targetType, targetId).then(
      (fetched) => {
        if (live) setSummary(fetched);
      },
      () => {
        if (live) setLoadError("Could not load reactions.");
      },
    );
    return () => {
      live = false;
    };
  }, [targetType, targetId, initial]);

  const commentCount = summary?.comments ?? 0;

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1">
      {summary ? (
        <LikeButton
          targetType={targetType}
          targetId={targetId}
          liked={summary.liked}
          count={summary.likes}
          onUpdate={setSummary}
        />
      ) : loadError ? (
        <span role="alert" className="px-2 text-xs text-red-500">
          {loadError}
        </span>
      ) : (
        <span aria-hidden className="inline-flex min-h-9 items-center px-2.5 text-sm text-muted">
          …
        </span>
      )}
      <button
        type="button"
        onClick={onCommentsClick}
        aria-label={summary ? `Comments, ${commentCount} comments` : "Comments"}
        className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-sm transition-colors hover:bg-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        <MessageCircle aria-hidden className="size-4" />
        <span>{summary ? commentCount : ""}</span>
      </button>
      <ShareButton url={shareUrl} />
    </div>
  );
}
