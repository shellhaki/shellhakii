import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ getSql: vi.fn() }));

import { HttpError } from "@/lib/api";
import { getSql } from "@/lib/db";
import {
  decodeCursor,
  deletePostRow,
  encodeCursor,
  existingDbIds,
  getCommentById,
  getCommentCounts,
  getLikeCounts,
  getPostRow,
  getViewerLikedKeys,
  insertComment,
  likeTarget,
  listCommentsPage,
  listPostsPage,
  softDeleteComment,
  targetExists,
  unlikeTarget,
  updatePostRow,
} from "./store";

const getSqlMock = vi.mocked(getSql);
const sqlMock = vi.fn();

const queryText = (): string =>
  (sqlMock.mock.calls[0][0] as TemplateStringsArray).join("?");

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";
const UUID_C = "33333333-3333-3333-3333-333333333333";

beforeEach(() => {
  sqlMock.mockReset();
  sqlMock.mockResolvedValue([]);
  getSqlMock.mockReturnValue(
    sqlMock as unknown as NonNullable<ReturnType<typeof getSql>>,
  );
});

describe("store cursors", () => {
  it("AC-E6: encodes and decodes a keyset cursor", () => {
    const cursor = encodeCursor("2024-05-01T00:00:00.000Z", UUID_A);
    expect(decodeCursor(cursor)).toEqual({
      createdAt: "2024-05-01T00:00:00.000Z",
      id: UUID_A,
    });
  });

  it("AC-E6: missing or empty cursor means the first page", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  it.each(["!!!", "bm90LWN1cnNvcg", "not-base64-!!!"])(
    "AC-E6: rejects malformed cursor %j with 400",
    (cursor) => {
      try {
        decodeCursor(cursor);
        expect.unreachable("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(HttpError);
        expect((err as HttpError).status).toBe(400);
      }
    },
  );

  it("AC-E6: rejects a cursor payload without a uuid id with 400", () => {
    const bad = Buffer.from("2024-05-01T00:00:00.000Z|nope", "utf8").toString(
      "base64url",
    );
    try {
      decodeCursor(bad);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as HttpError).status).toBe(400);
    }
  });

  it("AC-E9: rejects a cursor with an invalid date with 400", () => {
    const bad = Buffer.from(`not-a-date|${UUID_A}`, "utf8").toString("base64url");
    try {
      decodeCursor(bad);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as HttpError).status).toBe(400);
    }
  });
});

describe("store batch counts", () => {
  it("AC-E1: counts likes for several targets with a single query", async () => {
    const targets = [
      { type: "post" as const, id: UUID_A },
      { type: "post" as const, id: UUID_B },
      { type: "project" as const, id: UUID_C },
    ];
    sqlMock.mockResolvedValue([
      { target_type: "post", target_id: UUID_A, n: 2 },
      { target_type: "project", target_id: UUID_C, n: 1 },
    ]);
    const counts = await getLikeCounts(targets);
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(queryText()).toContain("from likes");
    expect(counts.get(`post:${UUID_A}`)).toBe(2);
    expect(counts.get(`post:${UUID_B}`)).toBe(0);
    expect(counts.get(`project:${UUID_C}`)).toBe(1);
  });

  it("AC-E4: comment counts exclude soft-deleted rows in one query", async () => {
    sqlMock.mockResolvedValue([
      { target_type: "post", target_id: UUID_A, n: 4 },
    ]);
    const counts = await getCommentCounts([{ type: "post", id: UUID_A }]);
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(queryText()).toContain("deleted_at is null");
    expect(counts.get(`post:${UUID_A}`)).toBe(4);
  });

  it("AC-E4: viewer likes resolve with a single query", async () => {
    sqlMock.mockResolvedValue([{ target_type: "post", target_id: UUID_A }]);
    const liked = await getViewerLikedKeys("99999999-9999-9999-9999-999999999999", [
      { type: "post", id: UUID_A },
      { type: "post", id: UUID_B },
    ]);
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(liked.has(`post:${UUID_A}`)).toBe(true);
    expect(liked.has(`post:${UUID_B}`)).toBe(false);
  });

  it("AC-E4: empty batches and invalid viewers skip SQL entirely", async () => {
    expect(await getLikeCounts([])).toEqual(new Map());
    expect(await getCommentCounts([])).toEqual(new Map());
    expect(await getViewerLikedKeys(UUID_A, [])).toEqual(new Set());
    expect(
      await getViewerLikedKeys("not-a-uuid", [{ type: "post", id: UUID_A }]),
    ).toEqual(new Set());
    expect(sqlMock).not.toHaveBeenCalled();
  });
});

