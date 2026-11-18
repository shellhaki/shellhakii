import { cacheLife, cacheTag } from "next/cache";
import { requireEnv } from "./env";

export type Repo = {
  id: number;
  name: string;
  description: string | null;
  url: string;
  homepage: string | null;
  language: string | null;
  stars: number;
  forks: number;
  topics: string[];
  pushedAt: string;
  createdAt: string;
};

type GithubRepo = {
  id: number;
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  topics?: string[];
  pushed_at: string;
  created_at: string;
  fork: boolean;
};

async function fetchRepos(user: string, token: string | undefined) {
  return fetch(
    `https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=pushed&type=owner`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "shellhaki-portfolio",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );
}

/**
 * Cached fetch. Never throws inside the cache scope (a throw there fails prerendering);
 * returns null on failure and caches that briefly so it retries soon.
 */
async function loadRepos(): Promise<Repo[] | null> {
  "use cache";
  cacheTag("repos");

  const user = requireEnv("GITHUB_USERNAME");
  const token = process.env.GITHUB_TOKEN || undefined;

  let res = await fetchRepos(user, token).catch(() => null);
  // A bad or expired token makes GitHub answer 401; public repos still load anonymously.
  if (res?.status === 401 && token) {
    console.error("GITHUB_TOKEN rejected by GitHub (401); retrying without it");
    res = await fetchRepos(user, undefined).catch(() => null);
  }
  if (!res?.ok) {
    console.error(`GitHub API ${res?.status ?? "network error"}`);
    cacheLife({ stale: 30, revalidate: 60, expire: 300 });
    return null;
  }
  cacheLife({ stale: 60, revalidate: 1800, expire: 86400 });

  const data = (await res.json()) as GithubRepo[];
  return data
    // Skip forks and the profile README repo (named like the user).
    .filter((r) => !r.fork && r.name.toLowerCase() !== user.toLowerCase())
    .map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      url: r.html_url,
      homepage: r.homepage || null,
      language: r.language,
      stars: r.stargazers_count,
      forks: r.forks_count,
      topics: r.topics ?? [],
      pushedAt: r.pushed_at,
      createdAt: r.created_at,
    }));
}

/** Public, non-fork repos, most recently pushed first. Throws when GitHub is unavailable. */
export async function getRepos(): Promise<Repo[]> {
  const repos = await loadRepos();
  if (!repos) throw new Error("GitHub repos unavailable");
  return repos;
}
