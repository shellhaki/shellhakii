"use client";

import { useState } from "react";
import { button, input } from "@/lib/ui";

export function SubscribeForm({ id = "subscribe" }: { id?: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      form.reset();
      setStatus({ ok: true, text: "Almost there. Check your inbox to confirm." });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={`${id}-email`} className="sr-only">
          Email address
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          maxLength={200}
          autoComplete="email"
          placeholder="you@example.com"
          className={`${input} sm:flex-1`}
        />
        {/* Honeypot: hidden from people and assistive tech, bots fill it. */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor={`${id}-website`}>Website</label>
          <input id={`${id}-website`} name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <button type="submit" disabled={busy} className={`${button} shrink-0`}>
          {busy ? "Subscribing…" : "Subscribe"}
        </button>
      </div>
      <p
        role={status ? (status.ok ? "status" : "alert") : undefined}
        className={`mt-3 min-h-5 text-sm ${status && !status.ok ? "text-red-500" : "text-muted"}`}
      >
        {status?.text}
      </p>
    </form>
  );
}
