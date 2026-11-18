import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ getSql: vi.fn() }));

import { getSql } from "@/lib/db";
import {
  findLatestUnusedOtp,
  findSessionById,
  findSubscriberByEmail,
  findSubscriberById,
  incrementOtpAttempts,
  insertOtpCode,
  insertSession,
  invalidateUnusedOtps,
  markOtpUsed,
  markSessionRotated,
  revokeSession,
  revokeSessionFamily,
  updateSubscriberDisplayName,
  upsertVerifiedSubscriber,
} from "./store";

const getSqlMock = vi.mocked(getSql);
type SqlCall = { text: string; values: unknown[] };
let calls: SqlCall[];
let queued: Record<string, unknown>[][];

function tag(strings: TemplateStringsArray, ...values: unknown[]) {
  calls.push({ text: strings.join("?"), values });
  const rows = queued.length > 0 ? queued.shift() ?? [] : [];
  return Promise.resolve(rows);
}

beforeEach(() => {
  calls = [];
  queued = [];
  getSqlMock.mockReturnValue(tag as unknown as NonNullable<ReturnType<typeof getSql>>);
});

function otpRow() {
  return {
    id: "otp-1",
    email: "a@example.com",
    code_hash: "aa".repeat(32),
    expires_at: "2026-01-01T00:10:00.000Z",
    attempts: 0,
    used_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

function subscriberRow() {
  return {
    id: "sub-1",
    email: "a@example.com",
    display_name: "Reader",
    status: "active",
    email_verified_at: "2026-01-01T00:00:00.000Z",
  };
}

function sessionRow() {
  return {
    id: "sess-1",
    subscriber_id: "sub-1",
    family_id: "fam-1",
    refresh_hash: "bb".repeat(32),
    created_at: "2026-01-01T00:00:00.000Z",
    family_created_at: "2026-01-01T00:00:00.000Z",
    expires_at: "2026-02-01T00:00:00.000Z",
    rotated_at: null,
    revoked_at: null,
    user_agent: "agent",
  };
}

describe("otp store", () => {
  it("inserts the hash with an expiry", async () => {
    queued.push([{ id: "otp-1" }]);
    const result = await insertOtpCode("a@example.com", "aa".repeat(32), new Date("2026-01-01T00:10:00Z"));
    expect(result).toEqual({ id: "otp-1" });
    expect(calls[0].text).toContain("insert into otp_codes");
    expect(calls[0].values[0]).toBe("a@example.com");
  });

  it("invalidates older unused codes", async () => {
    await invalidateUnusedOtps("a@example.com");
    expect(calls[0].text).toContain("used_at = now()");
    expect(calls[0].text).toContain("used_at is null");
  });

  it("finds the latest unused code and maps dates", async () => {
    queued.push([otpRow()]);
    const row = await findLatestUnusedOtp("a@example.com");
    expect(row?.id).toBe("otp-1");
    expect(row?.expiresAt).toEqual(new Date("2026-01-01T00:10:00.000Z"));
    expect(row?.usedAt).toBeNull();
    expect(calls[0].text).toContain("used_at is null");
    expect(calls[0].text).toContain("order by created_at desc limit 1");
  });

  it("maps Date objects, which is what the Neon driver returns for timestamptz", async () => {
    queued.push([
      {
        ...otpRow(),
        expires_at: new Date("2026-01-01T00:10:00.000Z"),
        created_at: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    const row = await findLatestUnusedOtp("a@example.com");
    expect(row?.expiresAt.toISOString()).toBe("2026-01-01T00:10:00.000Z");
  });

  it("returns null when no unused code exists", async () => {
    queued.push([]);
    expect(await findLatestUnusedOtp("a@example.com")).toBeNull();
  });

  it("increments attempts and marks codes used", async () => {
    queued.push([{ attempts: 3 }]);
    expect(await incrementOtpAttempts("otp-1")).toBe(3);
    expect(calls[0].text).toContain("attempts = attempts + 1");
    await markOtpUsed("otp-1");
    expect(calls[1].text).toContain("used_at = now()");
  });
});

describe("subscriber store", () => {
  it("creates a new active subscriber (isNew) with the newsletter rules", async () => {
    queued.push([]);
    queued.push([subscriberRow()]);
    const { subscriber, isNew } = await upsertVerifiedSubscriber("a@example.com", "sa***");
    expect(isNew).toBe(true);
    expect(subscriber.email).toBe("a@example.com");
    expect(calls[1].text).toContain("insert into subscribers");
    expect(calls[1].text).toContain("'active'");
    expect(calls[1].text).toContain("email_verified_at");
    expect(calls[1].text).toContain("unsubscribe_token");
  });

  it("activates pending but keeps unsubscribed unsubscribed", async () => {
    queued.push([{ id: "sub-1" }]);
    queued.push([subscriberRow()]);
    const { isNew } = await upsertVerifiedSubscriber("a@example.com", "sa***");
    expect(isNew).toBe(false);
    // Pending flips to active; any other status (active, unsubscribed) is kept.
    expect(calls[1].text).toContain("when status = 'pending' then 'active' else status end");
    expect(calls[1].text).toContain("email_verified_at = now()");
  });

  it("finds subscribers by email and id, null when missing", async () => {
    queued.push([subscriberRow()]);
    expect((await findSubscriberByEmail("a@example.com"))?.id).toBe("sub-1");
    queued.push([]);
    expect(await findSubscriberByEmail("missing@example.com")).toBeNull();
    queued.push([subscriberRow()]);
    expect((await findSubscriberById("sub-1"))?.email).toBe("a@example.com");
    queued.push([]);
    expect(await findSubscriberById("missing")).toBeNull();
  });

  it("updates the display name", async () => {
    queued.push([subscriberRow()]);
    const updated = await updateSubscriberDisplayName("sub-1", "New Name");
    expect(updated.id).toBe("sub-1");
    expect(calls[0].values).toContain("New Name");
  });
});

describe("session store", () => {
  it("inserts and finds sessions with camelCase mapping", async () => {
    queued.push([sessionRow()]);
    const inserted = await insertSession({
      subscriberId: "sub-1",
      familyId: "fam-1",
      refreshHash: "bb".repeat(32),
      expiresAt: new Date("2026-02-01T00:00:00Z"),
      familyCreatedAt: new Date("2026-01-01T00:00:00Z"),
      userAgent: "agent",
    });
    expect(inserted.familyId).toBe("fam-1");
    expect(inserted.revokedAt).toBeNull();
    expect(calls[0].text).toContain("insert into sessions");
    queued.push([sessionRow()]);
    expect((await findSessionById("11111111-2222-4333-8444-555555555555"))?.subscriberId).toBe("sub-1");
    queued.push([]);
    expect(await findSessionById("11111111-2222-4333-8444-666666666666")).toBeNull();
    const before = calls.length;
    expect(await findSessionById("not-a-uuid")).toBeNull();
    expect(calls.length).toBe(before); // never reaches the database
  });

  it("marks rotated and revokes one family", async () => {
    queued.push([{ id: "sess-1" }]);
    expect(await markSessionRotated("sess-1")).toBe(true);
    expect(calls[0].text).toContain("rotated_at = now()");
    expect(calls[0].text).toContain("rotated_at is null");
    await revokeSessionFamily("fam-1");
    expect(calls[1].text).toContain("revoked_at = now()");
    expect(calls[1].text).toContain("family_id");
    await revokeSession("sess-1");
    expect(calls[2].text).toContain("revoked_at = now()");
  });
});
