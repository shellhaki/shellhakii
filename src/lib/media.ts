import { cacheLife, cacheTag } from "next/cache";
import { getSql } from "./db";
import { publicUrl } from "./r2";

export type Media = {
  id: string;
  kind: "image" | "video";
  url: string;
  width: number | null;
  height: number | null;
  caption: string | null;
};

export async function getMedia(kind?: "image" | "video"): Promise<Media[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("media");

  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = kind
      ? await sql`select id, kind, key, width, height, caption from gallery_media
                  where kind = ${kind} order by created_at desc limit 200`
      : await sql`select id, kind, key, width, height, caption from gallery_media
                  order by created_at desc limit 200`;
    return rows.flatMap((r) => {
      const url = publicUrl(r.key);
      return url
        ? [{ id: r.id, kind: r.kind, url, width: r.width, height: r.height, caption: r.caption }]
        : [];
    });
  } catch (err) {
    console.error("getMedia failed", err);
    return [];
  }
}
