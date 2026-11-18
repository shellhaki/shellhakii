// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ShareButton } from "@/components/social/share-button";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("AC-U5: copies the exact permalink and announces it via aria-live", async () => {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  render(<ShareButton url="https://example.com/posts/abc-123" />);
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  expect(writeText).toHaveBeenCalledWith("https://example.com/posts/abc-123");
  const live = await screen.findByRole("status");
  expect(live).toHaveAttribute("aria-live", "polite");
  expect(live).toHaveTextContent("Link copied");
});

it("AC-U5: falls back to execCommand when the clipboard API is missing", async () => {
  Object.defineProperty(window.navigator, "clipboard", { value: undefined, configurable: true });
  const exec = vi.fn(() => true);
  Object.defineProperty(document, "execCommand", { value: exec, configurable: true });
  render(<ShareButton url="https://example.com/posts/xyz" />);
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  expect(exec).toHaveBeenCalledWith("copy");
  expect(await screen.findByRole("status")).toHaveTextContent("Link copied");
});
