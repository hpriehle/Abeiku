// POST /api/signup — Create a new hotel + admin user

import { NextRequest, NextResponse } from "next/server";
import { createHotel, createAdminUser, getAdminUserByEmail, getHotelBySlug, seedDefaultNotificationPreferences } from "@/lib/db";
import { hashPassword } from "@/lib/admin/auth";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { hotelName, email, password, contactPhone, locationCity, locationCountry, currency } = body;

    if (!hotelName || !email || !password) {
      return NextResponse.json({ error: "Hotel name, email, and password are required" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Check for existing email
    const existingUser = await getAdminUserByEmail(email);
    if (existingUser) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    // Generate unique slug
    let slug = slugify(hotelName);
    let existing = await getHotelBySlug(slug);
    let attempt = 0;
    while (existing) {
      attempt++;
      slug = `${slugify(hotelName)}-${attempt}`;
      existing = await getHotelBySlug(slug);
    }

    // Create hotel
    const hotel = await createHotel({
      name: hotelName,
      slug,
      contact_phone: contactPhone || null,
      contact_email: email,
      location_city: locationCity || null,
      location_country: locationCountry || null,
      currency: currency || "GHS",
    });

    // Create admin user
    const passwordHash = await hashPassword(password);
    await createAdminUser({
      hotel_id: hotel.id,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      name: hotelName,
      role: "admin",
    });

    // Seed default notification preferences (email on, WhatsApp off)
    await seedDefaultNotificationPreferences(hotel.id);

    return NextResponse.json({
      success: true,
      hotelId: hotel.id,
      slug: hotel.slug,
    });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json({ error: "Failed to create hotel" }, { status: 500 });
  }
}
