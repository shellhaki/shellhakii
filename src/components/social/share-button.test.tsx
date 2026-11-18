// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ShareButton } from "@/components/social/share-button";

function mockClipboardWrite(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText: vi.fn(writeText) },
    configurable: true,
  });
}

function mockExecCommand(result: boolean): ReturnType<typeof vi.fn> {
  const exec = vi.fn(() => result);
  Object.defineProperty(document, "execCommand", { value: exec, configurable: true });
  return exec;
}

beforeEach(() => {
  vi.useFakeTimers();
  window.history.pushState({}, "", "/somewhere");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function clickShare(name: string | RegExp): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

it("SB-1: a relative url copies the absolute URL", async () => {
  const seen: string[] = [];
  mockClipboardWrite(async (text: string) => {
    seen.push(text);
  });
  render(<ShareButton url="/posts/abc" />);
  await clickShare("Copy link");
  expect(seen).toEqual([`${window.location.origin}/posts/abc`]);
});

it("SB-2: an absolute url is copied unchanged", async () => {
  const seen: string[] = [];
  mockClipboardWrite(async (text: string) => {
    seen.push(text);
  });
  render(<ShareButton url="https://x.com/y" />);
  await clickShare("Copy link");
  expect(seen).toEqual(["https://x.com/y"]);
});

it("SB-3: an undefined url copies window.location.href at click time, not at render", async () => {
  window.history.pushState({}, "", "/before");
  const seen: string[] = [];
  mockClipboardWrite(async (text: string) => {
    seen.push(text);
  });
  render(<ShareButton url={undefined} />);
  window.history.pushState({}, "", "/after");
  await clickShare("Copy link");
  expect(seen).toEqual([`${window.location.origin}/after`]);
});

it("SB-4: success shows the Check icon and Copied text, then returns to idle after 2000 ms", async () => {
  mockClipboardWrite(async () => {});
  render(<ShareButton url="/posts/abc" />);
  const button = screen.getByRole("button", { name: "Copy link" });
  expect(button).toHaveAttribute("data-state", "idle");

  await clickShare("Copy link");

  const copied = screen.getByRole("button", { name: "Link copied" });
  expect(copied).toHaveAttribute("data-state", "copied");
  expect(copied).toHaveTextContent("Copied");
  expect(copied.querySelector("svg.lucide-check")).not.toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("Link copied");

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1999);
  });
  expect(screen.getByRole("button", { name: "Link copied" })).toHaveAttribute(
    "data-state",
    "copied",
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  const idle = screen.getByRole("button", { name: "Copy link" });
  expect(idle).toHaveAttribute("data-state", "idle");
  expect(idle.querySelector("svg.lucide-link-2")).not.toBeNull();
  expect(idle).not.toHaveTextContent("Copied");
  expect(screen.getByRole("status")).toHaveTextContent(/^$/);
});

it("SB-5: clipboard rejects but the fallback succeeds, giving the copied state", async () => {
  mockClipboardWrite(async () => {
    throw new Error("denied");
  });
  const exec = mockExecCommand(true);
  render(<ShareButton url="/posts/abc" />);
  await clickShare("Copy link");
  expect(exec).toHaveBeenCalledWith("copy");
  const copied = screen.getByRole("button", { name: "Link copied" });
  expect(copied).toHaveAttribute("data-state", "copied");
  expect(copied).toHaveTextContent("Copied");
  expect(screen.getByRole("status")).toHaveTextContent("Link copied");
});

it("SB-6: both fail, giving visible Couldn't copy and idle after 3000 ms", async () => {
  mockClipboardWrite(async () => {
    throw new Error("denied");
  });
  mockExecCommand(false);
  render(<ShareButton url="/posts/abc" />);
  await clickShare("Copy link");

  const failed = screen.getByRole("button", { name: "Copy link" });
  expect(failed).toHaveAttribute("data-state", "failed");
  const visible = failed.querySelector("span.text-xs");
  expect(visible).not.toBeNull();
  expect(visible).toHaveTextContent("Couldn't copy");
  expect(visible).toHaveClass("text-red-500");
  expect(screen.getByRole("status")).toHaveTextContent("Couldn't copy link");

  await act(async () => {
    await vi.advanceTimersByTimeAsync(2999);
  });
  expect(screen.getByRole("button", { name: "Copy link" })).toHaveAttribute(
    "data-state",
    "failed",
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByRole("button", { name: "Copy link" })).toHaveAttribute(
    "data-state",
    "idle",
  );
  expect(screen.getByRole("status")).toHaveTextContent(/^$/);
});

it("SB-7: a second click while copied restarts the timer", async () => {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  render(<ShareButton url="/posts/abc" />);
  await clickShare("Copy link");
  expect(writeText).toHaveBeenCalledTimes(1);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });

  fireEvent.click(screen.getByRole("button", { name: "Link copied" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(writeText).toHaveBeenCalledTimes(2);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1999);
  });
  expect(screen.getByRole("button", { name: "Link copied" })).toHaveAttribute(
    "data-state",
    "copied",
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByRole("button", { name: "Copy link" })).toHaveAttribute(
    "data-state",
    "idle",
  );
});

it("SB-8: unmounting during the copied state leaves no pending timer and no React warning", async () => {
  const errors: unknown[][] = [];
  const consoleError = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
  mockClipboardWrite(async () => {});
  const { unmount } = render(<ShareButton url="/posts/abc" />);
  await clickShare("Copy link");
  expect(screen.getByRole("button", { name: "Link copied" })).toBeInTheDocument();

  unmount();
  expect(vi.getTimerCount()).toBe(0);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(vi.getTimerCount()).toBe(0);
  expect(errors).toEqual([]);
  consoleError.mockRestore();
});
