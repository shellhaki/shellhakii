// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommentSectionProps } from "@/components/social/comment-section";
import type { EngagementBarProps } from "@/components/social/engagement-bar";
import type { Media } from "@/lib/media";

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

const mediaTwo: Media[] = [
  ...media,
  {
    id: "m2",
    kind: "video",
    url: "https://example.com/m2.mp4",
    width: 1280,
    height: 720,
    caption: "Second clip",
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

  it("PL-3: gallery tiles have media anchor ids", () => {
    const { container } = render(<GalleryGrid media={mediaTwo} />);

    expect(container.querySelector("#media-m1")).not.toBeNull();
    expect(container.querySelector("#media-m2")).not.toBeNull();
  });

  it("PL-4: opening an item shares its query permalink and closing restores /gallery", async () => {
    const user = userEvent.setup();
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    render(<GalleryGrid media={mediaTwo} />);

    await user.click(screen.getByRole("button", { name: "Second clip" }));

    const bar = await screen.findByTestId("engagement-bar");
    expect(bar).toHaveAttribute("data-share-url", "/gallery?item=m2");
    expect(replaceSpy).toHaveBeenCalledWith(null, "", "/gallery?item=m2");

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(replaceSpy).toHaveBeenLastCalledWith(null, "", "/gallery");
  });

  it("PL-5: mounting with ?item=<existing id> opens the lightbox on that item", async () => {
    window.history.replaceState(null, "", "/gallery?item=m2");
    render(<GalleryGrid media={mediaTwo} />);

    const bar = await screen.findByTestId("engagement-bar");
    expect(bar).toHaveAttribute("data-target-id", "m2");
    expect(bar).toHaveAttribute("data-share-url", "/gallery?item=m2");
  });

  it("PL-6: mounting with ?item=<unknown> leaves the lightbox closed", () => {
    window.history.replaceState(null, "", "/gallery?item=nope");
    render(<GalleryGrid media={mediaTwo} />);

    expect(screen.queryByTestId("engagement-bar")).toBeNull();
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });
});
