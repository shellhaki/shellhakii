"use client";

async function api<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const post = <T>(url: string, body: unknown) =>
  api<T>(url, { method: "POST", body: JSON.stringify(body) });

export const del = (url: string) => api<{ ok: true }>(url, { method: "DELETE" });

/** Upload a file straight to R2 via a presigned URL. Returns the object key. */
export async function uploadFile(file: File, folder: "media" | "projects") {
  const { uploadUrl, key } = await post<{ uploadUrl: string; key: string }>(
    "/api/admin/media/sign",
    { folder, contentType: file.type, size: file.size },
  );
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) {
    throw new Error(
      `Upload to storage failed (${res.status}). Check the bucket CORS rules.`,
    );
  }
  return key;
}

/** Read pixel dimensions of an image or video file, or null if unreadable. */
export function readDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const done = (v: { width: number; height: number } | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    if (file.type.startsWith("video/")) {
      const el = document.createElement("video");
      el.preload = "metadata";
      el.onloadedmetadata = () =>
        done(el.videoWidth ? { width: el.videoWidth, height: el.videoHeight } : null);
      el.onerror = () => done(null);
      el.src = url;
    } else {
      const el = new Image();
      el.onload = () => done({ width: el.naturalWidth, height: el.naturalHeight });
      el.onerror = () => done(null);
      el.src = url;
    }
  });
}
