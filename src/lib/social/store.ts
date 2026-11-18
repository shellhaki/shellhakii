import { HttpError, requireSql } from "@/lib/api";
import type { TargetType } from "./types";

/**
 * The only file in this package that touches SQL. Every other module in
 * `src/lib/social` calls these helpers so tests can `vi.mock` this module
 * and no test needs a live database.
 */

export type TargetRef = { type: TargetType; id: string };

export type StoredComment = {
  id: string;
  subscriberId: string;
  targetType: TargetType;
  targetId: string;
  body: string;
  createdAt: string;
  displayName: string;
};

export type StoredCommentRef = {
  id: string;
  subscriberId: string;
  targetType: TargetType;
  targetId: string;
  deletedAt: string | null;
};

export type StoredPost = {
  id: string;
  body: string;
  createdAt: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (id: string): boolean => UUID_RE.test(id);

const keyOf = (type: string, id: string): string => `${type}:${id}`;

type Row = Record<string, unknown>;

const textOf = (v: unknown): string => (typeof v === "string" ? v : String(v ?? ""));

const isoOf = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : textOf(v);

const asRows = (r: unknown): Row[] => r as Row[];

/** Encode a keyset cursor: base64url("<createdAtISO>|<id>"). */
export function encodeCursor(createdAtISO: string, id: string): string {
  return Buffer.from(`${createdAtISO}|${id}`, "utf8").toString("base64url");
}

/**
 * Decode a keyset cursor. Empty/missing means the first page (null).
 * Throws HttpError(400) when malformed. Cursor ids are database uuids,
 * so anything else is rejected here instead of failing in SQL.
 */
export function decodeCursor(
  cursor: string | null | undefined,
): { createdAt: string; id: string } | null {
  if (cursor === null || cursor === undefined || cursor === "") return null;
  let raw: string;
  try {
    raw = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw new HttpError(400, "Invalid cursor");
  }
  const sep = raw.indexOf("|");
  if (sep <= 0) throw new HttpError(400, "Invalid cursor");
  const createdAt = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!id || !isUuid(id) || Number.isNaN(Date.parse(createdAt))) {
    throw new HttpError(400, "Invalid cursor");
  }
  return { createdAt, id };
}

/** True when a database-backed target row exists. */
export async function targetExists(
  type: "post" | "project" | "gallery",
  id: string,
): Promise<boolean> {
  if (!isUuid(id)) return false;
  const sql = requireSql();
  if (type === "post") {
    const rows = asRows(await sql`select 1 as one from posts where id = ${id}`);
    return rows.length > 0;
  }
  if (type === "project") {
    const rows = asRows(
      await sql`select 1 as one from projects where id = ${id}`,
    );
    return rows.length > 0;
  }
  const rows = asRows(
    await sql`select 1 as one from gallery_media where id = ${id}`,
  );
  return rows.length > 0;
}

/**
 * Batch existence probe: one query for the given type no matter how many
 * ids are passed. Used by batch summary validation to avoid N+1 lookups.
 */
export async function existingDbIds(
  type: "post" | "project" | "gallery",
  ids: string[],
): Promise<Set<string>> {
  const valid = [...new Set(ids.filter(isUuid))];
  if (valid.length === 0) return new Set<string>();
  const sql = requireSql();
  // `id::text` keeps the parameter a plain text array so no cast is needed.
  const rows =
    type === "post"
      ? asRows(await sql`select id from posts where id::text = any(${valid})`)
      : type === "project"
        ? asRows(
            await sql`select id from projects where id::text = any(${valid})`,
          )
        : asRows(
            await sql`select id from gallery_media where id::text = any(${valid})`,
          );
  return new Set(rows.map((r) => textOf(r.id)));
}

/** Idempotent insert: liking twice keeps a single row. */
export async function likeTarget(
  viewerId: string,
  type: TargetType,
  id: string,
): Promise<void> {
  const sql = requireSql();
  await sql`
    insert into likes (subscriber_id, target_type, target_id)
    values (${viewerId}, ${type}, ${id})
    on conflict (subscriber_id, target_type, target_id) do nothing
  `;
}

