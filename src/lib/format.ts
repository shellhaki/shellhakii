const longDate = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "May 8, 2026", fixed to UTC so server and client agree. */
export const formatDate = (iso: string) => longDate.format(new Date(iso));
