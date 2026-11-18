import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./store", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./store")>();
  return {
    ...orig,
    getCommentById: vi.fn(),
    insertComment: vi.fn(),
    listCommentsPage: vi.fn(),
    softDeleteComment: vi.fn(),
  };
});
vi.mock("./targets", () => ({ validateTarget: vi.fn() }));

import { HttpError } from "@/lib/api";
import type { Viewer } from "./types";
import { addComment, deleteComment, listComments } from "./comments";
import {
  getCommentById,
  insertComment,
  listCommentsPage,
  softDeleteComment,
} from "./store";
import { validateTarget } from "./targets";

const getCommentByIdMock = vi.mocked(getCommentById);
const insertCommentMock = vi.mocked(insertComment);
const listCommentsPageMock = vi.mocked(listCommentsPage);
const softDeleteCommentMock = vi.mocked(softDeleteComment);
const validateTargetMock = vi.mocked(validateTarget);

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";
const UUID_C = "33333333-3333-3333-3333-333333333333";

const viewer = (id: string, displayName = "Haki"): Viewer => ({
  id,
  email: "viewer@example.com",
  displayName,
});

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
  validateTargetMock.mockReset();
  validateTargetMock.mockImplementation(async (type: string) => type as "post");
  listCommentsPageMock.mockReset();
  listCommentsPageMock.mockResolvedValue({ rows: [], nextCursor: null });
  insertCommentMock.mockReset();
  insertCommentMock.mockImplementation(async () => ({
    id: UUID_C,
    createdAt: "2024-05-01T00:00:00.000Z",
  }));
});

describe("comments", () => {
  it("AC-E5: trims the body before saving", async () => {
    const dto = await addComment("post", UUID_A, "  hello  ", viewer(UUID_B));
    expect(insertCommentMock).toHaveBeenCalledWith(UUID_B, "post", UUID_A, "hello");
    expect(dto.body).toBe("hello");
    expect(dto.mine).toBe(true);
    expect(dto.author).toEqual({ displayName: "Haki" });
  });

  it("AC-E5: rejects empty, overlong, and non-string bodies with 400", async () => {
    expect(await statusOf(() => addComment("post", UUID_A, "   ", viewer(UUID_B)))).toBe(400);
    expect(await statusOf(() => addComment("post", UUID_A, "x".repeat(1001), viewer(UUID_B)))).toBe(400);
    expect(await statusOf(() => addComment("post", UUID_A, 42, viewer(UUID_B)))).toBe(400);
    expect(await statusOf(() => addComment("post", UUID_A, undefined, viewer(UUID_B)))).toBe(400);
    expect(insertCommentMock).not.toHaveBeenCalled();
  });

  it("AC-E5: rejects more than 2 URLs with 400 but allows 2", async () => {
    expect(
      await statusOf(() =>
        addComment("post", UUID_A, "a https://a.example b https://b.example c https://c.example", viewer(UUID_B)),
      ),
    ).toBe(400);
    insertCommentMock.mockClear();
    await addComment("post", UUID_A, "a https://a.example b www.b.example", viewer(UUID_B));
    expect(insertCommentMock).toHaveBeenCalledTimes(1);
  });

  it("AC-E5: limits each viewer to 5 comments per minute with 429", async () => {
    const v = viewer("55555555-5555-5555-5555-555555555555");
    for (let i = 0; i < 5; i += 1) {
      await addComment("post", UUID_A, `comment ${i}`, v);
    }
    expect(await statusOf(() => addComment("post", UUID_A, "one too many", v))).toBe(429);
  });

  it("AC-E6: lists newest first with cursor and mine flags", async () => {
    listCommentsPageMock.mockResolvedValue({
      rows: [
        { id: UUID_A, subscriberId: UUID_B, targetType: "post", targetId: UUID_A, body: "one", createdAt: "2024-05-02T00:00:00.000Z", displayName: "Haki" },
        { id: UUID_B, subscriberId: UUID_C, targetType: "post", targetId: UUID_A, body: "two", createdAt: "2024-05-01T00:00:00.000Z", displayName: "Ada" },
      ],
      nextCursor: "cursor-1",
    });
    const page = await listComments("post", UUID_A, { viewerId: UUID_B });
    expect(page.comments.map((c) => c.id)).toEqual([UUID_A, UUID_B]);
    expect(page.nextCursor).toBe("cursor-1");
    expect(page.comments[0]).toMatchObject({ mine: true, author: { displayName: "Haki" } });
    expect(page.comments[1]).toMatchObject({ mine: false });
    expect(listCommentsPageMock).toHaveBeenCalledWith("post", UUID_A, null, 20);
  });

  it("AC-E6: signed-out listing marks nothing as mine", async () => {
    listCommentsPageMock.mockResolvedValue({
      rows: [
        { id: UUID_A, subscriberId: UUID_B, targetType: "post", targetId: UUID_A, body: "one", createdAt: "2024-05-01T00:00:00.000Z", displayName: "Haki" },
      ],
      nextCursor: null,
    });
    const page = await listComments("post", UUID_A, {});
    expect(page.comments[0]?.mine).toBe(false);
  });

  it("AC-E7: the author can delete their comment", async () => {
    getCommentByIdMock.mockResolvedValue({
      id: UUID_C, subscriberId: UUID_B, targetType: "post", targetId: UUID_A, deletedAt: null,
    });
    await expect(deleteComment(UUID_C, viewer(UUID_B), false)).resolves.toEqual({ ok: true });
    expect(softDeleteCommentMock).toHaveBeenCalledWith(UUID_C);
  });

  it("AC-E7: an admin can delete someone else's comment", async () => {
    getCommentByIdMock.mockResolvedValue({
      id: UUID_C, subscriberId: UUID_B, targetType: "post", targetId: UUID_A, deletedAt: null,
    });
    await expect(deleteComment(UUID_C, null, true)).resolves.toEqual({ ok: true });
  });

  it("AC-E7: strangers get 403", async () => {
    getCommentByIdMock.mockResolvedValue({
      id: UUID_C, subscriberId: UUID_B, targetType: "post", targetId: UUID_A, deletedAt: null,
    });
    expect(await statusOf(() => deleteComment(UUID_C, viewer(UUID_A), false))).toBe(403);
    expect(softDeleteCommentMock).not.toHaveBeenCalled();
  });

  it("AC-E7: unknown ids get 404", async () => {
    getCommentByIdMock.mockResolvedValue(null);
    expect(await statusOf(() => deleteComment("nope-not-a-row", viewer(UUID_B), false))).toBe(404);
  });

  it("AC-E2: anonymous non-admin deletes get 401", async () => {
    expect(await statusOf(() => deleteComment(UUID_C, null, false))).toBe(401);
    expect(getCommentByIdMock).not.toHaveBeenCalled();
  });
});
