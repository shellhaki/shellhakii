import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/store");
vi.mock("@/lib/mail");
vi.mock("node:crypto", async (importOriginal) => {
  const mod = await importOriginal<typeof import("node:crypto")>();
  return { ...mod, randomInt: vi.fn(mod.randomInt), timingSafeEqual: vi.fn(mod.timingSafeEqual) };
});

import { randomInt, timingSafeEqual } from "node:crypto";
import { sendMail } from "@/lib/mail";
import { hashOtp, generateOtp, requestOtp, verifyOtp } from "./otp";
import {
  findLatestUnusedOtp,
  incrementOtpAttempts,
  insertOtpCode,
  invalidateUnusedOtps,
  markOtpUsed,
  upsertVerifiedSubscriber,
  type OtpRecord,
} from "./store";

const SECRET = "otp-test-secret-0123456789abcdef";
const ORIGINAL_SECRET = process.env.AUTH_SECRET;
const sendMailMock = vi.mocked(sendMail);
const randomIntSpy = vi.mocked(randomInt);
const timingSafeEqualSpy = vi.mocked(timingSafeEqual);

function otpRow(overrides: Partial<OtpRecord> = {}): OtpRecord {
  return {
    id: "otp-id-1",
    email: "Reader@Example.com",
    codeHash: "0".repeat(64),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    attempts: 0,
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

function subscriber(email: string) {
  return {
    id: "sub-1",
    email,
    displayName: "re***",
    status: "active" as const,
    emailVerifiedAt: new Date(),
  };
}

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
  sendMailMock.mockResolvedValue(undefined);
  vi.mocked(findLatestUnusedOtp).mockResolvedValue(null);
  vi.mocked(upsertVerifiedSubscriber).mockImplementation(async (email: string) => ({
    subscriber: subscriber(email),
    isNew: true,
  }));
  vi.mocked(insertOtpCode).mockResolvedValue({ id: "otp-id-1" });
  vi.mocked(incrementOtpAttempts).mockResolvedValue(1);
  vi.mocked(invalidateUnusedOtps).mockResolvedValue(undefined);
  vi.mocked(markOtpUsed).mockResolvedValue(undefined);
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_SECRET;
});

describe("generateOtp", () => {
  it("AC-A1: generates 6-digit codes with a CSPRNG", () => {
    randomIntSpy.mockClear();
    for (let i = 0; i < 50; i++) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
    // Every code comes from crypto.randomInt, never Math.random.
    expect(randomIntSpy).toHaveBeenCalledWith(0, 1_000_000);
    expect(randomIntSpy.mock.calls.length).toBeGreaterThanOrEqual(50);
  });

  it("AC-A1: spreads across the whole code space", () => {
    const firstDigits = new Set(Array.from({ length: 500 }, () => generateOtp()[0]));
    expect(firstDigits.size).toBe(10);
  });
});

