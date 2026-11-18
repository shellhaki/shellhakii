import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { adminRoute, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/origin";
import { createPost } from "@/lib/social/posts";

// POST /api/admin/posts {body} -> publish a post. Admin only.
export const POST = adminRoute(async (req: Request) => {
  assertSameOrigin(req);
  const { id } = await createPost((await readJson(req)).body);
  revalidateTag("posts", { expire: 0 });
  return NextResponse.json({ id }, { status: 201 });
});
