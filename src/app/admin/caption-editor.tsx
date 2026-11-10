"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { input } from "@/lib/ui";
import { patch } from "./upload";

export function CaptionEditor({ id, caption }: { id: string; caption: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(caption ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await patch(`/api/admin/media/${id}`, { caption: value });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full cursor-pointer truncate px-1 pt-2 text-left text-xs text-muted transition-colors hover:text-foreground"
      >
        {caption || "Add caption"}
      </button>
    );
  }

  return (
    <form onSubmit={save} className="space-y-1 pt-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={300}
        autoFocus
        aria-label="Caption"
        placeholder="Caption"
        className={`${input} py-1 text-xs`}
      />
      <div className="flex items-center gap-3 text-xs">
        <button type="submit" disabled={busy} className="cursor-pointer text-foreground underline underline-offset-4">
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setValue(caption ?? "");
          }}
          className="cursor-pointer text-muted"
        >
          Cancel
        </button>
        {error && <span className="text-red-500">{error}</span>}
      </div>
    </form>
  );
}
