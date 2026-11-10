import { getMedia } from "@/lib/media";
import { getProjects } from "@/lib/projects";
import { logout } from "./actions";
import { CaptionEditor } from "./caption-editor";
import { DeleteButton } from "./delete-button";
import { MediaUploader } from "./media-uploader";
import { ProjectForm } from "./project-form";
import { ProjectRow } from "./project-row";
import { ghostButton } from "@/lib/ui";

export async function Dashboard() {
  const [projects, media] = await Promise.all([getProjects(), getMedia()]);

  return (
    <div className="space-y-16 pb-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            Welcome Haki
          </h1>
          <p className="mt-2 font-serif italic text-muted">
            Upload projects and gallery media
          </p>
        </div>
        <form action={logout}>
          <button type="submit" className={ghostButton}>
            Log out
          </button>
        </form>
      </div>

      <section aria-labelledby="projects-h" className="space-y-6">
        <h2 id="projects-h" className="font-serif text-xl font-semibold">
          Projects
        </h2>
        <ProjectForm />
        {projects.length > 0 && (
          <ul className="divide-y divide-line border-y border-line">
            {projects.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="media-h" className="space-y-6">
        <h2 id="media-h" className="font-serif text-xl font-semibold">
          Gallery
        </h2>
        <MediaUploader />
        {media.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {media.map((m) => (
              <li key={m.id}>
                <div className="relative overflow-hidden rounded-xl bg-pill">
                {m.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.url}
                    alt={m.caption ?? ""}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <video
                    src={m.url}
                    muted
                    preload="metadata"
                    className="aspect-square w-full object-cover"
                  />
                )}
                <div className="absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/70 to-transparent p-2">
                  <DeleteButton
                    url={`/api/admin/media/${m.id}`}
                    label={m.caption ?? m.kind}
                    className="cursor-pointer rounded-full bg-black/60 px-3 py-1 text-xs text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                  />
                </div>
                </div>
                <CaptionEditor id={m.id} caption={m.caption} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
