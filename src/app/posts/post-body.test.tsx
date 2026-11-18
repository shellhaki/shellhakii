// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PostBody } from "./post-body";

describe("PostBody", () => {
  it("AC-I1: preserves line breaks", () => {
    const { container } = render(<PostBody body={"line one\nline two"} />);
    expect(container.querySelector("p")).toHaveClass("whitespace-pre-line");
    expect(screen.getByText(/line one/)).toBeInTheDocument();
    expect(screen.getByText(/line two/)).toBeInTheDocument();
  });

  it("AC-I1: linkifies http(s) URLs as plain anchors", () => {
    render(<PostBody body="see https://example.com/x for more" />);
    const link = screen.getByRole("link", { name: "https://example.com/x" });
    expect(link).toHaveAttribute("href", "https://example.com/x");
  });

  it("AC-I1: strips trailing punctuation from linkified URLs", () => {
    render(<PostBody body="nice (https://example.com/y)." />);
    const link = screen.getByRole("link", { name: "https://example.com/y" });
    expect(link).toHaveAttribute("href", "https://example.com/y");
    expect(screen.queryByRole("link", { name: "https://example.com/y)." })).toBeNull();
  });

  it("AC-I1: never creates javascript: links", () => {
    render(<PostBody body="click javascript:alert(1) now" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it("AC-I1: renders markup in the body as text, not HTML", () => {
    render(<PostBody body="<b>bold</b>" />);
    expect(document.querySelector("b")).toBeNull();
    expect(screen.getByText("<b>bold</b>")).toBeInTheDocument();
  });
});
