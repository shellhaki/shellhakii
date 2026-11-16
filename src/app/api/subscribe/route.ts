import { NextResponse } from "next/server";
import { escapeHtml, sendMail, siteUrl } from "@/lib/mail";
import { clientIp, rateLimited } from "@/lib/rate-limit";
import { requestSubscription } from "@/lib/subscribers";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HOUR = 60 * 60 * 1000;
const err = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status });

// POST /api/subscribe -> start double opt-in. Always answers the same for valid
// emails so the form can't be used to discover who is subscribed.
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

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email) || email.length > 200) return err("Please enter a valid email.", 400);

  if (
    rateLimited(`sub-ip:${clientIp(req)}`, 5, HOUR) ||
    rateLimited(`sub-email:${email}`, 3, HOUR)
  ) {
    return err("Too many attempts. Try again later.", 429);
  }

  try {
    const confirmToken = await requestSubscription(email);
    if (confirmToken) {
      const url = `${siteUrl()}/api/subscribe/confirm?token=${confirmToken}`;
      await sendMail({
        to: email,
        subject: "Confirm your subscription to shellhaki",
        text: `Confirm your subscription to shellhaki by opening this link:\n\n${url}\n\nIf you didn't ask for this, ignore this email and nothing happens.`,
        html: `<div style="max-width:480px;margin:0 auto;padding:24px 20px;font:15px/1.6 system-ui,sans-serif;color:#111"><p style="font:italic 600 22px Georgia,serif;margin:0 0 16px">shellhaki</p><p>Confirm your subscription to get occasional updates on new projects, repos, articles and gallery posts.</p><p><a href="${escapeHtml(url)}" style="display:inline-block;background:#111;color:#fff;padding:10px 20px;border-radius:999px;text-decoration:none">Confirm subscription</a></p><p style="color:#888;font-size:13px">If you didn't ask for this, ignore this email and nothing happens.</p></div>`,
      });
    }
  } catch (e) {
    console.error("subscribe failed", e);
    return err("Couldn't sign you up right now. Please try again.", 502);
  }

  return NextResponse.json({ ok: true });
}