/** Idempotent delete: unliking without a like is a no-op. */
export async function unlikeTarget(
  viewerId: string,
  type: TargetType,
  id: string,
): Promise<void> {
  const sql = requireSql();
  await sql`
    delete from likes
    where subscriber_id = ${viewerId} and target_type = ${type} and target_id = ${id}
  `;
}

/** One query for every target: like counts keyed by `type:id`. */
export async function getLikeCounts(
  targets: TargetRef[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const t of targets) counts.set(keyOf(t.type, t.id), 0);
  if (targets.length === 0) return counts;
  const sql = requireSql();
  const keys = targets.map((t) => keyOf(t.type, t.id));
  const rows = asRows(await sql`
    select target_type, target_id, count(*) as n from likes
    where (target_type || ':' || target_id) = any(${keys})
    group by target_type, target_id
  `);
  for (const r of rows) {
    counts.set(keyOf(textOf(r.target_type), textOf(r.target_id)), Number(r.n));
  }
  return counts;
}

/** One query for every target: visible (not soft-deleted) comment counts. */
export async function getCommentCounts(
  targets: TargetRef[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const t of targets) counts.set(keyOf(t.type, t.id), 0);
  if (targets.length === 0) return counts;
  const sql = requireSql();
  const keys = targets.map((t) => keyOf(t.type, t.id));
  const rows = asRows(await sql`
    select target_type, target_id, count(*) as n from comments
    where deleted_at is null and (target_type || ':' || target_id) = any(${keys})
    group by target_type, target_id
  `);
  for (const r of rows) {
    counts.set(keyOf(textOf(r.target_type), textOf(r.target_id)), Number(r.n));
  }
  return counts;
}

/** One query for every target: which keys the viewer liked. */
export async function getViewerLikedKeys(
  viewerId: string,
  targets: TargetRef[],
): Promise<Set<string>> {
  if (targets.length === 0 || !isUuid(viewerId)) return new Set<string>();
  const sql = requireSql();
  const keys = targets.map((t) => keyOf(t.type, t.id));
  const rows = asRows(await sql`
    select target_type, target_id from likes
    where subscriber_id = ${viewerId}
      and (target_type || ':' || target_id) = any(${keys})
  `);
  return new Set(
    rows.map((r) => keyOf(textOf(r.target_type), textOf(r.target_id))),
  );
}

const toStoredComment = (r: Row): StoredComment => ({
  id: textOf(r.id),
  subscriberId: textOf(r.subscriber_id),
  targetType: textOf(r.target_type) as TargetType,
  targetId: textOf(r.target_id),
  body: textOf(r.body),
  createdAt: isoOf(r.created_at),
  displayName: typeof r.display_name === "string" ? r.display_name : "",
});

/**
 * Newest-first comment page with keyset pagination. Soft-deleted rows are
 * excluded. Returns at most `limit` rows plus the cursor for the next page.
 */
export async function listCommentsPage(
  type: TargetType,
  id: string,
  cursor: { createdAt: string; id: string } | null,
  limit: number,
): Promise<{ rows: StoredComment[]; nextCursor: string | null }> {
  const sql = requireSql();
  const take = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = asRows(
    cursor
      ? await sql`
          select c.id, c.subscriber_id, c.target_type, c.target_id,
                 c.body, c.created_at, s.display_name
          from comments c join subscribers s on s.id = c.subscriber_id
          where c.target_type = ${type} and c.target_id = ${id}
            and c.deleted_at is null
            and (c.created_at, c.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)
          order by c.created_at desc, c.id desc
          limit ${take + 1}
        `
      : await sql`
          select c.id, c.subscriber_id, c.target_type, c.target_id,
                 c.body, c.created_at, s.display_name
          from comments c join subscribers s on s.id = c.subscriber_id
          where c.target_type = ${type} and c.target_id = ${id}
            and c.deleted_at is null
          order by c.created_at desc, c.id desc
          limit ${take + 1}
        `,
  );
  const page = rows.slice(0, take);
  const last = page[page.length - 1];
  return {
    rows: page.map(toStoredComment),
    nextCursor:
      rows.length > take && last
        ? encodeCursor(isoOf(last.created_at), textOf(last.id))
        : null,
  };
}

