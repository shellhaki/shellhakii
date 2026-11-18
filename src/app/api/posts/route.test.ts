import { describe, expect, it, vi } from "vitest";
import { listPosts } from "@/lib/social/posts";

vi.mock("@/lib/social/posts", () => ({ listPosts: vi.fn(), getPost: vi.fn() }));

import { GET } from "./route";

describe("GET /api/posts", () => {
  it("AC-I1: delegates the cursor to listPosts and returns posts with nextCursor", async () => {
    const posts = [
      { id: "p1", body: "hello", createdAt: "2026-05-08T12:00:00.000Z" },
    ];
    vi.mocked(listPosts).mockResolvedValue({ posts, nextCursor: "c2" });

    const res = await GET(new Request("http://localhost/api/posts?cursor=c1"));
    expect(listPosts).toHaveBeenCalledWith({ cursor: "c1", limit: 10 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ posts, nextCursor: "c2" });
  });

  it("AC-I1: loads the first page when no cursor is given", async () => {
    vi.mocked(listPosts).mockResolvedValue({ posts: [], nextCursor: null });

    const res = await GET(new Request("http://localhost/api/posts"));
    expect(listPosts).toHaveBeenCalledWith({ cursor: undefined, limit: 10 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ posts: [], nextCursor: null });
  });

  it("AC-I1: returns 500 when the store fails", async () => {
    vi.mocked(listPosts).mockRejectedValue(new Error("db down"));

    const res = await GET(new Request("http://localhost/api/posts"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't load posts" });
  });
});
