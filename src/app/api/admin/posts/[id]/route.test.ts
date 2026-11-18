import { revalidateTag } from "next/cache";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ isAdmin: vi.fn() }));
vi.mock("@/lib/auth/origin", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/lib/social/posts", () => ({
  updatePost: vi.fn(),
  deletePost: vi.fn(),
}));

import { isAdmin } from "@/lib/admin-auth";
import { HttpError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/origin";
import { deletePost, updatePost } from "@/lib/social/posts";
import { DELETE, PATCH } from "./route";

const isAdminMock = vi.mocked(isAdmin);
const assertSameOriginMock = vi.mocked(assertSameOrigin);
const updatePostMock = vi.mocked(updatePost);
const deletePostMock = vi.mocked(deletePost);
const revalidateTagMock = vi.mocked(revalidateTag);

const UUID_A = "11111111-1111-1111-1111-111111111111";
const ctx: RouteContext<"/api/admin/posts/[id]"> = {
  params: Promise.resolve({ id: UUID_A }),
};

const patch = (body: unknown) =>
  new Request(`http://localhost/api/admin/posts/${UUID_A}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const del = () =>
  new Request(`http://localhost/api/admin/posts/${UUID_A}`, {
    method: "DELETE",
  });

describe("admin posts [id] route", () => {
  it("AC-E8: admins edit and revalidate the posts tag", async () => {
    isAdminMock.mockResolvedValue(true);
    updatePostMock.mockResolvedValue({
      id: UUID_A,
      body: "edited",
      createdAt: "2024-05-01T00:00:00.000Z",
    });
    const res = await PATCH(patch({ body: "edited" }), ctx);
    expect(res.status).toBe(200);
    expect(updatePostMock).toHaveBeenCalledWith(UUID_A, "edited");
    expect(revalidateTagMock).toHaveBeenCalledWith("posts", { expire: 0 });
    expect(await res.json()).toMatchObject({ id: UUID_A, body: "edited" });
  });

  it("AC-E8: admins delete and revalidate the posts tag", async () => {
    isAdminMock.mockResolvedValue(true);
    deletePostMock.mockResolvedValue({ ok: true });
    const res = await DELETE(del(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(revalidateTagMock).toHaveBeenCalledWith("posts", { expire: 0 });
  });

  it("AC-E8: non-admins get 401 and missing posts get 404", async () => {
    isAdminMock.mockResolvedValue(false);
    expect((await PATCH(patch({ body: "x" }), ctx)).status).toBe(401);
    expect((await DELETE(del(), ctx)).status).toBe(401);
    isAdminMock.mockResolvedValue(true);
    deletePostMock.mockRejectedValueOnce(new HttpError(404, "Post not found"));
    expect((await DELETE(del(), ctx)).status).toBe(404);
  });

  it("AC-E8: malformed ids get 400 without touching the store", async () => {
    isAdminMock.mockResolvedValue(true);
    const badCtx: RouteContext<"/api/admin/posts/[id]"> = {
      params: Promise.resolve({ id: "not-a-uuid!" }),
    };
    expect((await DELETE(del(), badCtx)).status).toBe(400);
    expect(deletePostMock).not.toHaveBeenCalled();
  });

  it("AC-E10: cross-origin admin writes are rejected", async () => {
    isAdminMock.mockResolvedValue(true);
    assertSameOriginMock.mockImplementationOnce(() => {
      throw new HttpError(403, "Forbidden");
    });
    expect((await PATCH(patch({ body: "x" }), ctx)).status).toBe(403);
    expect(updatePostMock).not.toHaveBeenCalled();
  });
});
