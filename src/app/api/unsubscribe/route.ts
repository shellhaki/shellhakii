import { NextResponse } from "next/server";
import { unsubscribe } from "@/lib/subscribers";

// POST /api/unsubscribe?token=... handles both the button on /unsubscribe (form post)
// and mail clients' one-click unsubscribe (RFC 8058, body "List-Unsubscribe=One-Click").
export async function POST(req: Request) {
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const token = url.searchParams.get("token") ?? String(form?.get("token") ?? "");
  const oneClick = form?.get("List-Unsubscribe") === "One-Click";

  let ok = false;
  try {
    ok = /^[0-9a-f]{48}$/.test(token) && (await unsubscribe(token));
  } catch (err) {
    console.error("unsubscribe failed", err);
  }

  if (oneClick) return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
  return NextResponse.redirect(
    new URL(`/subscribe/${ok ? "unsubscribed" : "invalid"}`, req.url),
    303,
  );
}
