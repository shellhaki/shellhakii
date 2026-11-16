"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ghostButton } from "@/lib/ui";
import { post } from "./upload";

export function RefreshButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function refresh() {
    setState("busy");
    try {
      await post("/api/admin/revalidate", {});
      router.refresh();
      setState("done");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("error");
    }
  }

  return (
    <button type="button" onClick={refresh} disabled={state === "busy"} className={ghostButton}>
      {state === "busy" ? "Refreshing…" : state === "done" ? "Refreshed" : state === "error" ? "Failed, retry" : "Refresh site data"}
    </button>
  );
}
