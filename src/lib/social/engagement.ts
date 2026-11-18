import { HttpError } from "@/lib/api";
import {
  getCommentCounts,
  getLikeCounts,
  getViewerLikedKeys,
  likeTarget,
  unlikeTarget,
  type TargetRef,
} from "./store";
import { validateTarget, validateTargetsBatch } from "./targets";
import { targetKey, type EngagementSummary, type TargetType } from "./types";

export const MAX_BATCH_TARGETS = 50;

const summarizeOne = async (
  type: TargetType,
  id: string,
  liked: boolean,
): Promise<EngagementSummary> => {
  const ref: TargetRef[] = [{ type, id }];
  const [likes, comments] = await Promise.all([
    getLikeCounts(ref),
    getCommentCounts(ref),
  ]);
  const key = targetKey(type, id);
  return {
    likes: likes.get(key) ?? 0,
    comments: comments.get(key) ?? 0,
    liked,
  };
};

/** Idempotent like: validates the target, inserts, returns the fresh summary. */
export async function setLike(
  type: string,
  id: string,
  viewerId: string,
): Promise<EngagementSummary> {
  const targetType = await validateTarget(type, id);
  await likeTarget(viewerId, targetType, id);
  return summarizeOne(targetType, id, true);
}

/** Idempotent unlike: validates the target, deletes, returns the fresh summary. */
export async function removeLike(
  type: string,
  id: string,
  viewerId: string,
): Promise<EngagementSummary> {
  const targetType = await validateTarget(type, id);
  await unlikeTarget(viewerId, targetType, id);
  return summarizeOne(targetType, id, false);
}

/**
 * Batch summaries for up to 50 targets. Uses one query for like counts,
 * one for comment counts, and one for the viewer's likes. `liked` is true
 * only for targets the given viewer liked, and always false when signed out.
 */
export async function getSummaries(
  targets: { type: string; id: string }[],
  viewerId: string | null,
): Promise<Record<string, EngagementSummary>> {
  if (targets.length > MAX_BATCH_TARGETS) {
    throw new HttpError(400, "Too many targets (max 50)");
  }
  const out: Record<string, EngagementSummary> = {};
  if (targets.length === 0) return out;
  await validateTargetsBatch(targets);
  const refs: TargetRef[] = targets.map((t) => ({
    type: t.type as TargetType,
    id: t.id,
  }));
  const [likeCounts, commentCounts, likedKeys] = await Promise.all([
    getLikeCounts(refs),
    getCommentCounts(refs),
    viewerId
      ? getViewerLikedKeys(viewerId, refs)
      : Promise.resolve(new Set<string>()),
  ]);
  for (const t of refs) {
    const key = targetKey(t.type, t.id);
    out[key] = {
      likes: likeCounts.get(key) ?? 0,
      comments: commentCounts.get(key) ?? 0,
      liked: likedKeys.has(key),
    };
  }
  return out;
}
