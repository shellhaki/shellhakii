import { NextResponse } from "next/server";
import { HttpError, readJson } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/origin";
import { getViewer } from "@/lib/auth/session";
import { removeLike, setLike } from "@/lib/social/engagement";

const toError = (err: unknown, label: string) => {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error(label, err);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
};

const targetOf = (b: Record<string, unknown>): { type: string; id: string } => {
  if (typeof b.targetType !== "string" || b.targetType.length === 0) {
    throw new HttpError(400, "targetType is required");
  }
  if (typeof b.targetId !== "string" || b.targetId.length === 0) {
    throw new HttpError(400, "targetId is required");
  }
  return { type: b.targetType, id: b.targetId };
};

// PUT /api/likes {targetType,targetId} -> like (idempotent), fresh summary.
export async function PUT(req: Request) {
  try {
    assertSameOrigin(req);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Sign in required");
    const { type, id } = targetOf(await readJson(req));
    return NextResponse.json(await setLike(type, id, viewer.id));
  } catch (err) {
    return toError(err, "likes PUT failed");
  }
}

// DELETE /api/likes {targetType,targetId} -> unlike (idempotent), fresh summary.
export async function DELETE(req: Request) {
  try {
    assertSameOrigin(req);
    const viewer = await getViewer();
    if (!viewer) throw new HttpError(401, "Sign in required");
    const { type, id } = targetOf(await readJson(req));
    return NextResponse.json(await removeLike(type, id, viewer.id));
  } catch (err) {
    return toError(err, "likes DELETE failed");
  }
}
