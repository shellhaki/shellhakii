import { NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/store");
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { cookies } from "next/headers";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  defaultDisplayName,
  endSession,
  getRequestCookie,
  getViewer,
  refreshSession,
  setSessionCookies,
  startSession,
  toViewer,
  viewerFromAccessToken,
} from "./session";
import {
  findSessionById,
  findSubscriberById,
  insertSession,
  markSessionRotated,
  revokeSessionFamily,
  type SessionRecord,
  type SubscriberRecord,
} from "./store";
import { SESSION_FAMILY_MAX_AGE_MS, sha256Hex, signAccessToken } from "./tokens";

const SECRET = "session-test-secret-0123456789abcdef";
const ORIGINAL_SECRET = process.env.AUTH_SECRET;
const cookiesMock = vi.mocked(cookies);

const NOW = 1_700_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function sub(overrides: Partial<SubscriberRecord> = {}): SubscriberRecord {
  return {
    id: "sub-1",
    email: "reader@example.com",
    displayName: "Reader",
    status: "active",
    emailVerifiedAt: new Date(NOW - DAY_MS),
    ...overrides,
  };
}

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: "sess-1",
    subscriberId: "sub-1",
    familyId: "fam-1",
    refreshHash: sha256Hex("refresh-secret-1"),
    createdAt: new Date(NOW - DAY_MS),
    familyCreatedAt: new Date(NOW - DAY_MS),
    expiresAt: new Date(NOW + 29 * DAY_MS),
    rotatedAt: null,
    revokedAt: null,
    userAgent: "test-agent",
    ...overrides,
  };
}

