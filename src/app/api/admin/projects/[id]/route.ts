import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import {
  adminRoute,
  httpUrl,
  HttpError,
  readJson,
  requireSql,
  tagList,
  text,
  uploadKey,
} from "@/lib/api";
import { deleteObject } from "@/lib/r2";

const UUID = /^[0-9a-f-]{36}$/;

function idOf(id: string) {
  if (!UUID.test(id)) throw new HttpError(400, "Invalid id");
  return id;
}

// PATCH /api/admin/projects/[id] -> partial update; omitted fields are kept.
export const PATCH = adminRoute(
  async (req: Request, ctx: RouteContext<"/api/admin/projects/[id]">) => {
    const id = idOf((await ctx.params).id);
    const b = await readJson(req);
    const has = (k: string) => k in b;
    const sql = requireSql();

    const [current] = await sql`select thumbnail_key from projects where id = ${id}`;
    if (!current) throw new HttpError(404, "Not found");

    const thumbnailKey = has("thumbnailKey")
      ? b.thumbnailKey
        ? uploadKey(b.thumbnailKey, "projects")
        : null
      : current.thumbnail_key;

    await sql`
      update projects set
        title = coalesce(${has("title") ? text(b.title, "title", 120, true) : null}, title),
        summary = coalesce(${has("summary") ? text(b.summary, "summary", 400, true) : null}, summary),
        url = case when ${has("url")} then ${httpUrl(b.url, "url")} else url end,
        repo_url = case when ${has("repoUrl")} then ${httpUrl(b.repoUrl, "repoUrl")} else repo_url end,
        tags = case when ${has("tags")} then ${tagList(b.tags)} else tags end,
        position = case when ${has("position")} then ${Number.isInteger(b.position) ? (b.position as number) : 0} else position end,
        thumbnail_key = ${thumbnailKey}
      where id = ${id}
    `;

    if (current.thumbnail_key && current.thumbnail_key !== thumbnailKey) {
      await deleteObject(current.thumbnail_key).catch((e) =>
        console.error("R2 delete failed", e),
      );
    }
    revalidateTag("projects", { expire: 0 });
    return NextResponse.json({ ok: true });
  },
);

// DELETE /api/admin/projects/[id] -> remove row and its thumbnail object.
export const DELETE = adminRoute(
  async (_req: Request, ctx: RouteContext<"/api/admin/projects/[id]">) => {
    const id = idOf((await ctx.params).id);
    const sql = requireSql();
    const rows = await sql`delete from projects where id = ${id} returning thumbnail_key`;
    if (!rows.length) throw new HttpError(404, "Not found");
    if (rows[0].thumbnail_key) {
      await deleteObject(rows[0].thumbnail_key).catch((e) =>
        console.error("R2 delete failed", e),
      );
    }
    revalidateTag("projects", { expire: 0 });
    return NextResponse.json({ ok: true });
  },
);
