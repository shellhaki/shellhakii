// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CommentSectionProps } from "@/components/social/comment-section";
import type { EngagementBarProps } from "@/components/social/engagement-bar";
import { getPost } from "@/lib/social/posts";

vi.mock("@/lib/social/posts", () => ({ listPosts: vi.fn(), getPost: vi.fn() }));
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
      data-default-open={props.defaultOpen === true ? "true" : "false"}
    />
  ),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { generateMetadata, PostDetail } from "./page";

const post = {
  id: "abc123",
  body: "A post body worth reading in full detail.",
  createdAt: "2026-05-08T12:00:00.000Z",
};

describe("PostDetail", () => {
  it("AC-I2: renders one post with engagement and open comments", async () => {
    vi.mocked(getPost).mockResolvedValue(post);
    render(await PostDetail({ params: Promise.resolve({ id: "abc123" }) }));

    expect(screen.getByText(post.body)).toBeInTheDocument();
    expect(screen.getByText("May 8, 2026")).toBeInTheDocument();
    const bar = screen.getByTestId("engagement-bar");
    expect(bar).toHaveAttribute("data-target-type", "post");
    expect(bar).toHaveAttribute("data-target-id", "abc123");
    expect(bar).toHaveAttribute("data-share-url", "/posts/abc123");
    const comments = screen.getByTestId("comment-section");
    expect(comments).toHaveAttribute("data-target-type", "post");
    expect(comments).toHaveAttribute("data-default-open", "true");
  });

  it("AC-I2: calls notFound for an unknown id", async () => {
    vi.mocked(getPost).mockResolvedValue(null);
    await expect(
      PostDetail({ params: Promise.resolve({ id: "nope" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("AC-I2: calls notFound when the store fails", async () => {
    vi.mocked(getPost).mockRejectedValue(new Error("db down"));
    await expect(
      PostDetail({ params: Promise.resolve({ id: "nope" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("generateMetadata for /posts/[id]", () => {
  it("AC-I2: builds metadata from the post body", async () => {
    vi.mocked(getPost).mockResolvedValue(post);
    const meta = await generateMetadata({
      params: Promise.resolve({ id: "abc123" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.title).toContain("A post body");
    expect(meta.description).toContain("A post body worth reading");
  });

  it("AC-I2: falls back to a plain title for an unknown id", async () => {
    vi.mocked(getPost).mockResolvedValue(null);
    const meta = await generateMetadata({
      params: Promise.resolve({ id: "nope" }),
      searchParams: Promise.resolve({}),
    });
    expect(meta.title).toBe("Post");
  });
});
