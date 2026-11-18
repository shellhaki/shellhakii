// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LikeButton } from "@/components/social/like-button";
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

function stubFetch(opts?: {
  me?: Viewer | null;
  likeImpl?: (init?: RequestInit) => Response;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me" && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ viewer: opts?.me ?? null }), { status: 200 });
      }
      if (url === "/api/auth/otp/request") return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url === "/api/auth/otp/verify") {
        return new Response(JSON.stringify({ viewer: HAL, isNew: false }), { status: 200 });
      }
      if (url === "/api/likes" && opts?.likeImpl) return opts.likeImpl(init);
      return new Response(JSON.stringify({ error: "not mocked" }), { status: 500 });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => stubFetch({ me: HAL }));

it("AC-U4: liked state toggles count up and calls PUT", async () => {
  const seen: RequestInit[] = [];
  stubFetch({
    me: HAL,
    likeImpl: (init) => {
      seen.push(init ?? {});
      return new Response(JSON.stringify({ likes: 6, comments: 0, liked: true }), { status: 200 });
    },
  });
  render(
    <ViewerProvider>
      <LikeButton targetType="post" targetId="a" liked={false} count={5} />
    </ViewerProvider>,
  );
  const like = await screen.findByRole("button", { name: "Like, 5 likes" });
  expect(like).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(like);
  expect(await screen.findByRole("button", { name: "Unlike, 6 likes" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(seen).toHaveLength(1);
  expect(seen[0].method).toBe("PUT");
  expect(JSON.parse(seen[0].body as string)).toEqual({ targetType: "post", targetId: "a" });
});

it("AC-U4: unliking calls DELETE and toggles count down", async () => {
  const seen: RequestInit[] = [];
  stubFetch({
    me: HAL,
    likeImpl: (init) => {
      seen.push(init ?? {});
      return new Response(JSON.stringify({ likes: 4, comments: 0, liked: false }), { status: 200 });
    },
  });
  const onUpdate = vi.fn();
  render(
    <ViewerProvider>
      <LikeButton targetType="post" targetId="a" liked count={5} onUpdate={onUpdate} />
    </ViewerProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Unlike, 5 likes" }));
  expect(await screen.findByRole("button", { name: "Like, 4 likes" })).toBeInTheDocument();
  expect(seen[0].method).toBe("DELETE");
  expect(onUpdate).toHaveBeenCalledWith({ likes: 4, comments: 0, liked: false } satisfies EngagementSummary);
});

it("AC-U4: failure rolls back to the previous count with an error", async () => {
  stubFetch({
    me: HAL,
    likeImpl: () => new Response(JSON.stringify({ error: "nope" }), { status: 500 }),
  });
  render(
    <ViewerProvider>
      <LikeButton targetType="post" targetId="a" liked={false} count={5} />
    </ViewerProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Like, 5 likes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("nope");
  expect(await screen.findByRole("button", { name: "Like, 5 likes" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

it("AC-U2: signed-out click signs in first, then performs the like", async () => {
  stubFetch({
    me: null,
    likeImpl: () => new Response(JSON.stringify({ likes: 1, comments: 0, liked: true }), { status: 200 }),
  });
  render(
    <ViewerProvider>
      <LikeButton targetType="post" targetId="a" liked={false} count={0} />
    </ViewerProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Like, 0 likes" }));
  // Auth dialog opens; complete the flow inside it.
  const email = await screen.findByLabelText("Email");
  fireEvent.change(email, { target: { value: "hal@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  const code = await screen.findByLabelText("Code");
  fireEvent.change(code, { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
  expect(await screen.findByRole("button", { name: "Unlike, 1 likes" })).toBeInTheDocument();
});
