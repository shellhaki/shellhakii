import "server-only";
import { createHmac, randomInt } from "node:crypto";
import { sendMail } from "@/lib/mail";
import { rateLimited } from "@/lib/rate-limit";
import { getAuthSecret } from "./config";
import { defaultDisplayName } from "./session";
import {
  findLatestUnusedOtp,
  incrementOtpAttempts,
  insertOtpCode,
  invalidateUnusedOtps,
  markOtpUsed,
  upsertVerifiedSubscriber,
  type SubscriberRecord,
} from "./store";
import { equalHex } from "./tokens";

/** OTP validity (10 minutes, spec 4.1). */
export const OTP_TTL_MS = 10 * 60 * 1000;
/** A code is dead after this many wrong attempts (spec 4.1). */
export const OTP_MAX_ATTEMPTS = 5;
/** Request limits: 1 per email per 60s, 5 per email per hour, 10 per IP per hour. */
export const OTP_REQUEST_MIN_LIMIT = 1;
export const OTP_REQUEST_EMAIL_HOUR_LIMIT = 5;
export const OTP_REQUEST_IP_HOUR_LIMIT = 10;

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

/** 6 digits from a CSPRNG (`crypto.randomInt`). */
export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** `HMAC-SHA256(AUTH_SECRET, email + ":" + code)` hex. Never store the code itself. */
export function hashOtp(email: string, code: string): string {
  return createHmac("sha256", getAuthSecret()).update(`${email}:${code}`, "utf8").digest("hex");
}

export type RequestOtpResult =
  | { ok: true }
  | { ok: false; reason: "rate_limited" | "send_failed" };

/**
 * Issue a code for an email. Always `{ok:true}` for a well-formed email unless
 * rate limited (429) or the mail send fails (502); never reveals whether the
 * email exists or is subscribed.
 */
export async function requestOtp(rawEmail: string, ip: string): Promise<RequestOtpResult> {
  const email = rawEmail.trim().toLowerCase();
  getAuthSecret();
  if (
    rateLimited(`otp:req:min:${email}`, OTP_REQUEST_MIN_LIMIT, MINUTE_MS) ||
    rateLimited(`otp:req:hour:${email}`, OTP_REQUEST_EMAIL_HOUR_LIMIT, HOUR_MS) ||
    rateLimited(`otp:req:ip:${ip}`, OTP_REQUEST_IP_HOUR_LIMIT, HOUR_MS)
  ) {
    return { ok: false, reason: "rate_limited" };
  }
  const code = generateOtp();
  await invalidateUnusedOtps(email);
  await insertOtpCode(email, hashOtp(email, code), new Date(Date.now() + OTP_TTL_MS));
  try {
    await sendMail({
      to: email,
      subject: `Your shellhaki code: ${code}`,
      text: `Your shellhaki sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't ask for this, ignore this email and nothing happens.`,
      html: `<div style="max-width:480px;margin:0 auto;padding:24px 20px;font:15px/1.6 system-ui,sans-serif;color:#111"><p style="font:italic 600 22px Georgia,serif;margin:0 0 16px">shellhaki</p><p>Your shellhaki sign-in code is <strong>${code}</strong>. It expires in 10 minutes.</p><p style="color:#888;font-size:13px">If you didn't ask for this, ignore this email and nothing happens.</p></div>`,
    });
  } catch {
    return { ok: false, reason: "send_failed" };
  }
  return { ok: true };
}

export type VerifyOtpResult =
  | { ok: true; subscriber: SubscriberRecord; isNew: boolean }
  | { ok: false; reason: "invalid_or_expired" };

const invalid = (): VerifyOtpResult => ({ ok: false, reason: "invalid_or_expired" });

/**
 * Check a code: attempts, expiry, single use, timing-safe compare. New emails
 * become active subscribers; pending become active; unsubscribed stay
 * unsubscribed. Never throws for normal failures.
 */
export async function verifyOtp(
  rawEmail: string,
  rawCode: string,
  displayName: string | null = null,
  now: number = Date.now(),
): Promise<VerifyOtpResult> {
  const email = rawEmail.trim().toLowerCase();
  const code = rawCode.trim();
  getAuthSecret();
  const row = await findLatestUnusedOtp(email);
  const candidate = hashOtp(email, code);
  if (!row) {
    // Compare against a dummy so a missing code takes a similar path.
    equalHex("0".repeat(64), candidate);
    return invalid();
  }
  if (row.expiresAt.getTime() <= now || row.attempts >= OTP_MAX_ATTEMPTS) return invalid();
  if (!equalHex(row.codeHash, candidate)) {
    await incrementOtpAttempts(row.id);
    return invalid();
  }
  await markOtpUsed(row.id);
  const { subscriber, isNew } = await upsertVerifiedSubscriber(
    email,
    displayName ?? defaultDisplayName(email),
  );
  return { ok: true, subscriber, isNew };
}
