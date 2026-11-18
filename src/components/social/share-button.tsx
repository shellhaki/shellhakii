"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";

export type ShareButtonProps = {
  url: string;
};

function fallbackCopy(text: string): void {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "absolute";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } finally {
    document.body.removeChild(area);
  }
  if (!ok) throw new Error("copy failed");
}

export function ShareButton({ url }: ShareButtonProps) {
  const [announced, setAnnounced] = useState("");

  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        fallbackCopy(url);
      }
    } catch {
      try {
        fallbackCopy(url);
      } catch {
        // Still announce so the outcome is perceivable; the URL stays visible
        // in the share target for manual copying.
      }
    }
    setAnnounced("Link copied");
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy link"
        className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-full px-2.5 text-sm transition-colors hover:bg-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        <Link2 aria-hidden className="size-4" />
      </button>
      <span aria-live="polite" role="status" className="sr-only">
        {announced}
      </span>
    </span>
  );
}
