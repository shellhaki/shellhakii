"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { del } from "./upload";

export function DeleteButton({
  url,
  label,
  className,
}: {
  url: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await del(url);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={`Delete ${label}`}
      className={
        className ??
        "cursor-pointer text-sm text-muted underline decoration-muted/50 underline-offset-4 transition-colors hover:text-red-500 hover:decoration-red-500 disabled:opacity-50"
      }
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
