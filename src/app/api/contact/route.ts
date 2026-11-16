import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";
import { clientIp, rateLimited } from "@/lib/rate-limit";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const err = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status });

// POST /api/contact -> validate, then send via Resend.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Invalid request", 400);
  }

  // Honeypot: real users never fill this hidden field.
  if (typeof body.website === "string" && body.website) {
    return NextResponse.json({ ok: true });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name || name.length > 100) return err("Please enter your name.", 400);
  if (!EMAIL.test(email) || email.length > 200) return err("Please enter a valid email.", 400);
  if (message.length < 10) return err("Message is too short.", 400);
  if (message.length > 4000) return err("Message is too long (max 4000 characters).", 400);

  // 5 messages per hour per IP (best-effort, in-memory).
  if (rateLimited(`contact:${clientIp(req)}`, 5, 60 * 60 * 1000)) return err("Too many messages. Try again later.", 429);

  let config: { key: string; to: string; from: string };
  try {
    config = {
      key: requireEnv("RESEND_API_KEY"),
      to: requireEnv("CONTACT_TO_EMAIL"),
      from: requireEnv("GREYSHIP_MAIL_FROM"),
    };
  } catch (e) {
    console.error(e);
    return err("The contact form isn't set up yet.", 503);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [config.to],
      reply_to: email,
      subject: `New message from ${name.replace(/[\r\n]+/g, " ")}`,
      text: `From: ${name} <${email}>\n\n${message}`,
    }),
  });

  if (!res.ok) {
    console.error("Resend failed", res.status, await res.text().catch(() => ""));
    return err("Couldn't send your message. Please try again.", 502);
  }
  return NextResponse.json({ ok: true });
}
