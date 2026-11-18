import { HttpError } from "@/lib/api";
import { getArticles } from "@/lib/medium";
import { isTargetType, type TargetType } from "./types";
import { existingDbIds, isUuid, targetExists } from "./store";

const ARTICLE_ID_RE = /^[0-9a-f]{6,32}$/;

/**
 * Throw HttpError(404) unless `type`/`id` identify a real target.
 * Database targets are checked for existence after a uuid format check;
 * article ids must match the Medium hex format and appear in the feed.
 * Returns the narrowed target type for callers.
 */
export async function validateTarget(
  type: string,
  id: string,
): Promise<TargetType> {
  if (!isTargetType(type)) throw new HttpError(404, "Unknown target type");
  if (typeof id !== "string" || id.length === 0) {
    throw new HttpError(404, "Target not found");
  }
  if (type === "article") {
    if (!ARTICLE_ID_RE.test(id)) throw new HttpError(404, "Target not found");
    const articles = await getArticles();
    if (!articles.some((a) => a.id === id)) {
      throw new HttpError(404, "Target not found");
    }
    return type;
  }
  if (!isUuid(id)) throw new HttpError(404, "Target not found");
  if (!(await targetExists(type, id))) {
    throw new HttpError(404, "Target not found");
  }
  return type;
}

export type BatchTarget = { type: string; id: string };

/**
 * Batch version of validateTarget. Groups ids by database type so each
 * table is queried once, and fetches the Medium feed once when articles
 * are present. Throws HttpError(404) naming the first bad target.
 */
export async function validateTargetsBatch(
  targets: BatchTarget[],
): Promise<void> {
  for (const t of targets) {
    if (!isTargetType(t.type)) {
      throw new HttpError(404, `Unknown target type: ${t.type}`);
    }
  }
  const typed = targets as { type: TargetType; id: string }[];
  const found = new Map<TargetType, Set<string>>();
  const dbTypes = ["post", "project", "gallery"] as const;
  for (const dbType of dbTypes) {
    const ids = typed.filter((t) => t.type === dbType).map((t) => t.id);
    if (ids.length > 0) found.set(dbType, await existingDbIds(dbType, ids));
  }
  let articleIds: Set<string> | null = null;
  if (typed.some((t) => t.type === "article")) {
    const articles = await getArticles();
    articleIds = new Set(articles.map((a) => a.id));
  }
  for (const t of typed) {
    if (t.type === "article") {
      if (!ARTICLE_ID_RE.test(t.id) || !articleIds?.has(t.id)) {
        throw new HttpError(404, `Target not found: article:${t.id}`);
      }
    } else if (!isUuid(t.id) || !found.get(t.type)?.has(t.id)) {
      throw new HttpError(404, `Target not found: ${t.type}:${t.id}`);
    }
  }
}
