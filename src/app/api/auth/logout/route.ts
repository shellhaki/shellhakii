import { NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/auth/origin";
import { authRoute } from "@/lib/auth/respond";
import { REFRESH_COOKIE, clearSessionCookies, endSession, getRequestCookie } from "@/lib/auth/session";

/** POST /api/auth/logout -> 200 {ok:true}, revokes the family, clears cookies. */
export const POST = authRoute(async (req: Request) => {
  assertSameOrigin(req);
  await endSession(getRequestCookie(req, REFRESH_COOKIE));
  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  return res;
});
