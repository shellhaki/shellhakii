import { describe, expect, it } from "vitest";
import { HttpError } from "@/lib/api";
import { assertSameOrigin } from "./origin";

function post(url: string, init?: { origin?: string; contentType?: string; body?: string }) {
  const headers: Record<string, string> = {};
  if (init?.origin !== undefined) headers.origin = init.origin;
  if (init?.contentType !== undefined) headers["content-type"] = init.contentType;
  return new Request(url, { method: "POST", headers, body: init?.body });
}

function expect403(fn: () => void) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(403);
    return;
  }
  throw new Error("expected assertSameOrigin to throw HttpError(403)");
}

describe("assertSameOrigin", () => {
  it("AC-A12: allows a same-origin JSON request", () => {
    expect(() =>
      assertSameOrigin(
        post("http://localhost/api/auth/otp/request", {
          origin: "http://localhost",
          contentType: "application/json",
          body: JSON.stringify({ email: "a@x.com" }),
        }),
      ),
    ).not.toThrow();
  });

  it("AC-A12: rejects a cross-origin request", () => {
    expect403(() =>
      assertSameOrigin(
        post("http://localhost/api/auth/otp/request", {
          origin: "https://evil.example",
          contentType: "application/json",
          body: JSON.stringify({ email: "a@x.com" }),
        }),
      ),
    );
  });

  it("AC-A12: rejects a request with a non-JSON body", () => {
    expect403(() =>
      assertSameOrigin(
        post("http://localhost/api/auth/otp/request", {
          origin: "http://localhost",
          contentType: "text/plain",
          body: "email=a@x.com",
        }),
      ),
    );
  });

  it("AC-A12: rejects a body without a content type", () => {
    const req = new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { "content-length": "7" },
    });
    expect403(() => assertSameOrigin(req));
  });

  it("AC-A12: allows a bodiless mutating request with no Origin header", () => {
    expect(() => assertSameOrigin(post("http://localhost/api/auth/logout"))).not.toThrow();
  });

  it("AC-A12: allows a same-origin bodiless POST whose runtime body stream is empty", () => {
    // Browsers send `Content-Length: 0` and no content type for fetch POSTs without a body.
    const req = new Request("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { origin: "http://localhost", "content-length": "0" },
    });
    expect(() => assertSameOrigin(req)).not.toThrow();
  });

  it("AC-A12: rejects a cross-site text/plain post (CSRF vector)", () => {
    expect403(() =>
      assertSameOrigin(post("http://localhost/api/likes", { contentType: "text/plain", body: "{}" })),
    );
  });

  it("AC-A12: allows a bodiless GET", () => {
    expect(() => assertSameOrigin(new Request("http://localhost/api/auth/me"))).not.toThrow();
  });

  it("AC-A12: allows JSON with a charset suffix", () => {
    expect(() =>
      assertSameOrigin(
        post("http://localhost/api/auth/otp/request", {
          contentType: "application/json; charset=utf-8",
          body: "{}",
        }),
      ),
    ).not.toThrow();
  });
});
