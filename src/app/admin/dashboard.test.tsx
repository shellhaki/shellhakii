// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/projects", () => ({ getProjects: vi.fn() }));
vi.mock("@/lib/media", () => ({ getMedia: vi.fn() }));
vi.mock("@/lib/social/posts", () => ({ listPosts: vi.fn(), getPost: vi.fn() }));
vi.mock("./actions", () => ({ logout: async () => {} }));
vi.mock("./project-form", () => ({ ProjectForm: () => null }));
vi.mock("./project-row", () => ({ ProjectRow: () => null }));
vi.mock("./media-uploader", () => ({ MediaUploader: () => null }));
vi.mock("./caption-editor", () => ({ CaptionEditor: () => null }));
vi.mock("./refresh-button", () => ({ RefreshButton: () => null }));
vi.mock("./newsletter", () => ({ Newsletter: () => null }));

import { getMedia } from "@/lib/media";
import { getProjects } from "@/lib/projects";
import { listPosts } from "@/lib/social/posts";
import { Dashboard } from "./dashboard";

describe("Dashboard", () => {
  it("AC-I3: renders the posts composer section with recent posts", async () => {
    vi.mocked(getProjects).mockResolvedValue([]);
    vi.mocked(getMedia).mockResolvedValue([]);
    vi.mocked(listPosts).mockResolvedValue({
      posts: [
        { id: "p1", body: "dashboard post", createdAt: "2026-05-08T12:00:00.000Z" },
      ],
      nextCursor: null,
    });

    render(await Dashboard());

    expect(
      screen.getByRole("heading", { name: "Posts" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("New post")).toBeInTheDocument();
    expect(screen.getByText("dashboard post")).toBeInTheDocument();
  });
});
