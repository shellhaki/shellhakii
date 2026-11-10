import "server-only";
import { NextResponse } from "next/server";
import { isAdmin } from "./admin-auth";
import { getSql } from "./db";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wrap a route handler: enforce admin session, map HttpError to JSON. */
export function adminRoute<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
) {
  return async (...args: A) => {
    try {
      if (!(await isAdmin())) throw new HttpError(401, "Unauthorized");
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error("admin route failed", err);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
  } catch {}
  throw new HttpError(400, "Invalid JSON body");
}

export function requireSql() {
  const sql = getSql();
  if (!sql) throw new HttpError(503, "Missing required env var: DATABASE_URL");
  return sql;
}

export function text(
  v: unknown,
  name: string,
  max: number,
  required = false,
): string | null {
  if (v === undefined || v === null || v === "") {
    if (required) throw new HttpError(400, `${name} is required`);
    return null;
  }
  if (typeof v !== "string") throw new HttpError(400, `${name} must be a string`);
  const s = v.trim();
  if (!s && required) throw new HttpError(400, `${name} is required`);
  if (s.length > max) throw new HttpError(400, `${name} is too long (max ${max})`);
  return s || null;
}

export function httpUrl(v: unknown, name: string): string | null {
  const s = text(v, name, 500);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
  } catch {}
  throw new HttpError(400, `${name} must be a valid http(s) URL`);
}

export function tagList(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new HttpError(400, "tags must be an array");
  return v
    .map((t) => (typeof t === "string" ? t.trim().toLowerCase() : ""))
    .filter(Boolean)
    .slice(0, 12)
    .map((t) => t.slice(0, 30));
}

/** Accept only keys we generated, under the expected folder. */
export function uploadKey(v: unknown, folder: "media" | "projects") {
  const s = text(v, "key", 200, true)!;
  if (!new RegExp(`^${folder}/[0-9a-f-]{36}\\.[a-z0-9]{2,5}$`).test(s)) {
    throw new HttpError(400, "Invalid upload key");
  }
  return s;
}