export async function insertComment(
  viewerId: string,
  type: TargetType,
  id: string,
  body: string,
): Promise<{ id: string; createdAt: string }> {
  const sql = requireSql();
  const rows = asRows(await sql`
    insert into comments (subscriber_id, target_type, target_id, body)
    values (${viewerId}, ${type}, ${id}, ${body})
    returning id, created_at
  `);
  const row = rows[0];
  if (!row) throw new HttpError(500, "Could not save the comment");
  return { id: textOf(row.id), createdAt: isoOf(row.created_at) };
}

/** Visible (not soft-deleted) comment by id, or null. */
export async function getCommentById(id: string): Promise<StoredCommentRef | null> {
  if (!isUuid(id)) return null;
  const sql = requireSql();
  const rows = asRows(await sql`
    select id, subscriber_id, target_type, target_id, deleted_at
    from comments where id = ${id} and deleted_at is null
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    id: textOf(row.id),
    subscriberId: textOf(row.subscriber_id),
    targetType: textOf(row.target_type) as TargetType,
    targetId: textOf(row.target_id),
    deletedAt: row.deleted_at === null ? null : isoOf(row.deleted_at),
  };
}

export async function softDeleteComment(id: string): Promise<void> {
  const sql = requireSql();
  await sql`update comments set deleted_at = now() where id = ${id}`;
}

const toStoredPost = (r: Row): StoredPost => ({
  id: textOf(r.id),
  body: textOf(r.body),
  createdAt: isoOf(r.created_at),
});

/** Newest-first post page with keyset pagination. */
export async function listPostsPage(
  cursor: { createdAt: string; id: string } | null,
  limit: number,
): Promise<{ rows: StoredPost[]; nextCursor: string | null }> {
  const sql = requireSql();
  const take = Math.max(1, Math.min(50, Math.floor(limit)));
  const rows = asRows(
    cursor
      ? await sql`
          select id, body, created_at from posts
          where (created_at, id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)
          order by created_at desc, id desc
          limit ${take + 1}
        `
      : await sql`
          select id, body, created_at from posts
          order by created_at desc, id desc
          limit ${take + 1}
        `,
  );
  const page = rows.slice(0, take);
  const last = page[page.length - 1];
  return {
    rows: page.map(toStoredPost),
    nextCursor:
      rows.length > take && last
        ? encodeCursor(isoOf(last.created_at), textOf(last.id))
        : null,
  };
}

export async function getPostRow(id: string): Promise<StoredPost | null> {
  if (!isUuid(id)) return null;
  const sql = requireSql();
  const rows = asRows(
    await sql`select id, body, created_at from posts where id = ${id}`,
  );
  const row = rows[0];
  return row ? toStoredPost(row) : null;
}

export async function createPostRow(body: string): Promise<{ id: string }> {
  const sql = requireSql();
  const rows = asRows(await sql`
    insert into posts (body) values (${body}) returning id
  `);
  const row = rows[0];
  if (!row) throw new HttpError(500, "Could not create the post");
  return { id: textOf(row.id) };
}

export async function updatePostRow(
  id: string,
  body: string,
): Promise<StoredPost | null> {
  if (!isUuid(id)) return null;
  const sql = requireSql();
  const rows = asRows(await sql`
    update posts set body = ${body}, updated_at = now()
    where id = ${id}
    returning id, body, created_at
  `);
  const row = rows[0];
  return row ? toStoredPost(row) : null;
}

export async function deletePostRow(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;
  const sql = requireSql();
  const rows = asRows(
    await sql`delete from posts where id = ${id} returning id`,
  );
  return rows.length > 0;
}
