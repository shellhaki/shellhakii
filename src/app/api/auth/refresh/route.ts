import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/auth/origin";
import { authRoute } from "@/lib/auth/respond";
import {
  REFRESH_COOKIE,
  clearSessionCookies,
  getRequestCookie,
  refreshSession,
  setSessionCookies,
} from "@/lib/auth/session";

function expired(): NextResponse {
  const res = NextResponse.json(
    { error: "Session expired. Please sign in again." },
    { status: 401 },
  );
  clearSessionCookies(res);
  return res;
}

/**
 * POST /api/auth/refresh -> 200 {viewer} with rotated cookies.
 * Invalid/expired/reused refresh -> 401 and clears cookies.
 */
export const POST = authRoute(async (req: Request) => {
  assertSameOrigin(req);
  const token = getRequestCookie(req, REFRESH_COOKIE);
  if (!token) return expired();
  const result = await refreshSession(token, req.headers.get("user-agent"));
  if (!result.ok) return expired();
  const res = NextResponse.json({ viewer: result.viewer });
  setSessionCookies(res, result.accessToken, result.refreshToken);
  return res;
});
