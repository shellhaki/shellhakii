export const site = {
  name: "shellhaki",
  title: "shellhaki",
  description:
    "Excel, also known as haki. Software engineer building fast backend systems, Go infrastructure and AI infrastructure.",
  timezone: "Africa/Lagos",
  since: 2026,
  links: {
    github: `https://github.com/${process.env.GITHUB_USERNAME ?? "shellhaki"}`,
    medium: "https://medium.com/@shellhaki",
    greylabs: "https://github.com/greylabss",
  },
} as const;

export const nav = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/projects", label: "Projects", icon: "projects" },
  { href: "/repos", label: "Repos", icon: "repos" },
  { href: "/articles", label: "Articles", icon: "articles" },
  { href: "/gallery", label: "Gallery", icon: "gallery" },
  { href: "/contact", label: "Contact", icon: "contact" },
] as const;
