import { cacheLife, cacheTag } from "next/cache";
import { getSql } from "./db";
import { publicUrl } from "./r2";

export type Project = {
  id: string;
  title: string;
  summary: string;
  url: string | null;
  repoUrl: string | null;
  thumbnailUrl: string | null;
  tags: string[];
  year: number;
  position: number;
};

export async function getProjects(limit?: number): Promise<Project[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("projects");

  const sql = getSql();
  if (!sql) return [];

  try {
    const rows = await sql`
      select id, title, summary, url, repo_url, thumbnail_key, tags,
             position, extract(year from created_at)::int as year
      from projects
      order by position asc, created_at desc
      limit ${limit ?? 100}
    `;
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      url: r.url,
      repoUrl: r.repo_url,
      thumbnailUrl: r.thumbnail_key ? publicUrl(r.thumbnail_key) : null,
      tags: r.tags ?? [],
      year: r.year,
      position: r.position,
    }));
  } catch (err) {
    console.error("getProjects failed", err);
    return [];
  }
}
