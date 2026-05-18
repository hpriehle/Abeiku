import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/admin/auth";
import {
  createInfluencer,
  listInfluencersForHotel,
  getInfluencerBySlug,
  getInfluencerByEmail,
  getClickCountsByInfluencer,
  isValidSlug,
  isReservedSlug,
} from "@/lib/db/influencers";
import { sendEmail } from "@/lib/notifications/email";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://abeiku.com";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [influencers, clickCounts] = await Promise.all([
    listInfluencersForHotel(session.hotelId),
    getClickCountsByInfluencer(session.hotelId),
  ]);

  return NextResponse.json({
    influencers: influencers.map((i) => ({
      id: i.id,
      slug: i.slug,
      name: i.name,
      email: i.email,
      redirect_url: i.redirect_url,
      password_set: Boolean(i.password_hash),
      created_at: i.created_at,
      last_login_at: i.last_login_at,
      total_clicks: clickCounts.get(i.id) ?? 0,
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const slug = String(body.slug ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const redirect_url = body.redirect_url ? String(body.redirect_url).trim() : "/";

    if (!slug || !name || !email) {
      return NextResponse.json(
        { error: "slug, name, and email are required" },
        { status: 400 }
      );
    }

    if (isReservedSlug(slug)) {
      return NextResponse.json({ error: `"${slug}" is a reserved slug` }, { status: 400 });
    }
    if (!isValidSlug(slug)) {
      return NextResponse.json(
        { error: "Slug must be 2-40 chars, letters/numbers/hyphens only" },
        { status: 400 }
      );
    }

    const [slugClash, emailClash] = await Promise.all([
      getInfluencerBySlug(session.hotelId, slug),
      getInfluencerByEmail(email),
    ]);
    if (slugClash) {
      return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
    }
    if (emailClash) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const invite_token = randomBytes(32).toString("hex");
    const invite_expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const influencer = await createInfluencer({
      hotel_id: session.hotelId,
      slug,
      name,
      email,
      invite_token,
      invite_expires_at,
      redirect_url,
    });

    const setupUrl = `${APP_URL}/partner/setup?token=${invite_token}`;
    const emailResult = await sendEmail({
      to: email,
      subject: `Welcome to ${session.hotelName} — set up your partner account`,
      html: `
        <h2 style="margin:0 0 16px;color:#2D4A3E;">Hi ${name},</h2>
        <p style="margin:0 0 16px;line-height:1.6;">
          You've been added as a referral partner for <strong>${session.hotelName}</strong>.
        </p>
        <p style="margin:0 0 16px;line-height:1.6;">
          Click the button below to set your password. This link expires in 24 hours.
        </p>
        <p style="margin:24px 0;">
          <a href="${setupUrl}" style="display:inline-block;background:#2D4A3E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">
            Set your password
          </a>
        </p>
        <p style="margin:0 0 8px;line-height:1.6;font-size:14px;color:#666;">
          Or copy this link: <br><code style="word-break:break-all;">${setupUrl}</code>
        </p>
      `,
    });

    return NextResponse.json(
      {
        success: true,
        influencer: {
          id: influencer.id,
          slug: influencer.slug,
          name: influencer.name,
          email: influencer.email,
        },
        email_sent: emailResult.success,
        email_error: emailResult.error,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Create influencer error:", err);
    return NextResponse.json({ error: "Failed to create influencer" }, { status: 500 });
  }
}
