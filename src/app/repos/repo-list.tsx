"use client";

import { ArrowUpRight, GitFork, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import type { Repo } from "@/lib/github";

const PAGE = 12;

const monthYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function RepoList({ repos }: { repos: Repo[] }) {
  const [language, setLanguage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);

  const languages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of repos) if (r.language) counts.set(r.language, (counts.get(r.language) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l]) => l);
  }, [repos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return repos.filter(
      (r) =>
        (!language || r.language === language) &&
        (!q ||
          r.name.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.topics.some((t) => t.includes(q))),
    );
  }, [repos, language, query]);

  const visible = filtered.slice(0, shown);

  const pill = (active: boolean) =>
    `cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
      active
        ? "border-foreground bg-foreground text-background"
        : "border-line hover:bg-line"
    }`;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by language">
          <button
            type="button"
            className={pill(language === null)}
            aria-pressed={language === null}
            onClick={() => {
              setLanguage(null);
              setShown(PAGE);
            }}
          >
            All
          </button>
          {languages.map((l) => (
            <button
              key={l}
              type="button"
              className={pill(language === l)}
              aria-pressed={language === l}
              onClick={() => {
                setLanguage(l);
                setShown(PAGE);
              }}
            >
              {l}
            </button>
          ))}
        </div>

        <label className="relative block sm:w-56">
          <span className="sr-only">Search repos</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Search"
            className="w-full rounded-full border border-line bg-background py-1.5 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-foreground"
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="mt-12 text-muted">No repos match.</p>
      ) : (
        <ul className="mt-8 divide-y divide-line border-y border-line">
          {visible.map((r) => (
            <li key={r.id}>
              <a
                href={r.url}
                className="group flex items-start justify-between gap-6 py-5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground"
              >
                <div className="min-w-0">
                  <h2 className="flex items-center gap-1.5 font-serif text-lg font-medium">
                    <span className="truncate">{r.name}</span>
                    <ArrowUpRight
                      className="size-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                      aria-hidden
                    />
                  </h2>
                  {r.description && (
                    <p className="mt-1 text-[15px] leading-relaxed text-muted">{r.description}</p>
                  )}
                  {r.topics.length > 0 && (
                    <p className="mt-2 flex flex-wrap gap-x-3 font-mono text-xs text-muted">
                      {r.topics.slice(0, 5).map((t) => (
                        <span key={t}>#{t}</span>
                      ))}
                    </p>
                  )}
                </div>
                <div className="shrink-0 space-y-1 text-right font-mono text-xs text-muted">
                  <p>{monthYear.format(new Date(r.pushedAt))}</p>
                  <p className="flex items-center justify-end gap-3">
                    {r.language && <span>{r.language}</span>}
                    <span className="inline-flex items-center gap-1">
                      <Star className="size-3" aria-hidden /> {r.stars}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <GitFork className="size-3" aria-hidden /> {r.forks}
                    </span>
                  </p>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}

      {filtered.length > shown && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="cursor-pointer rounded-full border border-line px-5 py-2 text-sm transition-colors hover:bg-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            Show more ({filtered.length - shown})
          </button>
        </div>
      )}
    </div>
  );
}
