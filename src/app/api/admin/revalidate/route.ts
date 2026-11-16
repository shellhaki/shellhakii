import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/api";

// POST /api/admin/revalidate -> drop cached Medium, GitHub, project and gallery data now.
export const POST = adminRoute(async () => {
  for (const tag of ["articles", "repos", "projects", "media"]) {
    revalidateTag(tag, { expire: 0 });
  }
  return NextResponse.json({ ok: true });
});
