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
  fork: boolean;
};

/** Public, non-fork repos, most recently pushed first. Throws on API failure (not cached). */
export async function getRepos(): Promise<Repo[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("repos");

  const user = requireEnv("GITHUB_USERNAME");
  const token = process.env.GITHUB_TOKEN;

  const res = await fetch(
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
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);

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
    }));
}
