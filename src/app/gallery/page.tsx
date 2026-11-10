import type { Metadata } from "next";
import { getMedia } from "@/lib/media";
import { GalleryGrid } from "./gallery-grid";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Pictures and videos from shellhaki.",
};

export default async function GalleryPage() {
  const media = await getMedia();

  return (
    <div className="mx-auto w-full max-w-5xl pt-6 sm:pt-12">
      {media.length === 0 ? (
        <p className="mt-16 text-center text-muted">Nothing here yet. Check back soon.</p>
      ) : (
        <GalleryGrid media={media} />
      )}
    </div>
  );
}
