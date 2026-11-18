// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EngagementBarProps } from "@/components/social/engagement-bar";

vi.mock("@/components/social/engagement-bar", () => ({
  EngagementBar: (props: EngagementBarProps) => (
    <div
      data-testid="engagement-bar"
      data-target-type={props.targetType}
      data-target-id={props.targetId}
      data-share-url={props.shareUrl ?? ""}
    />
  ),
}));

import { PostCard } from "./post-card";

const post = {
  id: "abc123",
  body: "Hello\nworld https://example.com",
  createdAt: "2026-05-08T12:00:00.000Z",
};

describe("PostCard", () => {
  it("AC-I1: renders body text, the full date, and an engagement bar with the post share URL", () => {
    render(<PostCard post={post} />);
    expect(screen.getByText("May 8, 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "https://example.com" }),
    ).toHaveAttribute("href", "https://example.com");
    const bar = screen.getByTestId("engagement-bar");
    expect(bar).toHaveAttribute("data-target-type", "post");
    expect(bar).toHaveAttribute("data-target-id", "abc123");
    expect(bar).toHaveAttribute("data-share-url", "/posts/abc123");
  });

  it("AC-I1: the date links to the post permalink", () => {
    render(<PostCard post={post} />);
    expect(screen.getByRole("link", { name: "May 8, 2026" })).toHaveAttribute(
      "href",
      "/posts/abc123",
    );
  });
});
