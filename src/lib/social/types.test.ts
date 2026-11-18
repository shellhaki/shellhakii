import { describe, expect, it } from "vitest";
import { isTargetType, targetKey, TARGET_TYPES } from "./types";

describe("social types", () => {
  it("recognises every target type and rejects others", () => {
    for (const t of TARGET_TYPES) expect(isTargetType(t)).toBe(true);
    expect(isTargetType("repo")).toBe(false);
    expect(isTargetType(undefined)).toBe(false);
  });

  it("builds stable target keys", () => {
    expect(targetKey("project", "abc")).toBe("project:abc");
  });
});
