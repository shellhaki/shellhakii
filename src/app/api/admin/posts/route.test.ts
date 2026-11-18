import { revalidateTag } from "next/cache";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-auth", () => ({ isAdmin: vi.fn() }));
vi.mock("@/lib/auth/origin", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/lib/social/posts", () => ({ createPost: vi.fn() }));

import { isAdmin } from "@/lib/admin-auth";
import { HttpError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/origin";
import { createPost } from "@/lib/social/posts";
import { POST } from "./route";

const isAdminMock = vi.mocked(isAdmin);
const assertSameOriginMock = vi.mocked(assertSameOrigin);
const createPostMock = vi.mocked(createPost);
const revalidateTagMock = vi.mocked(revalidateTag);

const post = (body: unknown) =>
  new Request("http://localhost/api/admin/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("admin posts route", () => {
  it("AC-E8: admins publish and revalidate the posts tag", async () => {
    isAdminMock.mockResolvedValue(true);
    createPostMock.mockResolvedValue({ id: "new-id" });
    const res = await POST(post({ body: "hello" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "new-id" });
    expect(createPostMock).toHaveBeenCalledWith("hello");
    expect(revalidateTagMock).toHaveBeenCalledWith("posts", { expire: 0 });
  });

  it("AC-E8: non-admins get 401", async () => {
    isAdminMock.mockResolvedValue(false);
    const res = await POST(post({ body: "hello" }));
    expect(res.status).toBe(401);
    expect(createPostMock).not.toHaveBeenCalled();
  });

  it("AC-E8: invalid bodies map to 400", async () => {
    isAdminMock.mockResolvedValue(true);
    createPostMock.mockRejectedValueOnce(new HttpError(400, "Post must be 1-500 characters"));
    const res = await POST(post({ body: "" }));
    expect(res.status).toBe(400);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("AC-E10: cross-origin admin writes are rejected", async () => {
    isAdminMock.mockResolvedValue(true);
    assertSameOriginMock.mockImplementationOnce(() => {
      throw new HttpError(403, "Forbidden");
    });
    expect((await POST(post({ body: "hello" }))).status).toBe(403);
    expect(createPostMock).not.toHaveBeenCalled();
  });
});
