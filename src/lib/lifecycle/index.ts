// Lifecycle message engine — sends conditional messages at key points in the guest journey
// All messages check the database before sending to avoid duplicates.

import {
  getBookingsNeedingCheckinReminder,
  getBookingsNeedingCheckoutReminder,
  getBookingsNeedingReviewRequest,
  getGuestsNeedingReturnOffer,
  getGuestsNeedingPhotoInvite,
  getOrCreateReferralCode,
  getPendingWakeupCalls,
  markWakeupSent,
  recordTemplateSent,
  recordTemplateSentByPhone,
} from "@/lib/db";
import { getHotelId, getHotel } from "@/lib/hotel-context";
import { sendText, sendButtons, sendCtaUrlButton, sendLocation } from "@/lib/whatsapp/client";

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Run all lifecycle checks. Called by the cron API route.
 * Must be called within hotelStorage.run() context.
 * Returns a summary of messages sent.
 */
export async function runLifecycleChecks(): Promise<{
  checkinReminders: number;
  checkoutReminders: number;
  reviewRequests: number;
  wakeupCalls: number;
  returnOffers: number;
  photoInvites: number;
  errors: string[];
}> {
  const hotelId = getHotelId();
  const hotel = getHotel();

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const tomorrow = addDays(today, 1);
  const twoDaysAgo = addDays(today, -2);
  const fiveDaysAgo = addDays(today, -5);
  const thirtyDaysAgo = addDays(today, -30);

  const results = {
    checkinReminders: 0,
    checkoutReminders: 0,
    reviewRequests: 0,
    wakeupCalls: 0,
    returnOffers: 0,
    photoInvites: 0,
    errors: [] as string[],
  };

  // 1. Check-in reminders (day before arrival)
  const checkinBookings = await getBookingsNeedingCheckinReminder(hotelId, tomorrow);
  for (const booking of checkinBookings) {
    try {
      await sendText(
        booking.phone,
        `Hi ${booking.guest_name}! 🌿\n\n` +
        `We're looking forward to welcoming you *tomorrow*!\n\n` +
        `📅 Check-in: *${formatDate(booking.check_in)}* from *${hotel.check_in_time}*\n` +
        `📅 Check-out: *${formatDate(booking.check_out)}* by *${hotel.check_out_time}*\n` +
        `🆔 Booking #${booking.id}\n\n` +
        `📶 WiFi details will be shared at check-in.\n\n` +
        `Need anything before your arrival? Just reply here!`
      );

      // Send location pin
      if (hotel.location_lat && hotel.location_lng) {
        await sendLocation(
          booking.phone,
          hotel.location_lat,
          hotel.location_lng,
          hotel.name,
          `${hotel.location_city || ""}, ${hotel.location_country || ""}`.trim()
        );
      }

      await recordTemplateSent(hotelId, booking.id, booking.phone, "checkin_reminder");
      results.checkinReminders++;
    } catch (err) {
      results.errors.push(`checkin_reminder booking #${booking.id}: ${err}`);
    }
  }

  // 2. Checkout reminders (morning of departure)
  const checkoutBookings = await getBookingsNeedingCheckoutReminder(hotelId, today);
  for (const booking of checkoutBookings) {
    try {
      await sendText(
        booking.phone,
        `Good morning, ${booking.guest_name}! ☀️\n\n` +
        `Just a gentle reminder that checkout is at *${hotel.check_out_time}* today.\n\n` +
        `Need a late checkout? Just reply *"Late"* and we'll check availability.\n\n` +
        `We hope you enjoyed your stay at ${hotel.name}! 🌿`
      );

      await recordTemplateSent(hotelId, booking.id, booking.phone, "checkout_reminder");
      results.checkoutReminders++;
    } catch (err) {
      results.errors.push(`checkout_reminder booking #${booking.id}: ${err}`);
    }
  }

  // 3. Review requests (2 days after checkout)
  // Google review link sent FIRST to ALL guests (no gating), then internal rating
  const reviewBookings = await getBookingsNeedingReviewRequest(hotelId, twoDaysAgo);
  for (const booking of reviewBookings) {
    try {
      // Message 1: Google review CTA (sent to ALL guests if google_place_id is configured)
      if (hotel.google_place_id) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000";
        const trackingUrl = `${baseUrl}/api/r/${hotel.slug}/${booking.id}`;

        await sendCtaUrlButton(
          booking.phone,
          `Hi ${booking.guest_name}! Thank you for staying at ${hotel.name}. 🌿\n\n` +
          `If you have a moment, a Google review would mean the world to us — ` +
          `it helps other travellers discover ${hotel.name}.`,
          "Leave a Google Review",
          trackingUrl,
        );
      }

      // Message 2: Internal rating buttons
      await sendButtons(
        booking.phone,
        hotel.google_place_id
          ? "We'd also love your private feedback. How was your stay?"
          : `Hi ${booking.guest_name}! Thank you for staying at ${hotel.name}! How would you rate your experience?`,
        [
          { id: `review_${booking.id}_5`, title: "Excellent" },
          { id: `review_${booking.id}_4`, title: "Very Good" },
          { id: `review_${booking.id}_3`, title: "Good or Below" },
        ],
      );

      await recordTemplateSent(hotelId, booking.id, booking.phone, "review_request");
      results.reviewRequests++;
    } catch (err) {
      results.errors.push(`review_request booking #${booking.id}: ${err}`);
    }
  }

  // 4. Wake-up calls
  const pendingWakeups = await getPendingWakeupCalls(hotelId, today, currentTime);
  for (const wakeup of pendingWakeups) {
    try {
      await sendText(
        wakeup.phone,
        `⏰ *Good morning!*\n\nThis is your ${wakeup.scheduled_time} wake-up call from ${hotel.name}.\n\nWe hope you have a wonderful day! 🌿`
      );

      await markWakeupSent(hotelId, wakeup.id);
      results.wakeupCalls++;
    } catch (err) {
      results.errors.push(`wakeup_call #${wakeup.id}: ${err}`);
    }
  }

  // 5. Return booking offers (30+ days after checkout, no upcoming booking)
  const returnGuests = await getGuestsNeedingReturnOffer(hotelId, thirtyDaysAgo);
  for (const booking of returnGuests) {
    try {
      const referral = await getOrCreateReferralCode(hotelId, booking.phone, hotel.slug);
      const discountPercent = hotel.referral_discount_percent || 10;

      await sendText(
        booking.phone,
        `Hi ${booking.guest_name}! 🌿\n\n` +
        `It's been a while since your stay at ${hotel.name} and we miss you!\n\n` +
        `We'd love to welcome you back with a special *${discountPercent}% discount* on your next booking.\n\n` +
        `🎁 Your code: *${referral.code}*\n\n` +
        `Just mention this code when you book, or share it with friends — they'll get ${discountPercent}% off too!\n\n` +
        `Reply *"Book"* to start a new reservation.`
      );

      await sendButtons(booking.phone, "Ready to book?", [
        { id: "book_again", title: "Book Again" },
        { id: "share_referral", title: "Share My Code" },
      ]);

      await recordTemplateSentByPhone(hotelId, booking.phone, "return_offer");
      results.returnOffers++;
    } catch (err) {
      results.errors.push(`return_offer ${booking.phone}: ${err}`);
    }
  }

  // 6. Photo sharing invitation (5 days after checkout, good review)
  const photoGuests = await getGuestsNeedingPhotoInvite(hotelId, fiveDaysAgo);
  for (const booking of photoGuests) {
    try {
      await sendText(
        booking.phone,
        `Hi ${booking.guest_name}! 📸\n\n` +
        `Thank you again for your wonderful review!\n\n` +
        `We'd love to see your favourite photos from your stay at ${hotel.name}. ` +
        `If you'd like to share any, simply send them here!\n\n` +
        `With your permission, we might feature them on our page to help other travellers discover ${hotel.name}. 🌿✨`
      );

      await recordTemplateSent(hotelId, booking.id, booking.phone, "photo_invite");
      results.photoInvites++;
    } catch (err) {
      results.errors.push(`photo_invite booking #${booking.id}: ${err}`);
    }
  }

  return results;
}
