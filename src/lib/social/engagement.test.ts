import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./store", () => ({
  likeTarget: vi.fn(),
  unlikeTarget: vi.fn(),
  getLikeCounts: vi.fn(),
  getCommentCounts: vi.fn(),
  getViewerLikedKeys: vi.fn(),
}));
vi.mock("./targets", () => ({
  validateTarget: vi.fn(),
  validateTargetsBatch: vi.fn(),
}));

import { HttpError } from "@/lib/api";
import { getSummaries, removeLike, setLike } from "./engagement";
import {
  getCommentCounts,
  getLikeCounts,
  getViewerLikedKeys,
  likeTarget,
  unlikeTarget,
} from "./store";
import { validateTarget, validateTargetsBatch } from "./targets";

const likeTargetMock = vi.mocked(likeTarget);
const unlikeTargetMock = vi.mocked(unlikeTarget);
const getLikeCountsMock = vi.mocked(getLikeCounts);
const getCommentCountsMock = vi.mocked(getCommentCounts);
const getViewerLikedKeysMock = vi.mocked(getViewerLikedKeys);
const validateTargetMock = vi.mocked(validateTarget);
const validateTargetsBatchMock = vi.mocked(validateTargetsBatch);

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";
const VIEWER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const VIEWER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

beforeEach(() => {
  validateTargetMock.mockImplementation(async (type: string) => type as "post");
  validateTargetsBatchMock.mockResolvedValue(undefined);
  likeTargetMock.mockResolvedValue(undefined);
  unlikeTargetMock.mockResolvedValue(undefined);
  getLikeCountsMock.mockImplementation(async (targets) => {
    const m = new Map<string, number>();
    for (const t of targets) m.set(`${t.type}:${t.id}`, 0);
    m.set(`post:${UUID_A}`, 2);
    return m;
  });
  getCommentCountsMock.mockImplementation(async (targets) => {
    const m = new Map<string, number>();
    for (const t of targets) m.set(`${t.type}:${t.id}`, 0);
    m.set(`post:${UUID_A}`, 3);
    return m;
  });
  getViewerLikedKeysMock.mockImplementation(async (viewerId) =>
    viewerId === VIEWER_A ? new Set([`post:${UUID_A}`]) : new Set<string>(),
  );
});

describe("engagement", () => {
  it("AC-E1: liking is idempotent and returns fresh counts", async () => {
    const first = await setLike("post", UUID_A, VIEWER_A);
    const second = await setLike("post", UUID_A, VIEWER_A);
    expect(first).toEqual({ likes: 2, comments: 3, liked: true });
    expect(second).toEqual(first);
    expect(likeTargetMock).toHaveBeenCalledTimes(2);
  });

  it("AC-E1: unliking is idempotent and clears the flag", async () => {
    const summary = await removeLike("post", UUID_A, VIEWER_A);
    expect(summary).toEqual({ likes: 2, comments: 3, liked: false });
    expect(unlikeTargetMock).toHaveBeenCalledWith(VIEWER_A, "post", UUID_A);
  });

  it("AC-E1: two viewers are counted separately", async () => {
    const a = await getSummaries([{ type: "post", id: UUID_A }], VIEWER_A);
    const b = await getSummaries([{ type: "post", id: UUID_A }], VIEWER_B);
    expect(a[`post:${UUID_A}`]?.liked).toBe(true);
    expect(b[`post:${UUID_A}`]?.liked).toBe(false);
    expect(a[`post:${UUID_A}`]?.likes).toBe(b[`post:${UUID_A}`]?.likes);
  });

  it("AC-E4: batch summaries share one query per count type", async () => {
    const out = await getSummaries(
      [
        { type: "post", id: UUID_A },
        { type: "post", id: UUID_B },
      ],
      VIEWER_A,
    );
    expect(getLikeCountsMock).toHaveBeenCalledTimes(1);
    expect(getCommentCountsMock).toHaveBeenCalledTimes(1);
    expect(getViewerLikedKeysMock).toHaveBeenCalledTimes(1);
    expect(out[`post:${UUID_A}`]).toEqual({ likes: 2, comments: 3, liked: true });
    expect(out[`post:${UUID_B}`]).toEqual({ likes: 0, comments: 0, liked: false });
  });

  it("AC-E4: signed-out summaries are never liked", async () => {
    const out = await getSummaries([{ type: "post", id: UUID_A }], null);
    expect(out[`post:${UUID_A}`]?.liked).toBe(false);
    expect(getViewerLikedKeysMock).not.toHaveBeenCalled();
  });

  it("AC-E4: rejects more than 50 targets with 400", async () => {
    const targets = Array.from({ length: 51 }, (_, i) => ({
      type: "post",
      id: `${UUID_A.slice(0, -2)}${String(i).padStart(2, "0")}`,
    }));
    try {
      await getSummaries(targets, null);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as HttpError).status).toBe(400);
    }
    expect(validateTargetsBatchMock).not.toHaveBeenCalled();
  });

  it("AC-E4: empty batch returns an empty map", async () => {
    await expect(getSummaries([], VIEWER_A)).resolves.toEqual({});
    expect(getLikeCountsMock).not.toHaveBeenCalled();
  });

  it("AC-E3: invalid targets surface 404 from validation", async () => {
    validateTargetsBatchMock.mockRejectedValueOnce(new HttpError(404, "Target not found"));
    try {
      await getSummaries([{ type: "post", id: "nope" }], null);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as HttpError).status).toBe(404);
    }
  });
});
