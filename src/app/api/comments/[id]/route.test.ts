import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getViewer: vi.fn() }));
vi.mock("@/lib/auth/origin", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ isAdmin: vi.fn() }));
vi.mock("@/lib/social/comments", () => ({ deleteComment: vi.fn() }));

import { isAdmin } from "@/lib/admin-auth";
import { HttpError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/origin";
import { getViewer } from "@/lib/auth/session";
import { deleteComment } from "@/lib/social/comments";
import { DELETE } from "./route";

const getViewerMock = vi.mocked(getViewer);
const assertSameOriginMock = vi.mocked(assertSameOrigin);
const isAdminMock = vi.mocked(isAdmin);
const deleteCommentMock = vi.mocked(deleteComment);

const UUID_A = "11111111-1111-1111-1111-111111111111";
const COMMENT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const VIEWER = { id: UUID_A, email: "viewer@example.com", displayName: "Haki" };

const del = () =>
  new Request(`http://localhost/api/comments/${COMMENT_ID}`, {
    method: "DELETE",
  });

const ctx: RouteContext<"/api/comments/[id]"> = {
  params: Promise.resolve({ id: COMMENT_ID }),
};

describe("comments [id] route", () => {
  it("AC-E7: the author deletes with 200", async () => {
    getViewerMock.mockResolvedValue(VIEWER);
    isAdminMock.mockResolvedValue(false);
    deleteCommentMock.mockResolvedValue({ ok: true });
    const res = await DELETE(del(), ctx);
    expect(res.status).toBe(200);
    expect(deleteCommentMock).toHaveBeenCalledWith(COMMENT_ID, VIEWER, false);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("AC-E7: admin sessions pass through to the logic", async () => {
    getViewerMock.mockResolvedValue(null);
    isAdminMock.mockResolvedValue(true);
    deleteCommentMock.mockResolvedValue({ ok: true });
    const res = await DELETE(del(), ctx);
    expect(res.status).toBe(200);
    expect(deleteCommentMock).toHaveBeenCalledWith(COMMENT_ID, null, true);
  });

  it("AC-E7: forbidden and missing map to 403 and 404", async () => {
    getViewerMock.mockResolvedValue(VIEWER);
    isAdminMock.mockResolvedValue(false);
    deleteCommentMock.mockRejectedValueOnce(new HttpError(403, "Not allowed"));
    expect((await DELETE(del(), ctx)).status).toBe(403);
    deleteCommentMock.mockRejectedValueOnce(new HttpError(404, "Comment not found"));
    expect((await DELETE(del(), ctx)).status).toBe(404);
  });

  it("AC-E2: anonymous non-admin deletes get 401", async () => {
    getViewerMock.mockResolvedValue(null);
    isAdminMock.mockResolvedValue(false);
    expect((await DELETE(del(), ctx)).status).toBe(401);
    expect(deleteCommentMock).not.toHaveBeenCalled();
  });

  it("AC-E10: cross-origin deletes are rejected first", async () => {
    assertSameOriginMock.mockImplementationOnce(() => {
      throw new HttpError(403, "Forbidden");
    });
    expect((await DELETE(del(), ctx)).status).toBe(403);
  });
});
