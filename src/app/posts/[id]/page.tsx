import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { CommentSection } from "@/components/social/comment-section";
import { EngagementBar } from "@/components/social/engagement-bar";
import { formatDate } from "@/lib/format";
import { getPost } from "@/lib/social/posts";
import { PostBody } from "../post-body";

async function find(id: string) {
  try {
    return await getPost(id);
  } catch (err) {
    console.error("getPost failed", err);
    return null;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/posts/[id]">): Promise<Metadata> {
  const post = await find((await params).id);
  if (!post) return { title: "Post" };
  const short =
    post.body.length > 80 ? `${post.body.slice(0, 77)}…` : post.body;
  return { title: short, description: post.body.slice(0, 160) };
}

export async function PostDetail({
  params,
}: {
  params: PageProps<"/posts/[id]">["params"];
}) {
  const post = await find((await params).id);
  if (!post) notFound();
  const href = `/posts/${post.id}`;

  return (
    <article>
      <p className="font-mono text-xs text-muted">{formatDate(post.createdAt)}</p>
      <div className="mt-4">
        <PostBody body={post.body} />
      </div>
      <div className="mt-6 border-t border-line pt-4">
        <EngagementBar targetType="post" targetId={post.id} shareUrl={href} />
      </div>
      <div className="mt-4">
        <CommentSection targetType="post" targetId={post.id} defaultOpen />
      </div>
    </article>
  );
}

export default function PostPage({ params }: PageProps<"/posts/[id]">) {
  return (
    <div className="mx-auto w-full max-w-2xl pt-6 sm:pt-12">
      <Link
        href="/posts"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> Posts
      </Link>
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <PostDetail params={params} />
      </Suspense>
    </div>
  );
}
