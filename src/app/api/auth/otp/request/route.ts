import { NextResponse } from "next/server";
import { HttpError, readJson } from "@/lib/api";
import { clientIp } from "@/lib/rate-limit";
import { assertSameOrigin } from "@/lib/auth/origin";
import { requestOtp } from "@/lib/auth/otp";
import { authRoute, parseEmail } from "@/lib/auth/respond";

/**
 * POST /api/auth/otp/request {email} -> 200 {ok:true}.
 * Always answers {ok:true} for a well-formed email (no account enumeration).
 */
export const POST = authRoute(async (req: Request) => {
  assertSameOrigin(req);
  const body = await readJson(req);
  const email = parseEmail(body.email);
  const result = await requestOtp(email, clientIp(req));
  if (!result.ok) {
    if (result.reason === "rate_limited") {
      throw new HttpError(429, "Too many attempts. Try again later.");
    }
    throw new HttpError(502, "Couldn't send your code right now. Please try again.");
  }
  return NextResponse.json({ ok: true });
});
