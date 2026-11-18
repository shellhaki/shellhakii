import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getViewer: vi.fn() }));
vi.mock("@/lib/auth/origin", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/lib/social/comments", () => ({
  listComments: vi.fn(),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
}));

import { HttpError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/origin";
import { getViewer } from "@/lib/auth/session";
import { addComment, listComments } from "@/lib/social/comments";
import type { CommentDTO } from "@/lib/social/types";
import { GET, POST } from "./route";

const getViewerMock = vi.mocked(getViewer);
const assertSameOriginMock = vi.mocked(assertSameOrigin);
const listCommentsMock = vi.mocked(listComments);
const addCommentMock = vi.mocked(addComment);

const UUID_A = "11111111-1111-1111-1111-111111111111";
const VIEWER = { id: UUID_A, email: "viewer@example.com", displayName: "Haki" };
const DTO: CommentDTO = {
  id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  targetType: "post",
  targetId: UUID_A,
  body: "hello",
  createdAt: "2024-05-01T00:00:00.000Z",
  author: { displayName: "Haki" },
  mine: true,
};

const get = (qs: string) => new Request(`http://localhost/api/comments?${qs}`);

const post = (body: unknown) =>
  new Request("http://localhost/api/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("comments route", () => {
  it("AC-E6: GET returns the newest-first page", async () => {
    getViewerMock.mockResolvedValue(null);
    listCommentsMock.mockResolvedValue({ comments: [DTO], nextCursor: null });
    const res = await GET(get(`targetType=post&targetId=${UUID_A}`));
    expect(res.status).toBe(200);
    expect(listCommentsMock).toHaveBeenCalledWith("post", UUID_A, {
      cursor: null,
      viewerId: null,
    });
    expect(await res.json()).toEqual({ comments: [DTO], nextCursor: null });
  });

  it("AC-E6: GET forwards cursor and viewer", async () => {
    getViewerMock.mockResolvedValue(VIEWER);
    listCommentsMock.mockResolvedValue({ comments: [], nextCursor: "c2" });
    await GET(get(`targetType=post&targetId=${UUID_A}&cursor=c2`));
    expect(listCommentsMock).toHaveBeenCalledWith("post", UUID_A, {
      cursor: "c2",
      viewerId: UUID_A,
    });
  });

  it("AC-E3: GET requires target params and maps bad cursors to 400", async () => {
    getViewerMock.mockResolvedValue(null);
    expect((await GET(get(`targetType=post`))).status).toBe(400);
    listCommentsMock.mockRejectedValueOnce(new HttpError(400, "Invalid cursor"));
    expect(
      (await GET(get(`targetType=post&targetId=${UUID_A}&cursor=bad`))).status,
    ).toBe(400);
  });

  it("AC-E3: GET maps invalid targets to 404", async () => {
    getViewerMock.mockResolvedValue(null);
    listCommentsMock.mockRejectedValueOnce(new HttpError(404, "Target not found"));
    const res = await GET(get(`targetType=post&targetId=missing`));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Target not found" });
  });

  it("AC-E5: POST creates a comment for signed-in viewers", async () => {
    getViewerMock.mockResolvedValue(VIEWER);
    addCommentMock.mockResolvedValue({ ...DTO, targetType: "post" as const });
    const res = await POST(
      post({ targetType: "post", targetId: UUID_A, body: "hello" }),
    );
    expect(res.status).toBe(200);
    expect(addCommentMock).toHaveBeenCalledWith("post", UUID_A, "hello", VIEWER);
    expect(await res.json()).toEqual({ ...DTO, targetType: "post" });
  });

  it("AC-E2: signed-out POST gets 401", async () => {
    getViewerMock.mockResolvedValue(null);
    const res = await POST(
      post({ targetType: "post", targetId: UUID_A, body: "hello" }),
    );
    expect(res.status).toBe(401);
    expect(addCommentMock).not.toHaveBeenCalled();
  });

  it("AC-E10: cross-origin POST is rejected before the viewer check", async () => {
    assertSameOriginMock.mockImplementationOnce(() => {
      throw new HttpError(403, "Forbidden");
    });
    const res = await POST(
      post({ targetType: "post", targetId: UUID_A, body: "hello" }),
    );
    expect(res.status).toBe(403);
    expect(getViewerMock).not.toHaveBeenCalled();
  });

  it("AC-E5: validation and rate limits map to 400 and 429", async () => {
    getViewerMock.mockResolvedValue(VIEWER);
    addCommentMock.mockRejectedValueOnce(new HttpError(400, "Comment must be 1-1000 characters"));
    expect(
      (await POST(post({ targetType: "post", targetId: UUID_A, body: "" }))).status,
    ).toBe(400);
    addCommentMock.mockRejectedValueOnce(new HttpError(429, "Too many comments. Try again later."));
    expect(
      (await POST(post({ targetType: "post", targetId: UUID_A, body: "hi" }))).status,
    ).toBe(429);
  });
});
