// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { listPosts } from "@/lib/social/posts";
import type { PostDTO } from "@/lib/social/types";

vi.mock("@/lib/social/posts", () => ({ listPosts: vi.fn(), getPost: vi.fn() }));
vi.mock("@/components/social/engagement-bar", () => ({
  EngagementBar: () => <div data-testid="engagement-bar" />,
}));

import PostsPage from "./page";

const newer: PostDTO = {
  id: "p2",
  body: "newer post",
  createdAt: "2026-05-08T12:00:00.000Z",
};
const older: PostDTO = {
  id: "p1",
  body: "older post",
  createdAt: "2026-05-07T12:00:00.000Z",
};

describe("PostsPage", () => {
  it("AC-I1: renders posts newest first with an engagement bar each", async () => {
    vi.mocked(listPosts).mockResolvedValue({ posts: [newer, older], nextCursor: null });
    render(await PostsPage());

    const items = screen.getAllByRole("article");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("newer post")).toBeInTheDocument();
    expect(within(items[1]).getByText("older post")).toBeInTheDocument();
    expect(screen.getAllByTestId("engagement-bar")).toHaveLength(2);
  });

  it("AC-I1: shows an empty state when there are no posts", async () => {
    vi.mocked(listPosts).mockResolvedValue({ posts: [], nextCursor: null });
    render(await PostsPage());

    expect(screen.getByText("Nothing here yet. Check back soon.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });
});
