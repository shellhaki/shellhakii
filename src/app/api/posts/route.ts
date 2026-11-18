import { connection, NextResponse } from "next/server";
import { listPosts } from "@/lib/social/posts";

const PAGE_SIZE = 10;

// GET /api/posts?cursor= -> public page of posts, newest first.
export async function GET(req: Request) {
  // Per-request data: opt out of prerendering before reading the URL.
  await connection();
  try {
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const { posts, nextCursor } = await listPosts({
      cursor: cursor ?? undefined,
      limit: PAGE_SIZE,
    });
    return NextResponse.json({ posts, nextCursor });
  } catch (err) {
    console.error("GET /api/posts failed", err);
    return NextResponse.json({ error: "Couldn't load posts" }, { status: 500 });
  }
}
