// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ViewerProvider, useViewer } from "@/components/social/viewer-provider";
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

function dialogEl(): HTMLDialogElement | null {
  return document.querySelector("dialog");
}

function dialogIsOpen(): boolean {
  const dialog = dialogEl();
  return !!dialog && (dialog.open || dialog.hasAttribute("open"));
}

type MeResponse = { viewer: Viewer | null };

function stubFetch(me: MeResponse, extra?: (url: string) => Response | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (typeof url === "string" && url.startsWith("/api/auth/me")) {
        return new Response(JSON.stringify(me), { status: 200 });
      }
      const routed = extra?.(url);
      if (routed) return routed;
      return new Response(JSON.stringify({ error: "not mocked" }), { status: 500 });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => stubFetch({ viewer: null }));

function Probe() {
  const { viewer, status, signOut, requireSignIn } = useViewer();
  const [outcome, setOutcome] = useState("pending");
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="viewer">{viewer ? viewer.displayName : "signed-out"}</p>
      <p data-testid="outcome">{outcome}</p>
      <button type="button" onClick={() => void requireSignIn().then((v) => setOutcome(v ? v.displayName : "null"))}>
        probe sign in
      </button>
      <button
        type="button"
        onClick={() => {
          const first = requireSignIn();
          const second = requireSignIn();
          void Promise.all([first, second]).then((pair) =>
            setOutcome(pair.map((v) => (v ? v.displayName : "null")).join("+")),
          );
        }}
      >
        probe sign in twice
      </button>
      <button type="button" onClick={() => void signOut().then(() => setOutcome("signed-out"))}>
        probe sign out
      </button>
    </div>
  );
}

async function completeSignInAsHal() {
  await userEvent.click(screen.getByLabelText("Email"));
  await userEvent.type(screen.getByLabelText("Email"), "hal@example.com");
  await userEvent.click(screen.getByRole("button", { name: "Send code" }));
  const code = await screen.findByLabelText("Code");
  await userEvent.type(code, "123456");
  await userEvent.click(screen.getByRole("button", { name: "Verify" }));
}

it("AC-U1: renders without opening a dialog or writing anything", async () => {
  stubFetch({ viewer: null });
  render(
    <ViewerProvider>
      <p>hello</p>
    </ViewerProvider>,
  );
  expect(screen.getByText("hello")).toBeInTheDocument();
  expect(dialogIsOpen()).toBe(false);
  await waitFor(() => expect(screen.queryByText("hello")).toBeInTheDocument());
  const calls = vi.mocked(fetch).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  for (const [url, init] of calls as Array<[string, RequestInit | undefined]>) {
    expect(url).toBe("/api/auth/me");
    expect(init?.method ?? "GET").toBe("GET");
  }
});

it("AC-U1: useViewer outside the provider throws", () => {
  function NoProvider() {
    useViewer();
    return null;
  }
  expect(() => render(<NoProvider />)).toThrow("useViewer must be used within ViewerProvider");
});

it("AC-U3: requireSignIn while signed out opens the dialog; Not now resolves null and restores focus", async () => {
  const user = userEvent.setup();
  render(
    <ViewerProvider>
      <Probe />
    </ViewerProvider>,
  );
  await screen.findByTestId("status");
  const trigger = screen.getByRole("button", { name: "probe sign in" });
  await user.click(trigger);
  expect(dialogIsOpen()).toBe(true);
  expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Not now" }));
  expect(await screen.findByTestId("outcome")).toHaveTextContent("null");
  expect(dialogIsOpen()).toBe(false);
  expect(document.activeElement).toBe(trigger);
});

it("AC-U9: Escape closes the dialog and resolves requireSignIn with null", async () => {
  render(
    <ViewerProvider>
      <Probe />
    </ViewerProvider>,
  );
  await screen.findByTestId("status");
  fireEvent.click(screen.getByRole("button", { name: "probe sign in" }));
  await screen.findByRole("button", { name: "Not now" });
  expect(dialogIsOpen()).toBe(true);
  const dialog = dialogEl();
  expect(dialog).not.toBeNull();
  fireEvent.keyDown(dialog!, { key: "Escape" });
  expect(await screen.findByTestId("outcome")).toHaveTextContent("null");
  expect(dialogIsOpen()).toBe(false);
});

it("AC-U2: concurrent requireSignIn calls share one dialog and resolve together", async () => {
  stubFetch(
    { viewer: null },
    (url) => {
      if (url === "/api/auth/otp/request") return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url === "/api/auth/otp/verify") {
        return new Response(JSON.stringify({ viewer: HAL, isNew: false }), { status: 200 });
      }
      return null;
    },
  );
  render(
    <ViewerProvider>
      <Probe />
    </ViewerProvider>,
  );
  await screen.findByTestId("status");
  fireEvent.click(screen.getByRole("button", { name: "probe sign in twice" }));
  await screen.findByRole("button", { name: "Not now" });
  expect(document.querySelectorAll("dialog[open], dialog").length).toBe(1);
  await completeSignInAsHal();
  expect(await screen.findByTestId("outcome")).toHaveTextContent("Hal+Hal");
  expect(dialogIsOpen()).toBe(false);
  expect(screen.getByTestId("viewer")).toHaveTextContent("Hal");
});

it("requireSignIn resolves immediately when already signed in", async () => {
  stubFetch({ viewer: HAL });
  const user = userEvent.setup();
  render(
    <ViewerProvider>
      <Probe />
    </ViewerProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("viewer")).toHaveTextContent("Hal"));
  await user.click(screen.getByRole("button", { name: "probe sign in" }));
  expect(await screen.findByTestId("outcome")).toHaveTextContent("Hal");
  expect(dialogIsOpen()).toBe(false);
});

it("signOut clears the viewer", async () => {
  stubFetch(
    { viewer: HAL },
    (url) => {
      if (url === "/api/auth/logout") return new Response(JSON.stringify({ ok: true }), { status: 200 });
      return null;
    },
  );
  render(
    <ViewerProvider>
      <Probe />
    </ViewerProvider>,
  );
  await waitFor(() => expect(screen.getByTestId("viewer")).toHaveTextContent("Hal"));
  fireEvent.click(screen.getByRole("button", { name: "probe sign out" }));
  await waitFor(() => expect(screen.getByTestId("viewer")).toHaveTextContent("signed-out"));
});
