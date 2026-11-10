import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { formatDate } from "@/lib/format";
import { getArticles } from "@/lib/medium";

async function find(id: string) {
  try {
    return (await getArticles()).find((a) => a.id === id) ?? null;
  } catch (err) {
    console.error("getArticles failed", err);
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/articles/[id]">): Promise<Metadata> {
  const article = await find((await params).id);
  return article
    ? { title: article.title, description: article.excerpt }
    : { title: "Article" };
}

async function Article({ params }: { params: PageProps<"/articles/[id]">["params"] }) {
  const article = await find((await params).id);
  if (!article) notFound();

  return (
    <article>
      <header>
        <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {article.title}
        </h1>
        <p className="mt-4 font-mono text-xs text-muted">
          {formatDate(article.publishedAt)} · {article.readMinutes} min read
        </p>
      </header>

      <div className="article mt-10" dangerouslySetInnerHTML={{ __html: article.html }} />

      <footer className="mt-14 border-t border-line pt-6">
        <a
          href={article.url}
          className="inline-flex items-center gap-1 text-sm text-foreground underline decoration-muted/50 underline-offset-4 transition-colors hover:decoration-foreground"
        >
          Read on Medium <ArrowUpRight className="size-4" aria-hidden />
        </a>
      </footer>
    </article>
  );
}

export default function ArticlePage({ params }: PageProps<"/articles/[id]">) {
  return (
    <div className="mx-auto w-full max-w-2xl pt-6 sm:pt-12">
      <Link
        href="/articles"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Articles
      </Link>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Article params={params} />
      </Suspense>
    </div>
  );
}
