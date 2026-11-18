import { HttpError } from "@/lib/api";
import { rateLimited } from "@/lib/rate-limit";
import {
  decodeCursor,
  getCommentById,
  insertComment,
  listCommentsPage,
  softDeleteComment,
} from "./store";
import { validateTarget } from "./targets";
import type { CommentDTO, Viewer } from "./types";

export const COMMENTS_PAGE_SIZE = 20;
const MAX_URLS = 2;
const COMMENT_WINDOW_MS = 60 * 1000;
const COMMENTS_PER_WINDOW = 5;
const URL_RE = /https?:\/\/\S+|www\.[^\s]+/gi;

const cleanBody = (body: unknown): string => {
  if (typeof body !== "string") throw new HttpError(400, "Comment body is required");
  const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > 1000) {
    throw new HttpError(400, "Comment must be 1-1000 characters");
  }
  const urls = trimmed.match(URL_RE) ?? [];
  if (urls.length > MAX_URLS) {
    throw new HttpError(400, "Comments can contain at most 2 links");
  }
  return trimmed;
};

/**
 * Newest-first comment page for a target. Deleted comments are excluded.
 * `mine` marks the viewer's own comments; it is false when signed out.
 */
export async function listComments(
  type: string,
  id: string,
  opts?: { cursor?: string | null; viewerId?: string | null; limit?: number },
): Promise<{ comments: CommentDTO[]; nextCursor: string | null }> {
  const targetType = await validateTarget(type, id);
  const cursor = decodeCursor(opts?.cursor);
  const page = await listCommentsPage(
    targetType,
    id,
    cursor,
    opts?.limit ?? COMMENTS_PAGE_SIZE,
  );
  return {
    comments: page.rows.map((r) => ({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      body: r.body,
      createdAt: r.createdAt,
      author: { displayName: r.displayName },
      mine: opts?.viewerId != null && opts.viewerId === r.subscriberId,
    })),
    nextCursor: page.nextCursor,
  };
}

/** Post a comment as the viewer. Only the display name is exposed, never the email. */
export async function addComment(
  type: string,
  id: string,
  body: unknown,
  viewer: Viewer,
): Promise<CommentDTO> {
  const trimmed = cleanBody(body);
  if (rateLimited(`comment:${viewer.id}`, COMMENTS_PER_WINDOW, COMMENT_WINDOW_MS)) {
    throw new HttpError(429, "Too many comments. Try again later.");
  }
  const targetType = await validateTarget(type, id);
  const row = await insertComment(viewer.id, targetType, id, trimmed);
  return {
    id: row.id,
    targetType,
    targetId: id,
    body: trimmed,
    createdAt: row.createdAt,
    author: { displayName: viewer.displayName },
    mine: true,
  };
}

/**
 * Soft-delete a comment. Allowed for the author or an admin session.
 * Unknown (or already deleted) ids report 404 so deletions stay idempotent
 * from the reader's point of view.
 */
export async function deleteComment(
  id: string,
  viewer: Viewer | null,
  admin: boolean,
): Promise<{ ok: true }> {
  if (!viewer && !admin) throw new HttpError(401, "Sign in required");
  const row = await getCommentById(id);
  if (!row) throw new HttpError(404, "Comment not found");
  if (!admin && row.subscriberId !== viewer?.id) {
    throw new HttpError(403, "Not allowed");
  }
  await softDeleteComment(row.id);
  return { ok: true };
}
