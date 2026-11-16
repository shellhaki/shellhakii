const buckets = new Map<string, number[]>();

/** Best-effort in-memory limiter (per server instance). Returns true when over the limit. */
export function rateLimited(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return true;
  }
  buckets.set(key, [...recent, now]);
  return false;
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
