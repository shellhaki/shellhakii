import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { adminRoute, HttpError, readJson } from "@/lib/api";
import {
  ALLOWED_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  presignUpload,
  publicUrl,
} from "@/lib/r2";

// POST /api/admin/media/sign -> presigned PUT URL for a direct browser upload.
export const POST = adminRoute(async (req: Request) => {
  const body = await readJson(req);
  const folder = body.folder === "projects" ? "projects" : "media";
  const type = typeof body.contentType === "string" ? ALLOWED_TYPES[body.contentType] : undefined;
  const size = Number(body.size);

  if (!type) throw new HttpError(400, "Unsupported file type");
  if (folder === "projects" && type.kind !== "image") {
    throw new HttpError(400, "Project thumbnails must be images");
  }
  if (!Number.isFinite(size) || size <= 0) throw new HttpError(400, "Invalid file size");
  const max = type.kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (size > max) {
    throw new HttpError(400, `File too large (max ${Math.round(max / 1024 / 1024)} MB)`);
  }

  const key = `${folder}/${randomUUID()}.${type.ext}`;
  const uploadUrl = await presignUpload(key, body.contentType as string);
  return NextResponse.json({ uploadUrl, key, publicUrl: publicUrl(key) });
});
