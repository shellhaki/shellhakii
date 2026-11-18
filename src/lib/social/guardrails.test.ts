import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getViewer: vi.fn() }));
vi.mock("@/lib/auth/origin", () => ({ assertSameOrigin: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ isAdmin: vi.fn() }));
vi.mock("@/lib/social/engagement", () => ({
  setLike: vi.fn(),
  getSummaries: vi.fn(),
}));
vi.mock("@/lib/social/comments", () => ({
  listComments: vi.fn(),
  addComment: vi.fn(),
}));
vi.mock("@/lib/social/posts", () => ({ createPost: vi.fn() }));

import { isAdmin } from "@/lib/admin-auth";
import { getViewer } from "@/lib/auth/session";
import { getSummaries, setLike } from "@/lib/social/engagement";
import { addComment, listComments } from "@/lib/social/comments";
import { createPost } from "@/lib/social/posts";
import { PUT as likesPut } from "@/app/api/likes/route";
import { GET as engagementGet } from "@/app/api/engagement/route";
import { GET as commentsGet, POST as commentsPost } from "@/app/api/comments/route";
import { POST as adminPostsPost } from "@/app/api/admin/posts/route";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const VIEWER = { id: UUID_A, email: "viewer@example.com", displayName: "Haki" };

const OWNED = [
  "src/lib/social/store.ts",
  "src/lib/social/targets.ts",
  "src/lib/social/engagement.ts",
  "src/lib/social/comments.ts",
  "src/lib/social/posts.ts",
  "src/app/api/likes/route.ts",
  "src/app/api/engagement/route.ts",
  "src/app/api/comments/route.ts",
  "src/app/api/comments/[id]/route.ts",
  "src/app/api/admin/posts/route.ts",
  "src/app/api/admin/posts/[id]/route.ts",
];

const sources = (): { file: string; text: string }[] =>
  OWNED.map((file) => ({ file, text: readFileSync(join(process.cwd(), file), "utf8") }));

const forbiddenKey = (key: string): boolean =>
  [
    "email",
    "token",
    "secret",
    "otp",
    "password",
    "authorization",
    "cookie",
    "session",
    "hash",
  ].includes(key.toLowerCase());

const keysOf = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => [
      k,
      ...keysOf(v),
    ]);
  }
  return [];
};

describe("guardrails", () => {
  it("AC-G3: owned sources use no banned tokens", () => {
    for (const { file, text } of sources()) {
      expect(text, `${file} contains @ts-ignore`).not.toContain("@ts-ignore");
      expect(text, `${file} contains eslint-disable`).not.toContain("eslint-disable");
      for (const m of text.matchAll(/\bany\b/gi)) {
        const at = m.index ?? 0;
        const context = text.slice(Math.max(0, at - 40), at + 40);
        expect(
          text.slice(at + 3, at + 4),
          `${file} has a non-SQL "any": ...${context}...`,
        ).toBe("(");
      }
    }
  });

  it("AC-G2: owned sources never log viewer or email values", () => {
    for (const { file, text } of sources()) {
      for (const line of text.split("\n")) {
        if (line.includes("console.")) {
          expect(/viewer|email/i.test(line), `${file}: ${line}`).toBe(false);
        }
      }
    }
  });

  it("AC-G2: public responses carry no secret or identity keys", async () => {
    vi.mocked(getViewer).mockResolvedValue(VIEWER);
    vi.mocked(setLike).mockResolvedValue({ likes: 1, comments: 0, liked: true });
    vi.mocked(addComment).mockResolvedValue({
      id: UUID_A,
      targetType: "post",
      targetId: UUID_A,
      body: "hi",
      createdAt: "2024-05-01T00:00:00.000Z",
      author: { displayName: "Haki" },
      mine: true,
    });
    vi.mocked(listComments).mockResolvedValue({
      comments: [
        {
          id: UUID_A,
          targetType: "post",
          targetId: UUID_A,
          body: "hi",
          createdAt: "2024-05-01T00:00:00.000Z",
          author: { displayName: "Haki" },
          mine: true,
        },
      ],
      nextCursor: null,
    });
    vi.mocked(getSummaries).mockResolvedValue({
      [`post:${UUID_A}`]: { likes: 1, comments: 1, liked: true },
    });
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.mocked(createPost).mockResolvedValue({ id: UUID_A });

    const json = (init: RequestInfo, method = "GET") =>
      new Request(init, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify({}),
      });

    const bodies = [
      await (
        await likesPut(
          new Request("http://localhost/api/likes", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetType: "post", targetId: UUID_A }),
          }),
        )
      ).json(),
      await (
        await commentsPost(
          new Request("http://localhost/api/comments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetType: "post", targetId: UUID_A, body: "hi" }),
          }),
        )
      ).json(),
      await (await commentsGet(json(`http://localhost/api/comments?targetType=post&targetId=${UUID_A}`))).json(),
      await (await engagementGet(json(`http://localhost/api/engagement?targets=post:${UUID_A}`))).json(),
      await (
        await adminPostsPost(
          new Request("http://localhost/api/admin/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: "hi" }),
          }),
        )
      ).json(),
    ];
    for (const body of bodies) {
      const bad = keysOf(body).filter(forbiddenKey);
      expect(bad, `leaked keys ${bad.join(",")}`).toEqual([]);
    }
  });

  it("AC-G2: unexpected failures hide details and log safely", async () => {
    vi.mocked(getViewer).mockResolvedValue(VIEWER);
    vi.mocked(setLike).mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await likesPut(
      new Request("http://localhost/api/likes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType: "post", targetId: UUID_A }),
      }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Server error" });
    expect(spy).toHaveBeenCalled();
    expect(JSON.stringify(spy.mock.calls)).not.toContain("viewer@example.com");
  });
});
