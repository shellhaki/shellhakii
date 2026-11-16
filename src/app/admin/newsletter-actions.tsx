"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { button, ghostButton, input } from "@/lib/ui";
import { post } from "./upload";

export function NewsletterActions({ activeCount }: { activeCount: number }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"test" | "send" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(test: boolean) {
    if (
      !test &&
      !confirm(`Send this update to ${activeCount} subscriber${activeCount === 1 ? "" : "s"}? This cannot be undone.`)
    ) {
      return;
    }
    setBusy(test ? "test" : "send");
    setMessage(null);
    try {
      const { sent, failed } = await post<{ sent: number; failed: number }>(
        "/api/admin/newsletter",
        { note, test },
      );
      setMessage({
        ok: failed === 0,
        text: test
          ? "Test sent to your contact email."
          : `Sent to ${sent} subscriber${sent === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.`,
      });
      if (!test) {
        setNote("");
        router.refresh();
      }
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Failed" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={2000}
        aria-label="Personal note (optional)"
        placeholder="Optional note shown at the top of the email"
        className={input}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => send(true)} disabled={busy !== null} className={ghostButton}>
          {busy === "test" ? "Sending…" : "Send test to me"}
        </button>
        <button
          type="button"
          onClick={() => send(false)}
          disabled={busy !== null || activeCount === 0}
          className={button}
        >
          {busy === "send" ? "Sending…" : `Send to ${activeCount} subscriber${activeCount === 1 ? "" : "s"}`}
        </button>
      </div>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-sm ${message.ok ? "text-muted" : "text-red-500"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
