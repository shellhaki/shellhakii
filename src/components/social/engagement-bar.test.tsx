// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  __resetEngagementLoader,
  EngagementBar,
} from "@/components/social/engagement-bar";
import { ViewerProvider } from "@/components/social/viewer-provider";
import type { EngagementSummary, Viewer } from "@/lib/social/types";

const HAL = { id: "viewer-1", email: "hal@example.com", displayName: "Hal" } satisfies Viewer;

if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

function dialogIsOpen(): boolean {
  const dialog = document.querySelector("dialog");
  return !!dialog && (dialog.open || dialog.hasAttribute("open"));
}

const SUMMARIES: Record<string, EngagementSummary> = {
  "post:a": { likes: 4, comments: 2, liked: false },
  "post:b": { likes: 0, comments: 0, liked: false },
};

function stubFetch(opts?: {
  me?: Viewer | null;
  summaries?: Record<string, EngagementSummary>;
  likeImpl?: (url: string, init?: RequestInit) => Response | Promise<Response>;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me" && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ viewer: opts?.me ?? null }), { status: 200 });
      }
      if (url.startsWith("/api/engagement")) {
        const targets = new URL(url, "http://test").searchParams.get("targets") ?? "";
        const out: Record<string, EngagementSummary> = {};
        for (const key of targets.split(",")) {
          out[key] = (opts?.summaries ?? SUMMARIES)[key] ?? { likes: 0, comments: 0, liked: false };
        }
        return new Response(JSON.stringify(out), { status: 200 });
      }
      if (url === "/api/auth/otp/request") return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url === "/api/auth/otp/verify") {
        return new Response(JSON.stringify({ viewer: HAL, isNew: false }), { status: 200 });
      }
      if (url === "/api/likes" && opts?.likeImpl) return opts.likeImpl(url, init);
      return new Response(JSON.stringify({ error: "not mocked" }), { status: 500 });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  __resetEngagementLoader();
  stubFetch();
});

async function signInThroughDialog() {
  await userEvent.click(screen.getByLabelText("Email"));
  await userEvent.type(screen.getByLabelText("Email"), "hal@example.com");
  await userEvent.click(screen.getByRole("button", { name: "Send code" }));
  const code = await screen.findByLabelText("Code");
  await userEvent.type(code, "123456");
  await userEvent.click(screen.getByRole("button", { name: "Verify" }));
}

it("AC-U1: renders read-only state with no dialog and no network writes", async () => {
  stubFetch();
  render(
    <ViewerProvider>
      <EngagementBar targetType="post" targetId="a" shareUrl="/posts/a" />
    </ViewerProvider>,
  );
  expect(dialogIsOpen()).toBe(false);
  const like = await screen.findByRole("button", { name: /like, 4 likes/i });
  expect(like).toHaveAttribute("aria-pressed", "false");
  const writes = vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => ["PUT", "POST", "DELETE", "PATCH"].includes((init as RequestInit)?.method ?? ""));
  expect(writes).toEqual([]);
});

it("AC-U8: many bars coalesce into one batch request", async () => {
  stubFetch();
  render(
    <ViewerProvider>
      <EngagementBar targetType="post" targetId="a" />
      <EngagementBar targetType="post" targetId="b" />
      <EngagementBar targetType="post" targetId="missing" />
    </ViewerProvider>,
  );
  expect(await screen.findByRole("button", { name: /like, 4 likes/i })).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: /comments, 2 comments/i })).toBeInTheDocument();
  const batchCalls = vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => (url as string).startsWith("/api/engagement"));
  expect(batchCalls).toHaveLength(1);
  const targets = new URL(batchCalls[0][0] as string, "http://test").searchParams.get("targets") ?? "";
  expect(targets.split(",").sort()).toEqual(["post:a", "post:b", "post:missing"].sort());
});

