import { XMLParser } from "fast-xml-parser";
import sanitizeHtml from "sanitize-html";
import { cacheLife, cacheTag } from "next/cache";

export type Article = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  excerpt: string;
  readMinutes: number;
  categories: string[];
  html: string;
};

type Item = {
  title?: string;
  link?: string;
  guid?: string | { "#text"?: string };
  pubDate?: string;
  category?: string[];
  "content:encoded"?: string;
};

const parser = new XMLParser({
  ignoreAttributes: false,
  isArray: (name) => name === "item" || name === "category",
});

function feedUrl() {
  return (
    process.env.MEDIUM_FEED_URL ||
    `https://medium.com/feed/@${process.env.MEDIUM_USERNAME ?? "shellhaki"}`
  );
}

function cleanHtml(raw: string, title: string) {
  let droppedTitle = false;
  return sanitizeHtml(raw, {
    allowedTags: [
      "p", "h2", "h3", "h4", "a", "img", "figure", "figcaption", "blockquote",
      "pre", "code", "ul", "ol", "li", "em", "strong", "b", "i", "hr", "br",
    ],
    allowedAttributes: {
      a: ["href"],
      img: ["src", "alt", "width", "height"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      h1: "h2",
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
    allowedSchemesAppliedToAttributes: ["href", "src"],
    // Medium prepends the title and appends a 1x1 tracking pixel.
    exclusiveFilter: (frame) => {
      if (frame.tag === "img" && frame.attribs.src?.includes("/_/stat")) return true;
      if (!droppedTitle && /^h[1-4]$/.test(frame.tag)) {
        droppedTitle = true;
        return frame.text.trim() === title.trim();
      }
      return false;
    },
  });
}

/** Latest posts from the Medium RSS feed. Throws on failure (so failures are not cached). */
export async function getArticles(): Promise<Article[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("articles");

  const res = await fetch(feedUrl(), { headers: { "User-Agent": "shellhaki-portfolio" } });
  if (!res.ok) throw new Error(`Medium feed ${res.status}`);

  const xml = parser.parse(await res.text());
  const items: Item[] = xml?.rss?.channel?.item ?? [];

  return items.flatMap((it) => {
    const guid = typeof it.guid === "string" ? it.guid : it.guid?.["#text"];
    const id = guid?.split("/").pop();
    if (!id || !it.title || !it.link || !it.pubDate) return [];

    const html = cleanHtml(it["content:encoded"] ?? "", it.title);
    const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
      .replace(/\s+/g, " ")
      .trim();

    return [
      {
        id,
        title: it.title,
        url: it.link.split("?")[0],
        publishedAt: new Date(it.pubDate).toISOString(),
        excerpt: text.length > 200 ? `${text.slice(0, 200).trimEnd()}…` : text,
        readMinutes: Math.max(1, Math.round(text.split(" ").length / 220)),
        categories: it.category ?? [],
        html,
      },
    ];
  });
}
