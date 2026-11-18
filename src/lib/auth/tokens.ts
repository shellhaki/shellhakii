import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "./config";

/** Access token lifetime in seconds (15 minutes, spec 4.2). */
export const ACCESS_TOKEN_TTL_S = 15 * 60;
/** Refresh token lifetime in ms (30 days, spec 4.2). */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Absolute session family cap in ms (90 days from family_created_at). */
export const SESSION_FAMILY_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/** Hex SHA-256 of a value (refresh secrets are stored only in this form). */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** 32 random bytes as hex (the refresh token secret half). */
export function generateRefreshSecret(): string {
  return randomBytes(32).toString("hex");
}

/** Constant-time hex digest comparison; false on any mismatch or bad input. */
export function equalHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * Sign `v1.<subscriberId>.<expUnix>.<hmac>` (HMAC-SHA256 with AUTH_SECRET).
 * `now` is injectable (ms) so tests do not need fake timers.
 */
export function signAccessToken(subscriberId: string, now: number = Date.now()): string {
  const exp = Math.floor(now / 1000) + ACCESS_TOKEN_TTL_S;
  const payload = `v1.${subscriberId}.${exp}`;
  const mac = createHmac("sha256", getAuthSecret()).update(payload, "utf8").digest("hex");
  return `${payload}.${mac}`;
}

/** Verify an access token; null when expired, tampered, or otherwise invalid. */
export function verifyAccessToken(
  token: string,
  now: number = Date.now(),
): { subscriberId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || !parts[1] || !parts[2] || !parts[3]) {
    return null;
  }
  const subscriberId = parts[1];
  const expRaw = parts[2];
  const presented = parts[3];
  const exp = Number(expRaw);
  if (!Number.isInteger(exp) || exp * 1000 <= now) return null;
  const expected = createHmac("sha256", getAuthSecret())
    .update(`v1.${subscriberId}.${expRaw}`, "utf8")
    .digest("hex");
  if (!equalHex(expected, presented)) return null;
  return { subscriberId };
}
