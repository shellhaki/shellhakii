import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { isAdmin } from "@/lib/admin-auth";
import { Dashboard } from "./dashboard";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

async function Gate() {
  // Session expiry check reads the clock, so opt into request-time rendering first.
  await connection();
  return (await isAdmin()) ? <Dashboard /> : <LoginForm />;
}

export default function AdminPage() {
  return (
    <div className="mx-auto w-full max-w-3xl pt-6 sm:pt-12">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Gate />
      </Suspense>
    </div>
  );
}
