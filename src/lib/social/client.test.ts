import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { __resetApiClient, apiFetch } from "@/lib/social/client";

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  __resetApiClient();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const fetchMock = () => vi.mocked(fetch);

it("AC-U7: sends credentials same-origin and JSON headers for bodies", async () => {
  fetchMock().mockResolvedValueOnce(ok({}));
  await apiFetch("/api/likes", { method: "PUT", body: JSON.stringify({ a: 1 }) });
  const [, init] = fetchMock().mock.calls[0] as [string, RequestInit];
  expect(init.credentials).toBe("same-origin");
  expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
});

it("AC-U7: does not add a JSON content type when there is no body", async () => {
  fetchMock().mockResolvedValueOnce(ok({}));
  await apiFetch("/api/engagement?targets=post:x", { method: "GET" });
  const [, init] = fetchMock().mock.calls[0] as [string, RequestInit];
  expect(new Headers(init.headers).has("Content-Type")).toBe(false);
});

it("AC-U7: passes a non-401 response through without refreshing", async () => {
  fetchMock().mockResolvedValueOnce(ok({ likes: 3 }));
  const res = await apiFetch("/api/likes", { method: "PUT", body: "{}" });
  expect(res.status).toBe(200);
  expect(fetchMock()).toHaveBeenCalledTimes(1);
});

it("AC-U7: on 401 calls GET /api/auth/me exactly once, then retries once", async () => {
  fetchMock()
    .mockResolvedValueOnce(new Response("{}", { status: 401 }))
    .mockResolvedValueOnce(ok({ viewer: null }))
    .mockResolvedValueOnce(ok({ likes: 1 }));
  const res = await apiFetch("/api/likes", { method: "PUT", body: "{}" });
  expect(res.status).toBe(200);
  expect(fetchMock()).toHaveBeenCalledTimes(3);
  const urls = fetchMock().mock.calls.map(([url]) => url as string);
  expect(urls).toEqual(["/api/likes", "/api/auth/me", "/api/likes"]);
  const [, refreshInit] = fetchMock().mock.calls[1] as [string, RequestInit];
  expect(refreshInit.credentials).toBe("same-origin");
});

it("AC-U7: shares one in-flight refresh across concurrent 401s", async () => {
  let releaseRefresh!: (value: Response) => void;
  const refreshGate = new Promise<Response>((resolve) => {
    releaseRefresh = resolve;
  });
  fetchMock().mockImplementation((url) => {
    if (url === "/api/auth/me") return refreshGate;
    if (url === "/api/first") return Promise.resolve(new Response("{}", { status: 401 }));
    return Promise.resolve(new Response("{}", { status: 401 }));
  });
  const first = apiFetch("/api/first", { method: "PUT", body: "{}" });
  const second = apiFetch("/api/second", { method: "PUT", body: "{}" });
  // Let both hit their 401s and queue on the shared refresh.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  releaseRefresh(ok({ viewer: null }));
  // Retries succeed.
  fetchMock().mockImplementation(async (url) => {
    if (url === "/api/auth/me") return ok({ viewer: null });
    return ok({ done: true });
  });
  await first;
  await second;
  const refreshCalls = fetchMock().mock.calls.filter(([url]) => url === "/api/auth/me");
  expect(refreshCalls.length).toBe(1);
});

it("AC-U7: never loops — the single retry result is returned as-is", async () => {
  fetchMock()
    .mockResolvedValueOnce(new Response("{}", { status: 401 }))
    .mockResolvedValueOnce(ok({ viewer: null }))
    .mockResolvedValueOnce(new Response("{}", { status: 401 }));
  const res = await apiFetch("/api/likes", { method: "PUT", body: "{}" });
  expect(res.status).toBe(401);
  expect(fetchMock()).toHaveBeenCalledTimes(3);
});

it("AC-U7: never refreshes for /api/auth/me itself", async () => {
  fetchMock().mockResolvedValueOnce(ok({ viewer: null }));
  const res = await apiFetch("/api/auth/me");
  expect(res.status).toBe(200);
  expect(fetchMock()).toHaveBeenCalledTimes(1);
});

it("AC-U7: still retries once when the refresh request fails", async () => {
  fetchMock()
    .mockResolvedValueOnce(new Response("{}", { status: 401 }))
    .mockRejectedValueOnce(new Error("network down"))
    .mockResolvedValueOnce(ok({ likes: 2 }));
  const res = await apiFetch("/api/likes", { method: "PUT", body: "{}" });
  expect(res.status).toBe(200);
  expect(fetchMock()).toHaveBeenCalledTimes(3);
});
