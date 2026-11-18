import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./store", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./store")>();
  return { ...orig, targetExists: vi.fn(), existingDbIds: vi.fn() };
});
vi.mock("@/lib/medium", () => ({ getArticles: vi.fn() }));

import { HttpError } from "@/lib/api";
import { getArticles } from "@/lib/medium";
import { existingDbIds, targetExists } from "./store";
import { validateTarget, validateTargetsBatch } from "./targets";

const targetExistsMock = vi.mocked(targetExists);
const existingDbIdsMock = vi.mocked(existingDbIds);
const getArticlesMock = vi.mocked(getArticles);

const UUID_A = "11111111-1111-1111-1111-111111111111";

const statusOf = async (fn: () => Promise<unknown>): Promise<number> => {
  try {
    await fn();
    expect.unreachable("should have thrown");
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError);
    return (err as HttpError).status;
  }
  throw new Error("unreachable");
};

beforeEach(() => {
  targetExistsMock.mockReset();
  existingDbIdsMock.mockReset();
  getArticlesMock.mockReset();
  targetExistsMock.mockResolvedValue(true);
  getArticlesMock.mockResolvedValue([
    { id: "abc123", title: "t", url: "https://x.example", publishedAt: "", excerpt: "", readMinutes: 1, categories: [], html: "" },
  ]);
});

describe("targets", () => {
  it("AC-E3: accepts existing database targets", async () => {
    await expect(validateTarget("post", UUID_A)).resolves.toBe("post");
    await expect(validateTarget("project", UUID_A)).resolves.toBe("project");
    await expect(validateTarget("gallery", UUID_A)).resolves.toBe("gallery");
    expect(targetExistsMock).toHaveBeenCalledTimes(3);
  });

  it("AC-E3: accepts an article present in the feed", async () => {
    await expect(validateTarget("article", "abc123")).resolves.toBe("article");
    expect(targetExistsMock).not.toHaveBeenCalled();
  });

  it("AC-E3: rejects an unknown target type with 404", async () => {
    expect(await statusOf(() => validateTarget("repo", UUID_A))).toBe(404);
  });

  it("AC-E3: rejects non-uuid database ids with 404", async () => {
    for (const bad of ["abc123", "", "xyz-not-a-uuid"]) {
      expect(await statusOf(() => validateTarget("post", bad))).toBe(404);
    }
    expect(targetExistsMock).not.toHaveBeenCalled();
  });

  it("AC-E3: rejects missing database rows with 404", async () => {
    targetExistsMock.mockResolvedValue(false);
    expect(await statusOf(() => validateTarget("project", UUID_A))).toBe(404);
  });

  it("AC-E3: rejects article ids outside the hex format with 404", async () => {
    for (const bad of ["XYZ", "abc", "a".repeat(33), "ghijkl", UUID_A]) {
      expect(await statusOf(() => validateTarget("article", bad))).toBe(404);
    }
    expect(getArticlesMock).not.toHaveBeenCalled();
  });

  it("AC-E3: rejects articles missing from the feed with 404", async () => {
    getArticlesMock.mockResolvedValue([]);
    expect(await statusOf(() => validateTarget("article", "abc123"))).toBe(404);
  });

  it("AC-E3: batch-validates mixed targets with one query per type", async () => {
    existingDbIdsMock.mockImplementation(async (type: string) => {
      if (type === "post") return new Set([UUID_A]);
      return new Set<string>();
    });
    await validateTargetsBatch([
      { type: "post", id: UUID_A },
      { type: "article", id: "abc123" },
    ]);
    expect(existingDbIdsMock).toHaveBeenCalledTimes(1);
    expect(getArticlesMock).toHaveBeenCalledTimes(1);
  });

  it("AC-E3: batch validation names the first bad target with 404", async () => {
    existingDbIdsMock.mockResolvedValue(new Set<string>());
    expect(
      await statusOf(() =>
        validateTargetsBatch([
          { type: "post", id: UUID_A },
          { type: "article", id: "abc123" },
        ]),
      ),
    ).toBe(404);
  });

  it("AC-E3: batch validation rejects unknown types with 404", async () => {
    expect(
      await statusOf(() => validateTargetsBatch([{ type: "repo", id: "x" }])),
    ).toBe(404);
    expect(existingDbIdsMock).not.toHaveBeenCalled();
  });
});
