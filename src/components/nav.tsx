"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import {
  FolderOpen,
  GitFork,
  House,
  Image as ImageIcon,
  Mail,
  PenLine,
  type LucideIcon,
} from "lucide-react";
import { nav } from "@/lib/site";
import { ThemeToggle } from "./theme-toggle";

const icons: Record<(typeof nav)[number]["icon"], LucideIcon> = {
  home: House,
  projects: FolderOpen,
  repos: GitFork,
  articles: PenLine,
  gallery: ImageIcon,
  contact: Mail,
};

function NavView({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Main"
      className="flex items-center gap-1 rounded-full border border-line bg-background/80 p-1 backdrop-blur"
    >
      {nav.map(({ href, label, icon }) => {
        const Icon = icons[icon];
        const active =
          pathname !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={`flex h-9 items-center gap-2 rounded-full px-2.5 text-sm font-medium transition-colors hover:bg-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground md:px-3 ${
              active ? "bg-line" : ""
            }`}
          >
            <Icon className="size-[18px] shrink-0" />
            {href !== "/" && <span className="hidden lg:inline">{label}</span>}
          </Link>
        );
      })}
      <span aria-hidden className="mx-1 h-5 w-px bg-line" />
      <ThemeToggle />
    </nav>
  );
}

function ActiveNav() {
  return <NavView pathname={usePathname()} />;
}

// usePathname() needs a Suspense boundary on routes with runtime params;
// the fallback is the same nav without the active highlight.
export function Nav() {
  return (
    <Suspense fallback={<NavView pathname={null} />}>
      <ActiveNav />
    </Suspense>
  );
}
