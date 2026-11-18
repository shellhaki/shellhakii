import { describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/api";
import { AuthConfigError } from "./config";
import {
  authErrorResponse,
  authRoute,
  parseCode,
  parseEmail,
  parseOptionalDisplayName,
  parseRequiredDisplayName,
} from "./respond";

describe("authErrorResponse", () => {
  it("AC-A13: maps AuthConfigError to 503 with a clear message", async () => {
    const res = authErrorResponse(new AuthConfigError());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Sign-in is not configured." });
  });

  it("passes HttpError status and message through", async () => {
    const res = authErrorResponse(new HttpError(429, "Too many attempts. Try again later."));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many attempts. Try again later." });
  });

  it("maps unexpected errors to a generic 500 without leaking", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const res = authErrorResponse(new Error("db connection string postgres://secret"));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Server error" });
    } finally {
      error.mockRestore();
    }
  });

  it("authRoute maps a thrown HttpError to a JSON response", async () => {
    const handler = authRoute(async (req: Request) => {
      expect(req.url).toContain("localhost");
      throw new HttpError(400, "Bad input");
    });
    const res = await handler(new Request("http://localhost/"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Bad input" });
  });
});

describe("validators", () => {
  it("parseEmail normalizes and rejects bad input", () => {
    expect(parseEmail("  Reader@Example.com ")).toBe("reader@example.com");
    for (const bad of ["nope", "", 42, null, "a@b", "x".repeat(195) + "@example.com"]) {
      expect(() => parseEmail(bad)).toThrow(HttpError);
    }
  });

  it("parseCode accepts only 6 digits", () => {
    expect(parseCode(" 123456 ")).toBe("123456");
    for (const bad of ["12345", "1234567", "abcdef", "", null]) {
      expect(() => parseCode(bad)).toThrow(HttpError);
    }
  });

  it("display name validators enforce 2-30 chars without control chars", () => {
    expect(parseOptionalDisplayName(undefined)).toBeNull();
    expect(parseOptionalDisplayName("   ")).toBeNull();
    expect(parseOptionalDisplayName("  Jo  ")).toBe("Jo");
    expect(parseRequiredDisplayName("  Newbie  ")).toBe("Newbie");
    for (const bad of ["x", "y".repeat(31), "bad\x01name", "has\x7fdel"]) {
      expect(() => parseOptionalDisplayName(bad)).toThrow(HttpError);
      expect(() => parseRequiredDisplayName(bad)).toThrow(HttpError);
    }
    expect(() => parseRequiredDisplayName("")).toThrow(HttpError);
    expect(() => parseRequiredDisplayName(42)).toThrow(HttpError);
  });
});
