"use client";

import { useState } from "react";
import { button, input } from "@/lib/ui";

export function ContactForm() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      form.reset();
      setStatus({ ok: true, text: "Message sent. I'll get back to you soon." });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-2 block text-sm text-muted">
            Name
          </label>
          <input id="name" name="name" required maxLength={100} autoComplete="name" className={input} />
        </div>
        <div>
          <label htmlFor="email" className="mb-2 block text-sm text-muted">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="email"
            className={input}
          />
        </div>
      </div>
      <div>
        <label htmlFor="message" className="mb-2 block text-sm text-muted">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          required
          minLength={10}
          maxLength={4000}
          rows={7}
          className={`${input} resize-y`}
        />
      </div>

      {/* Honeypot: hidden from people and assistive tech, bots fill it. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy} className={button}>
          {busy ? "Sending…" : "Send message"}
        </button>
        {status && (
          <p
            role={status.ok ? "status" : "alert"}
            className={`text-sm ${status.ok ? "text-muted" : "text-red-500"}`}
          >
            {status.text}
          </p>
        )}
      </div>
    </form>
  );
}
