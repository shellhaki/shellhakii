import { cacheLife, cacheTag } from "next/cache";
import { HttpError } from "@/lib/api";
import {
  createPostRow,
  decodeCursor,
  deletePostRow,
  getPostRow,
  listPostsPage,
  updatePostRow,
} from "./store";
import type { PostDTO } from "./types";

export const POSTS_PAGE_SIZE = 20;
export const POSTS_MAX_LIMIT = 50;

const cleanPostBody = (body: unknown): string => {
  if (typeof body !== "string") throw new HttpError(400, "Post body is required");
  const trimmed = body.trim();
  if (trimmed.length < 1 || trimmed.length > 500) {
    throw new HttpError(400, "Post must be 1-500 characters");
  }
  return trimmed;
};

const clampLimit = (limit: unknown): number => {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return POSTS_PAGE_SIZE;
  return Math.max(1, Math.min(POSTS_MAX_LIMIT, Math.floor(limit)));
};

// Public contract (spec section 5): cached reads, tag "posts".
export async function listPosts(
  opts?: { cursor?: string; limit?: number },
): Promise<{ posts: PostDTO[]; nextCursor: string | null }> {
  "use cache";
  cacheLife("minutes");
  cacheTag("posts");
  const cursor = decodeCursor(opts?.cursor);
  try {
    const page = await listPostsPage(cursor, clampLimit(opts?.limit));
    return { posts: page.rows, nextCursor: page.nextCursor };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("listPosts failed", err);
    return { posts: [], nextCursor: null };
  }
}

export async function getPost(id: string): Promise<PostDTO | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("posts");
  try {
    return await getPostRow(id);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("getPost failed", err);
    return null;
  }
}

// Write helpers used by the admin routes. Uncached on purpose: each admin
// route revalidates the "posts" tag after writing.
export async function createPost(body: unknown): Promise<{ id: string }> {
  return createPostRow(cleanPostBody(body));
}

export async function updatePost(id: string, body: unknown): Promise<PostDTO> {
  const row = await updatePostRow(id, cleanPostBody(body));
  if (!row) throw new HttpError(404, "Post not found");
  return row;
}

export async function deletePost(id: string): Promise<{ ok: true }> {
  if (!(await deletePostRow(id))) throw new HttpError(404, "Post not found");
  return { ok: true };
}
