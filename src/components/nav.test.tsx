// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { nav } from "@/lib/site";

vi.mock("next/navigation", () => ({ usePathname: () => "/posts" }));

import { Nav } from "./nav";

describe("Nav", () => {
  it("AC-I5: includes a Posts item pointing at /posts", () => {
    render(<Nav />);
    expect(nav.map((n) => n.href)).toContain("/posts");
    expect(screen.getByRole("link", { name: "Posts" })).toHaveAttribute(
      "href",
      "/posts",
    );
  });

  it("AC-I5: fits narrow widths without wrapping or horizontal scroll", () => {
    const { container } = render(<Nav />);
    const navEl = container.querySelector("nav");
    expect(navEl).not.toBeNull();
    const cls = navEl?.getAttribute("class") ?? "";
    expect(cls).toContain("flex-nowrap");
    expect(cls).toContain("whitespace-nowrap");
    expect(cls).not.toMatch(/overflow-x-auto|overflow-x-scroll/);
    // Labels stay icon-only below lg so seven items fit at 320px.
    expect(navEl?.querySelector(".overflow-x-auto")).toBeNull();
  });
});
