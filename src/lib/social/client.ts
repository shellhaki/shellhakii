// Client fetch wrapper for the social layer (spec section 7).
// On a 401 it silently calls GET /api/auth/me exactly once (a shared
// in-flight promise, so concurrent 401s trigger a single refresh), then
// retries the original request once. It never loops: the retry result is
// returned as-is, and /api/auth/me itself never triggers a refresh.

let refreshInflight: Promise<unknown> | null = null;

const REFRESH_URL = "/api/auth/me";

function refreshOnce(): Promise<unknown> {
  if (!refreshInflight) {
    const attempt = fetch(REFRESH_URL, {
      method: "GET",
      credentials: "same-origin",
    }).catch(() => null);
    refreshInflight = attempt;
    // Clear the slot when settled so a later 401 starts a fresh refresh.
    void attempt.finally(() => {
      refreshInflight = null;
    });
  }
  return refreshInflight;
}

function withDefaults(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return { ...init, credentials: "same-origin", headers };
}

/** Test hook: forget any in-flight refresh (tests run isolated anyway). */
export function __resetApiClient() {
  refreshInflight = null;
}

export const apiFetch = async (url: string, init?: RequestInit): Promise<Response> => {
  const request = withDefaults(init);
  const res = await fetch(url, request);
  if (res.status !== 401) return res;
  // The refresh endpoint reports viewer-or-null and never 401s by contract;
  // refreshing here would recurse, so return as-is.
  if (url === REFRESH_URL) return res;
  await refreshOnce();
  return fetch(url, request);
};
