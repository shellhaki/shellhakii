import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import {
  adminRoute,
  httpUrl,
  readJson,
  requireSql,
  tagList,
  text,
  uploadKey,
} from "@/lib/api";

// POST /api/admin/projects -> create a featured project.
export const POST = adminRoute(async (req: Request) => {
  const body = await readJson(req);
  const thumbnailKey = body.thumbnailKey ? uploadKey(body.thumbnailKey, "projects") : null;

  const sql = requireSql();
  const rows = await sql`
    insert into projects (title, summary, url, repo_url, thumbnail_key, tags)
    values (${text(body.title, "title", 120, true)},
            ${text(body.summary, "summary", 400, true)},
            ${httpUrl(body.url, "url")},
            ${httpUrl(body.repoUrl, "repoUrl")},
            ${thumbnailKey},
            ${tagList(body.tags)})
    returning id
  `;
  revalidateTag("projects", { expire: 0 });
  return NextResponse.json({ id: rows[0].id }, { status: 201 });
});
