import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

// Next's cache helpers only work inside the Next runtime; make them no-ops in tests.
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

// `connection()` needs a live Next request scope; route tests call handlers directly.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => {}),
}));

if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());
}