it("AC-U8: an initial summary skips the batch fetch", async () => {
  stubFetch();
  render(
    <ViewerProvider>
      <EngagementBar
        targetType="post"
        targetId="a"
        initial={{ likes: 9, comments: 1, liked: true }}
      />
    </ViewerProvider>,
  );
  expect(await screen.findByRole("button", { name: /unlike, 9 likes/i })).toBeInTheDocument();
  const batchCalls = vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => (url as string).startsWith("/api/engagement"));
  expect(batchCalls).toHaveLength(0);
});

it("AC-U2: signed-out like opens the dialog, then the like completes with no second click", async () => {
  stubFetch({
    likeImpl: () => new Response(JSON.stringify({ likes: 5, comments: 2, liked: true }), { status: 200 }),
  });
  render(
    <ViewerProvider>
      <EngagementBar targetType="post" targetId="a" shareUrl="/posts/a" />
    </ViewerProvider>,
  );
  const like = await screen.findByRole("button", { name: /like, 4 likes/i });
  await userEvent.click(like);
  expect(dialogIsOpen()).toBe(true);
  await signInThroughDialog();
  // The pending like fired automatically after sign-in.
  await waitFor(() => {
    const puts = vi
      .mocked(fetch)
      .mock.calls.filter(
        ([url, init]) => url === "/api/likes" && (init as RequestInit)?.method === "PUT",
      );
    expect(puts).toHaveLength(1);
  });
  expect(await screen.findByRole("button", { name: /unlike, 5 likes/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(dialogIsOpen()).toBe(false);
});

it("AC-U4: like is optimistic, then rolls back with an error on failure", async () => {
  // Gate the PUT so the test can observe the optimistic state while pending.
  let releaseLike!: (res: Response) => void;
  const likeGate = new Promise<Response>((resolve) => {
    releaseLike = resolve;
  });
  stubFetch({ me: HAL, likeImpl: () => likeGate });
  render(
    <ViewerProvider>
      <EngagementBar targetType="post" targetId="a" />
    </ViewerProvider>,
  );
  const like = await screen.findByRole("button", { name: /like, 4 likes/i });
  fireEvent.click(like);
  // Optimistic update shows immediately.
  expect(await screen.findByRole("button", { name: /unlike, 5 likes/i })).toBeInTheDocument();
  releaseLike(new Response(JSON.stringify({ error: "boom" }), { status: 500 }));
  // Failure rolls back and announces.
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("boom");
  const rolledBack = await screen.findByRole("button", { name: /like, 4 likes/i });
  expect(rolledBack).toHaveAttribute("aria-pressed", "false");
});

it("EB-share: passes shareUrl through and resolves the href at click time", async () => {
  const seen: string[] = [];
  Object.defineProperty(window.navigator, "clipboard", {
    value: {
      writeText: vi.fn(async (text: string) => {
        seen.push(text);
      }),
    },
    configurable: true,
  });
  window.history.pushState({}, "", "/list");
  const first = render(
    <ViewerProvider>
      <EngagementBar targetType="post" targetId="a" shareUrl="/posts/abc" />
    </ViewerProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  await waitFor(() => {
    expect(seen).toEqual([`${window.location.origin}/posts/abc`]);
  });
  first.unmount();

  seen.length = 0;
  window.history.pushState({}, "", "/list");
  render(
    <ViewerProvider>
      <EngagementBar targetType="post" targetId="b" />
    </ViewerProvider>,
  );
  // Nothing is frozen at render: moving before the click changes what is copied.
  window.history.pushState({}, "", "/elsewhere");
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  await waitFor(() => {
    expect(seen).toEqual([`${window.location.origin}/elsewhere`]);
  });
});

it("AC-U9: all controls have accessible names and touch-sized targets", async () => {
  stubFetch();
  render(
    <ViewerProvider>
      <EngagementBar targetType="post" targetId="a" shareUrl="/posts/a" />
    </ViewerProvider>,
  );
  const like = await screen.findByRole("button", { name: /like/i });
  const comments = screen.getByRole("button", { name: /comments/i });
  const copy = screen.getByRole("button", { name: "Copy link" });
  for (const control of [like, comments, copy]) {
    expect(control.getAttribute("aria-label")).not.toBe("");
    expect(control.className).toMatch(/min-h-9/);
  }
});
