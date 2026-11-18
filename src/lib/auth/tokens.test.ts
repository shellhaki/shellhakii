import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  equalHex,
  generateRefreshSecret,
  sha256Hex,
  signAccessToken,
  verifyAccessToken,
} from "./tokens";

const SECRET = "test-secret-for-tokens-0123456789";
const OTHER_SECRET = "a-different-test-secret-9876543210";
const ORIGINAL = process.env.AUTH_SECRET;

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL;
});

describe("access tokens", () => {
  it("AC-A7: validates until expiry", () => {
    const now = 1_700_000_000_000;
    const token = signAccessToken("sub-123", now);
    expect(token.startsWith("v1.sub-123.")).toBe(true);
    expect(verifyAccessToken(token, now)?.subscriberId).toBe("sub-123");
    // 14 minutes later: still valid (15 minute lifetime).
    expect(verifyAccessToken(token, now + 14 * 60 * 1000)?.subscriberId).toBe("sub-123");
  });

  it("AC-A7: rejects an expired token", () => {
    const now = 1_700_000_000_000;
    const token = signAccessToken("sub-123", now);
    // Exactly at expiry and after: invalid.
    expect(verifyAccessToken(token, now + 15 * 60 * 1000)).toBeNull();
    expect(verifyAccessToken(token, now + 60 * 60 * 1000)).toBeNull();
  });

  it("AC-A7: rejects a tampered payload", () => {
    const now = 1_700_000_000_000;
    const token = signAccessToken("sub-123", now);
    const [, , exp, mac] = token.split(".");
    expect(verifyAccessToken(`v1.sub-999.${exp}.${mac}`, now)).toBeNull();
    expect(verifyAccessToken(`v1.sub-123.${Number(exp) + 60}.${mac}`, now)).toBeNull();
    expect(verifyAccessToken(token.slice(0, -1) + (token.endsWith("0") ? "1" : "0"), now)).toBeNull();
  });

  it("AC-A7: rejects a token signed with the wrong secret", () => {
    const token = signAccessToken("sub-123");
    process.env.AUTH_SECRET = OTHER_SECRET;
    expect(verifyAccessToken(token)).toBeNull();
  });

  it("AC-A7: rejects the wrong token version", () => {
    const now = 1_700_000_000_000;
    const token = signAccessToken("sub-123", now);
    expect(verifyAccessToken(token.replace(/^v1\./, "v2."), now)).toBeNull();
    expect(verifyAccessToken(token.replace(/^v1\./, "v0."), now)).toBeNull();
  });

  it("AC-A7: rejects malformed tokens", () => {
    expect(verifyAccessToken("")).toBeNull();
    expect(verifyAccessToken("v1.only-two")).toBeNull();
    expect(verifyAccessToken("v1...")).toBeNull();
    expect(verifyAccessToken("v1.sub.not-a-number.abc123")).toBeNull();
    expect(verifyAccessToken("not-a-token")).toBeNull();
  });
});

describe("token helpers", () => {
  it("sha256Hex is a stable hex digest", () => {
    // Well-known empty-string vector pins the algorithm.
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex("refresh-secret")).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("refresh-secret")).toBe(sha256Hex("refresh-secret"));
    expect(sha256Hex("a")).not.toBe(sha256Hex("b"));
  });

  it("generateRefreshSecret returns unique 32-byte hex secrets", () => {
    const a = generateRefreshSecret();
    const b = generateRefreshSecret();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("equalHex compares in constant time without throwing", () => {
    expect(equalHex("ab".repeat(32), "ab".repeat(32))).toBe(true);
    expect(equalHex("ab".repeat(32), "ac".repeat(32))).toBe(false);
    expect(equalHex("ab", "ab".repeat(32))).toBe(false);
    expect(equalHex("not-hex!!", "ab".repeat(32))).toBe(false);
  });
});
