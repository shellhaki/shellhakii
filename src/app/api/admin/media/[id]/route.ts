import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { adminRoute, HttpError, readJson, requireSql, text } from "@/lib/api";
import { deleteObject } from "@/lib/r2";

const UUID = /^[0-9a-f-]{36}$/;

function idOf(id: string) {
  if (!UUID.test(id)) throw new HttpError(400, "Invalid id");
  return id;
}

// PATCH /api/admin/media/[id] -> update caption.
export const PATCH = adminRoute(
  async (req: Request, ctx: RouteContext<"/api/admin/media/[id]">) => {
    const id = idOf((await ctx.params).id);
    const body = await readJson(req);
    const sql = requireSql();
    const rows = await sql`
      update gallery_media set caption = ${text(body.caption, "caption", 300)}
      where id = ${id} returning id
    `;
    if (!rows.length) throw new HttpError(404, "Not found");
    revalidateTag("media", { expire: 0 });
    return NextResponse.json({ ok: true });
  },
);

// DELETE /api/admin/media/[id] -> remove row, then the R2 object.
export const DELETE = adminRoute(
  async (_req: Request, ctx: RouteContext<"/api/admin/media/[id]">) => {
    const id = idOf((await ctx.params).id);
    const sql = requireSql();
    const rows = await sql`delete from gallery_media where id = ${id} returning key`;
    if (!rows.length) throw new HttpError(404, "Not found");
    try {
      await deleteObject(rows[0].key);
    } catch (err) {
      console.error("R2 delete failed for", rows[0].key, err);
    }
    revalidateTag("media", { expire: 0 });
    return NextResponse.json({ ok: true });
  },
);
