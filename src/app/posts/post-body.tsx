import type { ReactNode } from "react";

const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
const TRAILING_PUNCT_RE = /[.,;:!?)\]]+$/;

/** Split trailing punctuation (periods, commas, parens) off a matched URL. */
function splitTrailingPunct(match: string): { url: string; trail: string } {
  const m = match.match(TRAILING_PUNCT_RE);
  if (!m || m.index === undefined) return { url: match, trail: "" };
  return { url: match.slice(0, m.index), trail: match.slice(m.index) };
}

/**
 * Split plain body text into React-safe parts, turning http(s) URLs into
 * plain anchor tags. Text stays as strings so React escapes it; only
 * http(s) matches become links, so `javascript:` can never be a href.
 */
export function linkifyBody(body: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of body.matchAll(URL_RE)) {
    const index = m.index ?? 0;
    if (index > last) parts.push(body.slice(last, index));
    const { url, trail } = splitTrailingPunct(m[0]);
    parts.push(
      <a
        key={key++}
        href={url}
        className="text-foreground underline decoration-muted/50 underline-offset-4 transition-colors hover:decoration-foreground"
      >
        {url}
      </a>,
    );
    if (trail) parts.push(trail);
    last = index + m[0].length;
  }
  if (last < body.length) parts.push(body.slice(last));
  return parts;
}

/** Post text with preserved line breaks and linkified URLs. */
export function PostBody({ body }: { body: string }) {
  return (
    <p className="whitespace-pre-line break-words text-[15px] leading-relaxed">
      {linkifyBody(body)}
    </p>
  );
}
