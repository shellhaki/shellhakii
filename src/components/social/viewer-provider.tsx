"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AuthDialog } from "@/components/social/auth-dialog";
import { apiFetch } from "@/lib/social/client";
import type { Viewer } from "@/lib/social/types";

// Keep every exported name, prop type and signature (WP3 owns this file).
export type ViewerContextValue = {
  viewer: Viewer | null;
  status: "loading" | "ready";
  signOut: () => Promise<void>;
  requireSignIn: () => Promise<Viewer | null>;
};

const ViewerContext = createContext<ViewerContextValue | null>(null);

export function useViewer(): ViewerContextValue {
  const value = useContext(ViewerContext);
  if (!value) throw new Error("useViewer must be used within ViewerProvider");
  return value;
}

export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogSession, setDialogSession] = useState(0);
  const viewerRef = useRef<Viewer | null>(null);
  const openRef = useRef(false);
  const pendingRef = useRef<Array<(viewer: Viewer | null) => void>>([]);

  // One read on mount. This is a GET (never a write) and opens no dialog.
  useEffect(() => {
    let live = true;
    apiFetch("/api/auth/me", { method: "GET" })
      .then(async (res) => {
        const json = (await res.json().catch(() => null)) as { viewer?: Viewer | null } | null;
        if (live) {
          viewerRef.current = json?.viewer ?? null;
          setViewer(json?.viewer ?? null);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (live) setStatus("ready");
      });
    return () => {
      live = false;
    };
  }, []);

  // Concurrent calls share the same dialog: every caller is queued and all
  // are resolved with the same outcome.
  const requireSignIn = useCallback((): Promise<Viewer | null> => {
    if (viewerRef.current) return Promise.resolve(viewerRef.current);
    // Fresh dialog state per opening via `key`; concurrent calls share it.
    if (!openRef.current) {
      openRef.current = true;
      setDialogOpen(true);
      setDialogSession((s) => s + 1);
    }
    return new Promise<Viewer | null>((resolve) => {
      pendingRef.current.push(resolve);
    });
  }, []);

  const settle = useCallback((next: Viewer | null) => {
    viewerRef.current = next;
    setViewer(next);
    openRef.current = false;
    setDialogOpen(false);
    const waiting = pendingRef.current;
    pendingRef.current = [];
    for (const resolve of waiting) resolve(next);
  }, []);

  const handleSuccess = useCallback(
    (next: Viewer) => settle(next),
    [settle],
  );

  const handleDismiss = useCallback(() => settle(null), [settle]);

  const signOut = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      viewerRef.current = null;
      setViewer(null);
    }
  }, []);

  return (
    <ViewerContext.Provider value={{ viewer, status, signOut, requireSignIn }}>
      {/* Rendered but closed until requireSignIn opens it: nothing modal on render. */}
      <AuthDialog
        key={dialogSession}
        open={dialogOpen}
        onSuccess={handleSuccess}
        onDismiss={handleDismiss}
      />
      {children}
    </ViewerContext.Provider>
  );
}
