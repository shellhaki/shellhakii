import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/store");

import {
  findSessionById,
  findSubscriberById,
  insertSession,
  markSessionRotated,
  revokeSessionFamily,
} from "@/lib/auth/store";
import { sha256Hex } from "@/lib/auth/tokens";
import { POST } from "./route";

const SECRET = "refresh-route-secret-0123456789abcdef";
const ORIGINAL_SECRET = process.env.AUTH_SECRET;

function post(refreshToken?: string, headers: Record<string, string> = {}) {
  const all: Record<string, string> = { ...headers };
  if (refreshToken) all.cookie = `viewer_rt=${refreshToken}`;
  return new Request("http://localhost/api/auth/refresh", { method: "POST", headers: all });
}

function sub() {
  return {
    id: "sub-1",
    email: "reader@example.com",
    displayName: "Reader",
    status: "active" as const,
    emailVerifiedAt: new Date(),
  };
}

function session(id: string, secret: string, rotated: boolean) {
  return {
    id,
    subscriberId: "sub-1",
    familyId: "fam-1",
    refreshHash: sha256Hex(secret),
    createdAt: new Date(Date.now() - 1000),
    familyCreatedAt: new Date(Date.now() - 1000),
    expiresAt: new Date(Date.now() + 29 * 24 * 60 * 60 * 1000),
    rotatedAt: rotated ? new Date(Date.now() - 500) : null,
    revokedAt: null,
    userAgent: "agent",
  };
}

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
  vi.mocked(findSubscriberById).mockResolvedValue(sub());
  vi.mocked(markSessionRotated).mockResolvedValue(true);
  vi.mocked(revokeSessionFamily).mockResolvedValue(undefined);
  vi.mocked(insertSession).mockImplementation(async (s) => ({
    ...session("sess-new", "unused", false),
    ...s,
    id: "sess-new",
    createdAt: new Date(),
  }));
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_SECRET;
});

describe("POST /api/auth/refresh", () => {
  it("AC-A8: rotates the session and sets new cookies", async () => {
    vi.mocked(findSessionById).mockResolvedValue(session("sess-old", "old-secret", false));
    const res = await POST(post("sess-old.old-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      viewer: { id: "sub-1", email: "reader@example.com", displayName: "Reader" },
    });
    const access = res.cookies.get("viewer_at");
    const refresh = res.cookies.get("viewer_rt");
    expect(access?.value).toMatch(/^v1\.sub-1\.\d+\.[0-9a-f]{64}$/);
    expect(refresh?.value.startsWith("sess-new.")).toBe(true);
    expect(refresh?.value).not.toContain("old-secret");
    expect(res.headers.getSetCookie().join("\n")).toContain("Max-Age=2592000");
  });

  it("AC-A9: reusing a rotated token revokes the family and returns 401", async () => {
    vi.mocked(findSessionById).mockResolvedValue(session("sess-old", "old-secret", true));
    const res = await POST(post("sess-old.old-secret"));
    expect(res.status).toBe(401);
    expect(revokeSessionFamily).toHaveBeenCalledWith("fam-1");
    const cleared = res.headers.getSetCookie().join("\n");
    expect(cleared).toContain("viewer_at=");
    expect(cleared).toContain("Max-Age=0");
  });

  it("returns 401 with cleared cookies for unknown or missing tokens", async () => {
    vi.mocked(findSessionById).mockResolvedValue(null);
    const unknown = await POST(post("sess-missing.secret"));
    expect(unknown.status).toBe(401);
    expect(unknown.headers.getSetCookie().join("\n")).toContain("Max-Age=0");
    const missing = await POST(post());
    expect(missing.status).toBe(401);
    expect(missing.headers.getSetCookie().join("\n")).toContain("Max-Age=0");
  });

  it("AC-A13: maps a missing AUTH_SECRET to 503 for a valid session", async () => {
    vi.mocked(findSessionById).mockResolvedValue(session("sess-old", "old-secret", false));
    delete process.env.AUTH_SECRET;
    const res = await POST(post("sess-old.old-secret"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Sign-in is not configured." });
  });

  it("AC-A12: rejects cross-origin requests with 403", async () => {
    const res = await POST(post("sess-old.old-secret", { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });
});
