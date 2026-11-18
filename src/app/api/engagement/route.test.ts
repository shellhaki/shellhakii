import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getViewer: vi.fn() }));
vi.mock("@/lib/social/engagement", () => ({ getSummaries: vi.fn() }));

import { HttpError } from "@/lib/api";
import { getViewer } from "@/lib/auth/session";
import { getSummaries } from "@/lib/social/engagement";
import { GET } from "./route";

const getViewerMock = vi.mocked(getViewer);
const getSummariesMock = vi.mocked(getSummaries);

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

const get = (targets: string | null) =>
  new Request(
    targets === null
      ? "http://localhost/api/engagement"
      : `http://localhost/api/engagement?targets=${encodeURIComponent(targets)}`,
  );

describe("engagement route", () => {
  it("AC-E4: returns the batch map keyed by type:id", async () => {
    getViewerMock.mockResolvedValue(null);
    getSummariesMock.mockResolvedValue({
      [`post:${UUID_A}`]: { likes: 2, comments: 1, liked: false },
    });
    const res = await GET(get(`post:${UUID_A}`));
    expect(res.status).toBe(200);
    expect(getSummariesMock).toHaveBeenCalledWith(
      [{ type: "post", id: UUID_A }],
      null,
    );
    expect(await res.json()).toEqual({
      [`post:${UUID_A}`]: { likes: 2, comments: 1, liked: false },
    });
  });

  it("AC-E4: forwards the viewer id for liked flags", async () => {
    getViewerMock.mockResolvedValue({
      id: UUID_B,
      email: "viewer@example.com",
      displayName: "Haki",
    });
    getSummariesMock.mockResolvedValue({});
    await GET(get(`post:${UUID_A}`));
    expect(getSummariesMock).toHaveBeenCalledWith(
      [{ type: "post", id: UUID_A }],
      UUID_B,
    );
  });

  it("AC-E4: rejects missing targets and more than 50 with 400", async () => {
    getViewerMock.mockResolvedValue(null);
    expect((await GET(get(null))).status).toBe(400);
    expect((await GET(get("  "))).status).toBe(400);
    const many = Array.from({ length: 51 }, () => `post:${UUID_A}`).join(",");
    expect((await GET(get(many))).status).toBe(400);
    expect(getSummariesMock).not.toHaveBeenCalled();
  });

  it("AC-E4: rejects unparseable entries with 400", async () => {
    getViewerMock.mockResolvedValue(null);
    const res = await GET(get("not-a-target"));
    expect(res.status).toBe(400);
  });

  it("AC-E3: invalid targets map to 404 JSON", async () => {
    getViewerMock.mockResolvedValue(null);
    getSummariesMock.mockRejectedValueOnce(new HttpError(404, "Target not found"));
    const res = await GET(get(`post:missing`));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Target not found" });
  });
});
