import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { listPosts } from "@/lib/social/posts";
import { PostsFeed } from "./posts-feed";

export const metadata: Metadata = {
  title: "Posts",
  description: "Short posts by shellhaki.",
};

export default async function PostsPage() {
  const { posts, nextCursor } = await listPosts({ limit: 10 });

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeading title="Posts" subtitle="Short thoughts, newest first" />

      <div className="mt-12">
        {posts.length === 0 ? (
          <p className="text-muted">Nothing here yet. Check back soon.</p>
        ) : (
          <PostsFeed initialPosts={posts} initialCursor={nextCursor} />
        )}
      </div>
    </div>
  );
}
