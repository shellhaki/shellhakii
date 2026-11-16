import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/page-heading";

const messages = {
  confirmed: {
    title: "You're in",
    subtitle: "Subscription confirmed",
    body: "Thanks for subscribing. You'll get an email when I publish something new.",
  },
  unsubscribed: {
    title: "Unsubscribed",
    subtitle: "You won't get any more emails",
    body: "You've been removed from the list. You can subscribe again any time.",
  },
  invalid: {
    title: "Link not valid",
    subtitle: "This link is invalid or already used",
    body: "If you were trying to confirm a subscription, request a new email from the subscribe form.",
  },
} as const;

type Status = keyof typeof messages;

export const metadata: Metadata = {
  title: "Subscribe",
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return Object.keys(messages).map((status) => ({ status }));
}

export default async function SubscribeStatusPage({
  params,
}: PageProps<"/subscribe/[status]">) {
  const { status } = await params;
  if (!(status in messages)) notFound();
  const m = messages[status as Status];

  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeading title={m.title} subtitle={m.subtitle} />
      <p className="mt-10 leading-8 text-muted">{m.body}</p>
      <p className="mt-6">
        <Link
          href={status === "invalid" ? "/subscribe" : "/"}
          className="text-foreground underline decoration-muted/50 underline-offset-4 hover:decoration-foreground"
        >
          {status === "invalid" ? "Go to subscribe" : "Back home"}
        </Link>
      </p>
    </div>
  );
}
