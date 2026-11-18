// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CommentSectionProps } from "@/components/social/comment-section";
import type { EngagementBarProps } from "@/components/social/engagement-bar";

vi.mock("@/components/social/engagement-bar", () => ({
  EngagementBar: (props: EngagementBarProps) => (
    <div
      data-testid="engagement-bar"
      data-target-type={props.targetType}
      data-target-id={props.targetId}
    >
      <button type="button" onClick={() => props.onCommentsClick?.()}>
        comments
      </button>
    </div>
  ),
}));
vi.mock("@/components/social/comment-section", () => ({
  CommentSection: (props: CommentSectionProps) => (
    <div
      data-testid="comment-section"
      data-target-type={props.targetType}
      data-target-id={props.targetId}
    />
  ),
}));

import { ProjectCard } from "./project-card";

const project = {
  id: "proj-1",
  title: "Demo",
  summary: "A demo project",
  url: null,
  repoUrl: null,
  thumbnailUrl: null,
  tags: ["go"],
  year: 2026,
  position: 0,
};

describe("ProjectCard", () => {
  it("AC-I4: renders an engagement bar for the project target", () => {
    render(<ProjectCard project={project} />);

    const bar = screen.getByTestId("engagement-bar");
    expect(bar).toHaveAttribute("data-target-type", "project");
    expect(bar).toHaveAttribute("data-target-id", "proj-1");
    expect(screen.queryByTestId("comment-section")).toBeNull();
  });

  it("AC-I4: opens an inline comment section on comments click", async () => {
    const user = userEvent.setup();
    render(<ProjectCard project={project} />);

    await user.click(screen.getByRole("button", { name: "comments" }));
    const comments = await screen.findByTestId("comment-section");
    expect(comments).toHaveAttribute("data-target-type", "project");
    expect(comments).toHaveAttribute("data-target-id", "proj-1");
  });
});
