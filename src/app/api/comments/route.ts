import { connection, NextResponse } from "next/server";
import { HttpError, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/origin";
import { getViewer } from "@/lib/auth/session";
import { addComment, listComments } from "@/lib/social/comments";

const toError = (err: unknown, label: string) => {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(label, err);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
};

// GET /api/comments?targetType&targetId&cursor? -> newest-first page. Public.
export async function GET(req: Request) {
  // Per-request data: opt out of prerendering before reading the URL.
  await connection();
  try {
    const q = new URL(req.url).searchParams;
    const targetType = q.get("targetType");
    const targetId = q.get("targetId");
    if (!targetType || !targetId) {
      throw new HttpError(400, "targetType and targetId are required");
    }
    const viewer = await getViewer();
    return NextResponse.json(
      await listComments(targetType, targetId, {
        cursor: q.get("cursor"),
        viewerId: viewer?.id ?? null,
      }),
    );
  } catch (err) {
    return toError(err, "comments GET failed");
  }
}

// POST /api/comments {targetType,targetId,body} -> new comment. Needs viewer.
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Sign in required");
    const b = await readJson(req);
    if (typeof b.targetType !== "string" || b.targetType.length === 0) {
      throw new HttpError(400, "targetType is required");
    }
    if (typeof b.targetId !== "string" || b.targetId.length === 0) {
      throw new HttpError(400, "targetId is required");
    }
    return NextResponse.json(
      await addComment(b.targetType, b.targetId, b.body, viewer),
    );
  } catch (err) {
    return toError(err, "comments POST failed");
  }
}
