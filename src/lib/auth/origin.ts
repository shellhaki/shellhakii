import "server-only";
import { HttpError } from "@/lib/api";

/**
 * Reject cross-origin mutating requests and non-JSON bodies (spec 4.3).
 * Throws HttpError(403) when an `Origin` header is present but differs from the
 * request URL origin, or when a request with a body is not `application/json`.
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (origin !== null) {
    let requestOrigin: string;
    try {
      requestOrigin = new URL(req.url).origin;
    } catch {
      throw new HttpError(403, "Forbidden");
    }
    if (origin !== requestOrigin) {
      throw new HttpError(403, "Forbidden");
    }
  }
  // Body rules: a declared content type must be JSON; an undeclared body is refused.
  // Body-less POST/DELETE (refresh, logout, deletes) pass. Cross-site form or
  // text/plain posts, the classic CSRF vectors, always carry a non-JSON type.
  const contentType = req.headers.get("content-type");
  const contentLength = req.headers.get("content-length");
  const declaresBody =
    (contentLength !== null && contentLength !== "0") || req.headers.has("transfer-encoding");
  if (contentType !== null) {
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new HttpError(403, "Content-Type must be application/json");
    }
  } else if (declaresBody) {
    throw new HttpError(403, "Content-Type must be application/json");
  }
}
