import "server-only";
import { randomBytes } from "node:crypto";
import { getSql } from "@/lib/db";

// The ONLY file in src/lib/auth allowed to contain SQL. Every function is one
// small query so logic modules can `vi.mock` individual functions in tests.

/** A raw DB row with unknown column values (mapped to typed records below). */
type Row = Record<string, unknown>;

function db() {
  const client = getSql();
  if (!client) throw new Error("Missing required env var: DATABASE_URL");
  return client;
}

function str(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`Bad row: missing ${key}`);
  return value;
}

// The Neon driver returns timestamptz columns as Date objects; accept strings too.
function dateOf(row: Row, key: string): Date {
  const value = row[key];
  if (value instanceof Date) return value;
  if (typeof value === "string") return new Date(value);
  throw new Error(`Bad row: missing ${key}`);
}

function nullableDate(row: Row, key: string): Date | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value : new Date(String(value));
}

export type OtpRecord = {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  usedAt: Date | null;
  createdAt: Date;
};

function toOtp(row: Row): OtpRecord {
  const attempts = row.attempts;
  if (typeof attempts !== "number") throw new Error("Bad row: missing attempts");
  return {
    id: str(row, "id"),
    email: str(row, "email"),
    codeHash: str(row, "code_hash"),
    expiresAt: dateOf(row, "expires_at"),
    attempts,
    usedAt: nullableDate(row, "used_at"),
    createdAt: dateOf(row, "created_at"),
  };
}

export type SubscriberRecord = {
  id: string;
  email: string;
  displayName: string | null;
  status: "pending" | "active" | "unsubscribed";
  emailVerifiedAt: Date | null;
};

function toSubscriber(row: Row): SubscriberRecord {
  const status = row.status;
  if (status !== "pending" && status !== "active" && status !== "unsubscribed") {
    throw new Error("Bad row: invalid status");
  }
  const displayName = row.display_name;
  return {
    id: str(row, "id"),
    email: str(row, "email"),
    displayName: typeof displayName === "string" ? displayName : null,
    status,
    emailVerifiedAt: nullableDate(row, "email_verified_at"),
  };
}

export type SessionRecord = {
  id: string;
  subscriberId: string;
  familyId: string;
  refreshHash: string;
  createdAt: Date;
  familyCreatedAt: Date;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  userAgent: string | null;
};

function toSession(row: Row): SessionRecord {
  const userAgent = row.user_agent;
  return {
    id: str(row, "id"),
    subscriberId: str(row, "subscriber_id"),
    familyId: str(row, "family_id"),
    refreshHash: str(row, "refresh_hash"),
    createdAt: dateOf(row, "created_at"),
    familyCreatedAt: dateOf(row, "family_created_at"),
    expiresAt: dateOf(row, "expires_at"),
    rotatedAt: nullableDate(row, "rotated_at"),
    revokedAt: nullableDate(row, "revoked_at"),
    userAgent: typeof userAgent === "string" ? userAgent : null,
  };
}

// --- OTP codes ---

/** Store one OTP hash; the plain code is never written. */
export async function insertOtpCode(
  email: string,
  codeHash: string,
  expiresAt: Date,
): Promise<{ id: string }> {
  const rows = (await db()`
    insert into otp_codes (email, code_hash, expires_at)
    values (${email}, ${codeHash}, ${expiresAt.toISOString()})
    returning id
  `) as Row[];
  return { id: str(rows[0], "id") };
}

/** Invalidate older unused codes for an email (a new request replaces them). */
export async function invalidateUnusedOtps(email: string): Promise<void> {
  await db()`update otp_codes set used_at = now() where email = ${email} and used_at is null`;
}

/** Latest still-unused code for an email, or null. */
export async function findLatestUnusedOtp(email: string): Promise<OtpRecord | null> {
  const rows = (await db()`
    select id, email, code_hash, expires_at, attempts, used_at, created_at
    from otp_codes where email = ${email} and used_at is null
    order by created_at desc limit 1
  `) as Row[];
  if (rows.length === 0) return null;
  return toOtp(rows[0]);
}

/** Count one wrong attempt; returns the new attempt total. */
export async function incrementOtpAttempts(id: string): Promise<number> {
  const rows = (await db()`
    update otp_codes set attempts = attempts + 1 where id = ${id} returning attempts
  `) as Row[];
  const attempts = rows[0]?.attempts;
  if (typeof attempts !== "number") throw new Error("Bad row: missing attempts");
  return attempts;
}

/** Mark a code used (single use). */
export async function markOtpUsed(id: string): Promise<void> {
  await db()`update otp_codes set used_at = now() where id = ${id}`;
}

