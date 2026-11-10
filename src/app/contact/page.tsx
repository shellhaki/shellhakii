import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with shellhaki.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-xl">
      <PageHeading title="Contact" subtitle="Say hello, or let's build something" />
      <div className="mt-12">
        <ContactForm />
      </div>
    </div>
  );
}
