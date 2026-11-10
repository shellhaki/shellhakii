import "server-only";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireEnv } from "./env";

export const ALLOWED_TYPES: Record<string, { ext: string; kind: "image" | "video" }> = {
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/png": { ext: "png", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "image/gif": { ext: "gif", kind: "image" },
  "image/avif": { ext: "avif", kind: "image" },
  "video/mp4": { ext: "mp4", kind: "video" },
  "video/webm": { ext: "webm", kind: "video" },
  "video/quicktime": { ext: "mov", kind: "video" },
};

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

let client: S3Client | null = null;

function r2() {
  client ??= new S3Client({
    region: "auto",
    // Default CRC32 checksum would be baked into the presigned URL and break browser uploads.
    requestChecksumCalculation: "WHEN_REQUIRED",
    // Buckets created with a jurisdiction (eu, fedramp) live on a different endpoint.
    endpoint: `https://${requireEnv("CLOUDFLARE_ACCOUNT_ID")}${
      process.env.CLOUDFLARE_JURISDICTION ? `.${process.env.CLOUDFLARE_JURISDICTION}` : ""
    }.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

/** Presigned PUT URL so the browser uploads straight to R2. */
export function presignUpload(key: string, contentType: string) {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({
      Bucket: requireEnv("CLOUDFLARE_BUCKET"),
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 600 },
  );
}

export async function deleteObject(key: string) {
  await r2().send(
    new DeleteObjectCommand({
      Bucket: requireEnv("CLOUDFLARE_BUCKET"),
      Key: key,
    }),
  );
}

/** Public delivery URL for a stored key, or null when no base URL is set. */
export function publicUrl(key: string): string | null {
  const base = process.env.CLOUDFLARE_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  return base ? `${base}/${key}` : null;
}
