import Link from "next/link";
import { EngagementBar } from "@/components/social/engagement-bar";
import { formatDate } from "@/lib/format";
import type { PostDTO } from "@/lib/social/types";
import { PostBody } from "./post-body";

export function PostCard({ post }: { post: PostDTO }) {
  const href = `/posts/${post.id}`;
  return (
    <article className="rounded-2xl border border-line p-5">
      <p className="font-mono text-xs text-muted">
        <Link
          href={href}
          className="underline decoration-muted/50 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
        >
          {formatDate(post.createdAt)}
        </Link>
      </p>
      <div className="mt-3">
        <PostBody body={post.body} />
      </div>
      <div className="mt-4 border-t border-line pt-3">
        <EngagementBar targetType="post" targetId={post.id} shareUrl={href} />
      </div>
    </article>
  );
}
