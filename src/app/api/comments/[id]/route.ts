import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { HttpError } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/origin";
import { getViewer } from "@/lib/auth/session";
import { deleteComment } from "@/lib/social/comments";

// DELETE /api/comments/[id] -> soft-delete. Author or admin session.
// An admin session without a viewer identity can still delete.
export async function DELETE(
  req: Request,
  ctx: RouteContext<"/api/comments/[id]">,
) {
  try {
    assertSameOrigin(req);
    const { id } = await ctx.params;
    const viewer = await getViewer();
    const admin = await isAdmin();
    if (!viewer && !admin) throw new HttpError(401, "Sign in required");
    return NextResponse.json(await deleteComment(id, viewer, admin));
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("comments DELETE failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
