import { connection, NextResponse } from "next/server";
import { HttpError } from "@/lib/api";
import { getViewer } from "@/lib/auth/session";
import { getSummaries } from "@/lib/social/engagement";

// GET /api/engagement?targets=project:<id>,article:<id> -> batch summaries.
// Public: `liked` is false for every target when signed out.
export async function GET(req: Request) {
  // Per-request data: opt out of prerendering before reading the URL.
  await connection();
  try {
    const raw = new URL(req.url).searchParams.get("targets");
    if (!raw) throw new HttpError(400, "targets is required");
    const parts = raw
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (parts.length === 0) throw new HttpError(400, "targets is required");
    if (parts.length > 50) {
      throw new HttpError(400, "Too many targets (max 50)");
    }
    const targets = parts.map((p) => {
      const sep = p.indexOf(":");
      if (sep <= 0) throw new HttpError(400, `Invalid target: ${p}`);
      return { type: p.slice(0, sep), id: p.slice(sep + 1) };
    });
    const viewer = await getViewer();
    return NextResponse.json(await getSummaries(targets, viewer?.id ?? null));
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("engagement GET failed", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
