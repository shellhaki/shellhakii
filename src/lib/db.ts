import { neon } from "@neondatabase/serverless";

/** Returns a SQL tagged-template client, or null when DATABASE_URL is unset. */
export function getSql() {
  const url = process.env.DATABASE_URL;
  return url ? neon(url) : null;
}
