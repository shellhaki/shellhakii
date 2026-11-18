// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useRouter } from "next/navigation";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { PostsSection } from "./posts-section";

const posts = [
  { id: "p1", body: "first recent post", createdAt: "2026-05-08T12:00:00.000Z" },
  { id: "p2", body: "second recent post", createdAt: "2026-05-07T12:00:00.000Z" },
];

function mockRouter() {
  const refresh = vi.fn();
  vi.mocked(useRouter).mockReturnValue({ refresh } as never);
  return { refresh };
}

describe("PostsSection", () => {
  it("AC-I3: publish is disabled when the composer is empty and shows a live counter", async () => {
    const user = userEvent.setup();
    mockRouter();
    render(<PostsSection posts={posts} />);

    const publish = screen.getByRole("button", { name: "Publish" });
    expect(publish).toBeDisabled();
    expect(screen.getByText("0 / 500")).toBeInTheDocument();

    await user.type(screen.getByLabelText("New post"), "hello");
    expect(screen.getByText("5 / 500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).not.toBeDisabled();
  });

  it("AC-I3: whitespace-only input cannot publish", async () => {
    const user = userEvent.setup();
    mockRouter();
    render(<PostsSection posts={posts} />);

    await user.type(screen.getByLabelText("New post"), "   ");
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("AC-I3: input over 500 chars cannot publish", async () => {
    const user = userEvent.setup();
    mockRouter();
    render(<PostsSection posts={posts} />);

    await user.type(screen.getByLabelText("New post"), "x".repeat(501));
    expect(screen.getByText("501 / 500")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
  });

  it("AC-I3: publish posts to the admin API, clears, and refreshes", async () => {
    const user = userEvent.setup();
    const { refresh } = mockRouter();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "p3" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<PostsSection posts={posts} />);

    await user.type(screen.getByLabelText("New post"), "  fresh post  ");
    await user.click(screen.getByRole("button", { name: "Publish" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/posts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ body: "fresh post" }),
      }),
    );
    expect(await screen.findByText("0 / 500")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("AC-I3: lists recent posts each with a confirm-before-delete control", () => {
    mockRouter();
    render(<PostsSection posts={posts} />);

    expect(screen.getByText("first recent post")).toBeInTheDocument();
    expect(screen.getByText("second recent post")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete first recent post" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete second recent post" }),
    ).toBeInTheDocument();
  });
});
