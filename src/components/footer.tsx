import Link from "next/link";
import { Mail } from "lucide-react";
import { site } from "@/lib/site";

const iconClass = "size-5";

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={iconClass}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function MediumIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={iconClass}>
      <path d="M13.54 12a6.8 6.8 0 1 1-6.77-6.82A6.77 6.77 0 0 1 13.54 12Zm7.42 0c0 3.54-1.51 6.42-3.38 6.42S14.2 15.54 14.2 12s1.51-6.42 3.38-6.42S20.96 8.46 20.96 12ZM24 12c0 3.17-.53 5.75-1.19 5.75S21.62 15.17 21.62 12s.53-5.75 1.19-5.75S24 8.83 24 12Z" />
    </svg>
  );
}

const linkClass =
  "text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground";

export function Footer() {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 px-4 pb-10 pt-24 text-sm">
      <p className="text-muted">
        © {site.since} / <span className="text-foreground">{site.name}</span>
      </p>
      <div className="flex items-center gap-5">
        <a href={site.links.github} aria-label="GitHub" className={linkClass}>
          <GithubIcon />
        </a>
        <a href={site.links.medium} aria-label="Medium" className={linkClass}>
          <MediumIcon />
        </a>
        <Link href="/contact" aria-label="Contact" className={linkClass}>
          <Mail className={iconClass} />
        </Link>
      </div>
    </footer>
  );
}
