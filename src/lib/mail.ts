import "server-only";
import { requireEnv } from "./env";

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

/** Public base URL for links in emails, always with a scheme and no trailing slash. */
export function siteUrl() {
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  const raw = requireEnv("NEXT_PUBLIC_SITE_URL").trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
}

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function payload(m: Mail) {
  return {
    from: requireEnv("GREYSHIP_MAIL_FROM"),
    to: [m.to],
    subject: m.subject.replace(/[\r\n]+/g, " "),
    text: m.text,
    ...(m.html ? { html: m.html } : {}),
    ...(m.replyTo ? { reply_to: m.replyTo } : {}),
    ...(m.headers ? { headers: m.headers } : {}),
  };
}

async function post(path: string, body: unknown) {
  const res = await fetch(`https://api.resend.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text().catch(() => "")}`);
  }
}

export const sendMail = (m: Mail) => post("/emails", payload(m));

/** Send many individual emails (100 per API call, paced for Resend's rate limit). */
export async function sendMailBatch(mails: Mail[]) {
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < mails.length; i += 100) {
    const chunk = mails.slice(i, i + 100);
    try {
      await post("/emails/batch", chunk.map(payload));
      sent += chunk.length;
    } catch (err) {
      console.error("batch send failed", err);
      failed += chunk.length;
    }
    if (i + 100 < mails.length) await new Promise((r) => setTimeout(r, 600));
  }
  return { sent, failed };
}
