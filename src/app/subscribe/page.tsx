import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { SubscribeForm } from "@/components/subscribe-form";

export const metadata: Metadata = {
  title: "Subscribe",
  description: "Get occasional updates on new projects, repos, articles and gallery posts.",
};

export default function SubscribePage() {
  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeading title="Subscribe" subtitle="Stay up to date with what I build and write" />
      <p className="mt-10 leading-8 text-muted">
        Occasional emails when I publish a new project, repo, article or gallery post. No spam,
        and you can unsubscribe in one click.
      </p>
      <div className="mt-8">
        <SubscribeForm />
      </div>
    </div>
  );
}
