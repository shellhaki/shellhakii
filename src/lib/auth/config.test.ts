import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthConfigError, getAuthSecret } from "./config";

const ORIGINAL = process.env.AUTH_SECRET;

beforeEach(() => {
  delete process.env.AUTH_SECRET;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL;
});

describe("auth config", () => {
  it("AC-A13: throws AuthConfigError when AUTH_SECRET is missing", () => {
    delete process.env.AUTH_SECRET;
    expect(() => getAuthSecret()).toThrow(AuthConfigError);
    expect(() => getAuthSecret()).toThrow("Sign-in is not configured.");
  });

  it("AC-A13: throws AuthConfigError when AUTH_SECRET is shorter than 32 chars", () => {
    process.env.AUTH_SECRET = "short-secret";
    expect(() => getAuthSecret()).toThrow(AuthConfigError);
  });

  it("returns the secret when it is at least 32 chars", () => {
    process.env.AUTH_SECRET = "x".repeat(32);
    expect(getAuthSecret()).toBe("x".repeat(32));
  });
});
