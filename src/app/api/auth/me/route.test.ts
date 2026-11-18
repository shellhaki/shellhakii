import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/store");

import {
  findSessionById,
  findSubscriberById,
  insertSession,
  markSessionRotated,
  revokeSessionFamily,
  updateSubscriberDisplayName,
  type SessionRecord,
} from "@/lib/auth/store";
import { sha256Hex, signAccessToken } from "@/lib/auth/tokens";
import { GET, PATCH } from "./route";

const SECRET = "me-route-secret-0123456789abcdef12";
const ORIGINAL_SECRET = process.env.AUTH_SECRET;

function get(cookies: string[]) {
  const headers: Record<string, string> = {};
  if (cookies.length > 0) headers.cookie = cookies.join("; ");
  return new Request("http://localhost/api/auth/me", { headers });
}

function patch(body: unknown, cookies: string[] = [], origin?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookies.length > 0) headers.cookie = cookies.join("; ");
  if (origin) headers.origin = origin;
  return new Request("http://localhost/api/auth/me", {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

function sub(displayName: string | null = "Reader") {
  return {
    id: "sub-1",
    email: "reader@example.com",
    displayName,
    status: "active" as const,
    emailVerifiedAt: new Date(),
  };
}

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "sess-old",
    subscriberId: "sub-1",
    familyId: "fam-1",
    refreshHash: sha256Hex("old-secret"),
    createdAt: new Date(Date.now() - 1000),
    familyCreatedAt: new Date(Date.now() - 1000),
    expiresAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000),
    rotatedAt: null,
    revokedAt: null,
    userAgent: "agent",
    ...overrides,
  };
}

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
  vi.mocked(findSubscriberById).mockResolvedValue(sub());
  vi.mocked(markSessionRotated).mockResolvedValue(true);
  vi.mocked(revokeSessionFamily).mockResolvedValue(undefined);
  vi.mocked(insertSession).mockImplementation(async (s) => ({
    ...session(),
    ...s,
    id: "sess-new",
    createdAt: new Date(),
  }));
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_SECRET;
});

describe("GET /api/auth/me", () => {
  it("AC-A10: returns viewer null when signed out, and never 401s", async () => {
    const res = await GET(get([]));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ viewer: null });
  });

  it("AC-A10: returns the viewer for a valid access token without rotating", async () => {
    const res = await GET(get([`viewer_at=${signAccessToken("sub-1")}`]));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      viewer: { id: "sub-1", email: "reader@example.com", displayName: "Reader" },
    });
    expect(insertSession).not.toHaveBeenCalled();
  });

  it("AC-A10: refreshes inline when only the refresh cookie is valid", async () => {
    vi.mocked(findSessionById).mockResolvedValue(session());
    const res = await GET(
      get(["viewer_at=v1.sub-1.1.deadbeef", "viewer_rt=sess-old.old-secret"]),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      viewer: { id: "sub-1", email: "reader@example.com", displayName: "Reader" },
    });
    expect(res.cookies.get("viewer_at")?.value).toMatch(/^v1\.sub-1\./);
    expect(res.cookies.get("viewer_rt")?.value.startsWith("sess-new.")).toBe(true);
  });

  it("AC-A10: returns viewer null (200, cookies cleared) for garbage cookies", async () => {
    vi.mocked(findSessionById).mockResolvedValue(null);
    const res = await GET(get(["viewer_at=garbage", "viewer_rt=nope.nothing"]));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ viewer: null });
    expect(res.headers.getSetCookie().join("\n")).toContain("Max-Age=0");
  });

  it("AC-A13: maps a missing AUTH_SECRET to 503 when a refresh is attempted", async () => {
    vi.mocked(findSessionById).mockResolvedValue(session());
    delete process.env.AUTH_SECRET;
    const res = await GET(get(["viewer_rt=sess-old.old-secret"]));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Sign-in is not configured." });
  });
});

describe("PATCH /api/auth/me", () => {
  it("AC-A14: updates a valid display name", async () => {
    vi.mocked(updateSubscriberDisplayName).mockResolvedValue(sub("New Name"));
    const res = await PATCH(
      patch({ displayName: "  New Name  " }, [`viewer_at=${signAccessToken("sub-1")}`]),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      viewer: { id: "sub-1", email: "reader@example.com", displayName: "New Name" },
    });
    expect(vi.mocked(updateSubscriberDisplayName).mock.calls[0]).toEqual(["sub-1", "New Name"]);
  });

  it("AC-A14: rejects invalid display names with 400", async () => {
    const token = `viewer_at=${signAccessToken("sub-1")}`;
    for (const displayName of ["x", "y".repeat(31), "bad\x02name", "", 42, null]) {
      const res = await PATCH(patch({ displayName }, [token]));
      expect(res.status).toBe(400);
    }
    expect(updateSubscriberDisplayName).not.toHaveBeenCalled();
  });

  it("returns 401 when not signed in", async () => {
    expect((await PATCH(patch({ displayName: "Valid Name" }))).status).toBe(401);
    const badToken = await PATCH(patch({ displayName: "Valid Name" }, ["viewer_at=garbage"]));
    expect(badToken.status).toBe(401);
  });

  it("AC-A12: rejects cross-origin requests with 403", async () => {
    const res = await PATCH(
      patch(
        { displayName: "Valid Name" },
        [`viewer_at=${signAccessToken("sub-1")}`],
        "https://evil.example",
      ),
    );
    expect(res.status).toBe(403);
  });
});
