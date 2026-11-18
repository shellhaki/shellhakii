// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CommentSectionProps } from "@/components/social/comment-section";
import type { EngagementBarProps } from "@/components/social/engagement-bar";
import { getArticles } from "@/lib/medium";

vi.mock("@/lib/medium", () => ({ getArticles: vi.fn() }));
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
vi.mock("@/components/social/comment-section", () => ({
  CommentSection: (props: CommentSectionProps) => (
    <div
      data-testid="comment-section"
      data-target-type={props.targetType}
      data-target-id={props.targetId}
    />
  ),
}));

import { Article, generateMetadata } from "./page";

const article = {
  id: "abc123",
  title: "Hello",
  url: "https://medium.com/@shellhaki/abc123",
  publishedAt: "2026-05-08T12:00:00.000Z",
  excerpt: "excerpt",
  readMinutes: 3,
  categories: [],
  html: "<p>body</p>",
};

describe("Article", () => {
  it("AC-I4: renders engagement bars near title and footer plus a comment section", async () => {
    vi.mocked(getArticles).mockResolvedValue([article]);
    render(await Article({ params: Promise.resolve({ id: "abc123" }) }));

    const bars = screen.getAllByTestId("engagement-bar");
    expect(bars).toHaveLength(2);
    for (const bar of bars) {
      expect(bar).toHaveAttribute("data-target-type", "article");
      expect(bar).toHaveAttribute("data-target-id", "abc123");
      expect(bar).toHaveAttribute("data-share-url", "/articles/abc123");
    }
    const comments = screen.getByTestId("comment-section");
    expect(comments).toHaveAttribute("data-target-type", "article");
    expect(comments).toHaveAttribute("data-target-id", "abc123");
  });

  it("AC-I4: falls back gracefully when the feed fails", async () => {
    vi.mocked(getArticles).mockRejectedValue(new Error("feed down"));
    const meta = await generateMetadata({
      params: Promise.resolve({ id: "abc123" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.title).toBe("Article");
  });
});
