import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { ProjectCard } from "@/components/project-card";
import { getProjects } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Projects",
  description: "Featured projects and open source work by shellhaki.",
};

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeading title="Projects" subtitle="Things I've built and shipped" />

      {projects.length === 0 ? (
        <p className="mt-16 text-muted">Nothing here yet. Check back soon.</p>
      ) : (
        <ul className="mt-12 grid gap-5 sm:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
