import { NextResponse } from "next/server";
import { HttpError, readJson } from "@/lib/api";
import { clientIp, rateLimited } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/auth/origin";
import { verifyOtp } from "@/lib/auth/otp";
import { authRoute, parseCode, parseEmail, parseOptionalDisplayName } from "@/lib/auth/respond";
import { setSessionCookies, startSession, toViewer } from "@/lib/auth/session";

const HOUR_MS = 60 * 60 * 1000;
const TEN_MIN_MS = 10 * 60 * 1000;

/**
 * POST /api/auth/otp/verify {email, code, displayName?} -> 200 {viewer, isNew}
 * plus both cookies. Wrong/expired code -> 401 invalid_or_expired, no cookies.
 */
export const POST = authRoute(async (req: Request) => {
  assertSameOrigin(req);
  const body = await readJson(req);
  const email = parseEmail(body.email);
  const code = parseCode(body.code);
  const displayName = parseOptionalDisplayName(body.displayName);
  if (
    rateLimited(`otp-verify:ip:${clientIp(req)}`, 30, HOUR_MS) ||
    rateLimited(`otp-verify:email:${email}`, 10, TEN_MIN_MS)
  ) {
    throw new HttpError(429, "Too many attempts. Try again later.");
  }
  const result = await verifyOtp(email, code, displayName);
  if (!result.ok) {
    return NextResponse.json({ error: "invalid_or_expired" }, { status: 401 });
  }
  const { accessToken, refreshToken } = await startSession(
    result.subscriber.id,
    req.headers.get("user-agent"),
  );
  const res = NextResponse.json({ viewer: toViewer(result.subscriber), isNew: result.isNew });
  setSessionCookies(res, accessToken, refreshToken);
  return res;
});
