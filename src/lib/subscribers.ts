import "server-only";
import { randomBytes } from "node:crypto";
import { getSql } from "./db";

const token = () => randomBytes(24).toString("hex");

function sql() {
  const client = getSql();
  if (!client) throw new Error("Missing required env var: DATABASE_URL");
  return client;
}

export type Subscriber = {
  id: string;
  email: string;
  status: "pending" | "active" | "unsubscribed";
  createdAt: string;
};

/**
 * Start (or restart) a subscription. Returns a confirm token when a confirmation
 * email must be sent, or null when the address is already active.
 */
export async function requestSubscription(email: string): Promise<string | null> {
  const rows = await sql()`
    insert into subscribers (email, status, confirm_token, unsubscribe_token)
    values (${email}, 'pending', ${token()}, ${token()})
    on conflict (email) do update set
      status = case when subscribers.status = 'active' then 'active' else 'pending' end,
      confirm_token = case when subscribers.status = 'active' then null else excluded.confirm_token end
    returning status, confirm_token
  `;
  return rows[0].status === "pending" ? rows[0].confirm_token : null;
}

export async function unsubscribeTokenFor(email: string): Promise<string | null> {
  const rows = await sql()`select unsubscribe_token from subscribers where email = ${email}`;
  return rows[0]?.unsubscribe_token ?? null;
}

export async function confirmSubscription(confirmToken: string) {
  const rows = await sql()`
    update subscribers
    set status = 'active', confirmed_at = now(), confirm_token = null
    where confirm_token = ${confirmToken} and status = 'pending'
    returning id
  `;
  return rows.length > 0;
}

export async function unsubscribe(unsubscribeToken: string) {
  const rows = await sql()`
    update subscribers
    set status = 'unsubscribed', unsubscribed_at = now(), confirm_token = null
    where unsubscribe_token = ${unsubscribeToken}
    returning id
  `;
  return rows.length > 0;
}

export async function activeRecipients(): Promise<{ email: string; unsubscribeToken: string }[]> {
  const rows = await sql()`
    select email, unsubscribe_token from subscribers where status = 'active' order by created_at
  `;
  return rows.map((r) => ({ email: r.email, unsubscribeToken: r.unsubscribe_token }));
}

export async function listSubscribers(): Promise<Subscriber[]> {
  const rows = await sql()`
    select id, email, status, created_at from subscribers order by created_at desc limit 200
  `;
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function deleteSubscriber(id: string) {
  const rows = await sql()`delete from subscribers where id = ${id} returning id`;
  return rows.length > 0;
}
