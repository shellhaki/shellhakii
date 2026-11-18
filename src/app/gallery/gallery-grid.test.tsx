// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CommentSectionProps } from "@/components/social/comment-section";
import type { EngagementBarProps } from "@/components/social/engagement-bar";
import type { Media } from "@/lib/media";

vi.mock("@/components/social/engagement-bar", () => ({
  EngagementBar: (props: EngagementBarProps) => (
    <div
      data-testid="engagement-bar"
      data-target-type={props.targetType}
      data-target-id={props.targetId}
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

import { GalleryGrid } from "./gallery-grid";

// jsdom has no dialog showModal/close; the spec rules allow a polyfill here.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  this.removeAttribute("open");
  this.dispatchEvent(new Event("close"));
};

const media: Media[] = [
  {
    id: "m1",
    kind: "image",
    url: "https://example.com/m1.jpg",
    width: 800,
    height: 600,
    caption: "First pic",
  },
];

describe("GalleryGrid", () => {
  it("AC-I4: lightbox shows engagement for the current item with collapsed comments", async () => {
    const user = userEvent.setup();
    render(<GalleryGrid media={media} />);

    expect(screen.queryByTestId("engagement-bar")).toBeNull();
    await user.click(screen.getByRole("button", { name: "First pic" }));

    const bar = await screen.findByTestId("engagement-bar");
    expect(bar).toHaveAttribute("data-target-type", "gallery");
    expect(bar).toHaveAttribute("data-target-id", "m1");
    const comments = screen.getByTestId("comment-section");
    expect(comments).toHaveAttribute("data-target-type", "gallery");
    expect(comments).toHaveAttribute("data-target-id", "m1");
  });

  it("AC-I4: existing filter behavior still works", async () => {
    const user = userEvent.setup();
    render(<GalleryGrid media={media} />);

    await user.click(screen.getByRole("button", { name: "Videos" }));
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pictures" }));
    expect(screen.getByRole("button", { name: "First pic" })).toBeInTheDocument();
  });
});
