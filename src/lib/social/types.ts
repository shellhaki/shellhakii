/** Shared contracts for the social layer. See specs/social-spec.md section 6. */

export const TARGET_TYPES = ["post", "project", "article", "gallery"] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export const isTargetType = (x: unknown): x is TargetType =>
  typeof x === "string" && (TARGET_TYPES as readonly string[]).includes(x);

/** Stable string key for a target, used in batch responses: `project:<id>`. */
export const targetKey = (type: TargetType, id: string) => `${type}:${id}`;

/** A signed-in person. `email` is only ever returned to that same person. */
export type Viewer = {
  id: string;
  email: string;
  displayName: string;
};

export type EngagementSummary = {
  likes: number;
  comments: number;
  /** True only when the current request has a valid viewer who liked it. */
  liked: boolean;
};

export type CommentDTO = {
  id: string;
  targetType: TargetType;
  targetId: string;
  body: string;
  createdAt: string; // ISO
  author: { displayName: string };
  /** True when the current viewer wrote it. */
  mine: boolean;
};

export type PostDTO = {
  id: string;
  body: string;
  createdAt: string; // ISO
};

export type ApiError = { error: string };
