import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { adminRoute, HttpError, readJson, requireSql, text, uploadKey } from "@/lib/api";
import { ALLOWED_TYPES } from "@/lib/r2";

function dimension(v: unknown, name: string) {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0 || n > 20000) {
    throw new HttpError(400, `${name} must be a positive integer`);
  }
  return n;
}

// POST /api/admin/media -> record an object already uploaded to R2.
export const POST = adminRoute(async (req: Request) => {
  const body = await readJson(req);
  const key = uploadKey(body.key, "media");
  const ext = key.split(".").pop()!;
  const kind = Object.values(ALLOWED_TYPES).find((t) => t.ext === ext)?.kind;
  if (!kind) throw new HttpError(400, "Unsupported file type");

  const sql = requireSql();
  const rows = await sql`
    insert into gallery_media (kind, key, width, height, caption)
    values (${kind}, ${key}, ${dimension(body.width, "width")},
            ${dimension(body.height, "height")}, ${text(body.caption, "caption", 300)})
    returning id
  `;
  revalidateTag("media", { expire: 0 });
  return NextResponse.json({ id: rows[0].id }, { status: 201 });
});
