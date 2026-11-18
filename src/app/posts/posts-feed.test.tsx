// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/social/client";
import type { PostDTO } from "@/lib/social/types";

vi.mock("@/lib/social/client", () => ({ apiFetch: vi.fn() }));
vi.mock("@/components/social/engagement-bar", () => ({
  EngagementBar: () => <div data-testid="engagement-bar" />,
}));

import { PostsFeed } from "./posts-feed";

const first: PostDTO = {
  id: "p1",
  body: "first post",
  createdAt: "2026-05-08T12:00:00.000Z",
};
const second: PostDTO = {
  id: "p2",
  body: "second post",
  createdAt: "2026-05-07T12:00:00.000Z",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("PostsFeed", () => {
  it("AC-I1: Load more fetches the next cursor and appends posts", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(
      jsonResponse({ posts: [second], nextCursor: null }),
    );
    render(<PostsFeed initialPosts={[first]} initialCursor="c1" />);

    expect(screen.getByText("first post")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(apiFetch).toHaveBeenCalledWith("/api/posts?cursor=c1");
    expect(await screen.findByText("second post")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  it("AC-I1: hides Load more when there is no next cursor", () => {
    render(<PostsFeed initialPosts={[first]} initialCursor={null} />);
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  it("AC-I1: shows an error on a malformed response", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(jsonResponse({ posts: "nope" }));
    render(<PostsFeed initialPosts={[first]} initialCursor="c1" />);

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("first post")).toBeInTheDocument();
  });

  it("AC-I1: shows an error and keeps the button when loading fails", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(jsonResponse({}, 500));
    render(<PostsFeed initialPosts={[first]} initialCursor="c1" />);

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load more posts. Try again.",
    );
    expect(
      screen.getByRole("button", { name: "Load more" }),
    ).toBeInTheDocument();
  });
});
