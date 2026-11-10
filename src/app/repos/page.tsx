import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { getRepos, type Repo } from "@/lib/github";
import { RepoList } from "./repo-list";

export const metadata: Metadata = {
  title: "Repos",
  description: "Open source repositories by shellhaki on GitHub.",
};

export default async function ReposPage() {
  let repos: Repo[] = [];
  let failed = false;
  try {
    repos = await getRepos();
  } catch (err) {
    console.error("getRepos failed", err);
    failed = true;
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeading title="Repos" subtitle="Open source, straight from GitHub" />
      <div className="mt-12">
        {failed ? (
          <p className="text-muted">Couldn&apos;t load repos right now. Try again soon.</p>
        ) : repos.length === 0 ? (
          <p className="text-muted">No public repos yet.</p>
        ) : (
          <RepoList repos={repos} />
        )}
      </div>
    </div>
  );
}
