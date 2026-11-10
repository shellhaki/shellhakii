import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { requireEnv } from "./env";

const COOKIE = "admin_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function sign(payload: string) {
  return createHmac("sha256", requireEnv("ADMIN_SECRET"))
    .update(payload)
    .digest("hex");
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string) {
  return timingSafeEqual(digest(a), digest(b));
}

export function passwordMatches(input: string) {
  return safeEqual(input, requireEnv("ADMIN_SECRET"));
}

export async function startSession() {
  const expires = Math.floor(Date.now() / 1000) + MAX_AGE;
  const token = `${expires}.${sign(`admin:${expires}`)}`;
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function isAdmin() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  const [expires, mac] = token.split(".");
  if (!expires || !mac) return false;
  if (Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  try {
    return safeEqual(mac, sign(`admin:${expires}`));
  } catch {
    return false;
  }
}
