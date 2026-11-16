import "server-only";
import { getSql } from "./db";
import { getRepos, type Repo } from "./github";
import { escapeHtml, siteUrl } from "./mail";
import { getArticles, type Article } from "./medium";
import { publicUrl } from "./r2";

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type DigestProject = { title: string; summary: string; href: string };
export type DigestMedia = { kind: "image" | "video"; url: string };

export type Digest = {
  since: string;
  projects: DigestProject[];
  articles: Pick<Article, "id" | "title" | "excerpt">[];
  repos: Pick<Repo, "name" | "description" | "url">[];
  media: DigestMedia[];
};

export const digestIsEmpty = (d: Digest) =>
  !d.projects.length && !d.articles.length && !d.repos.length && !d.media.length;

/** Content published after the last digest (or the last 30 days if none was sent). */
export async function buildDigest(): Promise<Digest> {
  const sql = getSql();
  if (!sql) throw new Error("Missing required env var: DATABASE_URL");

  const [last] = await sql`select max(sent_at) as at from digests`;
  const since = last?.at ? new Date(last.at) : new Date(Date.now() - DEFAULT_WINDOW_MS);
  const base = siteUrl();

  const [projectRows, mediaRows, articles, repos] = await Promise.all([
    sql`select title, summary, url, repo_url from projects
        where created_at > ${since.toISOString()} order by created_at desc limit 10`,
    sql`select kind, key from gallery_media
        where created_at > ${since.toISOString()} order by created_at desc limit 50`,
    getArticles().catch((err) => {
      console.error("digest: articles failed", err);
      return [] as Article[];
    }),
    getRepos().catch((err) => {
      console.error("digest: repos failed", err);
      return [] as Repo[];
    }),
  ]);

  return {
    since: since.toISOString(),
    projects: projectRows.map((p) => ({
      title: p.title,
      summary: p.summary,
      href: p.url ?? p.repo_url ?? `${base}/projects`,
    })),
    articles: articles
      .filter((a) => new Date(a.publishedAt) > since)
      .map(({ id, title, excerpt }) => ({ id, title, excerpt })),
    repos: repos
      .filter((r) => new Date(r.createdAt) > since)
      .map(({ name, description, url }) => ({ name, description, url })),
    media: mediaRows.flatMap((m) => {
      const url = publicUrl(m.key);
      return url ? [{ kind: m.kind, url }] : [];
    }),
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function subjectFor(d: Digest) {
  const parts = [
    d.projects.length && plural(d.projects.length, "project"),
    d.articles.length && plural(d.articles.length, "article"),
    d.repos.length && plural(d.repos.length, "repo"),
    d.media.length && plural(d.media.length, "gallery post"),
  ].filter(Boolean);
  return parts.length ? `New from shellhaki: ${parts.join(", ")}` : "A note from shellhaki";
}

/** Render the digest as subject + HTML + plain text for one recipient. */
export function renderDigest(
  d: Digest,
  opts: { note?: string; unsubscribeUrl: string },
) {
  const base = siteUrl();
  const note = opts.note?.trim();
  const subject = subjectFor(d);

  // --- plain text
  const t: string[] = [];
  if (note) t.push(note, "");
  if (d.projects.length) {
    t.push("PROJECTS");
    for (const p of d.projects) t.push(`- ${p.title}: ${p.summary}`, `  ${p.href}`);
    t.push("");
  }
  if (d.articles.length) {
    t.push("ARTICLES");
    for (const a of d.articles) t.push(`- ${a.title}`, `  ${base}/articles/${a.id}`);
    t.push("");
  }
  if (d.repos.length) {
    t.push("REPOS");
    for (const r of d.repos) t.push(`- ${r.name}${r.description ? `: ${r.description}` : ""}`, `  ${r.url}`);
    t.push("");
  }
  if (d.media.length) {
    t.push("GALLERY", `- ${plural(d.media.length, "new post")}: ${base}/gallery`, "");
  }
  t.push(`Unsubscribe: ${opts.unsubscribeUrl}`);
  const text = t.join("\n");

  // --- html
  const link = (href: string, label: string) =>
    `<a href="${escapeHtml(href)}" style="color:#111;text-decoration:underline">${escapeHtml(label)}</a>`;
  const item = (title: string, href: string, desc?: string | null) =>
    `<li style="margin:0 0 14px">${link(href, title)}${
      desc ? `<br><span style="color:#666">${escapeHtml(desc)}</span>` : ""
    }</li>`;
  const section = (title: string, items: string) =>
    `<h2 style="font:600 13px/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#888;margin:32px 0 14px">${title}</h2><ul style="margin:0;padding:0;list-style:none">${items}</ul>`;

  const parts: string[] = [];
  if (note) {
    parts.push(
      `<p style="font-size:16px;line-height:1.6;margin:0">${escapeHtml(note).replace(/\n/g, "<br>")}</p>`,
    );
  }
  if (d.projects.length) {
    parts.push(section("Projects", d.projects.map((p) => item(p.title, p.href, p.summary)).join("")));
  }
  if (d.articles.length) {
    parts.push(
      section("Articles", d.articles.map((a) => item(a.title, `${base}/articles/${a.id}`, a.excerpt)).join("")),
    );
  }
  if (d.repos.length) {
    parts.push(section("Repos", d.repos.map((r) => item(r.name, r.url, r.description)).join("")));
  }
  if (d.media.length) {
    const thumbs = d.media
      .filter((m) => m.kind === "image")
      .slice(0, 4)
      .map(
        (m) =>
          `<a href="${base}/gallery"><img src="${escapeHtml(m.url)}" width="128" height="128" alt="" style="width:128px;height:128px;object-fit:cover;border-radius:8px;margin:0 8px 8px 0"></a>`,
      )
      .join("");
    parts.push(
      `<h2 style="font:600 13px/1 system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#888;margin:32px 0 14px">Gallery</h2>${thumbs}<p style="margin:8px 0 0">${link(
        `${base}/gallery`,
        `${plural(d.media.length, "new post")} in the gallery`,
      )}</p>`,
    );
  }

  const html = `<!doctype html><html><body style="margin:0;background:#fff"><div style="max-width:560px;margin:0 auto;padding:32px 20px;font:15px/1.5 system-ui,-apple-system,sans-serif;color:#111"><p style="font:italic 600 22px Georgia,serif;margin:0 0 24px">shellhaki</p>${parts.join("")}<hr style="border:0;border-top:1px solid #eee;margin:40px 0 16px"><p style="font-size:12px;color:#888;margin:0">You're getting this because you subscribed at ${escapeHtml(
    base.replace(/^https?:\/\//, ""),
  )}. ${link(opts.unsubscribeUrl, "Unsubscribe")}.</p></div></body></html>`;

  return { subject, text, html };
}
