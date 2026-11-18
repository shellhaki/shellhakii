"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/social/client";
import type { Viewer } from "@/lib/social/types";
import { button, ghostButton, input } from "@/lib/ui";

export type AuthDialogProps = {
  open: boolean;
  onSuccess: (viewer: Viewer) => void;
  onDismiss: () => void;
};

type Step = "email" | "code" | "name";

const RESEND_SECONDS = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isDialogOpen(dialog: HTMLDialogElement): boolean {
  return dialog.open || dialog.hasAttribute("open");
}

function showDialog(dialog: HTMLDialogElement): void {
  if (isDialogOpen(dialog)) return;
  if (typeof dialog.showModal === "function") {
    try {
      dialog.showModal();
      return;
    } catch {
      // showModal throws if the dialog is already open or unsupported; fall through.
    }
  }
  dialog.setAttribute("open", "");
}

function hideDialog(dialog: HTMLDialogElement): void {
  if (dialog.open && typeof dialog.close === "function") {
    try {
      dialog.close();
    } catch {
      // Ignore close errors in polyfilled environments.
    }
  }
  dialog.removeAttribute("open");
}

function focusables(root: HTMLElement): HTMLElement[] {
  const selector =
    'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';
  // The dialog never renders hidden focusables, so no visibility filtering is
  // needed (and offsetParent is always null in jsdom).
  return [...root.querySelectorAll<HTMLElement>(selector)];
}

export function AuthDialog({ open, onSuccess, onDismiss }: AuthDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<Element | null>(null);

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [pendingViewer, setPendingViewer] = useState<Viewer | null>(null);

  // Open/close the native dialog; restore focus to the trigger on close.
  // Fresh flow state per opening comes from the provider's `key`, so this
  // effect only touches the DOM and never sets state.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      triggerRef.current = document.activeElement;
      showDialog(dialog);
    } else {
      if (isDialogOpen(dialog)) hideDialog(dialog);
      const trigger = triggerRef.current;
      triggerRef.current = null;
      if (trigger instanceof HTMLElement) trigger.focus();
    }
  }, [open ]);

  // Countdown for the resend affordance.
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Autofocus the active step input.
  useEffect(() => {
    if (!open) return;
    const target =
      step === "email" ? emailRef.current : step === "code" ? codeRef.current : nameRef.current;
    target?.focus();
  }, [open, step]);

  function handleCancel(e: React.SyntheticEvent) {
    e.preventDefault();
    onDismiss();
  }

  // Keep Tab cycling inside the dialog (native showModal traps focus in
  // browsers; this covers polyfilled environments such as jsdom). Escape
  // closes explicitly so jsdom tests can exercise it without native cancel.
  function handleKeyDown(e: React.KeyboardEvent<HTMLDialogElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onDismiss();
      return;
    }
    if (e.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const items = focusables(dialog).filter((el) => !el.hasAttribute("disabled"));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  async function requestCode(targetEmail: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      // OTP endpoints are pre-session: use plain fetch so a 401 for a bad
      // code never triggers the session-refresh cycle in apiFetch.
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? "Could not send a code. Try again.");
      setCountdown(RESEND_SECONDS);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a code. Try again.");
      emailRef.current?.focus();
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError("Enter a valid email address.");
      emailRef.current?.focus();
      return;
    }
    setEmail(trimmed);
    const ok = await requestCode(trimmed);
    if (ok) setStep("code");
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit code from your email.");
      codeRef.current?.focus();
      codeRef.current?.select();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: trimmed }),
      });
      const json = (await res.json().catch(() => null)) as {
        viewer?: Viewer;
        isNew?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !json?.viewer) {
        setError("That code did not work. Check it and try again.");
        codeRef.current?.focus();
        codeRef.current?.select();
        return;
      }
      setCode("");
      if (json.isNew) {
        setPendingViewer(json.viewer);
        setStep("name");
      } else {
        onSuccess(json.viewer);
      }
    } catch {
      setError("Something went wrong. Try again.");
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (countdown > 0 || busy) return;
    await requestCode(email);
    codeRef.current?.focus();
  }

  async function submitName(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (trimmed !== "" && (trimmed.length < 2 || trimmed.length > 30)) {
      setError("Display name must be 2 to 30 characters, or skip it.");
      nameRef.current?.focus();
      return;
    }
    if (!pendingViewer) {
      onDismiss();
      return;
    }
    if (trimmed === "") {
      onSuccess(pendingViewer);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName: trimmed }),
      });
      const json = (await res.json().catch(() => null)) as { viewer?: Viewer } | null;
      if (!res.ok || !json?.viewer) throw new Error("Could not save that name.");
      onSuccess(json.viewer);
    } catch {
      setError("Could not save that name. Try again or skip.");
      nameRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function skipName() {
    if (pendingViewer) onSuccess(pendingViewer);
    else onDismiss();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Sign in"
      onCancel={handleCancel}
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
      className="w-[min(24rem,calc(100dvw-2rem))] rounded-2xl border border-line bg-background p-6 text-foreground shadow-xl backdrop:bg-black/60"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-serif text-xl font-semibold">
          {step === "email" ? "Sign in" : step === "code" ? "Check your email" : "Pick a name"}
        </h2>
        <button
          type="button"
          onClick={onDismiss}
          className="flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-full border border-line text-sm text-muted transition-colors hover:bg-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          Not now
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-pill px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      )}

      {step === "email" && (
        <form onSubmit={submitEmail} noValidate className="mt-4 space-y-4">
          <p className="text-sm text-muted">Enter your email and we will send you a quick code.</p>
          <div>
            <label htmlFor="auth-email" className="mb-2 block text-sm text-muted">
              Email
            </label>
            <input
              ref={emailRef}
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={200}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={input}
            />
          </div>
          <button type="submit" disabled={busy} className={button}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={submitCode} noValidate className="mt-4 space-y-4">
          <p className="text-sm text-muted">
            We sent a 6-digit code to <span className="text-foreground">{email}</span>. It expires
            in 10 minutes.
          </p>
          <div>
            <label htmlFor="auth-code" className="mb-2 block text-sm text-muted">
              Code
            </label>
            <input
              ref={codeRef}
              id="auth-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              minLength={6}
              maxLength={6}
              pattern="[0-9]{6}"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
              placeholder="123456"
              className={`${input} tracking-[0.3em]`}
            />
          </div>
          <div className="flex min-h-9 flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className={button}>
              {busy ? "Checking…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={resend}
              disabled={busy || countdown > 0}
              aria-label={
                countdown > 0 ? `Resend code in ${countdown} seconds` : "Resend code"
              }
              className={ghostButton}
            >
              {countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep("email");
            }}
            className="min-h-9 cursor-pointer text-sm text-muted underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            Use a different email
          </button>
        </form>
      )}

      {step === "name" && (
        <form onSubmit={submitName} noValidate className="mt-4 space-y-4">
          <p className="text-sm text-muted">
            What should we call you? This name shows next to your comments.
          </p>
          <div>
            <label htmlFor="auth-name" className="mb-2 block text-sm text-muted">
              Display name (optional)
            </label>
            <input
              ref={nameRef}
              id="auth-name"
              name="displayName"
              type="text"
              autoComplete="nickname"
              minLength={2}
              maxLength={30}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="haki fan"
              className={input}
            />
          </div>
          <div className="flex min-h-9 flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className={button}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={skipName} disabled={busy} className={ghostButton}>
              Skip
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
