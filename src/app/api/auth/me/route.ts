import { NextResponse, connection } from "next/server";
import { HttpError, readJson } from "@/lib/api";
import { updateSubscriberDisplayName } from "@/lib/auth/store";
import { assertSameOrigin } from "@/lib/auth/origin";
import { authRoute, parseRequiredDisplayName } from "@/lib/auth/respond";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  getRequestCookie,
  refreshSession,
  setSessionCookies,
  toViewer,
  viewerFromAccessToken,
} from "@/lib/auth/session";

/**
 * GET /api/auth/me -> 200 {viewer: Viewer | null}.
 * Refreshes inline when only a valid refresh cookie exists. Never 401s.
 */
export const GET = authRoute(async (req: Request) => {
  // Reads cookies from the request headers, so it must never be prerendered.
  await connection();
  const accessToken = getRequestCookie(req, ACCESS_COOKIE);
  if (accessToken) {
    const viewer = await viewerFromAccessToken(accessToken);
    if (viewer) return NextResponse.json({ viewer });
  }
  const refreshToken = getRequestCookie(req, REFRESH_COOKIE);
  if (!refreshToken) return NextResponse.json({ viewer: null });
  const result = await refreshSession(refreshToken, req.headers.get("user-agent"));
  if (!result.ok) {
    const res = NextResponse.json({ viewer: null });
    clearSessionCookies(res);
    return res;
  }
  const res = NextResponse.json({ viewer: result.viewer });
  setSessionCookies(res, result.accessToken, result.refreshToken);
  return res;
});

/** PATCH /api/auth/me {displayName} -> 200 {viewer}. 401 when not signed in. */
export const PATCH = authRoute(async (req: Request) => {
  assertSameOrigin(req);
  const accessToken = getRequestCookie(req, ACCESS_COOKIE);
  const viewer = accessToken ? await viewerFromAccessToken(accessToken) : null;
  if (!viewer) throw new HttpError(401, "Please sign in to update your profile.");
  const body = await readJson(req);
  const displayName = parseRequiredDisplayName(body.displayName);
  const updated = await updateSubscriberDisplayName(viewer.id, displayName);
  return NextResponse.json({ viewer: toViewer(updated) });
});
