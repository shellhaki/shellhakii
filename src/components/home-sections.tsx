import Link from "next/link";
import { ArrowUpRight, Play } from "lucide-react";
import { formatDate } from "@/lib/format";
import { getMedia } from "@/lib/media";
import { getArticles, type Article } from "@/lib/medium";
import { getProjects } from "@/lib/projects";
import { site } from "@/lib/site";
import { button } from "@/lib/ui";

function Section({
  id,
  title,
  href,
  children,
}: {
  id: string;
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-20">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={id} className="font-serif text-xl font-semibold tracking-tight">
          {title}
        </h2>
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
        >
          View all <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export async function Highlights() {
  const projects = await getProjects(4);
  if (projects.length === 0) return null;

  return (
    <Section id="highlights" title="Highlights" href="/projects">
      <ul className="divide-y divide-line border-y border-line">
        {projects.map((p) => {
          const href = p.url ?? p.repoUrl ?? "/projects";
          const body = (
            <>
              {p.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="size-16 shrink-0 rounded-lg object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-serif text-lg font-medium decoration-muted/50 underline-offset-4 group-hover:underline">
                    {p.title}
                  </h3>
                  <span className="shrink-0 font-mono text-xs text-muted">{p.year}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-[15px] leading-relaxed text-muted">
                  {p.summary}
                </p>
              </div>
            </>
          );
          const cls =
            "group flex items-start gap-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground";
          return (
            <li key={p.id}>
              {href.startsWith("http") ? (
                <a href={href} className={cls}>
                  {body}
                </a>
              ) : (
                <Link href={href} className={cls}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export async function LatestWriting() {
  let articles: Article[] = [];
  try {
    articles = (await getArticles()).slice(0, 3);
  } catch (err) {
    console.error("home: getArticles failed", err);
  }

  return (
    <Section id="writing" title="Latest writing" href="/articles">
      {articles.length === 0 ? (
        <p className="text-muted">
          Read my writing on{" "}
          <a
            href={site.links.medium}
            className="text-foreground underline decoration-muted/50 underline-offset-4 hover:decoration-foreground"
          >
            Medium
          </a>
          .
        </p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {articles.map((a) => (
            <li key={a.id}>
              <Link
                href={`/articles/${a.id}`}
                className="group block py-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <h3 className="font-serif text-lg font-medium decoration-muted/50 underline-offset-4 group-hover:underline">
                    {a.title}
                  </h3>
                  <span className="shrink-0 font-mono text-xs text-muted">
                    {formatDate(a.publishedAt)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[15px] leading-relaxed text-muted">
                  {a.excerpt}
                </p>
                <p className="mt-2 font-mono text-xs text-muted">{a.readMinutes} min read</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export async function GalleryTeaser() {
  const media = (await getMedia()).slice(0, 6);
  if (media.length === 0) return null;

  return (
    <Section id="gallery" title="Gallery" href="/gallery">
      <ul className="grid grid-cols-3 gap-2 sm:gap-3">
        {media.map((m) => (
          <li key={m.id}>
            <Link
              href="/gallery"
              aria-label={m.caption ?? `Open gallery (${m.kind})`}
              className="group relative block aspect-square overflow-hidden rounded-xl bg-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
            >
              {m.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.url}
                  alt={m.caption ?? ""}
                  loading="lazy"
                  className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              ) : (
                <>
                  <video
                    src={`${m.url}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    className="size-full object-cover"
                  />
                  <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-black/60 text-white">
                    <Play className="size-3 fill-current" aria-hidden />
                  </span>
                </>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function ContactTeaser() {
  return (
    <section aria-labelledby="contact" className="mt-20 rounded-2xl border border-line p-8 text-center">
      <h2 id="contact" className="font-serif text-xl font-semibold tracking-tight">
        Let&apos;s build something
      </h2>
      <p className="mx-auto mt-2 max-w-md text-muted">
        Got a project, a collaboration or just want to say hi? My inbox is open.
      </p>
      <Link href="/contact" className={`${button} mt-6`}>
        Get in touch
      </Link>
    </section>
  );
}
