"use client";

import { useState } from "react";
import type { Project } from "@/lib/projects";
import { DeleteButton } from "./delete-button";
import { ProjectForm } from "./project-form";

export function ProjectRow({ project }: { project: Project }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="py-4">
        <ProjectForm project={project} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <span className="truncate">{project.title}</span>
      <span className="flex shrink-0 items-center gap-4">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="cursor-pointer text-sm text-muted underline decoration-muted/50 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
        >
          Edit
        </button>
        <DeleteButton url={`/api/admin/projects/${project.id}`} label={project.title} />
      </span>
    </li>
  );
}
