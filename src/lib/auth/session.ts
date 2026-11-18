import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Viewer } from "@/lib/social/types";
import {
  findSessionById,
  findSubscriberById,
  insertSession,
  markSessionRotated,
  revokeSessionFamily,
} from "./store";
import {
  REFRESH_TOKEN_TTL_MS,
  SESSION_FAMILY_MAX_AGE_MS,
  equalHex,
  generateRefreshSecret,
  sha256Hex,
  signAccessToken,
  verifyAccessToken,
} from "./tokens";

/** Cookie names (spec 4.2). */
export const ACCESS_COOKIE = "viewer_at";
export const REFRESH_COOKIE = "viewer_rt";
/** 15 minutes in seconds. */
export const ACCESS_COOKIE_MAX_AGE = 15 * 60;
/** 30 days in seconds. */
export const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

function baseCookieOptions(maxAge: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function accessCookieOptions() {
  return baseCookieOptions(ACCESS_COOKIE_MAX_AGE);
}

export function refreshCookieOptions() {
  return baseCookieOptions(REFRESH_COOKIE_MAX_AGE);
}

/** Set both session cookies on a route response (readable via Set-Cookie). */
export function setSessionCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string,
): void {
  res.cookies.set(ACCESS_COOKIE, accessToken, accessCookieOptions());
  res.cookies.set(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
}

/** Clear both session cookies on a route response. */
export function clearSessionCookies(res: NextResponse): void {
  res.cookies.set(ACCESS_COOKIE, "", { ...accessCookieOptions(), maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { ...refreshCookieOptions(), maxAge: 0 });
}

/** Read one cookie from an incoming request (routes parse headers directly). */
export function getRequestCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

/** Default `displayName` for a new viewer: first 2 letters of the local part + `***`. */
export function defaultDisplayName(email: string): string {
  const local = email.split("@")[0] ?? "";
  return `${local.slice(0, 2)}***`;
}

/** Map a subscriber record to the public viewer (email only ever goes to itself). */
export function toViewer(record: {
  id: string;
  email: string;
  displayName: string | null;
}): Viewer {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName ?? defaultDisplayName(record.email),
  };
}

/** Validate an access token and load its subscriber. Null on any failure. */
export async function viewerFromAccessToken(token: string): Promise<Viewer | null> {
  try {
    const parsed = verifyAccessToken(token);
    if (!parsed) return null;
    const subscriber = await findSubscriberById(parsed.subscriberId);
    if (!subscriber) return null;
    return toViewer(subscriber);
  } catch {
    return null;
  }
}

/** The signed-in viewer for this request (reads the access cookie only), or null. */
export async function getViewer(): Promise<Viewer | null> {
  try {
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    if (!token) return null;
    return await viewerFromAccessToken(token);
  } catch {
    return null;
  }
}

export type StartSessionResult = { accessToken: string; refreshToken: string };

/** Create a session family and mint both tokens (the route sets the cookies). */
export async function startSession(
  subscriberId: string,
  userAgent: string | null,
  now: number = Date.now(),
): Promise<StartSessionResult> {
  const secret = generateRefreshSecret();
  const row = await insertSession({
    subscriberId,
    familyId: randomUUID(),
    refreshHash: sha256Hex(secret),
    expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
    familyCreatedAt: new Date(now),
    userAgent,
  });
  return {
    accessToken: signAccessToken(subscriberId, now),
    refreshToken: `${row.id}.${secret}`,
  };
}

export type RefreshSessionResult =
  | { ok: true; viewer: Viewer; accessToken: string; refreshToken: string }
  | { ok: false; reason: "invalid" | "expired" | "revoked" | "reused" };

/**
 * Rotate a refresh token: the old session is marked rotated, a new session row
 * joins the same family, both tokens are re-minted. Presenting an already
 * rotated token revokes the whole family (reuse detection, spec 4.2).
 */
export async function refreshSession(
  refreshToken: string,
  userAgent: string | null,
  now: number = Date.now(),
): Promise<RefreshSessionResult> {
  const sep = refreshToken.indexOf(".");
  if (sep <= 0) return { ok: false, reason: "invalid" };
  const sessionId = refreshToken.slice(0, sep);
  const secret = refreshToken.slice(sep + 1);
  if (!secret) return { ok: false, reason: "invalid" };
  const session = await findSessionById(sessionId);
  if (!session) return { ok: false, reason: "invalid" };
  // Check the secret first: someone who only knows a session id must not be able
  // to trigger reuse detection and log the real owner out.
  if (!equalHex(sha256Hex(secret), session.refreshHash)) {
    return { ok: false, reason: "invalid" };
  }
  if (session.revokedAt) return { ok: false, reason: "revoked" };
  if (session.rotatedAt) {
    await revokeSessionFamily(session.familyId);
    return { ok: false, reason: "reused" };
  }
  if (session.expiresAt.getTime() <= now) return { ok: false, reason: "expired" };
  if (session.familyCreatedAt.getTime() + SESSION_FAMILY_MAX_AGE_MS <= now) {
    await revokeSessionFamily(session.familyId);
    return { ok: false, reason: "expired" };
  }
  const subscriber = await findSubscriberById(session.subscriberId);
  if (!subscriber) return { ok: false, reason: "invalid" };
  // Atomic claim: if another request rotated this token first, treat it as reuse.
  if (!(await markSessionRotated(session.id))) {
    await revokeSessionFamily(session.familyId);
    return { ok: false, reason: "reused" };
  }
  const newSecret = generateRefreshSecret();
  const next = await insertSession({
    subscriberId: session.subscriberId,
    familyId: session.familyId,
    refreshHash: sha256Hex(newSecret),
    expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
    familyCreatedAt: session.familyCreatedAt,
    userAgent,
  });
  return {
    ok: true,
    viewer: toViewer(subscriber),
    accessToken: signAccessToken(subscriber.id, now),
    refreshToken: `${next.id}.${newSecret}`,
  };
}

/** Revoke the session family behind a refresh token. Best-effort: never throws. */
export async function endSession(refreshToken: string | null): Promise<void> {
  try {
    if (!refreshToken) return;
    const sep = refreshToken.indexOf(".");
    if (sep <= 0) return;
    const session = await findSessionById(refreshToken.slice(0, sep));
    if (!session) return;
    await revokeSessionFamily(session.familyId);
  } catch {
    // Logout must always succeed from the visitor's view: cookies are cleared
    // by the route regardless, so a revoke failure stays silent here.
  }
}
