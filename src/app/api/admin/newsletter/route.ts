import { NextResponse } from "next/server";
import { adminRoute, HttpError, readJson, requireSql, text } from "@/lib/api";
import { buildDigest, digestIsEmpty, renderDigest } from "@/lib/digest";
import { requireEnv } from "@/lib/env";
import { sendMailBatch, siteUrl, type Mail } from "@/lib/mail";
import { activeRecipients } from "@/lib/subscribers";

// POST /api/admin/newsletter { note?, test? } -> send the digest to everyone
// subscribed, or only to CONTACT_TO_EMAIL when `test` is true.
export const POST = adminRoute(async (req: Request) => {
  const body = await readJson(req);
  const note = text(body.note, "note", 2000) ?? undefined;
  const test = body.test === true;
  const sql = requireSql();

  const digest = await buildDigest();
  if (digestIsEmpty(digest) && !note) {
    throw new HttpError(400, "Nothing new to send. Add a note or publish something first.");
  }

  if (!test) {
    const [last] = await sql`select max(sent_at) as at from digests`;
    if (last?.at && Date.now() - new Date(last.at).getTime() < 60_000) {
      throw new HttpError(429, "A digest was just sent. Wait a minute before sending another.");
    }
  }

  const base = siteUrl();
  const recipients = test
    ? [{ email: requireEnv("CONTACT_TO_EMAIL"), unsubscribeToken: "" }]
    : await activeRecipients();
  if (recipients.length === 0) throw new HttpError(400, "No active subscribers yet.");

  const mails: Mail[] = recipients.map((r) => {
    const unsubscribeUrl = r.unsubscribeToken
      ? `${base}/unsubscribe?token=${r.unsubscribeToken}`
      : `${base}/unsubscribe`;
    const { subject, text, html } = renderDigest(digest, { note, unsubscribeUrl });
    return {
      to: r.email,
      subject: test ? `[Test] ${subject}` : subject,
      text,
      html,
      headers: r.unsubscribeToken
        ? {
            "List-Unsubscribe": `<${base}/api/unsubscribe?token=${r.unsubscribeToken}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : undefined,
    };
  });

  const { sent, failed } = await sendMailBatch(mails);
  if (!test && sent > 0) {
    await sql`insert into digests (subject, recipients) values (${mails[0].subject}, ${sent})`;
  }
  if (sent === 0) throw new HttpError(502, "Sending failed. Check the Resend key and sender domain.");

  return NextResponse.json({ sent, failed });
});
