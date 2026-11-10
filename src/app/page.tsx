import Link from "next/link";
import { site } from "@/lib/site";

const link =
  "text-foreground underline decoration-muted/50 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-2xl pt-10 sm:pt-16">
      <h1 className="font-script text-[8.5rem] leading-[0.8] sm:text-[13rem]">
        {site.name}
      </h1>

      <div className="mt-10 space-y-6 text-lg leading-8 text-muted">
        <p>
          I&apos;m Excel, but most people call me Haki. I&apos;m a software
          engineer who builds backend systems that don&apos;t break and run
          fast. Most of my time goes into Go, containers and AI infrastructure.
        </p>

        <p>
          I founded{" "}
          <a href={site.links.greylabs} className={link}>
            Greylabs
          </a>
          , where we build infrastructure for Go. I build open source too: a
          secrets manager, deployment infrastructure for Go backends, a backend
          provisioning system, WhatsApp automation and more. See my{" "}
          <Link href="/projects" className={link}>
            projects
          </Link>{" "}
          or browse the{" "}
          <Link href="/repos" className={link}>
            repos
          </Link>
          . Outside the product work, I dig into systems engineering and write
          about it in my{" "}
          <Link href="/articles" className={link}>
            articles
          </Link>
          .
        </p>

        <p>
          I&apos;m 18, studying software engineering at the Federal University
          of Technology, Owerri, Nigeria. I&apos;m a gopher, and a gamer too:
          Roblox, Minecraft and a few others, on PC, mobile and console.
        </p>

        <p>
          I&apos;m looking to collaborate with people in Georgia, Luxembourg,
          the UAE and beyond. If that sounds like you,{" "}
          <Link href="/contact" className={link}>
            get in touch
          </Link>
          . And if you&apos;re curious what I look like away from the keyboard,
          check out my{" "}
          <Link href="/gallery" className={link}>
            gallery
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
