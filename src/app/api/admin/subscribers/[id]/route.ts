import { NextResponse } from "next/server";
import { adminRoute, HttpError } from "@/lib/api";
import { deleteSubscriber } from "@/lib/subscribers";

// DELETE /api/admin/subscribers/[id] -> remove a subscriber entirely.
export const DELETE = adminRoute(
  async (_req: Request, ctx: RouteContext<"/api/admin/subscribers/[id]">) => {
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, "Invalid id");
    if (!(await deleteSubscriber(id))) throw new HttpError(404, "Not found");
    return NextResponse.json({ ok: true });
  },
);
