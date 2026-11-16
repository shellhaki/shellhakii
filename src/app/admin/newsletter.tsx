import { buildDigest, digestIsEmpty } from "@/lib/digest";
import { formatDate } from "@/lib/format";
import { listSubscribers, type Subscriber } from "@/lib/subscribers";
import { DeleteButton } from "./delete-button";
import { NewsletterActions } from "./newsletter-actions";

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export async function Newsletter() {
  const [subs, digest] = await Promise.all([
    listSubscribers().catch((err) => {
      console.error("admin: listSubscribers failed", err);
      return [] as Subscriber[];
    }),
    buildDigest().catch((err) => {
      console.error("admin: buildDigest failed", err);
      return null;
    }),
  ]);
  const active = subs.filter((s) => s.status === "active").length;
  const pending = subs.filter((s) => s.status === "pending").length;

  return (
    <section aria-labelledby="news-h" className="space-y-6">
      <h2 id="news-h" className="font-serif text-xl font-semibold">
        Newsletter
      </h2>
      <p className="text-sm text-muted">
        {plural(active, "active subscriber")}
        {pending > 0 && `, ${plural(pending, "pending confirmation")}`}
      </p>

      <div className="rounded-xl border border-line p-4 text-sm">
        <p className="font-medium">
          New since {digest ? formatDate(digest.since) : "last update"}
        </p>
        {!digest ? (
          <p className="mt-2 text-muted">Couldn&apos;t build the preview.</p>
        ) : digestIsEmpty(digest) ? (
          <p className="mt-2 text-muted">Nothing new yet. Publish something, or send just a note.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-muted">
            {digest.projects.map((p) => (
              <li key={p.title}>Project: {p.title}</li>
            ))}
            {digest.articles.map((a) => (
              <li key={a.id}>Article: {a.title}</li>
            ))}
            {digest.repos.map((r) => (
              <li key={r.name}>Repo: {r.name}</li>
            ))}
            {digest.media.length > 0 && <li>Gallery: {plural(digest.media.length, "new post")}</li>}
          </ul>
        )}
      </div>

      <NewsletterActions activeCount={active} />

      {subs.length > 0 && (
        <ul className="divide-y divide-line border-y border-line text-sm">
          {subs.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-4 py-2.5">
              <span className="min-w-0 truncate">
                {s.email} <span className="text-muted">· {s.status}</span>
              </span>
              <DeleteButton url={`/api/admin/subscribers/${s.id}`} label={s.email} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
