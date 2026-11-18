import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/store");
vi.mock("@/lib/mail");

import { sendMail } from "@/lib/mail";
import { POST } from "./route";

const SECRET = "request-route-secret-0123456789abcdef";
const ORIGINAL_SECRET = process.env.AUTH_SECRET;

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/auth/otp/request", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
  vi.mocked(sendMail).mockResolvedValue(undefined);
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_SECRET;
});

describe("POST /api/auth/otp/request", () => {
  it("AC-A2: returns {ok:true} without revealing whether the email exists", async () => {
    const res = await POST(post({ email: "Someone@Example.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // A second, unknown address gets the identical answer.
    const other = await POST(post({ email: "totally-unknown-9@example.com" }));
    expect(other.status).toBe(200);
    expect(await other.json()).toEqual({ ok: true });
    // The mail went to the normalized address with a 6-digit code subject.
    const mailed = vi.mocked(sendMail).mock.calls[0][0];
    expect(mailed.to).toBe("someone@example.com");
    expect(mailed.subject).toMatch(/^Your shellhaki code: \d{6}$/);
    expect(mailed.text).toContain("10 minutes");
  });

  it("AC-A2: rejects malformed emails with 400", async () => {
    for (const body of [{ email: "not-an-email" }, { email: "" }, {}, { email: 42 }]) {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
    }
  });

  it("AC-A4: returns 429 when over the email rate limit", async () => {
    const first = await POST(post({ email: "limited-req@example.com" }));
    expect(first.status).toBe(200);
    const second = await POST(post({ email: "limited-req@example.com" }));
    expect(second.status).toBe(429);
  });

  it("returns 502 when the code email cannot be sent", async () => {
    vi.mocked(sendMail).mockRejectedValueOnce(new Error("Resend down"));
    const res = await POST(post({ email: "send-fails@example.com" }));
    expect(res.status).toBe(502);
  });

  it("AC-A13: maps a missing AUTH_SECRET to 503", async () => {
    delete process.env.AUTH_SECRET;
    const res = await POST(post({ email: "unconfigured@example.com" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Sign-in is not configured." });
  });

  it("AC-A12: rejects cross-origin requests with 403", async () => {
    const res = await POST(post({ email: "a@example.com" }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("AC-A12: rejects non-JSON bodies with 403", async () => {
    const req = new Request("http://localhost/api/auth/otp/request", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "email=a@example.com",
    });
    expect((await POST(req)).status).toBe(403);
  });
});