describe("store comment pages", () => {
  const row = (id: string, createdAt: string) => ({
    id,
    subscriber_id: UUID_A,
    target_type: "post",
    target_id: UUID_B,
    body: `body-${id}`,
    created_at: createdAt,
    display_name: "Haki",
  });

  it("AC-E6: lists newest first and pages with a cursor", async () => {
    sqlMock.mockResolvedValue([
      row(UUID_A, "2024-05-03T00:00:00.000Z"),
      row(UUID_B, "2024-05-02T00:00:00.000Z"),
      row(UUID_C, "2024-05-01T00:00:00.000Z"),
    ]);
    const first = await listCommentsPage("post", UUID_B, null, 2);
    expect(first.rows.map((r) => r.id)).toEqual([UUID_A, UUID_B]);
    expect(first.rows[0]).toMatchObject({
      targetType: "post",
      targetId: UUID_B,
      displayName: "Haki",
    });
    expect(first.nextCursor).not.toBeNull();

    // Second page passes the decoded cursor into SQL.
    sqlMock.mockClear();
    sqlMock.mockResolvedValue([row(UUID_C, "2024-05-01T00:00:00.000Z")]);
    const decoded = decodeCursor(first.nextCursor);
    const second = await listCommentsPage("post", UUID_B, decoded, 2);
    expect(second.rows.map((r) => r.id)).toEqual([UUID_C]);
    expect(second.nextCursor).toBeNull();
    expect(queryText()).toContain("order by c.created_at desc");
    expect(sqlMock.mock.calls[0].slice(1)).toContain("2024-05-02T00:00:00.000Z");
  });

  it("AC-E6: short final page has no next cursor", async () => {
    sqlMock.mockResolvedValue([row(UUID_A, "2024-05-01T00:00:00.000Z")]);
    const page = await listCommentsPage("post", UUID_B, null, 20);
    expect(page.rows).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });
});

describe("store targets and writes", () => {
  it("AC-E3: probes the right table per target type", async () => {
    sqlMock.mockResolvedValue([{ one: 1 }]);
    expect(await targetExists("gallery", UUID_A)).toBe(true);
    expect(queryText()).toContain("gallery_media");
    sqlMock.mockClear();
    sqlMock.mockResolvedValue([]);
    expect(await targetExists("post", UUID_A)).toBe(false);
    expect(queryText()).toContain("from posts");
  });

  it("AC-E3: skips SQL for non-uuid ids", async () => {
    expect(await targetExists("post", "abc123")).toBe(false);
    expect(await getCommentById("abc123")).toBeNull();
    expect(await getPostRow("abc123")).toBeNull();
    expect(await updatePostRow("abc123", "hi")).toBeNull();
    expect(await deletePostRow("abc123")).toBe(false);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("AC-E3: batches existence probes into one query", async () => {
    sqlMock.mockResolvedValue([{ id: UUID_A }]);
    const found = await existingDbIds("project", [UUID_A, UUID_B, "bad"]);
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(queryText()).toContain("from projects");
    expect(found.has(UUID_A)).toBe(true);
    expect(found.has(UUID_B)).toBe(false);
  });

  it("AC-E1: like and unlike hit SQL once each", async () => {
    await likeTarget(UUID_A, "post", UUID_B);
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(queryText()).toContain("on conflict");
    sqlMock.mockClear();
    await unlikeTarget(UUID_A, "post", UUID_B);
    expect(sqlMock).toHaveBeenCalledTimes(1);
    expect(queryText()).toContain("delete from likes");
  });

  it("AC-E7: comment lookup returns null when missing", async () => {
    sqlMock.mockResolvedValue([]);
    expect(await getCommentById(UUID_A)).toBeNull();
    expect(queryText()).toContain("deleted_at is null");
  });

  it("AC-E5: insert returns the new id and timestamp", async () => {
    sqlMock.mockResolvedValue([
      { id: UUID_C, created_at: "2024-05-01T00:00:00.000Z" },
    ]);
    await expect(
      insertComment(UUID_A, "post", UUID_B, "hello"),
    ).resolves.toEqual({ id: UUID_C, createdAt: "2024-05-01T00:00:00.000Z" });
    sqlMock.mockClear();
    sqlMock.mockResolvedValue([]);
    await softDeleteComment(UUID_C);
    expect(queryText()).toContain("deleted_at = now()");
  });

  it("AC-E9: post rows map to DTOs", async () => {
    sqlMock.mockResolvedValue([
      { id: UUID_A, body: "one", created_at: "2024-05-02T00:00:00.000Z" },
      { id: UUID_B, body: "two", created_at: "2024-05-01T00:00:00.000Z" },
    ]);
    const page = await listPostsPage(null, 20);
    expect(page.rows).toEqual([
      { id: UUID_A, body: "one", createdAt: "2024-05-02T00:00:00.000Z" },
      { id: UUID_B, body: "two", createdAt: "2024-05-01T00:00:00.000Z" },
    ]);
    expect(page.nextCursor).toBeNull();
    sqlMock.mockResolvedValue([]);
    expect(await getPostRow(UUID_A)).toBeNull();
  });

  it("AC-E8: update returns null and delete returns false when missing", async () => {
    sqlMock.mockResolvedValue([]);
    expect(await updatePostRow(UUID_A, "new")).toBeNull();
    expect(await deletePostRow(UUID_A)).toBe(false);
  });
});
