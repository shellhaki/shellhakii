import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { formatDate } from "@/lib/format";
import { getArticles, type Article } from "@/lib/medium";

export const metadata: Metadata = {
  title: "Articles",
  description: "Writing by shellhaki, from Medium.",
};

export default async function ArticlesPage() {
  let articles: Article[] = [];
  let failed = false;
  try {
    articles = await getArticles();
  } catch (err) {
    console.error("getArticles failed", err);
    failed = true;
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeading title="Articles" subtitle="Read what I'm thinking lately" />

      <div className="mt-14">
        {failed ? (
          <p className="text-muted">Couldn&apos;t load articles right now. Try again soon.</p>
        ) : articles.length === 0 ? (
          <p className="text-muted">Nothing published yet.</p>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {articles.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/articles/${a.id}`}
                  className="group flex flex-col gap-1 py-5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground"
                >
                  <span className="font-serif text-lg font-medium decoration-muted/50 underline-offset-4 group-hover:underline">
                    {a.title}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted">
                    {formatDate(a.publishedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
