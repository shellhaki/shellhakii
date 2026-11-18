import "server-only";
import { NextResponse } from "next/server";
import { HttpError } from "@/lib/api";
import { AuthConfigError } from "./config";

/** Wrap an auth route handler: map HttpError/AuthConfigError to JSON, never leak. */
export function authRoute<T extends unknown[]>(fn: (...args: T) => Promise<NextResponse>) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await fn(...args);
    } catch (err) {
      return authErrorResponse(err);
    }
  };
}

/** Map errors to JSON responses like `adminRoute` does (missing config -> 503). */
export function authErrorResponse(err: unknown): NextResponse {
  if (err instanceof AuthConfigError) {
    return NextResponse.json({ error: "Sign-in is not configured." }, { status: 503 });
  }
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  // Log only a static message: errors from lower layers must never carry
  // secrets, OTP codes, tokens or email addresses into the logs.
  console.error("auth route failed");
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}

/** Same email shape as the subscribe route. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CODE_RE = /^\d{6}$/;
const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/;

/** Trimmed, lowercased, valid email or HttpError(400). */
export function parseEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 200) {
    throw new HttpError(400, "Please enter a valid email.");
  }
  return email;
}

/** Trimmed 6-digit code or HttpError(400). */
export function parseCode(value: unknown): string {
  const code = typeof value === "string" ? value.trim() : "";
  if (!CODE_RE.test(code)) {
    throw new HttpError(400, "Enter the 6-digit code from your email.");
  }
  return code;
}

function assertValidDisplayName(name: string): void {
  if (name.length < 2 || name.length > 30) {
    throw new HttpError(400, "Display name must be 2-30 characters.");
  }
  if (CONTROL_CHARS_RE.test(name)) {
    throw new HttpError(400, "Display name contains invalid characters.");
  }
}

/** Optional display name (verify route): missing/blank means "use the default". */
export function parseOptionalDisplayName(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new HttpError(400, "Display name must be a string.");
  const name = value.trim();
  if (!name) return null;
  assertValidDisplayName(name);
  return name;
}

/** Required display name (PATCH route): must be present and valid. */
export function parseRequiredDisplayName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, "Display name is required.");
  }
  const name = value.trim();
  assertValidDisplayName(name);
  return name;
}