function mockRequestCookies(value: string | undefined) {
  cookiesMock.mockResolvedValue({
    get: (name: string) => (name === ACCESS_COOKIE && value ? { name, value } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
  mockRequestCookies(undefined);
  vi.mocked(findSubscriberById).mockResolvedValue(sub());
  vi.mocked(findSessionById).mockResolvedValue(session());
  vi.mocked(insertSession).mockImplementation(async (s) => session({ ...s, id: "sess-new" }));
  vi.mocked(markSessionRotated).mockResolvedValue(true);
  vi.mocked(revokeSessionFamily).mockResolvedValue(undefined);
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_SECRET;
});

describe("getViewer", () => {
  it("returns null when no access cookie exists", async () => {
    mockRequestCookies(undefined);
    expect(await getViewer()).toBeNull();
  });

  it("returns the viewer for a valid access token", async () => {
    mockRequestCookies(signAccessToken("sub-1"));
    vi.mocked(findSubscriberById).mockResolvedValue(sub());
    const viewer = await getViewer();
    expect(viewer).toEqual({ id: "sub-1", email: "reader@example.com", displayName: "Reader" });
  });

  it("returns null for a tampered token or unknown subscriber", async () => {
    mockRequestCookies("v1.sub-1.9999999999.deadbeef");
    expect(await getViewer()).toBeNull();
    mockRequestCookies(signAccessToken("sub-1", NOW));
    vi.mocked(findSubscriberById).mockResolvedValue(null);
    expect(await getViewer()).toBeNull();
  });

  it("returns null when cookies() throws (never throws itself)", async () => {
    cookiesMock.mockRejectedValue(new Error("no request scope"));
    expect(await getViewer()).toBeNull();
  });
});

describe("viewer mapping", () => {
  it("falls back to the email local part plus ***", () => {
    expect(defaultDisplayName("sam@example.com")).toBe("sa***");
    expect(toViewer({ id: "1", email: "bo@example.com", displayName: null })).toEqual({
      id: "1",
      email: "bo@example.com",
      displayName: "bo***",
    });
  });

  it("viewerFromAccessToken loads the subscriber or returns null", async () => {
    expect(await viewerFromAccessToken(signAccessToken("sub-1"))).toEqual({
      id: "sub-1",
      email: "reader@example.com",
      displayName: "Reader",
    });
    expect(await viewerFromAccessToken("garbage")).toBeNull();
  });
});

describe("startSession", () => {
  it("mints tokens and stores only the refresh hash", async () => {
    const result = await startSession("sub-1", "agent-1", NOW);
    expect(result.accessToken.startsWith("v1.sub-1.")).toBe(true);
    const [sessionId, secret] = result.refreshToken.split(".");
    expect(sessionId).toBe("sess-new");
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    const stored = vi.mocked(insertSession).mock.calls[0][0];
    expect(stored.subscriberId).toBe("sub-1");
    expect(stored.refreshHash).toBe(sha256Hex(secret));
    expect(stored.refreshHash).not.toContain(secret);
    expect(stored.expiresAt.getTime()).toBe(NOW + 30 * DAY_MS);
    expect(stored.familyCreatedAt.getTime()).toBe(NOW);
  });
});

describe("refreshSession", () => {
  it("AC-A8: rotates the token, issues new cookies material and extends expiry", async () => {
    const old = session({ id: "sess-old", refreshHash: sha256Hex("old-secret") });
    vi.mocked(findSessionById).mockResolvedValue(old);
    const result = await refreshSession("sess-old.old-secret", "agent-2", NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.viewer).toEqual({
      id: "sub-1",
      email: "reader@example.com",
      displayName: "Reader",
    });
    expect(markSessionRotated).toHaveBeenCalledWith("sess-old");
    const stored = vi.mocked(insertSession).mock.calls[0][0];
    expect(stored.familyId).toBe("fam-1");
    expect(stored.familyCreatedAt).toEqual(old.familyCreatedAt);
    expect(stored.expiresAt.getTime()).toBe(NOW + 30 * DAY_MS);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(old.expiresAt.getTime());
    const [newId, newSecret] = result.refreshToken.split(".");
    expect(newId).toBe("sess-new");
    expect(stored.refreshHash).toBe(sha256Hex(newSecret));
    expect(result.accessToken.startsWith("v1.sub-1.")).toBe(true);
  });

  it("AC-A9: reusing a rotated refresh token revokes the whole family", async () => {
    vi.mocked(findSessionById).mockResolvedValue(
      session({ rotatedAt: new Date(NOW - 1000), refreshHash: sha256Hex("old-secret") }),
    );
    const result = await refreshSession("sess-1.old-secret", "agent", NOW);
    expect(result).toEqual({ ok: false, reason: "reused" });
    expect(revokeSessionFamily).toHaveBeenCalledWith("fam-1");
    expect(insertSession).not.toHaveBeenCalled();
  });

  it("AC-A9: a wrong secret on a rotated session does not revoke the family", async () => {
    vi.mocked(findSessionById).mockResolvedValue(
      session({ rotatedAt: new Date(NOW - 1000), refreshHash: sha256Hex("old-secret") }),
    );
    const result = await refreshSession("sess-1.guess", "agent", NOW);
    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(revokeSessionFamily).not.toHaveBeenCalled();
  });

  it("AC-A9: losing a concurrent rotation race is treated as reuse", async () => {
    vi.mocked(findSessionById).mockResolvedValue(session({ refreshHash: sha256Hex("old-secret") }));
    vi.mocked(markSessionRotated).mockResolvedValue(false);
    const result = await refreshSession("sess-1.old-secret", "agent", NOW);
    expect(result).toEqual({ ok: false, reason: "reused" });
    expect(revokeSessionFamily).toHaveBeenCalledWith("fam-1");
    expect(insertSession).not.toHaveBeenCalled();
  });

  it("AC-A8: honors the 90-day family cap", async () => {
    vi.mocked(findSessionById).mockResolvedValue(
      session({
        refreshHash: sha256Hex("old-secret"),
        familyCreatedAt: new Date(NOW - SESSION_FAMILY_MAX_AGE_MS - 1000),
      }),
    );
    const result = await refreshSession("sess-1.old-secret", "agent", NOW);
    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(revokeSessionFamily).toHaveBeenCalledWith("fam-1");
    expect(insertSession).not.toHaveBeenCalled();
  });

  it("rejects expired sessions, revoked sessions, wrong secrets and unknown ids", async () => {
    vi.mocked(findSessionById).mockResolvedValue(
      session({ refreshHash: sha256Hex("right"), expiresAt: new Date(NOW - 1000) }),
    );
    expect(await refreshSession("sess-1.right", "agent", NOW)).toEqual({
      ok: false,
      reason: "expired",
    });
    vi.mocked(findSessionById).mockResolvedValue(
      session({ refreshHash: sha256Hex("right"), revokedAt: new Date(NOW - 1000) }),
    );
    expect(await refreshSession("sess-1.right", "agent", NOW)).toEqual({
      ok: false,
      reason: "revoked",
    });
    vi.mocked(findSessionById).mockResolvedValue(session({ refreshHash: sha256Hex("right") }));
    expect(await refreshSession("sess-1.wrong", "agent", NOW)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(insertSession).not.toHaveBeenCalled();
    vi.mocked(findSessionById).mockResolvedValue(null);
    expect(await refreshSession("missing.right", "agent", NOW)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await refreshSession("no-separator", "agent", NOW)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});

describe("endSession", () => {
  it("AC-A11: revokes the session family", async () => {
    await endSession("sess-1.any-secret");
    expect(revokeSessionFamily).toHaveBeenCalledWith("fam-1");
  });

  it("does nothing (and never throws) without a token or session", async () => {
    await endSession(null);
    await endSession("no-separator");
    vi.mocked(findSessionById).mockResolvedValue(null);
    await endSession("missing.secret");
    expect(revokeSessionFamily).not.toHaveBeenCalled();
    vi.mocked(findSessionById).mockRejectedValue(new Error("db down"));
    await endSession("sess-1.secret");
  });
});

describe("cookies", () => {
  it("sets both cookies with the spec flags", () => {
    const res = NextResponse.json({ ok: true });
    setSessionCookies(res, "access-token", "refresh-token");
    expect(res.cookies.get(ACCESS_COOKIE)?.value).toBe("access-token");
    expect(res.cookies.get(REFRESH_COOKIE)?.value).toBe("refresh-token");
    const setCookie = res.headers.getSetCookie().join("\n");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=900");
    expect(setCookie).toContain("Max-Age=2592000");
  });

  it("clears both cookies", () => {
    const res = NextResponse.json({ ok: true });
    clearSessionCookies(res);
    const setCookie = res.headers.getSetCookie().join("\n");
    expect(setCookie).toContain(`${ACCESS_COOKIE}=`);
    expect(setCookie).toContain(`${REFRESH_COOKIE}=`);
    expect(setCookie).toContain("Max-Age=0");
  });

  it("getRequestCookie parses the cookie header", () => {
    const req = new Request("http://localhost/api/auth/me", {
      headers: { cookie: `${ACCESS_COOKIE}=abc123; other=1` },
    });
    expect(getRequestCookie(req, ACCESS_COOKIE)).toBe("abc123");
    expect(getRequestCookie(req, REFRESH_COOKIE)).toBeNull();
    expect(getRequestCookie(new Request("http://localhost/"), ACCESS_COOKIE)).toBeNull();
  });
});
