import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeading } from "@/components/page-heading";
import { button } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

async function Body({ searchParams }: { searchParams: PageProps<"/unsubscribe">["searchParams"] }) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" && /^[0-9a-f]{48}$/.test(raw) ? raw : null;

  if (!token) {
    return (
      <p className="mt-10 leading-8 text-muted">
        This unsubscribe link isn&apos;t valid. Use the link at the bottom of any email I sent you,
        or{" "}
        <Link
          href="/contact"
          className="text-foreground underline decoration-muted/50 underline-offset-4"
        >
          contact me
        </Link>
        .
      </p>
    );
  }

  // A button (not a bare link) so email scanners that prefetch links don't unsubscribe anyone.
  return (
    <form method="post" action="/api/unsubscribe" className="mt-10">
      <input type="hidden" name="token" value={token} />
      <p className="mb-6 leading-8 text-muted">Stop getting update emails from me?</p>
      <button type="submit" className={button}>
        Unsubscribe
      </button>
    </form>
  );
}

export default function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeading title="Unsubscribe" subtitle="Leave the mailing list" />
      <Suspense fallback={<p className="mt-10 text-muted">Loading…</p>}>
        <Body searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
