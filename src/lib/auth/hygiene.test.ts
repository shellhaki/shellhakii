import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/store");
vi.mock("@/lib/mail");

import { sendMail } from "@/lib/mail";
import { hashOtp, requestOtp, verifyOtp } from "./otp";
import { refreshSession, startSession } from "./session";
import {
  findLatestUnusedOtp,
  findSessionById,
  findSubscriberById,
  insertSession,
  invalidateUnusedOtps,
  insertOtpCode,
  markOtpUsed,
  markSessionRotated,
  revokeSessionFamily,
  upsertVerifiedSubscriber,
} from "./store";
import { sha256Hex } from "./tokens";

const SECRET = "hygiene-test-secret-0123456789abcdef";
const ORIGINAL_SECRET = process.env.AUTH_SECRET;
const here = dirname(fileURLToPath(import.meta.url));

beforeEach(() => {
  process.env.AUTH_SECRET = SECRET;
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = ORIGINAL_SECRET;
});

describe("AC-G2: no secret, OTP, token or email in logs or stray responses", () => {
  it("never logs secrets during OTP and session flows", async () => {
    const email = "g2-probe-xyz@example.com";
    const seen: string[] = [];
    const spies = (["log", "error", "warn", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        seen.push(args.map(String).join(" "));
      }),
    );
    try {
      vi.mocked(sendMail).mockResolvedValue(undefined);
      vi.mocked(invalidateUnusedOtps).mockResolvedValue(undefined);
      vi.mocked(insertOtpCode).mockResolvedValue({ id: "otp-1" });
      await requestOtp(email, "ip-g2-1");
      const code = vi
        .mocked(sendMail)
        .mock.calls[0][0].subject.replace("Your shellhaki code: ", "");
      vi.mocked(findLatestUnusedOtp).mockResolvedValue({
        id: "otp-1",
        email,
        codeHash: hashOtp(email, code),
        expiresAt: new Date(Date.now() + 60_000),
        attempts: 0,
        usedAt: null,
        createdAt: new Date(),
      });
      vi.mocked(markOtpUsed).mockResolvedValue(undefined);
      vi.mocked(upsertVerifiedSubscriber).mockResolvedValue({
        subscriber: {
          id: "sub-g2",
          email,
          displayName: null,
          status: "active",
          emailVerifiedAt: new Date(),
        },
        isNew: true,
      });
      await verifyOtp(email, code);
      await verifyOtp(email, "000000");
      vi.mocked(findSubscriberById).mockResolvedValue({
        id: "sub-g2",
        email,
        displayName: null,
        status: "active",
        emailVerifiedAt: new Date(),
      });
      vi.mocked(insertSession).mockImplementation(async (s) => ({
        id: "sess-g2",
        subscriberId: s.subscriberId,
        familyId: s.familyId,
        refreshHash: s.refreshHash,
        createdAt: new Date(),
        familyCreatedAt: s.familyCreatedAt,
        expiresAt: s.expiresAt,
        rotatedAt: null,
        revokedAt: null,
        userAgent: s.userAgent,
      }));
      const started = await startSession("sub-g2", null, Date.now());
      const [, secret] = started.refreshToken.split(".");
      vi.mocked(findSessionById).mockResolvedValue({
        id: "sess-g2",
        subscriberId: "sub-g2",
        familyId: "fam-g2",
        refreshHash: sha256Hex(secret),
        createdAt: new Date(),
        familyCreatedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000),
        rotatedAt: null,
        revokedAt: null,
        userAgent: null,
      });
      vi.mocked(markSessionRotated).mockResolvedValue(true);
      vi.mocked(revokeSessionFamily).mockResolvedValue(undefined);
      await refreshSession(started.refreshToken, null, Date.now());
      const flat = seen.join("\n");
      expect(flat).not.toContain(code);
      expect(flat).not.toContain(email);
      expect(flat).not.toContain(SECRET);
      expect(flat).not.toContain(secret);
      expect(flat).not.toContain(started.accessToken);
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});

describe("AC-G3: no any, no ts-ignore, no eslint-disable in shipped files", () => {
  it("scans every owned source file for suppressions", () => {
    const libFiles = readdirSync(here)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => join(here, f));
    const routeFiles = ["otp/request", "otp/verify", "refresh", "logout", "me"].map((r) =>
      resolve(here, "..", "..", "app", "api", "auth", r, "route.ts"),
    );
    const files = [...libFiles, ...routeFiles];
    expect(files.length).toBeGreaterThan(5);
    const banned: RegExp[] = [
      /:\s*any(?![\w$])/,
      /<\s*any\s*>/,
      /\bas\s+any\b/,
      /any\[\]/,
      /ts-ignore/,
      /ts-nocheck/,
      /ts-expect-error/,
      /eslint-disable/,
    ];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");
      for (const [index, line] of lines.entries()) {
        for (const pattern of banned) {
          if (pattern.test(line)) {
            throw new Error(`Banned pattern ${pattern} in ${file}:${index + 1}: ${line}`);
          }
        }
      }
    }
  });
});
