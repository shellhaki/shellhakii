import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ getSql: vi.fn() }));

import { HttpError } from "@/lib/api";
import { getSql } from "@/lib/db";
import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  updatePost,
} from "./posts";

const getSqlMock = vi.mocked(getSql);
const sqlMock = vi.fn();

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

const statusOf = async (fn: () => Promise<unknown>): Promise<number> => {
  try {
    await fn();
    expect.unreachable("should have thrown");
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    return (err as HttpError).status;
  }
  throw new Error("unreachable");
};

beforeEach(() => {
  sqlMock.mockReset();
  sqlMock.mockResolvedValue([]);
  getSqlMock.mockReturnValue(
    sqlMock as unknown as NonNullable<ReturnType<typeof getSql>>,
  );
});

describe("posts", () => {
  it("AC-E9: lists newest first and returns DTOs with a cursor", async () => {
    sqlMock.mockResolvedValue([
      { id: UUID_A, body: "newer", created_at: "2024-05-02T00:00:00.000Z" },
      { id: UUID_B, body: "older", created_at: "2024-05-01T00:00:00.000Z" },
      { id: UUID_A, body: "extra", created_at: "2024-04-01T00:00:00.000Z" },
    ]);
    const page = await listPosts({ limit: 2 });
    expect(page.posts.map((p) => p.body)).toEqual(["newer", "older"]);
    expect(page.posts[0]).toEqual({
      id: UUID_A,
      body: "newer",
      createdAt: "2024-05-02T00:00:00.000Z",
    });
    expect(page.nextCursor).not.toBeNull();
  });

  it("AC-E9: follows the cursor to the next page", async () => {
    sqlMock.mockResolvedValue([
      { id: UUID_A, body: "one", created_at: "2024-05-02T00:00:00.000Z" },
      { id: UUID_B, body: "two", created_at: "2024-05-01T00:00:00.000Z" },
    ]);
    const first = await listPosts({ limit: 1 });
    expect(first.posts).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    sqlMock.mockResolvedValue([
      { id: UUID_B, body: "two", created_at: "2024-05-01T00:00:00.000Z" },
    ]);
    const second = await listPosts({
      cursor: first.nextCursor ?? undefined,
      limit: 1,
    });
    expect(second.posts.map((p) => p.id)).toEqual([UUID_B]);
    expect(second.nextCursor).toBeNull();
  });

  it("AC-E9: rejects malformed cursors with 400", async () => {
    expect(await statusOf(() => listPosts({ cursor: "nope" }))).toBe(400);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("AC-E9: getPost returns the post and null for unknown ids", async () => {
    sqlMock.mockResolvedValue([
      { id: UUID_A, body: "hello", created_at: "2024-05-01T00:00:00.000Z" },
    ]);
    await expect(getPost(UUID_A)).resolves.toEqual({
      id: UUID_A,
      body: "hello",
      createdAt: "2024-05-01T00:00:00.000Z",
    });
    sqlMock.mockResolvedValue([]);
    await expect(getPost(UUID_B)).resolves.toBeNull();
  });

  it("AC-E9: getPost returns null for non-uuid ids without SQL", async () => {
    await expect(getPost("abc")).resolves.toBeNull();
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("AC-E9: reads degrade to empty instead of throwing on DB failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    sqlMock.mockRejectedValueOnce(new Error("db down"));
    await expect(listPosts({})).resolves.toEqual({ posts: [], nextCursor: null });
    sqlMock.mockRejectedValueOnce(new Error("db down"));
    await expect(getPost(UUID_A)).resolves.toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("AC-E8: create validates 1-500 chars", async () => {
    sqlMock.mockResolvedValue([{ id: UUID_A }]);
    await expect(createPost("  hello  ")).resolves.toEqual({ id: UUID_A });
    expect(sqlMock.mock.calls[0].slice(1)).toContain("hello");
    expect(await statusOf(() => createPost("   "))).toBe(400);
    expect(await statusOf(() => createPost("x".repeat(501)))).toBe(400);
    expect(await statusOf(() => createPost(42))).toBe(400);
  });

  it("AC-E8: update validates and reports missing posts with 404", async () => {
    sqlMock.mockResolvedValue([
      { id: UUID_A, body: "new", created_at: "2024-05-01T00:00:00.000Z" },
    ]);
    await expect(updatePost(UUID_A, "new")).resolves.toMatchObject({
      id: UUID_A,
      body: "new",
    });
    sqlMock.mockResolvedValue([]);
    expect(await statusOf(() => updatePost(UUID_A, "new"))).toBe(404);
    expect(await statusOf(() => updatePost("bad-id", "new"))).toBe(404);
    expect(await statusOf(() => updatePost(UUID_A, ""))).toBe(400);
  });

  it("AC-E8: delete reports missing posts with 404", async () => {
    sqlMock.mockResolvedValue([{ id: UUID_A }]);
    await expect(deletePost(UUID_A)).resolves.toEqual({ ok: true });
    sqlMock.mockResolvedValue([]);
    expect(await statusOf(() => deletePost(UUID_A))).toBe(404);
    expect(await statusOf(() => deletePost("bad-id"))).toBe(404);
  });
});
