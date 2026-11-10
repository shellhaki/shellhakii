"use server";

import { redirect } from "next/navigation";
import { endSession, passwordMatches, startSession } from "@/lib/admin-auth";

export type LoginState = { error?: string } | undefined;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");

  let ok = false;
  try {
    ok = passwordMatches(password);
  } catch (err) {
    console.error(err);
    return { error: "Admin is not configured. Set ADMIN_SECRET." };
  }

  if (!ok) {
    // Slow down brute-force attempts.
    await new Promise((r) => setTimeout(r, 800));
    return { error: "Wrong password." };
  }

  await startSession();
  redirect("/admin");
}

export async function logout() {
  await endSession();
  redirect("/admin");
}
