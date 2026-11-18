import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/store");

import { findSessionById, revokeSessionFamily } from "@/lib/auth/store";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { POST as refreshPOST } from "@/app/api/auth/refresh/route";

const SECRET = "logout-route-secret-0123456789abcdef";
const ORIGINAL_SECRET = process.env.AUTH_SECRET;

function post(path: string, refreshToken?: string, headers: Record<string, string> = {}) {
  const all: Record<string, string> = { ...headers };
  if (refreshToken) all.cookie = `viewer_rt=${refreshToken}`;
  return new Request(`http://localhost${path}`, { method: "POST", headers: all });
}

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
  vi.mocked(findSessionById).mockResolvedValue({
    id: "sess-1",
    subscriberId: "sub-1",
    familyId: "fam-1",
    refreshHash: "ff".repeat(32),
    createdAt: new Date(),
    familyCreatedAt: new Date(),
    expiresAt: new Date(Date.now() + 1000),
    rotatedAt: null,
    revokedAt: null,
    userAgent: "agent",
  });
  vi.mocked(revokeSessionFamily).mockResolvedValue(undefined);
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_SECRET;
});

describe("POST /api/auth/logout", () => {
  it("AC-A11: revokes the family and clears cookies", async () => {
    const res = await logoutPOST(post("/api/auth/logout", "sess-1.secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(revokeSessionFamily).toHaveBeenCalledWith("fam-1");
    const cleared = res.headers.getSetCookie().join("\n");
    expect(cleared).toContain("viewer_at=");
    expect(cleared).toContain("viewer_rt=");
    expect(cleared).toContain("Max-Age=0");
  });

  it("AC-A11: a subsequent refresh fails after logout", async () => {
    await logoutPOST(post("/api/auth/logout", "sess-1.secret"));
    // The family is now revoked: refreshing with the same token fails.
    vi.mocked(findSessionById).mockResolvedValue({
      id: "sess-1",
      subscriberId: "sub-1",
      familyId: "fam-1",
      refreshHash: "ff".repeat(32),
      createdAt: new Date(),
      familyCreatedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000),
      rotatedAt: null,
      revokedAt: new Date(),
      userAgent: "agent",
    });
    const res = await refreshPOST(post("/api/auth/refresh", "sess-1.secret"));
    expect(res.status).toBe(401);
  });

  it("succeeds with cleared cookies even without a session", async () => {
    const res = await logoutPOST(post("/api/auth/logout"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(revokeSessionFamily).not.toHaveBeenCalled();
    expect(res.headers.getSetCookie().join("\n")).toContain("Max-Age=0");
  });

  it("AC-A12: rejects cross-origin requests with 403", async () => {
    const res = await logoutPOST(
      post("/api/auth/logout", "sess-1.secret", { origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
  });
});
