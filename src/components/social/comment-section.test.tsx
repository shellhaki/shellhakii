// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommentSection } from "@/components/social/comment-section";
import { ViewerProvider } from "@/components/social/viewer-provider";
import type { CommentDTO, Viewer } from "@/lib/social/types";

const HAL = { id: "viewer-1", email: "hal@example.com", displayName: "Hal" } satisfies Viewer;

if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

function comment(id: string, body: string, mine: boolean): CommentDTO {
  return {
    id,
    targetType: "post",
    targetId: "a",
    body,
    createdAt: new Date().toISOString(),
    author: { displayName: mine ? "Hal" : "Ada" },
    mine,
  };
}

function stubFetch(opts?: {
  me?: Viewer | null;
  pages?: { comments: CommentDTO[]; nextCursor: string | null }[];
  postImpl?: (body: string) => Response;
  deleteImpl?: (id: string) => Response;
}) {
  let pageIndex = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/me" && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ viewer: opts?.me ?? null }), { status: 200 });
      }
      if (url.startsWith("/api/comments?")) {
        const page = opts?.pages?.[Math.min(pageIndex, (opts?.pages?.length ?? 1) - 1)] ?? {
          comments: [],
          nextCursor: null,
        };
        pageIndex += 1;
        return new Response(JSON.stringify(page), { status: 200 });
      }
      if (url === "/api/comments" && init?.method === "POST") {
        const parsed = JSON.parse((init.body as string) ?? "{}") as { body?: string };
        if (opts?.postImpl) return opts.postImpl(parsed.body ?? "");
        const created = comment("new-1", parsed.body ?? "", true);
        return new Response(JSON.stringify(created), { status: 200 });
      }
      if (url.startsWith("/api/comments/") && init?.method === "DELETE") {
        const id = decodeURIComponent(url.split("/").pop() ?? "");
        if (opts?.deleteImpl) return opts.deleteImpl(id);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url === "/api/auth/otp/request") return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url === "/api/auth/otp/verify") {
        return new Response(JSON.stringify({ viewer: HAL, isNew: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not mocked" }), { status: 500 });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => stubFetch({ me: HAL }));

function renderSection(open = false) {
  render(
    <ViewerProvider>
      <CommentSection targetType="post" targetId="a" defaultOpen={open} />
    </ViewerProvider>,
  );
}

it("AC-U1 + AC-U6: collapsed section fetches nothing and opens on click", async () => {
  stubFetch({ me: null });
  renderSection(false);
  const toggle = screen.getByRole("button", { name: "Comments" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  const commentCalls = vi.mocked(fetch).mock.calls.filter(([url]) => (url as string).startsWith("/api/comments"));
  expect(commentCalls).toHaveLength(0);
  fireEvent.click(toggle);
  expect(await screen.findByText("No comments yet. Be the first to reply.")).toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => (url as string).startsWith("/api/comments"))).toHaveLength(1);
});

it("AC-U6: open section loads newest-first comments and offers load more", async () => {
  stubFetch({
    me: HAL,
    pages: [
      { comments: [comment("c2", "second", false), comment("c1", "first", false)], nextCursor: "cursor-1" },
      { comments: [comment("c0", "oldest", false)], nextCursor: null },
    ],
  });
  renderSection(true);
  const items = await screen.findAllByText(/second|first/);
  expect(items[0]).toHaveTextContent("second");
  fireEvent.click(screen.getByRole("button", { name: /load more comments/i }));
  expect(await screen.findByText("oldest")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /load more comments/i })).not.toBeInTheDocument();
});

it("AC-U6: composer shows a live counter capped at 1000", async () => {
  stubFetch({ me: HAL, pages: [{ comments: [], nextCursor: null }] });
  renderSection(true);
  await screen.findByText("No comments yet. Be the first to reply.");
  const box = screen.getByLabelText("Add a comment");
  expect(box).toHaveAttribute("maxlength", "1000");
  expect(screen.getByRole("button", { name: "Post comment" })).toBeDisabled();
  fireEvent.change(box, { target: { value: "Hello there" } });
  expect(screen.getByText("11/1000")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Post comment" })).toBeEnabled();
});

it("AC-U2: signed-out submit opens the dialog only on click, then posts the draft", async () => {
  stubFetch({ me: null, pages: [{ comments: [], nextCursor: null }] });
  renderSection(true);
  await screen.findByText("No comments yet. Be the first to reply.");
  // No dialog before any click (AC-U1).
  expect(document.querySelector("dialog[open]")).toBeNull();
  const box = screen.getByLabelText("Sign in to join the discussion");
  fireEvent.change(box, { target: { value: "My first thought" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in to comment" }));
  const email = await screen.findByLabelText("Email");
  fireEvent.change(email, { target: { value: "hal@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  fireEvent.change(await screen.findByLabelText("Code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
  // The draft posted automatically with no second click.
  expect(await screen.findByText("My first thought")).toBeInTheDocument();
  const posts = vi
    .mocked(fetch)
    .mock.calls.filter(([url, init]) => url === "/api/comments" && (init as RequestInit)?.method === "POST");
  expect(posts).toHaveLength(1);
});

it("AC-U6: authors can delete their own comment only", async () => {
  stubFetch({
    me: HAL,
    pages: [{ comments: [comment("mine-1", "take this down", true), comment("theirs-1", "keep me", false)], nextCursor: null }],
  });
  renderSection(true);
  await screen.findByText("take this down");
  expect(screen.getByRole("button", { name: /delete your comment/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /delete your comment/i }));
  await waitFor(() => expect(screen.queryByText("take this down")).not.toBeInTheDocument());
  expect(screen.getByText("keep me")).toBeInTheDocument();
  const deletes = vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => (init as RequestInit)?.method === "DELETE");
  expect(deletes).toHaveLength(1);
});

it("AC-U6: comment bodies render as plain text, never HTML", async () => {
  stubFetch({ me: HAL, pages: [{ comments: [comment("x", "<b>not bold</b>", false)], nextCursor: null }] });
  renderSection(true);
  expect(await screen.findByText("<b>not bold</b>")).toBeInTheDocument();
  expect(document.querySelector("li b")).toBeNull();
});

it("AC-U6: failed posts show an inline error and keep the draft", async () => {
  stubFetch({
    me: HAL,
    pages: [{ comments: [], nextCursor: null }],
    postImpl: () => new Response(JSON.stringify({ error: "too fast" }), { status: 429 }),
  });
  renderSection(true);
  await screen.findByText("No comments yet. Be the first to reply.");
  fireEvent.change(screen.getByLabelText("Add a comment"), { target: { value: "try again" } });
  fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("too fast");
  expect(screen.getByLabelText("Add a comment")).toHaveValue("try again");
});

it("AC-U9: toggle, composer and delete controls all have accessible names", async () => {
  stubFetch({
    me: HAL,
    pages: [{ comments: [comment("mine-1", "hello", true)], nextCursor: null }],
  });
  renderSection(true);
  await screen.findByText("hello");
  expect(screen.getByRole("button", { name: /hide comments/i })).toBeInTheDocument();
  expect(screen.getByLabelText("Add a comment")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /delete your comment/i })).toBeInTheDocument();
});
