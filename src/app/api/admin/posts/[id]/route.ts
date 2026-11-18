import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { HttpError, adminRoute, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/origin";
import { deletePost, updatePost } from "@/lib/social/posts";

const UUID = /^[0-9a-f-]{36}$/;

const idOf = (id: string): string => {
  if (!UUID.test(id)) throw new HttpError(400, "Invalid id");
  return id;
};

// PATCH /api/admin/posts/[id] {body} -> edit a post. Admin only.
export const PATCH = adminRoute(
  async (req: Request, ctx: RouteContext<"/api/admin/posts/[id]">) => {
    assertSameOrigin(req);
    const id = idOf((await ctx.params).id);
    const post = await updatePost(id, (await readJson(req)).body);
    revalidateTag("posts", { expire: 0 });
    return NextResponse.json(post);
  },
);

// DELETE /api/admin/posts/[id] -> remove a post. Admin only.
export const DELETE = adminRoute(
  async (req: Request, ctx: RouteContext<"/api/admin/posts/[id]">) => {
    assertSameOrigin(req);
    await deletePost(idOf((await ctx.params).id));
    revalidateTag("posts", { expire: 0 });
    return NextResponse.json({ ok: true });
  },
);
