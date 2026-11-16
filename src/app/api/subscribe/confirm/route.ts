import { NextResponse } from "next/server";
import { confirmSubscription } from "@/lib/subscribers";

// GET /api/subscribe/confirm?token=... -> activate, then show a status page.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  let ok = false;
  try {
    ok = /^[0-9a-f]{48}$/.test(token) && (await confirmSubscription(token));
  } catch (err) {
    console.error("confirm failed", err);
  }
  return NextResponse.redirect(new URL(`/subscribe/${ok ? "confirmed" : "invalid"}`, req.url));
}