// --- Subscribers ---

/** New email: active + confirmed (OTP proved ownership). Existing pending: active. Unsubscribed stays unsubscribed. */
export async function upsertVerifiedSubscriber(
  email: string,
  displayName: string | null,
): Promise<{ subscriber: SubscriberRecord; isNew: boolean }> {
  const client = db();
  const existing = (await client`
    select id from subscribers where email = ${email} limit 1
  `) as Row[];
  if (existing.length > 0) {
    const rows = (await client`
      update subscribers set
        status = case when status = 'pending' then 'active' else status end,
        confirmed_at = coalesce(confirmed_at, now()),
        email_verified_at = now(),
        display_name = coalesce(display_name, ${displayName})
      where email = ${email}
      returning id, email, display_name, status, email_verified_at
    `) as Row[];
    return { subscriber: toSubscriber(rows[0]), isNew: false };
  }
  const rows = (await client`
    insert into subscribers (email, status, display_name, confirmed_at, email_verified_at, unsubscribe_token)
    values (${email}, 'active', ${displayName}, now(), now(), ${randomBytes(24).toString("hex")})
    returning id, email, display_name, status, email_verified_at
  `) as Row[];
  return { subscriber: toSubscriber(rows[0]), isNew: true };
}

export async function findSubscriberByEmail(email: string): Promise<SubscriberRecord | null> {
  const rows = (await db()`
    select id, email, display_name, status, email_verified_at
    from subscribers where email = ${email} limit 1
  `) as Row[];
  if (rows.length === 0) return null;
  return toSubscriber(rows[0]);
}

export async function findSubscriberById(id: string): Promise<SubscriberRecord | null> {
  const rows = (await db()`
    select id, email, display_name, status, email_verified_at
    from subscribers where id = ${id} limit 1
  `) as Row[];
  if (rows.length === 0) return null;
  return toSubscriber(rows[0]);
}

/** Replace the display name; returns the updated subscriber. */
export async function updateSubscriberDisplayName(
  id: string,
  displayName: string,
): Promise<SubscriberRecord> {
  const rows = (await db()`
    update subscribers set display_name = ${displayName} where id = ${id}
    returning id, email, display_name, status, email_verified_at
  `) as Row[];
  if (rows.length === 0) throw new Error("Subscriber not found");
  return toSubscriber(rows[0]);
}

// --- Sessions ---

export type NewSession = {
  subscriberId: string;
  familyId: string;
  refreshHash: string;
  expiresAt: Date;
  familyCreatedAt: Date;
  userAgent: string | null;
};

/** Insert one session row (rotation creates a new row in the same family). */
export async function insertSession(session: NewSession): Promise<SessionRecord> {
  const rows = (await db()`
    insert into sessions (subscriber_id, family_id, refresh_hash, expires_at, family_created_at, user_agent)
    values (${session.subscriberId}, ${session.familyId}, ${session.refreshHash},
      ${session.expiresAt.toISOString()}, ${session.familyCreatedAt.toISOString()}, ${session.userAgent})
    returning id, subscriber_id, family_id, refresh_hash, created_at,
      family_created_at, expires_at, rotated_at, revoked_at, user_agent
  `) as Row[];
  return toSession(rows[0]);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function findSessionById(id: string): Promise<SessionRecord | null> {
  // Refresh cookies are attacker-controlled; a non-uuid would make Postgres throw.
  if (!UUID.test(id)) return null;
  const rows = (await db()`
    select id, subscriber_id, family_id, refresh_hash, created_at,
      family_created_at, expires_at, rotated_at, revoked_at, user_agent
    from sessions where id = ${id} limit 1
  `) as Row[];
  if (rows.length === 0) return null;
  return toSession(rows[0]);
}

/**
 * Mark a session rotated (its refresh token must never work again). Returns false
 * when it was already rotated or revoked, so concurrent refreshes cannot both win.
 */
export async function markSessionRotated(id: string): Promise<boolean> {
  const rows = (await db()`
    update sessions set rotated_at = now()
    where id = ${id} and rotated_at is null and revoked_at is null
    returning id
  `) as Row[];
  return rows.length > 0;
}

/** Revoke every session in a family (reuse detection, logout). */
export async function revokeSessionFamily(familyId: string): Promise<void> {
  await db()`update sessions set revoked_at = now() where family_id = ${familyId} and revoked_at is null`;
}

/** Revoke one session. */
export async function revokeSession(id: string): Promise<void> {
  await db()`update sessions set revoked_at = now() where id = ${id}`;
}
