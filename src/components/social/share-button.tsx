"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2 } from "lucide-react";

export type ShareButtonProps = {
  url?: string;
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

type ShareState = "idle" | "copied" | "failed";

export function ShareButton({ url }: ShareButtonProps) {
  const [state, setState] = useState<ShareState>("idle");
  const [announced, setAnnounced] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  function announce(message: string): void {
    setAnnounced("");
    setTimeout(() => setAnnounced(message), 0);
  }

  function scheduleReset(ms: number): void {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setState("idle");
      setAnnounced("");
    }, ms);
  }

  async function handleCopy() {
    const text = new URL(url ?? window.location.href, window.location.origin).href;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      } else {
        fallbackCopy(text);
        ok = true;
      }
    } catch {
      try {
        fallbackCopy(text);
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setState("copied");
      announce("Link copied");
      scheduleReset(2000);
    } else {
      setState("failed");
      announce("Couldn't copy link");
      scheduleReset(3000);
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={handleCopy}
        aria-label={state === "copied" ? "Link copied" : "Copy link"}
        data-state={state}
        className="inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-sm transition-colors hover:bg-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        {state === "copied" ? (
          <Check aria-hidden className="size-4" />
        ) : (
          <Link2 aria-hidden className="size-4" />
        )}
        {state === "copied" ? <span className="text-xs">Copied</span> : null}
        {state === "failed" ? (
          <span className="text-xs text-red-500">Couldn&apos;t copy</span>
        ) : null}
      </button>
      <span aria-live="polite" role="status" className="sr-only">
        {announced}
      </span>
    </span>
  );
}
