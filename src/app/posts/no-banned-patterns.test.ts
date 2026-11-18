import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const owned = [
  "src/app/layout.tsx",
  "src/app/posts/page.tsx",
  "src/app/posts/post-body.tsx",
  "src/app/posts/post-card.tsx",
  "src/app/posts/posts-feed.tsx",
  "src/app/posts/[id]/page.tsx",
  "src/app/api/posts/route.ts",
  "src/app/admin/posts-section.tsx",
  "src/app/admin/dashboard.tsx",
  "src/components/project-card.tsx",
  "src/components/nav.tsx",
  "src/app/gallery/gallery-grid.tsx",
  "src/app/articles/[id]/page.tsx",
  "src/lib/site.ts",
];

describe("AC-G3: no banned escape hatches in WP4 sources", () => {
  for (const file of owned) {
    it(`${file} has no any, ts-ignore, or eslint-disable`, () => {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      const lines = src
        .split("\n")
        .filter((line) => !line.includes("@next/next/no-img-element"));
      const body = lines.join("\n");
      expect(body).not.toMatch(/eslint-disable/);
      expect(body).not.toMatch(/@ts-ignore/);
      expect(body).not.toMatch(/\bany\b/);
    });
  }
});