describe("hashOtp", () => {
  it("AC-A1: hashes differ per email for the same code", () => {
    const a = hashOtp("a@example.com", "123456");
    const b = hashOtp("b@example.com", "123456");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("AC-A1: is deterministic", () => {
    expect(hashOtp("a@example.com", "123456")).toBe(hashOtp("a@example.com", "123456"));
  });
});

describe("requestOtp", () => {
  it("AC-A1: stores only the hash and never logs the plain code", async () => {
    const logged: unknown[][] = [];
    const methods = ["log", "error", "warn", "debug"] as const;
    const spies = methods.map((m) => vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      logged.push(args);
    }));
    try {
      const result = await requestOtp("Store-Hash@Example.com", "ip-store-1");
      expect(result).toEqual({ ok: true });
      const storedHash = vi.mocked(insertOtpCode).mock.calls[0][1];
      expect(storedHash).toMatch(/^[0-9a-f]{64}$/);
      const subject = sendMailMock.mock.calls[0][0].subject;
      const code = subject.replace("Your shellhaki code: ", "");
      expect(code).toMatch(/^\d{6}$/);
      expect(storedHash).not.toContain(code);
      expect(storedHash).toBe(hashOtp("store-hash@example.com", code));
      // The email went lowercase into storage and mail.
      expect(vi.mocked(insertOtpCode).mock.calls[0][0]).toBe("store-hash@example.com");
      const flat = logged.flat().map(String).join("\n");
      expect(flat).not.toContain(code);
      expect(flat).not.toContain("store-hash@example.com");
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });

  it("AC-A3: a new request invalidates older unused codes first", async () => {
    await requestOtp("invalidate@example.com", "ip-inv-1");
    const invalidateOrder = vi.mocked(invalidateUnusedOtps).mock.invocationCallOrder[0];
    const insertOrder = vi.mocked(insertOtpCode).mock.invocationCallOrder[0];
    expect(invalidateOrder).toBeLessThan(insertOrder);
    expect(vi.mocked(invalidateUnusedOtps).mock.calls[0][0]).toBe("invalidate@example.com");
  });

  it("AC-A4: returns 429 for a second request within 60 seconds", async () => {
    expect(await requestOtp("min-limit@example.com", "ip-min-1")).toEqual({ ok: true });
    expect(await requestOtp("min-limit@example.com", "ip-min-2")).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });

  it("AC-A4: returns 429 after 10 requests from one IP within an hour", async () => {
    for (let i = 0; i < 10; i++) {
      const result = await requestOtp(`ip-flood-${i}@example.com`, "ip-flood-1");
      expect(result).toEqual({ ok: true });
    }
    expect(await requestOtp("ip-flood-10@example.com", "ip-flood-1")).toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });
});

describe("verifyOtp", () => {
  it("AC-A3: accepts a correct code and marks it used", async () => {
    const email = "verify-ok@example.com";
    const code = "482916";
    vi.mocked(findLatestUnusedOtp).mockResolvedValue({
      ...otpRow({ email, codeHash: hashOtp(email, code) }),
    });
    const result = await verifyOtp(email, code);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isNew).toBe(true);
      expect(result.subscriber.email).toBe(email);
    }
    expect(markOtpUsed).toHaveBeenCalledWith("otp-id-1");
  });

  it("AC-A3: rejects an expired code", async () => {
    const email = "verify-expired@example.com";
    const code = "111111";
    vi.mocked(findLatestUnusedOtp).mockResolvedValue({
      ...otpRow({ email, codeHash: hashOtp(email, code), expiresAt: new Date(Date.now() - 1000) }),
    });
    expect(await verifyOtp(email, code)).toEqual({ ok: false, reason: "invalid_or_expired" });
    expect(markOtpUsed).not.toHaveBeenCalled();
  });

  it("AC-A3: a code is single use", async () => {
    const email = "verify-once@example.com";
    const code = "222222";
    vi.mocked(findLatestUnusedOtp)
      .mockResolvedValueOnce({ ...otpRow({ email, codeHash: hashOtp(email, code) }) })
      .mockResolvedValueOnce(null);
    expect((await verifyOtp(email, code)).ok).toBe(true);
    // After use the lookup finds nothing (used_at is set), so it fails.
    expect(await verifyOtp(email, code)).toEqual({ ok: false, reason: "invalid_or_expired" });
  });

  it("AC-A3: dead after 5 wrong attempts, even with the right code", async () => {
    const email = "verify-dead@example.com";
    const code = "333333";
    vi.mocked(findLatestUnusedOtp).mockResolvedValue({
      ...otpRow({ email, codeHash: hashOtp(email, code), attempts: 5 }),
    });
    expect(await verifyOtp(email, code)).toEqual({ ok: false, reason: "invalid_or_expired" });
    expect(markOtpUsed).not.toHaveBeenCalled();
    expect(incrementOtpAttempts).not.toHaveBeenCalled();
  });

  it("AC-A3: a wrong code increments attempts", async () => {
    const email = "verify-wrong@example.com";
    vi.mocked(findLatestUnusedOtp).mockResolvedValue({
      ...otpRow({ email, codeHash: hashOtp(email, "000000"), attempts: 4 }),
    });
    expect(await verifyOtp(email, "999999")).toEqual({
      ok: false,
      reason: "invalid_or_expired",
    });
    expect(incrementOtpAttempts).toHaveBeenCalledWith("otp-id-1");
    expect(markOtpUsed).not.toHaveBeenCalled();
  });

  it("AC-A6: wrong or expired codes fail and comparison is timing safe", async () => {
    timingSafeEqualSpy.mockClear();
    vi.mocked(findLatestUnusedOtp).mockResolvedValue({
      ...otpRow({ codeHash: hashOtp("safe@example.com", "000000") }),
    });
    expect(await verifyOtp("safe@example.com", "999999")).toEqual({
      ok: false,
      reason: "invalid_or_expired",
    });
    expect(timingSafeEqualSpy.mock.calls.length).toBeGreaterThan(0);
    // Unknown email also fails (compared against a dummy, same shape).
    vi.mocked(findLatestUnusedOtp).mockResolvedValue(null);
    expect(await verifyOtp("nobody@example.com", "123456")).toEqual({
      ok: false,
      reason: "invalid_or_expired",
    });
  });

  it("passes the display name through to the subscriber upsert", async () => {
    const email = "verify-name@example.com";
    const code = "444444";
    vi.mocked(findLatestUnusedOtp).mockResolvedValue({
      ...otpRow({ email, codeHash: hashOtp(email, code) }),
    });
    await verifyOtp(email, code, "New Name");
    expect(vi.mocked(upsertVerifiedSubscriber).mock.calls[0]).toEqual([email, "New Name"]);
  });

  it("defaults the display name from the email local part", async () => {
    const email = "sam@example.com";
    const code = "555555";
    vi.mocked(findLatestUnusedOtp).mockResolvedValue({
      ...otpRow({ email, codeHash: hashOtp(email, code) }),
    });
    await verifyOtp(email, code);
    expect(vi.mocked(upsertVerifiedSubscriber).mock.calls[0]).toEqual([email, "sa***"]);
  });
});
