// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthDialog } from "@/components/social/auth-dialog";
import type { Viewer } from "@/lib/social/types";

const HAL = { id: "viewer-1", email: "hal@example.com", displayName: "Hal" } satisfies Viewer;

if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

function stubFetch(handler: (url: string) => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => handler(url)),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

beforeEach(() => {
  stubFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
});

function openDialog(props?: Partial<{ onSuccess: (v: Viewer) => void; onDismiss: () => void }>) {
  const onSuccess = props?.onSuccess ?? vi.fn();
  const onDismiss = props?.onDismiss ?? vi.fn();
  render(<AuthDialog open onSuccess={onSuccess} onDismiss={onDismiss} />);
  return { onSuccess, onDismiss };
}

async function goToCodeStep(email = "hal@example.com") {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  await screen.findByLabelText("Code");
}

it("AC-U3: rejects a malformed email with an inline error and keeps focus", async () => {
  openDialog();
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-an-email" } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("valid email");
  expect(document.activeElement).toBe(screen.getByLabelText("Email"));
  expect(screen.queryByLabelText("Code")).not.toBeInTheDocument();
});

it("AC-U3: shows the code step after a valid email and autofocuses it", async () => {
  openDialog();
  await goToCodeStep();
  expect(screen.getByLabelText("Code")).toHaveFocus();
  expect(screen.getByRole("button", { name: /resend code in 60 seconds/i })).toBeDisabled();
});

it("AC-U3: wrong code shows an inline error and keeps focus in the code field", async () => {
  stubFetch((url) => {
    if (url === "/api/auth/otp/verify") {
      return new Response(JSON.stringify({ error: "invalid_or_expired" }), { status: 401 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  openDialog();
  await goToCodeStep();
  fireEvent.change(screen.getByLabelText("Code"), { target: { value: "000000" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("did not work");
  const code = screen.getByLabelText("Code");
  expect(document.activeElement).toBe(code);
});

async function advanceSeconds(n: number) {
  // One tick at a time: each countdown tick reschedules from its own effect,
  // so the re-render must commit before the next second advances.
  for (let i = 0; i < n; i += 1) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
  }
}

it("AC-U3: resend counts down from 60 and re-enables", async () => {
  vi.useFakeTimers();
  openDialog();
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "hal@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByLabelText("Code")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /resend code in 60 seconds/i })).toBeDisabled();
  await advanceSeconds(59);
  expect(screen.getByRole("button", { name: /resend code in 1 second/i })).toBeDisabled();
  await advanceSeconds(1);
  expect(screen.getByRole("button", { name: "Resend code" })).toBeEnabled();
});

it("AC-U3: resending requests another code and restarts the countdown", async () => {
  vi.useFakeTimers();
  openDialog();
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "hal@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByLabelText("Code")).toBeInTheDocument();
  await advanceSeconds(60);
  fireEvent.click(screen.getByRole("button", { name: "Resend code" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  const requests = vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => url === "/api/auth/otp/request");
  expect(requests.length).toBe(2);
  expect(screen.getByRole("button", { name: /resend code in 60 seconds/i })).toBeDisabled();
});

it("AC-U3: back link returns to the email step", async () => {
  openDialog();
  await goToCodeStep();
  fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
  expect(await screen.findByLabelText("Email")).toBeInTheDocument();
});

it("AC-U3: new viewers see the optional name step; Skip finishes sign-in", async () => {
  const newborn = { ...HAL, displayName: "ha***" };
  stubFetch((url) => {
    if (url === "/api/auth/otp/verify") {
      return new Response(JSON.stringify({ viewer: newborn, isNew: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  const { onSuccess } = openDialog();
  await goToCodeStep();
  fireEvent.change(screen.getByLabelText("Code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
  expect(await screen.findByLabelText(/display name/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  expect(onSuccess).toHaveBeenCalledWith(newborn);
});

it("AC-U3: saving a display name PATCHes /api/auth/me", async () => {
  const newborn = { ...HAL, displayName: "ha***" };
  stubFetch((url) => {
    if (url === "/api/auth/otp/verify") {
      return new Response(JSON.stringify({ viewer: newborn, isNew: true }), { status: 200 });
    }
    if (url === "/api/auth/me") {
      return new Response(JSON.stringify({ viewer: HAL }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  const { onSuccess } = openDialog();
  await goToCodeStep();
  fireEvent.change(screen.getByLabelText("Code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));
  const name = await screen.findByLabelText(/display name/i);
  fireEvent.change(name, { target: { value: "Hal" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(HAL));
  const patch = vi
    .mocked(fetch)
    .mock.calls.find(([url, init]) => url === "/api/auth/me" && (init as RequestInit)?.method === "PATCH");
  expect(patch).toBeDefined();
  expect(onSuccess).toHaveBeenCalledWith(HAL);
});

it("AC-U3: Esc and Not now close the dialog and resolve with null", async () => {
  const onDismiss = vi.fn();
  render(<AuthDialog open onSuccess={vi.fn()} onDismiss={onDismiss} />);
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  expect(onDismiss).toHaveBeenCalled();
});

it("AC-U3: Escape key dismisses from the code step", async () => {
  const onDismiss = vi.fn();
  render(<AuthDialog open onSuccess={vi.fn()} onDismiss={onDismiss} />);
  await goToCodeStep();
  fireEvent.keyDown(document.querySelector("dialog")!, { key: "Escape" });
  expect(onDismiss).toHaveBeenCalled();
});

it("AC-U9: every control has an accessible name", async () => {
  render(<AuthDialog open onSuccess={vi.fn()} onDismiss={vi.fn()} />);
  await goToCodeStep();
  const dialog = document.querySelector("dialog")!;
  const controls = dialog.querySelectorAll("button, input");
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    expect(control as HTMLElement).toHaveAccessibleName(/.+/);
  }
});

it("AC-U9: Tab cycles focus inside the dialog instead of leaving it", async () => {
  render(<AuthDialog open onSuccess={vi.fn()} onDismiss={vi.fn()} />);
  await goToCodeStep();
  const dialog = document.querySelector("dialog")!;
  const items = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input")];
  expect(items.length).toBeGreaterThan(1);
  const last = items[items.length - 1];
  last.focus();
  fireEvent.keyDown(dialog, { key: "Tab" });
  expect(document.activeElement).toBe(items[0]);
  items[0].focus();
  fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(last);
});
