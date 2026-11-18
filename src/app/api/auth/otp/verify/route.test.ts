import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/store");

import { hashOtp } from "@/lib/auth/otp";
import {
  findLatestUnusedOtp,
  insertSession,
  markOtpUsed,
  upsertVerifiedSubscriber,
} from "@/lib/auth/store";
import { POST } from "./route";

const SECRET = "verify-route-secret-0123456789abcdef";
const ORIGINAL_SECRET = process.env.AUTH_SECRET;

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/auth/otp/verify", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function validRow(email: string, code: string) {
  return {
    id: "otp-1",
    email,
    codeHash: hashOtp(email, code),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    attempts: 0,
    usedAt: null,
    createdAt: new Date(),
  };
}

function subscriber(email: string, displayName: string | null = "re***") {
  return {
    id: "sub-1",
    email,
    displayName,
    status: "active" as const,
    emailVerifiedAt: new Date(),
  };
}

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
  vi.mocked(markOtpUsed).mockResolvedValue(undefined);
  vi.mocked(insertSession).mockImplementation(async (s) => ({
    id: "sess-new",
    subscriberId: s.subscriberId,
    familyId: s.familyId,
    refreshHash: s.refreshHash,
    createdAt: new Date(),
    familyCreatedAt: s.familyCreatedAt,
    expiresAt: s.expiresAt,
    rotatedAt: null,
    revokedAt: null,
    userAgent: s.userAgent,
  }));
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_SECRET;
});

describe("POST /api/auth/otp/verify", () => {
  it("AC-A5: verifies a code, creates the subscriber and sets both cookies", async () => {
    const email = "new-viewer@example.com";
    const code = "102030";
    vi.mocked(findLatestUnusedOtp).mockResolvedValue(validRow(email, code));
    vi.mocked(upsertVerifiedSubscriber).mockResolvedValue({
      subscriber: subscriber(email),
      isNew: true,
    });
    const res = await POST(post({ email, code }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      viewer: { id: "sub-1", email, displayName: "re***" },
      isNew: true,
    });
    const access = res.cookies.get("viewer_at");
    const refresh = res.cookies.get("viewer_rt");
    expect(access?.value).toMatch(/^v1\.sub-1\.\d+\.[0-9a-f]{64}$/);
    expect(refresh?.value).toMatch(/^[a-z0-9-]+\.[0-9a-f]{64}$/);
    const setCookie = res.headers.getSetCookie().join("\n");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=900");
    expect(setCookie).toContain("Max-Age=2592000");
  });

  it("AC-A5: keeps unsubscribed subscribers unsubscribed and reports isNew", async () => {
    const email = "opted-out@example.com";
    const code = "112233";
    vi.mocked(findLatestUnusedOtp).mockResolvedValue(validRow(email, code));
    vi.mocked(upsertVerifiedSubscriber).mockResolvedValue({
      subscriber: { ...subscriber(email), status: "unsubscribed" },
      isNew: false,
    });
    const res = await POST(post({ email, code }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isNew).toBe(false);
    expect(body.viewer.email).toBe(email);
  });

  it("AC-A5: forwards an explicit display name", async () => {
    const email = "named-viewer@example.com";
    const code = "223344";
    vi.mocked(findLatestUnusedOtp).mockResolvedValue(validRow(email, code));
    vi.mocked(upsertVerifiedSubscriber).mockResolvedValue({
      subscriber: subscriber(email, "Newbie"),
      isNew: true,
    });
    const res = await POST(post({ email, code, displayName: "Newbie" }));
    expect((await res.json()).viewer.displayName).toBe("Newbie");
    expect(vi.mocked(upsertVerifiedSubscriber).mock.calls[0][1]).toBe("Newbie");
  });

  it("AC-A6: wrong code returns 401 invalid_or_expired with no cookies", async () => {
    const email = "wrong-code@example.com";
    vi.mocked(findLatestUnusedOtp).mockResolvedValue(validRow(email, "000000"));
    const res = await POST(post({ email, code: "999999" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_or_expired" });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("AC-A6: expired code returns 401 with no cookies", async () => {
    const email = "expired-code@example.com";
    const code = "334455";
    vi.mocked(findLatestUnusedOtp).mockResolvedValue({
      ...validRow(email, code),
      expiresAt: new Date(Date.now() - 1000),
    });
    const res = await POST(post({ email, code }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_or_expired" });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("rejects malformed input with 400", async () => {
    const email = "malformed@example.com";
    const code = "445566";
    vi.mocked(findLatestUnusedOtp).mockResolvedValue(validRow(email, code));
    for (const body of [
      { email: "bad", code },
      { email, code: "123" },
      { email, code: "abcdef" },
      { email },
      { email, code, displayName: "x" },
      { email, code, displayName: "y".repeat(31) },
      { email, code, displayName: "bad\x01name" },
    ]) {
      expect((await POST(post(body))).status).toBe(400);
    }
  });

  it("returns 429 after too many verify attempts for one email", async () => {
    const email = "verify-flood@example.com";
    vi.mocked(findLatestUnusedOtp).mockResolvedValue(null);
    for (let i = 0; i < 10; i++) {
      expect((await POST(post({ email, code: "000000" }))).status).toBe(401);
    }
    expect((await POST(post({ email, code: "000000" }))).status).toBe(429);
  });

  it("AC-A13: maps a missing AUTH_SECRET to 503", async () => {
    delete process.env.AUTH_SECRET;
    const res = await POST(post({ email: "a@example.com", code: "123456" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Sign-in is not configured." });
  });

  it("AC-A12: rejects cross-origin requests with 403", async () => {
    const res = await POST(
      post({ email: "a@example.com", code: "123456" }, { origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
  });
});
