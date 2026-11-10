import { ArrowUpRight } from "lucide-react";
import type { Project } from "@/lib/projects";

const chip =
  "inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-sm transition-colors hover:bg-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

export function ProjectCard({ project: p }: { project: Project }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line transition-colors hover:border-muted/50">
      {p.thumbnailUrl && (
        <div className="aspect-video overflow-hidden bg-pill">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.thumbnailUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-serif text-xl font-semibold tracking-tight">{p.title}</h2>
          <span className="shrink-0 font-mono text-xs text-muted">{p.year}</span>
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">{p.summary}</p>

        {p.tags.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted">
            {p.tags.map((t) => (
              <li key={t}>#{t}</li>
            ))}
          </ul>
        )}

        {(p.url || p.repoUrl) && (
          <div className="mt-auto flex flex-wrap gap-2 pt-5">
            {p.url && (
              <a href={p.url} className={chip}>
                Live <ArrowUpRight className="size-3.5" aria-hidden />
              </a>
            )}
            {p.repoUrl && (
              <a href={p.repoUrl} className={chip}>
                Source <ArrowUpRight className="size-3.5" aria-hidden />
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
