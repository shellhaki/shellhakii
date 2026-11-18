import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getViewer: vi.fn() }));
vi.mock("@/lib/auth/origin", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/lib/social/engagement", () => ({
  setLike: vi.fn(),
  removeLike: vi.fn(),
}));

import { HttpError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/origin";
import { getViewer } from "@/lib/auth/session";
import { removeLike, setLike } from "@/lib/social/engagement";
import { DELETE, PUT } from "./route";

const getViewerMock = vi.mocked(getViewer);
const assertSameOriginMock = vi.mocked(assertSameOrigin);
const setLikeMock = vi.mocked(setLike);
const removeLikeMock = vi.mocked(removeLike);

const UUID_A = "11111111-1111-1111-1111-111111111111";
const VIEWER = { id: UUID_A, email: "viewer@example.com", displayName: "Haki" };
const SUMMARY = { likes: 2, comments: 1, liked: true };

const put = (body: unknown) =>
  new Request("http://localhost/api/likes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const del = (body: unknown) =>
  new Request("http://localhost/api/likes", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("likes route", () => {
  it("AC-E1: PUT likes and returns the fresh summary", async () => {
    getViewerMock.mockResolvedValue(VIEWER);
    setLikeMock.mockResolvedValue(SUMMARY);
    const res = await PUT(put({ targetType: "post", targetId: UUID_A }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(SUMMARY);
    expect(setLikeMock).toHaveBeenCalledWith("post", UUID_A, UUID_A);
  });

  it("AC-E1: DELETE unlikes and returns the fresh summary", async () => {
    getViewerMock.mockResolvedValue(VIEWER);
    removeLikeMock.mockResolvedValue({ ...SUMMARY, liked: false });
    const res = await DELETE(del({ targetType: "post", targetId: UUID_A }));
    expect(await res.json()).toEqual({ ...SUMMARY, liked: false });
  });

  it("AC-E2: signed-out PUT and DELETE get 401", async () => {
    getViewerMock.mockResolvedValue(null);
    expect((await PUT(put({ targetType: "post", targetId: UUID_A }))).status).toBe(401);
    expect((await DELETE(del({ targetType: "post", targetId: UUID_A }))).status).toBe(401);
    expect(setLikeMock).not.toHaveBeenCalled();
    expect(removeLikeMock).not.toHaveBeenCalled();
  });

  it("AC-E10: cross-origin requests are rejected before the viewer check", async () => {
    assertSameOriginMock.mockImplementationOnce(() => {
      throw new HttpError(403, "Forbidden");
    });
    const res = await PUT(put({ targetType: "post", targetId: UUID_A }));
    expect(res.status).toBe(403);
    expect(getViewerMock).not.toHaveBeenCalled();
  });

  it("AC-E3: invalid targets map to 404 JSON", async () => {
    getViewerMock.mockResolvedValue(VIEWER);
    setLikeMock.mockRejectedValueOnce(new HttpError(404, "Target not found"));
    const res = await PUT(put({ targetType: "post", targetId: "missing" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Target not found" });
  });

  it("AC-E3: missing target fields map to 400 JSON", async () => {
    getViewerMock.mockResolvedValue(VIEWER);
    const res = await PUT(put({ targetType: "post" }));
    expect(res.status).toBe(400);
  });

  it("AC-G2: summary responses carry only the public keys", async () => {
    getViewerMock.mockResolvedValue(VIEWER);
    setLikeMock.mockResolvedValue(SUMMARY);
    const res = await PUT(put({ targetType: "post", targetId: UUID_A }));
    expect(Object.keys(await res.json()).sort()).toEqual([
      "comments",
      "liked",
      "likes",
    ]);
  });
});
