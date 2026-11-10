"use client";

import { useActionState } from "react";
import { login } from "./actions";
import { button, input } from "@/lib/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="mx-auto mt-16 w-full max-w-sm space-y-4">
      <div>
        <label htmlFor="password" className="mb-2 block text-sm text-muted">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          className={input}
        />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-red-500">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}
