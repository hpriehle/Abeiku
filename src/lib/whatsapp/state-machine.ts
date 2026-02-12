// Conversation state machine — handles button replies and routes to actions

import {
  getConversation,
  upsertConversation,
  determineGuestState,
  getActiveBooking,
  getActiveBookings,
  getRecentBooking,
  createBooking,
  updateBooking,
  createReview,
  createWakeupCall,
  getOrCreateReferralCode,
  lookupReferralCode,
  useReferralCode,
  getHotelRooms,
  getHotelRoomBySlug,
  getRoomAvailability,
  getRoomGroupMembers,
} from "@/lib/db";
import { getHotelId, getHotel } from "@/lib/hotel-context";
import { isAvailable, createBookingEvent, updateBookingEvent, deleteBookingEvent } from "@/lib/calendar";
import { interpretMessage, Intent } from "@/lib/ai";
import { calculateFee } from "@/lib/payments/momo";
import { initializePayment } from "@/lib/payments/paystack";
import { chargeMobileMoney, submitChargeOTP, type MoMoProvider } from "@/lib/payments/paystack-momo";
import { notifyOwner } from "@/lib/notifications";
import {
  trackedSendText as sendText,
  trackedSendButtons as sendButtons,
  trackedSendList as sendList,
  trackedSendCtaUrlButton as sendCtaUrlButton,
  trackedSendImage as sendImage,
  setTrackingContext,
  clearTrackingContext,
} from "./tracked-client";
import { isSimulatorMode } from "./simulator-context";
import { logMessage, logEvent } from "./chat-logger";
import {
  Conversation,
  ConversationContext,
  GuestState,
  WhatsAppMessage,
} from "./types";

// --- Guest-state-aware greeting ---

function getGreetingButtons(state: GuestState) {
  switch (state) {
    case "lead":
      return [
        { id: "book_now", title: "Book Now" },
        { id: "view_rooms", title: "View Rooms" },
        { id: "contact_us", title: "Contact Us" },
      ];
    case "booking_pending":
      return [
        { id: "my_booking", title: "My Booking" },
        { id: "modify_booking", title: "Modify Booking" },
        { id: "contact_us", title: "Contact Us" },
      ];
    case "current_guest":
      return [
        { id: "room_service", title: "Room Service" },
        { id: "concierge", title: "Concierge" },
        { id: "my_booking", title: "My Booking" },
      ];
    case "checked_out":
      return [
        { id: "book_again", title: "Book Again" },
        { id: "leave_review", title: "Leave Review" },
        { id: "contact_us", title: "Contact Us" },
      ];
  }
}

function getGreetingText(state: GuestState, guestName?: string | null): string {
  const name = guestName ? `, ${guestName}` : "";
  const hotelName = getHotel().name;

  switch (state) {
    case "lead":
      return `Welcome to ${hotelName}${name}! 🌿\n\nWe're a boutique hotel in Ghana offering a serene escape. How can we help you today?`;
    case "booking_pending":
      return `Welcome back${name}! 🌿\n\nWe're looking forward to your stay. What can we help you with?`;
    case "current_guest":
      return `Hi${name}! 🌿\n\nWe hope you're enjoying your stay. How can we assist you?`;
    case "checked_out":
      return `Hi${name}! 🌿\n\nThank you for staying with us. We'd love to welcome you back!`;
  }
}

// --- Main message handler ---

export async function handleMessage(message: WhatsAppMessage, senderPhone: string, senderName?: string) {
  const hotelId = getHotelId();

  // Determine guest state from bookings
  const guestState = await determineGuestState(hotelId, senderPhone);

  // Get or create conversation
  let conversation = await getConversation(hotelId, senderPhone);
  if (!conversation) {
    conversation = await upsertConversation(hotelId, senderPhone, {
      guest_state: guestState,
      step: "idle",
      guest_name: senderName,
    });
  } else {
    // Update guest state if it changed (e.g., check-in date arrived)
    if (conversation.guest_state !== guestState) {
      conversation = await upsertConversation(hotelId, senderPhone, { guest_state: guestState });
    }
    // Update name if we got one and didn't have it
    if (senderName && !conversation.guest_name) {
      conversation = await upsertConversation(hotelId, senderPhone, { guest_name: senderName });
    }
  }

  // Log inbound message
  logMessage({
    hotelId,
    conversationId: conversation.id,
    phone: senderPhone,
    direction: "inbound",
    messageType: message.type,
    body:
      message.text?.body ??
      message.interactive?.button_reply?.title ??
      message.interactive?.list_reply?.title ??
      `[${message.type}]`,
    rawPayload: message as unknown as object,
    waMessageId: message.id,
    senderType: "guest",
    senderName: senderName,
    guestState: guestState,
    step: conversation.step,
  });

  // Set tracking context for outbound message auto-logging
  setTrackingContext({
    conversationId: conversation.id,
    phone: senderPhone,
    guestState: guestState,
    step: conversation.step,
  });

  try {
    // Extract the action (button reply ID or text)
    const action = getAction(message);

    // Route based on current step or button action
    if (action) {
      await routeAction(senderPhone, action, conversation.guest_state, conversation);
    } else {
      // No recognizable action — send greeting with context-aware buttons
      await sendGreeting(senderPhone, guestState, conversation.guest_name);
    }
  } finally {
    clearTrackingContext();
  }
}

function getAction(message: WhatsAppMessage): string | null {
  // Button reply
  if (message.type === "interactive" && message.interactive?.button_reply) {
    return message.interactive.button_reply.id;
  }

  // List reply
  if (message.type === "interactive" && message.interactive?.list_reply) {
    return message.interactive.list_reply.id;
  }

  // Text message
  if (message.type === "text" && message.text?.body) {
    return `text:${message.text.body}`;
  }

  // Image message (photo sharing)
  if (message.type === "image") {
    return "photo_received";
  }

  return null;
}

async function sendGreeting(phone: string, state: GuestState, guestName?: string | null) {
  const text = getGreetingText(state, guestName);
  const buttons = getGreetingButtons(state);
  await sendButtons(phone, text, buttons, getHotel().name);
}

// --- Action router ---

async function routeAction(
  phone: string,
  action: string,
  guestState: GuestState,
  conversation: Conversation | null
) {
  const hotelId = getHotelId();

  // Handle button actions
  switch (action) {
    case "book_now":
    case "book_again":
      await handleBookingStart(phone);
      break;

    case "view_rooms":
      await handleViewRooms(phone);
      break;

    case "my_booking":
      await handleMyBooking(phone);
      break;

    case "modify_booking":
      await handleModifyBooking(phone);
      break;

    case "contact_us":
      await handleContactUs(phone);
      break;

    case "room_service":
      await handleRoomService(phone);
      break;

    case "concierge":
      await handleConcierge(phone);
      break;

    case "leave_review":
      await handleLeaveReview(phone);
      break;

    case "confirm_booking":
      await handleConfirmBooking(phone);
      break;

    case "cancel_flow":
      await upsertConversation(hotelId, phone, { step: "idle", context: {} });
      await sendText(phone, "Booking cancelled. No worries!");
      await sendGreeting(phone, guestState, conversation?.guest_name);
      break;

    case "change_dates":
      await handleChangeDates(phone);
      break;

    case "cancel_booking":
      await handleCancelBooking(phone);
      break;

    case "confirm_cancel":
      await handleConfirmCancel(phone);
      break;

    case "concierge_recommend":
      await handleConciergeRecommendations(phone);
      break;

    case "concierge_wakeup":
      await handleWakeupCall(phone);
      break;

    case "concierge_help":
      await handleContactUs(phone);
      break;

    case "share_referral":
      await handleShareReferral(phone);
      break;

    case "photo_received":
      await handlePhotoReceived(phone, conversation?.guest_name);
      break;

    case "pick_dates":
      await handlePickDates(phone);
      break;

    case "pick_room":
      await handlePickRoom(phone);
      break;

    case "skip_payment":
      await upsertConversation(hotelId, phone, { step: "done", context: {} });
      await sendText(phone, "No problem! You can pay anytime before your check-in. Just message us when you're ready. 🌿");
      break;

    case "add_another_room":
      await handleAddAnotherRoom(phone);
      break;

    case "no_thanks":
      await sendText(phone, "Great! Your booking is all set. 🌿");
      break;

    case "confirm_momo_yes": {
      // Guest confirmed their WhatsApp number is their MoMo number
      const ctx = conversation?.context ?? {};
      if (ctx.momo_booking_id) {
        const network = (ctx.momo_network as MoMoProvider) || "mtn";
        await processMoMoPayment(phone, ctx.momo_booking_id as string, phone, network);
      }
      break;
    }

    case "confirm_momo_different":
      // Guest wants to use a different MoMo number
      await upsertConversation(hotelId, phone, { step: "momo_number_input" });
      await sendText(phone, "Please enter your Mobile Money phone number (e.g. 0551234567 or 233551234567):");
      break;

    case "momo_net_mtn":
      await handleMoMoNetworkSelected(phone, "mtn");
      break;

    case "momo_net_vod":
      await handleMoMoNetworkSelected(phone, "vod");
      break;

    case "momo_net_atl":
      await handleMoMoNetworkSelected(phone, "atl");
      break;

    default:
      // Handle payment actions
      if (action.startsWith("pay_momo_")) {
        const bookingId = action.replace("pay_momo_", "");
        await handleMoMoPayment(phone, bookingId);
        break;
      }

      if (action.startsWith("pay_card_")) {
        const bookingId = action.replace("pay_card_", "");
        await handleCardPayment(phone, bookingId);
        break;
      }

      // Handle review rating buttons (review_{bookingId}_{rating})
      if (action.startsWith("review_")) {
        const parts = action.split("_");
        const rating = parseInt(parts[parts.length - 1]);
        const bookingId = parts.slice(1, -1).join("_");
        await handleReviewRating(phone, bookingId, rating);
        break;
      }

      // Handle room browsing selection
      if (action.startsWith("browse_")) {
        const roomSlug = action.replace("browse_", "");
        await handleRoomBrowseSelected(phone, roomSlug);
        break;
      }

      // Handle "Book This Room" from browsing view
      if (action.startsWith("book_room_")) {
        const roomSlug = action.replace("book_room_", "");
        await handleBookRoom(phone, roomSlug);
        break;
      }

      // Handle room selection from list
      if (action.startsWith("room_")) {
        await handleRoomSelected(phone, action);
        break;
      }

      // Handle rooms count selection
      if (action.startsWith("rooms_count_")) {
        await handleRoomsCountSelected(phone, action);
        break;
      }

      // Handle text messages — AI interprets free text and routes to actions
      if (action.startsWith("text:")) {
        const text = action.slice(5);
        // Check conversation step for expected text input first
        if (conversation?.step === "guest_count") {
          await handleGuestCountInput(phone, text);
        } else if (conversation?.step === "date_selection" && /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(text)) {
          await handleDateInput(phone, text);
        } else if (conversation?.step === "modify_dates") {
          await handleModifyDateInput(phone, text);
        } else if (conversation?.step === "guest_info") {
          await handleGuestNameInput(phone, text);
        } else if (conversation?.step === "review_feedback") {
          await handleReviewFeedback(phone, text);
        } else if (conversation?.step === "room_service_order") {
          await handleRoomServiceOrder(phone, text);
        } else if (conversation?.step === "momo_number_input") {
          await handleMoMoNumberInput(phone, text);
        } else if (conversation?.step === "momo_otp_input") {
          await handleMoMoOTPInput(phone, text);
        } else if (conversation?.step === "room_selection" && conversation?.context?.check_in) {
          // Path A fallback: dates already selected, re-show available rooms if list failed
          await handleShowAvailableRooms(phone);
        } else if (!conversation || conversation.step === "idle") {
          // Idle or first interaction — always show state-based greeting
          await sendGreeting(phone, guestState, conversation?.guest_name);
        } else {
          // Check for pending wake-up call time
          const ctx = conversation?.context ?? {};
          if (ctx.awaiting_wakeup) {
            const wakeupTime = parseWakeupTime(text);
            if (wakeupTime) {
              const tomorrow = new Date();
              // If it's past this time today, schedule for tomorrow
              const now = new Date();
              const [h, m] = wakeupTime.split(":").map(Number);
              let scheduledDate: string;
              if (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes())) {
                tomorrow.setDate(tomorrow.getDate() + 1);
                scheduledDate = tomorrow.toISOString().split("T")[0];
              } else {
                scheduledDate = now.toISOString().split("T")[0];
              }

              await createWakeupCall(hotelId, {
                phone,
                booking_id: ctx.booking_id as string | undefined,
                scheduled_date: scheduledDate,
                scheduled_time: wakeupTime,
              });

              await upsertConversation(hotelId, phone, { step: "idle", context: {} });

              const displayTime = formatTime(wakeupTime);
              await sendText(
                phone,
                `✅ Wake-up call set for *${displayTime}* on *${formatDate(scheduledDate)}*.\n\nSweet dreams! 😴🌿`
              );
              break;
            } else {
              await sendText(phone, "I couldn't understand that time. Please try again — for example: _6:30 AM_ or _07:00_");
              break;
            }
          }

          // Check for referral code (HOTELSLUG-XXXXX)
          const hotel = getHotel();
          const prefix = hotel.slug.toUpperCase();
          const referralPattern = new RegExp(`${prefix}-[A-Z0-9]{5}`);
          const referralMatch = text.trim().toUpperCase().match(referralPattern);
          if (referralMatch) {
            const code = referralMatch[0];
            const referral = await lookupReferralCode(hotelId, code);
            if (referral) {
              if (referral.referrer_phone === phone) {
                await sendText(phone, "That's your own referral code! Share it with friends so they can get a discount. 😊");
              } else {
                // Store in context for use during booking
                const currentCtx: ConversationContext & { referral_code?: string; discount_percent?: number } =
                  conversation?.context ?? {};
                currentCtx.referral_code = code;
                currentCtx.discount_percent = referral.discount_percent;
                await upsertConversation(hotelId, phone, { context: currentCtx });

                await sendText(
                  phone,
                  `🎁 Referral code *${code}* applied! You'll get *${referral.discount_percent}% off* your booking.\n\nReady to book?`
                );
                await sendButtons(phone, "What would you like to do?", [
                  { id: "book_now", title: "Book Now" },
                  { id: "view_rooms", title: "View Rooms" },
                ]);
              }
              break;
            } else {
              await sendText(phone, "That referral code isn't valid or has been fully used. Please check and try again.");
              break;
            }
          }

          // Check if text is a rating number (1-5) from a review request
          const rating = parseInt(text.trim());
          if (rating >= 1 && rating <= 5 && guestState === "checked_out") {
            const booking = await getRecentBooking(hotelId, phone);
            if (booking) {
              await handleReviewRating(phone, booking.id, rating);
              break;
            }
          }
          // AI interprets the message
          await handleFreeText(phone, text, guestState, conversation);
        }
        break;
      }

      // Fallback
      await sendGreeting(phone, guestState, conversation?.guest_name);
  }
}

// --- Handlers ---

// --- Booking flow: guest count → room selection → date picker → name → confirm ---

async function handleBookingStart(phone: string) {
  const hotelId = getHotelId();
  await upsertConversation(hotelId, phone, { step: "guest_count", context: {} });
  await sendText(phone, "Great, let's get you booked! 🌿\n\nHow many guests will be staying? _(Enter a number)_");
}

async function handleGuestCountInput(phone: string, text: string) {
  const hotelId = getHotelId();
  const count = parseInt(text.trim());

  if (isNaN(count) || count < 1 || count > 20) {
    await sendText(phone, "Please enter a number between 1 and 20.");
    return;
  }

  // Check at least one room can fit this guest count
  const rooms = await getHotelRooms(hotelId);
  const hasOptions = rooms.some((room) =>
    room.pricing_tiers.some((tier) => tier.rooms * room.occupancy >= count)
  );

  if (!hasOptions) {
    await sendText(
      phone,
      `We don't have a single room option for ${count} guests. You may need to book multiple rooms — please contact us and we'll help!`
    );
    await sendButtons(phone, "What would you like to do?", [
      { id: "book_now", title: "Try Again" },
      { id: "contact_us", title: "Contact Us" },
    ]);
    return;
  }

  await upsertConversation(hotelId, phone, {
    step: "idle",
    context: { guest_count: count },
  });

  await sendButtons(
    phone,
    `Got it — ${count} guest${count > 1 ? "s" : ""}! How would you like to search?`,
    [
      { id: "pick_dates", title: "Find Available Dates" },
      { id: "pick_room", title: "Choose a Room" },
    ]
  );
}

// --- Path A: dates first ---

async function handlePickDates(phone: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const conversation = await getConversation(hotelId, phone);
  const guestCount = conversation?.context?.guest_count || 1;

  await upsertConversation(hotelId, phone, { step: "date_selection" });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const simSuffix = isSimulatorMode() ? "&sim=1" : "";
  const url = `${appUrl}/booking/dates?hotel=${hotel.slug}&phone=${phone}&guests=${guestCount}${simSuffix}`;

  await sendCtaUrlButton(
    phone,
    "Tap below to select your check-in and check-out dates:",
    "Pick Your Dates",
    url,
    "Date Selection"
  );
}

// --- Path B: room first ---

async function handlePickRoom(phone: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const conversation = await getConversation(hotelId, phone);
  const guestCount = conversation?.context?.guest_count || 1;

  const rooms = await getHotelRooms(hotelId);

  // Filter rooms that can accommodate this guest count
  const qualifyingRooms = rooms
    .map((room) => {
      const qualifyingTiers = room.pricing_tiers.filter(
        (tier) => tier.rooms * room.occupancy >= guestCount
      );
      return qualifyingTiers.length > 0 ? { ...room, pricing_tiers: qualifyingTiers } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (qualifyingRooms.length === 0) {
    await sendText(phone, "No rooms match your guest count. Let's try again.");
    await handleBookingStart(phone);
    return;
  }

  await upsertConversation(hotelId, phone, { step: "room_selection" });

  const sections = qualifyingRooms.map((room) => ({
    title: room.name,
    rows: room.pricing_tiers.map((tier) => ({
      id: `room_${room.slug}_${tier.rooms}`,
      title: tier.label,
      description: `${hotel.currency} ${tier.price}/night · 👥 Up to ${tier.rooms * room.occupancy} guests`,
    })),
  }));

  const roomSummaries = qualifyingRooms
    .map(
      (room) =>
        `*${room.name}*${room.tagline ? ` — ${room.tagline}` : ""}\n🛏️ ${room.bed_type || "Comfortable beds"} · 👥 Up to ${room.occupancy} guests`
    )
    .join("\n\n");

  await sendList(
    phone,
    `🏡 *${hotel.name}*\n\n${roomSummaries}\n\nSelect a room option below:`,
    "Choose Room",
    sections,
    "Our Rooms"
  );
}

// --- Show available rooms (used by Path A after dates selected, and as fallback) ---

async function handleShowAvailableRooms(phone: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const conversation = await getConversation(hotelId, phone);
  const ctx = conversation?.context ?? {};
  const guestCount = (ctx.guest_count as number) || 1;
  const checkIn = ctx.check_in as string;
  const checkOut = ctx.check_out as string;

  if (!checkIn || !checkOut) {
    await sendText(phone, "Let's start with your dates first.");
    await handlePickDates(phone);
    return;
  }

  const availability = await getRoomAvailability(hotelId, checkIn, checkOut);

  // Filter: rooms with availability that can fit the guest count
  const available = availability
    .map(({ room, availableRooms }) => {
      const tiers = room.pricing_tiers.filter(
        (tier) => tier.rooms <= availableRooms && tier.rooms * room.occupancy >= guestCount
      );
      return tiers.length > 0 ? { room, tiers, availableRooms } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const nights = Math.ceil(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
  );

  const fmtDate = (d: string) => {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  if (available.length === 0) {
    await upsertConversation(hotelId, phone, { step: "date_selection" });
    await sendText(
      phone,
      `Sorry, no rooms are available for ${fmtDate(checkIn)} → ${fmtDate(checkOut)} with ${guestCount} guest${guestCount > 1 ? "s" : ""}. Please try different dates.`
    );
    await sendButtons(phone, "What would you like to do?", [
      { id: "pick_dates", title: "Try Different Dates" },
      { id: "contact_us", title: "Contact Us" },
    ]);
    return;
  }

  await upsertConversation(hotelId, phone, { step: "room_selection" });

  const sections = available.map(({ room, tiers }) => ({
    title: room.name,
    rows: tiers.map((tier) => ({
      id: `room_${room.slug}_${tier.rooms}`,
      title: tier.label,
      description: `${hotel.currency} ${tier.price}/night · ${nights} nights · Total: ${hotel.currency} ${tier.price * nights}`,
    })),
  }));

  const roomSummaries = available
    .map(
      ({ room }) =>
        `*${room.name}*${room.tagline ? ` — ${room.tagline}` : ""}\n🛏️ ${room.bed_type || "Comfortable beds"} · 👥 Up to ${room.occupancy} guests`
    )
    .join("\n\n");

  await sendList(
    phone,
    `📅 *${fmtDate(checkIn)} → ${fmtDate(checkOut)}* (${nights} night${nights > 1 ? "s" : ""})\n\n${roomSummaries}\n\nSelect a room below:`,
    "Choose Room",
    sections,
    "Available Rooms"
  );
}

// --- View Rooms (browsing / discovery) ---

async function handleViewRooms(phone: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const rooms = await getHotelRooms(hotelId);

  if (rooms.length === 0) {
    await sendText(phone, "Sorry, no rooms are currently available. Please contact us for more information.");
    return;
  }

  const sections = rooms.map((room) => ({
    title: room.name,
    rows: [{
      id: `browse_${room.slug}`,
      title: `View ${room.name}`,
      description: room.tagline || `🛏️ ${room.bed_type || "Comfortable beds"} · 👥 Up to ${room.occupancy} guests`,
    }],
  }));

  const roomSummaries = rooms.map((room) =>
    `*${room.name}*${room.tagline ? ` — ${room.tagline}` : ""}\n🛏️ ${room.bed_type || "Comfortable beds"} · 👥 Up to ${room.occupancy} guests`
  ).join("\n\n");

  await sendList(
    phone,
    `🏡 *${hotel.name}*\n\n${roomSummaries}\n\nSelect a room to see photos and details:`,
    "Browse Rooms",
    sections,
    "Our Rooms"
  );

  await upsertConversation(hotelId, phone, { step: "room_browsing" });
}

async function handleBookRoom(phone: string, _roomSlug: string) {
  // Redirect to the full booking flow (guest count → room selection → dates)
  await handleBookingStart(phone);
}

async function handleRoomBrowseSelected(phone: string, roomSlug: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const room = await getHotelRoomBySlug(hotelId, roomSlug);

  if (!room) {
    await sendText(phone, "Sorry, I couldn't find that room. Please try again.");
    return;
  }

  // Send hero image if available
  if (room.images?.hero) {
    await sendImage(phone, room.images.hero, room.name);
  }

  // Build room details text
  const details = [
    `🏡 *${room.name}*`,
    room.tagline ? `_${room.tagline}_` : null,
    "",
    room.description || null,
    "",
    `🛏️ ${room.bed_type || "Comfortable beds"}`,
    `👥 Up to ${room.occupancy} guests`,
    room.amenities.length > 0 ? `✨ ${room.amenities.join(" · ")}` : null,
    "",
    `💰 From ${hotel.currency} ${room.pricing_tiers[0]?.price ?? "—"}/night`,
  ].filter((line) => line !== null).join("\n");

  await sendButtons(phone, details, [
    { id: `book_room_${roomSlug}`, title: "Book This Room" },
    { id: "view_rooms", title: "View Rooms" },
  ]);

  await upsertConversation(hotelId, phone, {
    step: "room_browsing",
    context: { selected_room: roomSlug },
  });
}

async function handleRoomSelected(phone: string, action: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();

  // Parse room_suite_2 → slug=suite, count=2
  const parts = action.split("_");
  const roomsCount = parseInt(parts[parts.length - 1]);
  const roomSlug = parts.slice(1, -1).join("_");

  const room = await getHotelRoomBySlug(hotelId, roomSlug);
  if (!room) {
    await sendText(phone, "Sorry, I couldn't find that room. Please try again.");
    return;
  }

  const tier = room.pricing_tiers.find((t) => t.rooms === roomsCount);
  if (!tier) {
    await sendText(phone, "Sorry, that option isn't available. Please try again.");
    return;
  }

  const conversation = await getConversation(hotelId, phone);
  const prev = conversation?.context ?? {};

  if (prev.check_in && prev.check_out) {
    // Path A: dates already selected → calculate price, ask for name
    const nights = Math.ceil(
      (new Date(prev.check_out as string).getTime() - new Date(prev.check_in as string).getTime()) / 86400000
    );
    const totalPrice = tier.price * nights;

    const fmtDate = (d: string) => {
      const date = new Date(d + "T00:00:00");
      return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    };

    await upsertConversation(hotelId, phone, {
      step: "guest_info",
      context: { ...prev, selected_room: roomSlug, rooms_count: roomsCount, total_price: totalPrice },
    });

    await sendText(
      phone,
      `✅ *${tier.label}* — ${hotel.currency} ${tier.price}/night\n` +
        `📅 ${fmtDate(prev.check_in as string)} → ${fmtDate(prev.check_out as string)} (${nights} night${nights > 1 ? "s" : ""})\n` +
        `💰 Total: *${hotel.currency} ${totalPrice}*\n\n` +
        `What name should the booking be under?`
    );

    // Funnel: room selected
    if (conversation) logEvent({ hotelId, conversationId: conversation.id, phone, eventType: "funnel_step", funnelStep: "room_selected" });
  } else {
    // Path B: room picked first → send CTA URL date picker
    await upsertConversation(hotelId, phone, {
      step: "date_selection",
      context: { ...prev, selected_room: roomSlug, rooms_count: roomsCount },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const simSuffix = isSimulatorMode() ? "&sim=1" : "";
    const url = `${appUrl}/booking/dates?hotel=${hotel.slug}&phone=${phone}&room=${roomSlug}&count=${roomsCount}${simSuffix}`;

    await sendCtaUrlButton(
      phone,
      `Great choice! *${tier.label}* at ${hotel.currency} ${tier.price}/night.\n\nTap below to pick your dates:`,
      "Pick Your Dates",
      url,
      "Date Selection"
    );
  }
}

async function handleRoomsCountSelected(phone: string, action: string) {
  const count = parseInt(action.replace("rooms_count_", ""));
  await handleRoomSelected(phone, `room_suite_${count}`);
}

async function handleDateInput(phone: string, text: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();

  // Parse dates from text like "15/03/2026 - 18/03/2026" or "15/03/2026 18/03/2026"
  const dateRegex = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g;
  const matches = [...text.matchAll(dateRegex)];

  if (matches.length < 2) {
    await sendText(
      phone,
      "I couldn't understand those dates. Please use this format:\n\n_15/03/2026 - 18/03/2026_\n\n(DD/MM/YYYY - DD/MM/YYYY)"
    );
    return;
  }

  const checkIn = `${matches[0][3]}-${matches[0][2].padStart(2, "0")}-${matches[0][1].padStart(2, "0")}`;
  const checkOut = `${matches[1][3]}-${matches[1][2].padStart(2, "0")}-${matches[1][1].padStart(2, "0")}`;

  // Validate dates
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
    await sendText(phone, "Those dates don't seem valid. Please try again with DD/MM/YYYY format.");
    return;
  }

  if (checkInDate < today) {
    await sendText(phone, "Check-in date must be in the future. Please try again.");
    return;
  }

  if (checkOutDate <= checkInDate) {
    await sendText(phone, "Check-out must be after check-in. Please try again.");
    return;
  }

  // Check calendar availability
  try {
    const available = await isAvailable(checkIn, checkOut);
    if (!available) {
      await sendText(
        phone,
        `Sorry, those dates (${formatDate(checkIn)} → ${formatDate(checkOut)}) are not available. 😔\n\nPlease try different dates:\n\n_DD/MM/YYYY - DD/MM/YYYY_`
      );
      return;
    }
  } catch {
    // Calendar not connected or API error — proceed without availability check
  }

  // Get current context and add dates
  const conversation = await getConversation(hotelId, phone);
  const context: ConversationContext = conversation?.context ?? {};

  context.check_in = checkIn;
  context.check_out = checkOut;

  // Calculate price
  const room = await getHotelRoomBySlug(hotelId, context.selected_room ?? "");
  const tier = room?.pricing_tiers.find((t) => t.rooms === context.rooms_count);
  const nights = Math.ceil(
    (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const totalPrice = (tier?.price ?? 0) * nights;
  context.total_price = totalPrice;

  await upsertConversation(hotelId, phone, {
    step: "guest_info",
    context,
  });

  // Funnel: dates entered
  if (conversation) logEvent({ hotelId, conversationId: conversation.id, phone, eventType: "funnel_step", funnelStep: "dates_entered" });

  await sendText(
    phone,
    `✅ Dates available!\n\n📅 *${formatDate(checkIn)}* → *${formatDate(checkOut)}* (${nights} night${nights > 1 ? "s" : ""})\n💰 Total: *${hotel.currency} ${totalPrice}*\n\nPlease enter your *full name* for the booking:`
  );
}

async function handleGuestNameInput(phone: string, text: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const name = text.trim();

  if (name.length < 2) {
    await sendText(phone, "Please enter your full name (at least 2 characters).");
    return;
  }

  // Get current context and add name
  const conversation = await getConversation(hotelId, phone);
  const context: ConversationContext = conversation?.context ?? {};

  context.guest_name = name;

  await upsertConversation(hotelId, phone, {
    step: "confirmation",
    context,
    guest_name: name,
  });

  // Funnel: guest info provided
  if (conversation) logEvent({ hotelId, conversationId: conversation.id, phone, eventType: "funnel_step", funnelStep: "guest_info" });

  // Show booking summary with confirm/cancel buttons
  const room = await getHotelRoomBySlug(hotelId, context.selected_room ?? "");
  const tier = room?.pricing_tiers.find((t) => t.rooms === context.rooms_count);

  await sendButtons(
    phone,
    `📋 *Booking Summary*\n\n👤 ${name}${context.guest_count ? ` (${context.guest_count} guest${context.guest_count > 1 ? "s" : ""})` : ""}\n🏡 ${tier?.label ?? "Room"}\n📅 ${formatDate(context.check_in!)} → ${formatDate(context.check_out!)}\n💰 *${hotel.currency} ${context.total_price}*\n\nWould you like to confirm this booking?`,
    [
      { id: "confirm_booking", title: "Confirm Booking" },
      { id: "cancel_flow", title: "Cancel" },
    ],
    "Confirm Booking"
  );
}

async function handleMyBooking(phone: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const bookings = await getActiveBookings(hotelId, phone);

  if (bookings.length === 0) {
    await sendText(
      phone,
      "You don't have any active bookings. Would you like to make one?"
    );
    await sendButtons(phone, "What would you like to do?", [
      { id: "book_now", title: "Book Now" },
      { id: "view_rooms", title: "View Rooms" },
    ]);
    return;
  }

  // Display all active bookings
  const lines: string[] = [];
  let totalPrice = 0;
  for (const booking of bookings) {
    const room = await getHotelRoomBySlug(hotelId, booking.room_slug);
    const tier = room?.pricing_tiers.find((t) => t.rooms === booking.rooms_count);
    lines.push(`🏡 ${tier?.label ?? room?.name ?? booking.room_slug}`);
    totalPrice += booking.total_price;
  }

  const first = bookings[0];
  const roomsSummary = lines.join("\n");
  const priceDisplay = bookings.length > 1
    ? `💰 ${hotel.currency} ${totalPrice} (${bookings.length} rooms)`
    : `💰 ${hotel.currency} ${first.total_price}`;

  await sendText(
    phone,
    `📋 *Your Booking*\n\n👤 ${first.guest_name}\n${roomsSummary}\n📅 ${formatDate(first.check_in)} → ${formatDate(first.check_out)}\n${priceDisplay}\n💳 Payment: ${first.payment_status}\n📌 Status: ${first.booking_status}`
  );
}

async function handleModifyBooking(phone: string) {
  const hotelId = getHotelId();
  const booking = await getActiveBooking(hotelId, phone);

  if (!booking) {
    await sendText(phone, "You don't have any active bookings to modify.");
    return;
  }

  await sendButtons(
    phone,
    `What would you like to change for your booking?`,
    [
      { id: "change_dates", title: "Change Dates" },
      { id: "cancel_booking", title: "Cancel Booking" },
      { id: "my_booking", title: "View Details" },
    ]
  );
}

async function handleContactUs(phone: string) {
  const hotel = getHotel();
  const phoneDisplay = hotel.contact_phone
    ? `📱 WhatsApp: ${hotel.contact_phone}`
    : "";
  const emailDisplay = hotel.contact_email
    ? `📧 Email: ${hotel.contact_email}`
    : "";

  await sendText(
    phone,
    `📞 *Contact ${hotel.name}*\n\nYou can reach us at:\n${phoneDisplay}\n${emailDisplay}\n\nOr simply type your question here and we'll get back to you!`
  );
}

async function handleLeaveReview(phone: string) {
  const hotelId = getHotelId();
  const booking = await getRecentBooking(hotelId, phone);

  if (!booking) {
    await sendText(phone, "We don't have a recent stay on record. Thank you for your interest!");
    return;
  }

  await upsertConversation(hotelId, phone, { step: "idle" });

  await sendText(
    phone,
    "We'd love to hear about your experience! ⭐\n\nPlease rate your stay from 1 to 5:\n\n1 ⭐ - Poor\n2 ⭐⭐ - Fair\n3 ⭐⭐⭐ - Good\n4 ⭐⭐⭐⭐ - Very Good\n5 ⭐⭐⭐⭐⭐ - Excellent"
  );
}

// --- Room service handler ---

async function handleRoomService(phone: string) {
  const hotelId = getHotelId();
  const booking = await getActiveBooking(hotelId, phone);

  if (!booking || booking.booking_status !== "checked_in") {
    await sendText(phone, "Room service is available for checked-in guests. If you're currently staying with us, please let the front desk know to update your check-in status.");
    return;
  }

  await upsertConversation(hotelId, phone, {
    step: "room_service_order",
    context: { booking_id: booking.id },
  });

  await sendText(
    phone,
    `🍽️ *Room Service*\n\nWhat can we bring to your room?\n\nPlease describe your order — for example:\n• _2 bottles of water_\n• _Club sandwich and a coffee_\n• _Extra towels and pillows_\n• _Breakfast for 2 at 8am_\n\nOr type *"menu"* to see available items.`
  );
}

async function handleRoomServiceOrder(phone: string, text: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const conversation = await getConversation(hotelId, phone);
  const context = conversation?.context ?? {};

  if (text.toLowerCase() === "cancel") {
    await upsertConversation(hotelId, phone, { step: "idle", context: {} });
    await sendText(phone, "Room service order cancelled. Let us know if you need anything else! 🌿");
    return;
  }

  if (text.toLowerCase() === "menu") {
    // Build menu from hotel config
    const menu = hotel.room_service_menu;
    let menuText = `📋 *Room Service Menu*\n\n`;
    for (const category of menu) {
      menuText += `*${category.category}*\n`;
      for (const item of category.items) {
        const priceStr = item.price > 0 ? `— ${hotel.currency} ${item.price}` : "— Free";
        menuText += `• ${item.name} ${priceStr}\n`;
      }
      menuText += "\n";
    }
    menuText += `_Type your order or reply "cancel" to go back._`;
    await sendText(phone, menuText);
    return;
  }

  // Confirm the order
  const orderText = text.trim();
  await upsertConversation(hotelId, phone, { step: "idle", context: {} });

  await sendText(
    phone,
    `✅ *Order Received!*\n\n📝 ${orderText}\n\nOur team will prepare your order shortly. We'll let you know when it's on the way! 🌿`
  );

  console.log(`[Room Service] Hotel: ${hotel.slug} — Order: ${orderText}`);
}

// --- Concierge handler ---

async function handleConcierge(phone: string) {
  const hotelId = getHotelId();
  const booking = await getActiveBooking(hotelId, phone);

  if (!booking || booking.booking_status !== "checked_in") {
    await sendText(phone, "Our concierge service is available for checked-in guests. If you need help before your stay, just type your question and we'll assist you!");
    return;
  }

  await sendButtons(
    phone,
    `🌿 *Concierge Services*\n\nHow can we help make your stay better?`,
    [
      { id: "concierge_recommend", title: "Local Tips" },
      { id: "concierge_wakeup", title: "Wake-Up Call" },
      { id: "concierge_help", title: "General Help" },
    ],
    "Concierge"
  );
}

async function handleConciergeRecommendations(phone: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();

  // Use AI for personalized recommendations if available
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const conversation = await getConversation(hotelId, phone);
      const context: ConversationContext = conversation?.context ?? {};
      const ai = await interpretMessage(
        "What are some good restaurants and things to do nearby?",
        "current_guest",
        context
      );
      await sendText(phone, ai.reply);
      return;
    } catch {
      // Fall through to static recommendations
    }
  }

  // Build recommendations from hotel config
  const recs = hotel.local_recommendations;
  let recsText = `🗺️ *Local Recommendations*\n\n`;
  for (const category of recs) {
    recsText += `*${category.category}*\n`;
    for (const item of category.items) {
      recsText += `${item.name} — ${item.description} (${item.distance})\n`;
    }
    recsText += "\n";
  }
  recsText += `_Want more specific recommendations? Just ask!_`;
  await sendText(phone, recsText);
}

async function handleWakeupCall(phone: string) {
  const hotelId = getHotelId();
  const booking = await getActiveBooking(hotelId, phone);
  if (!booking) return;

  await upsertConversation(hotelId, phone, {
    step: "idle",
    context: { awaiting_wakeup: true, booking_id: booking.id },
  });

  await sendText(
    phone,
    `⏰ *Wake-Up Call*\n\nWhat time would you like to be woken up?\n\nPlease type the time — for example:\n• _6:00 AM_\n• _7:30_\n• _06:00_`
  );
}

function parseWakeupTime(text: string): string | null {
  // Match patterns like "6:00 AM", "6am", "06:00", "7:30", "6:00am"
  const match = text.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
  if (!match) return null;

  let hours = parseInt(match[1]);
  const minutes = match[2] ? parseInt(match[2]) : 0;
  const period = match[3]?.toLowerCase();

  if (period === "pm" && hours < 12) hours += 12;
  if (period === "am" && hours === 12) hours = 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// --- Referral & growth handlers ---

async function handleShareReferral(phone: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const referral = await getOrCreateReferralCode(hotelId, phone, hotel.slug);

  await sendText(
    phone,
    `🎁 *Your Referral Code*\n\n*${referral.code}*\n\n` +
    `Share this code with friends and family — they'll get *${referral.discount_percent}% off* their first booking at ${hotel.name}!\n\n` +
    `📊 Used: ${referral.uses}/${referral.max_uses} times\n\n` +
    `Simply forward this message or share the code. When they book, they just mention the code! 🌿`
  );
}

async function handlePhotoReceived(phone: string, guestName?: string | null) {
  const hotel = getHotel();
  const name = guestName ? ` ${guestName}` : "";

  await sendText(
    phone,
    `Thank you${name}! 📸✨\n\nWe love this photo! With your permission, we may feature it on our page to inspire other travellers.\n\nKeep sharing — we appreciate every memory from your stay at ${hotel.name}! 🌿`
  );

  console.log(`[Photo Sharing] Hotel: ${hotel.slug} — Photo received from ${phone}`);
}

async function handleConfirmBooking(phone: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const conversation = await getConversation(hotelId, phone);
  if (!conversation) return;

  const context: ConversationContext & { referral_code?: string; discount_percent?: number } = conversation.context;

  if (!context.guest_name || !context.selected_room || !context.check_in || !context.check_out) {
    await sendText(phone, "Something went wrong. Let's start over.");
    await upsertConversation(hotelId, phone, { step: "idle", context: {} });
    return;
  }

  // Apply referral discount if one is in context
  let finalPrice = context.total_price ?? 0;
  let discountNote = "";
  if (context.referral_code && context.discount_percent) {
    const discount = Math.round(finalPrice * (context.discount_percent / 100));
    finalPrice = finalPrice - discount;
    discountNote = `\n🎁 Referral discount: *-${hotel.currency} ${discount}* (${context.discount_percent}%)`;
    // Mark the referral code as used
    await useReferralCode(hotelId, context.referral_code);
  }

  // Create booking in database
  const booking = await createBooking(hotelId, {
    phone,
    guest_name: context.guest_name,
    room_slug: context.selected_room,
    rooms_count: context.rooms_count ?? 1,
    check_in: context.check_in,
    check_out: context.check_out,
    total_price: finalPrice,
    currency: hotel.currency,
    payment_status: "unpaid",
    payment_provider: null,
    booking_status: "confirmed",
    calendar_event_id: null,
    booking_group_id: context.booking_group_id ?? null,
  });

  // Funnel: booking confirmed
  logEvent({ hotelId, conversationId: conversation.id, phone, eventType: "funnel_step", funnelStep: "confirmed" });
  logEvent({ hotelId, conversationId: conversation.id, phone, eventType: "booking_created", metadata: { booking_id: booking.id, room_slug: context.selected_room, total_price: finalPrice } });

  // Notify hotel owner (fire-and-forget)
  notifyOwner(hotelId, "new_booking", {
    guest_name: context.guest_name,
    room_slug: context.selected_room,
    check_in: context.check_in,
    check_out: context.check_out,
    total_price: finalPrice,
    booking_id: booking.id,
  });

  // Create calendar event (non-blocking — booking is confirmed even if calendar fails)
  try {
    const eventId = await createBookingEvent({
      guest_name: context.guest_name,
      phone,
      room_slug: context.selected_room,
      rooms_count: context.rooms_count ?? 1,
      check_in: context.check_in,
      check_out: context.check_out,
      total_price: context.total_price ?? 0,
      booking_id: booking.id,
    });
    if (eventId) {
      await updateBooking(hotelId, booking.id, { calendar_event_id: eventId });
    }
  } catch (err) {
    console.error("Failed to create calendar event:", err);
  }

  // Update conversation state — preserve booking_group_id for multi-room flows
  await upsertConversation(hotelId, phone, {
    step: "payment_choice",
    guest_state: "booking_pending",
    context: {
      booking_id: booking.id,
      booking_group_id: context.booking_group_id,
    },
  });

  const room = await getHotelRoomBySlug(hotelId, context.selected_room);
  const tier = room?.pricing_tiers.find((t) => t.rooms === context.rooms_count);

  await sendText(
    phone,
    `✅ *Booking Confirmed!*\n\n👤 ${context.guest_name}\n🏡 ${tier?.label ?? "Room"}\n📅 ${formatDate(context.check_in)} → ${formatDate(context.check_out)}\n💰 ${hotel.currency} ${finalPrice}${discountNote}\n\nWe'll send you check-in details before your arrival. Thank you for choosing ${hotel.name}! 🌿`
  );

  // Offer payment options
  await sendButtons(
    phone,
    "How would you like to pay your deposit?",
    [
      { id: `pay_momo_${booking.id}`, title: "Mobile Money" },
      { id: `pay_card_${booking.id}`, title: "Card Payment" },
      { id: "skip_payment", title: "Pay Later" },
    ],
    "Payment"
  );

  // For individual rooms in a group: offer to add another room
  if (room && room.room_type === "individual" && room.group_id && context.check_in && context.check_out) {
    const siblings = await getRoomGroupMembers(hotelId, room.group_id);
    const siblingAvailability = await getRoomAvailability(hotelId, context.check_in, context.check_out);
    const availableSiblings = siblings.filter(s =>
      s.id !== room.id &&
      siblingAvailability.some(a => a.room.id === s.id && a.availableRooms > 0)
    );

    if (availableSiblings.length > 0) {
      const roomNames = availableSiblings.map(s => s.name).join(", ");
      await sendButtons(
        phone,
        `Would you like to add another room for the same dates? Available: ${roomNames}`,
        [
          { id: "add_another_room", title: "Add Another Room" },
          { id: "no_thanks", title: "No Thanks" },
        ]
      );
    }
  }
}

async function handleAddAnotherRoom(phone: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const conversation = await getConversation(hotelId, phone);
  const ctx = conversation?.context ?? {};

  // Get the most recent booking to find group context
  const bookings = await getActiveBookings(hotelId, phone);
  if (bookings.length === 0) {
    await sendText(phone, "You don't have an active booking to add rooms to.");
    return;
  }

  const lastBooking = bookings[bookings.length - 1];
  const lastRoom = await getHotelRoomBySlug(hotelId, lastBooking.room_slug);

  if (!lastRoom || lastRoom.room_type !== "individual" || !lastRoom.group_id) {
    await sendText(phone, "No additional rooms available to add.");
    return;
  }

  // Find available sibling rooms for the same dates
  const siblings = await getRoomGroupMembers(hotelId, lastRoom.group_id);
  const availability = await getRoomAvailability(hotelId, lastBooking.check_in, lastBooking.check_out);
  const availableSiblings = siblings.filter(s =>
    s.id !== lastRoom.id &&
    availability.some(a => a.room.id === s.id && a.availableRooms > 0)
  );

  if (availableSiblings.length === 0) {
    await sendText(phone, "All rooms in this property are now booked for your dates. You're all set! 🌿");
    return;
  }

  // Generate a booking_group_id if this is the first multi-room link
  const bookingGroupId = lastBooking.booking_group_id ?? crypto.randomUUID();
  // Backfill the first booking's group_id if it wasn't set
  if (!lastBooking.booking_group_id) {
    await updateBooking(hotelId, lastBooking.id, { booking_group_id: bookingGroupId } as Partial<import("./types").Booking>);
  }

  // Set up context for room selection with group context
  await upsertConversation(hotelId, phone, {
    step: "room_selection",
    context: {
      ...ctx,
      guest_name: lastBooking.guest_name,
      check_in: lastBooking.check_in,
      check_out: lastBooking.check_out,
      booking_group_id: bookingGroupId,
    },
  });

  const nights = Math.ceil(
    (new Date(lastBooking.check_out).getTime() - new Date(lastBooking.check_in).getTime()) / 86400000
  );

  const sections = availableSiblings.map((room) => ({
    title: room.name,
    rows: room.pricing_tiers.map((tier) => ({
      id: `room_${room.slug}_${tier.rooms}`,
      title: tier.label,
      description: `${hotel.currency} ${tier.price}/night · ${nights} nights · Total: ${hotel.currency} ${tier.price * nights}`,
    })),
  }));

  const roomSummaries = availableSiblings
    .map(
      (room) =>
        `*${room.name}*\n🛏️ ${room.bed_type || "Comfortable beds"} · 👥 Up to ${room.occupancy} guests`
    )
    .join("\n\n");

  await sendList(
    phone,
    `🏡 Add another room for ${formatDate(lastBooking.check_in)} → ${formatDate(lastBooking.check_out)}:\n\n${roomSummaries}`,
    "Choose Room",
    sections,
    "Available Rooms"
  );
}

async function handleChangeDates(phone: string) {
  const hotelId = getHotelId();
  const booking = await getActiveBooking(hotelId, phone);

  if (!booking) {
    await sendText(phone, "You don't have any active bookings to modify.");
    return;
  }

  await upsertConversation(hotelId, phone, {
    step: "modify_dates",
    context: { modify_booking_id: booking.id },
  });

  await sendText(
    phone,
    `Current dates for your booking:\n📅 ${formatDate(booking.check_in)} → ${formatDate(booking.check_out)}\n\nPlease enter your new dates:\n\n_DD/MM/YYYY - DD/MM/YYYY_`
  );
}

async function handleModifyDateInput(phone: string, text: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();

  const dateRegex = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g;
  const matches = [...text.matchAll(dateRegex)];

  if (matches.length < 2) {
    await sendText(
      phone,
      "I couldn't understand those dates. Please use this format:\n\n_15/03/2026 - 18/03/2026_"
    );
    return;
  }

  const checkIn = `${matches[0][3]}-${matches[0][2].padStart(2, "0")}-${matches[0][1].padStart(2, "0")}`;
  const checkOut = `${matches[1][3]}-${matches[1][2].padStart(2, "0")}-${matches[1][1].padStart(2, "0")}`;

  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
    await sendText(phone, "Those dates don't seem valid. Please try again.");
    return;
  }

  if (checkInDate < today) {
    await sendText(phone, "Check-in date must be in the future. Please try again.");
    return;
  }

  if (checkOutDate <= checkInDate) {
    await sendText(phone, "Check-out must be after check-in. Please try again.");
    return;
  }

  // Check availability
  try {
    const available = await isAvailable(checkIn, checkOut);
    if (!available) {
      await sendText(
        phone,
        `Sorry, those dates (${formatDate(checkIn)} → ${formatDate(checkOut)}) are not available. 😔\n\nPlease try different dates:\n\n_DD/MM/YYYY - DD/MM/YYYY_`
      );
      return;
    }
  } catch {
    // Calendar not connected — proceed
  }

  // Get the booking being modified
  const conversation = await getConversation(hotelId, phone);
  const context = conversation?.context ?? {};
  const bookingId = context.modify_booking_id as string | undefined;

  if (!bookingId) {
    await sendText(phone, "Something went wrong. Let's start over.");
    await upsertConversation(hotelId, phone, { step: "idle", context: {} });
    return;
  }

  const booking = await getActiveBooking(hotelId, phone);
  if (!booking || booking.id !== bookingId) {
    await sendText(phone, "Couldn't find the booking to modify.");
    await upsertConversation(hotelId, phone, { step: "idle", context: {} });
    return;
  }

  // Recalculate price
  const room = await getHotelRoomBySlug(hotelId, booking.room_slug);
  const tier = room?.pricing_tiers.find((t) => t.rooms === booking.rooms_count);
  const nights = Math.ceil(
    (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const newPrice = (tier?.price ?? 0) * nights;

  // Update booking in database
  await updateBooking(hotelId, booking.id, {
    check_in: checkIn,
    check_out: checkOut,
    total_price: newPrice,
  });

  // Update calendar event
  if (booking.calendar_event_id) {
    try {
      await updateBookingEvent(booking.calendar_event_id, {
        check_in: checkIn,
        check_out: checkOut,
      });
    } catch (err) {
      console.error("Failed to update calendar event:", err);
    }
  }

  // Reset conversation
  await upsertConversation(hotelId, phone, { step: "done", context: {} });

  await sendText(
    phone,
    `✅ *Booking Updated!*\n\n📅 *New dates:* ${formatDate(checkIn)} → ${formatDate(checkOut)} (${nights} night${nights > 1 ? "s" : ""})\n💰 *New total:* ${hotel.currency} ${newPrice}\n\nYour booking has been updated. 🌿`
  );

  await sendButtons(phone, "What would you like to do?", [
    { id: "my_booking", title: "View Booking" },
    { id: "contact_us", title: "Contact Us" },
  ]);
}

async function handleCancelBooking(phone: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const booking = await getActiveBooking(hotelId, phone);

  if (!booking) {
    await sendText(phone, "You don't have any active bookings to cancel.");
    return;
  }

  // Ask for confirmation, noting refund status if paid
  const paidNote = booking.payment_status === "paid"
    ? `\n\n💰 Your deposit of ${hotel.currency} ${booking.total_price} will be refunded.`
    : "";

  await sendButtons(
    phone,
    `Are you sure you want to cancel your booking?\n\n📅 ${formatDate(booking.check_in)} → ${formatDate(booking.check_out)}${paidNote}`,
    [
      { id: "confirm_cancel", title: "Yes, Cancel" },
      { id: "my_booking", title: "No, Keep It" },
    ],
    "Cancel Booking"
  );
}

async function handleConfirmCancel(phone: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const booking = await getActiveBooking(hotelId, phone);

  if (!booking) {
    await sendText(phone, "You don't have any active bookings to cancel.");
    return;
  }

  // Delete calendar event if one exists
  if (booking.calendar_event_id) {
    try {
      await deleteBookingEvent(booking.calendar_event_id);
    } catch (err) {
      console.error("Failed to delete calendar event:", err);
    }
  }

  // Mark refund if booking was paid
  if (booking.payment_status === "paid") {
    await updateBooking(hotelId, booking.id, {
      booking_status: "cancelled",
      payment_status: "refunded",
    });

    await sendText(
      phone,
      `❌ Your booking has been cancelled.\n\n💰 A refund of *${hotel.currency} ${booking.total_price}* will be processed. Please allow 3-5 business days.\n\nWe hope to welcome you another time! 🌿`
    );
  } else {
    await updateBooking(hotelId, booking.id, { booking_status: "cancelled" });

    await sendText(
      phone,
      `❌ Your booking has been cancelled.\n\nWe hope to welcome you another time! 🌿`
    );
  }

  // Funnel: booking cancelled
  const convCancel = await getConversation(hotelId, phone);
  if (convCancel) logEvent({ hotelId, conversationId: convCancel.id, phone, eventType: "booking_cancelled", metadata: { booking_id: booking.id } });

  // Update conversation state
  const newState = await determineGuestState(hotelId, phone);
  await upsertConversation(hotelId, phone, { guest_state: newState, step: "idle", context: {} });
  const updatedConv = await getConversation(hotelId, phone);
  await sendGreeting(phone, newState, updatedConv?.guest_name);
}

// --- Review handlers ---

async function handleReviewRating(phone: string, bookingId: string, rating: number) {
  const hotelId = getHotelId();

  // Save rating to context and ask for written feedback
  await upsertConversation(hotelId, phone, {
    step: "review_feedback",
    context: { review_booking_id: bookingId, review_rating: rating },
  });

  if (rating >= 4) {
    await sendText(
      phone,
      `Thank you for the *${rating}/5* rating! 🌟\n\nWe're so glad you enjoyed your stay!\n\nWould you mind sharing a few words about your experience? This helps other guests and means a lot to our team.\n\n_Just type your feedback or reply "skip" to finish._`
    );
  } else {
    await sendText(
      phone,
      `Thank you for your honest rating of *${rating}/5*.\n\nWe're sorry we didn't fully meet your expectations. Could you share what we could improve?\n\n_Your feedback helps us get better. Type your thoughts or reply "skip" to finish._`
    );
  }
}

async function handleReviewFeedback(phone: string, text: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const conversation = await getConversation(hotelId, phone);
  if (!conversation) return;

  const context = conversation.context as ConversationContext & { review_booking_id?: string; review_rating?: number };
  const bookingId = context.review_booking_id;
  const rating = context.review_rating;

  if (!bookingId || !rating) {
    await upsertConversation(hotelId, phone, { step: "idle", context: {} });
    return;
  }

  const feedback = text.toLowerCase() === "skip" ? null : text.trim();

  // Save review to database
  await createReview(hotelId, {
    booking_id: bookingId,
    phone,
    rating,
    feedback: feedback ?? undefined,
  });

  // Notify hotel owner (fire-and-forget)
  notifyOwner(hotelId, "new_review", {
    guest_name: conversation.context?.guest_name || "Guest",
    rating,
    feedback,
    booking_id: bookingId,
  });

  // Reset conversation
  await upsertConversation(hotelId, phone, { step: "idle", context: {} });

  const referral = await getOrCreateReferralCode(hotelId, phone, hotel.slug);

  await sendText(
    phone,
    rating >= 4
      ? `Thank you for your wonderful feedback! 🌿✨\n\n🎁 Here's your referral code: *${referral.code}*\nShare it with friends — they'll get *${referral.discount_percent}% off* their first booking!\n\nWe hope to welcome you back soon!`
      : `Thank you for your honest feedback. We take it seriously and will work to improve. 🙏\n\n🎁 Here's your referral code: *${referral.code}*\nShare it with friends — they'll get *${referral.discount_percent}% off* their first booking!\n\nWe hope to earn a better experience for you next time.`
  );
  await sendButtons(phone, "What would you like to do?", [
    { id: "book_again", title: "Book Again" },
    { id: "share_referral", title: "Share My Code" },
    { id: "contact_us", title: "Contact Us" },
  ]);
}

// --- Payment handlers ---

async function handleMoMoPayment(phone: string, bookingId: string) {
  const hotelId = getHotelId();
  const booking = await getActiveBooking(hotelId, phone);
  if (!booking || booking.id !== bookingId) {
    await sendText(phone, "Sorry, I couldn't find that booking. Please try again.");
    return;
  }

  if (booking.payment_status === "paid") {
    await sendText(phone, "This booking has already been paid. Thank you! ✅");
    return;
  }

  // Funnel: payment initiated
  const convMomo = await getConversation(hotelId, phone);
  if (convMomo) logEvent({ hotelId, conversationId: convMomo.id, phone, eventType: "funnel_step", funnelStep: "payment_initiated", metadata: { provider: "momo", booking_id: bookingId } });

  // Step 1: Ask guest to select their network
  await upsertConversation(hotelId, phone, {
    step: "momo_network_select",
    context: { momo_booking_id: bookingId },
  });

  await sendText(phone, "📱 *Mobile Money Payment*\n\nPlease select your mobile money network:");
  await sendButtons(phone, "Choose your network:", [
    { id: "momo_net_mtn", title: "MTN MoMo" },
    { id: "momo_net_vod", title: "Vodafone Cash" },
    { id: "momo_net_atl", title: "AirtelTigo" },
  ]);
}

async function handleMoMoNetworkSelected(phone: string, network: MoMoProvider) {
  const hotelId = getHotelId();
  const conversation = await getConversation(hotelId, phone);
  const bookingId = conversation?.context?.momo_booking_id;

  if (!bookingId) {
    await sendText(phone, "Sorry, something went wrong. Please try the payment again.");
    return;
  }

  // Step 2: Confirm phone number (reuse existing flow)
  const displayPhone = phone.startsWith("233")
    ? `0${phone.slice(3)}`
    : phone;

  await upsertConversation(hotelId, phone, {
    step: "confirm_momo_number",
    context: { momo_booking_id: bookingId, momo_network: network },
  });

  await sendText(
    phone,
    `📱 *Mobile Money Payment*\n\nWe'll charge your MoMo account at *${displayPhone}*.\n\nIs this your Mobile Money number?`
  );
  await sendButtons(phone, "Confirm your MoMo number:", [
    { id: "confirm_momo_yes", title: "Yes, use this number" },
    { id: "confirm_momo_different", title: "Different number" },
  ]);
}

async function handleMoMoNumberInput(phone: string, text: string) {
  const hotelId = getHotelId();
  const conversation = await getConversation(hotelId, phone);
  const bookingId = conversation?.context?.momo_booking_id;

  if (!bookingId) {
    await sendText(phone, "Sorry, something went wrong. Please try the payment again.");
    return;
  }

  // Normalize phone number input to MSISDN (233XXXXXXXXX)
  let momoPhone = text.trim().replace(/[\s\-()]/g, "");
  if (momoPhone.startsWith("+")) momoPhone = momoPhone.slice(1);
  if (momoPhone.startsWith("0")) momoPhone = `233${momoPhone.slice(1)}`;

  if (!/^233\d{9}$/.test(momoPhone)) {
    await sendText(
      phone,
      "That doesn't look like a valid phone number. Please enter a Ghanaian number (e.g. 0551234567 or 233551234567):"
    );
    return;
  }

  const network = (conversation?.context?.momo_network as MoMoProvider) || "mtn";
  await processMoMoPayment(phone, bookingId, momoPhone, network);
}

async function processMoMoPayment(phone: string, bookingId: string, momoPhone: string, network: MoMoProvider) {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const booking = await getActiveBooking(hotelId, phone);
  if (!booking || booking.id !== bookingId) {
    await sendText(phone, "Sorry, I couldn't find that booking. Please try again.");
    return;
  }

  try {
    const result = await chargeMobileMoney(
      {
        id: booking.id,
        phone,
        guest_name: booking.guest_name,
        total_price: booking.total_price,
        currency: booking.currency,
      },
      momoPhone,
      network
    );

    const platformFee = calculateFee(booking.total_price, hotel.fee_type, hotel.fee_value);
    const total = booking.total_price + platformFee;
    const displayMomo = momoPhone.startsWith("233")
      ? `0${momoPhone.slice(3)}`
      : momoPhone;

    if (result.status === "send_otp") {
      // Guest will receive OTP via SMS — ask them to type it here
      await upsertConversation(hotelId, phone, {
        step: "momo_otp_input",
        context: {
          momo_booking_id: bookingId,
          momo_network: network,
          momo_phone: momoPhone,
          paystack_charge_reference: result.reference,
        },
      });

      await sendText(
        phone,
        `📱 *Mobile Money Payment*\n\n💰 *${hotel.currency} ${total}*\n_${hotel.currency} ${booking.total_price} (deposit) + ${hotel.currency} ${platformFee} (service fee)_\n\nAn OTP has been sent to *${displayMomo}*.\nPlease type the code here to confirm your payment:`
      );
    } else if (result.status === "pay_offline") {
      // Guest needs to approve on their phone (USSD/PIN prompt)
      await upsertConversation(hotelId, phone, { step: "payment_pending", context: {} });

      await sendText(
        phone,
        `📱 *Mobile Money Payment*\n\n💰 *${hotel.currency} ${total}*\n_${hotel.currency} ${booking.total_price} (deposit) + ${hotel.currency} ${platformFee} (service fee)_\n\n${result.displayText}\n\nWe'll notify you once payment is received. ⏳`
      );
    } else if (result.status === "success") {
      // Instant success (rare for MoMo, webhook will handle the rest)
      await upsertConversation(hotelId, phone, { step: "payment_pending", context: {} });
      await sendText(phone, "Payment is being processed. We'll confirm shortly! ⏳");
    } else {
      // Failed
      await sendText(phone, `Payment could not be processed: ${result.displayText}`);
      await sendButtons(phone, "Payment options:", [
        { id: `pay_momo_${bookingId}`, title: "Try Again" },
        { id: `pay_card_${bookingId}`, title: "Card Payment" },
        { id: "skip_payment", title: "Pay Later" },
      ]);
    }
  } catch (err) {
    console.error("MoMo payment failed:", err);
    await sendText(
      phone,
      "Sorry, we couldn't initiate the mobile money payment. Please try again or choose a different payment method."
    );
    await sendButtons(phone, "Payment options:", [
      { id: `pay_momo_${bookingId}`, title: "Try Again" },
      { id: `pay_card_${bookingId}`, title: "Card Payment" },
      { id: "skip_payment", title: "Pay Later" },
    ]);
  }
}

async function handleMoMoOTPInput(phone: string, otp: string) {
  const hotelId = getHotelId();
  const conversation = await getConversation(hotelId, phone);
  const reference = conversation?.context?.paystack_charge_reference as string | undefined;
  const bookingId = conversation?.context?.momo_booking_id as string | undefined;

  if (!reference || !bookingId) {
    await sendText(phone, "Sorry, your payment session has expired. Please try again.");
    return;
  }

  const trimmedOtp = otp.trim();
  if (!/^\d{4,6}$/.test(trimmedOtp)) {
    await sendText(phone, "Please enter a valid OTP (4-6 digits):");
    return;
  }

  try {
    const result = await submitChargeOTP(reference, trimmedOtp);

    if (result.status === "success") {
      await upsertConversation(hotelId, phone, { step: "payment_pending", context: {} });
      await sendText(phone, "Payment is being confirmed. We'll notify you shortly! ⏳");
    } else if (result.status === "pay_offline") {
      await upsertConversation(hotelId, phone, { step: "payment_pending", context: {} });
      await sendText(phone, `${result.displayText}\n\nWe'll notify you once payment is received. ⏳`);
    } else {
      await sendText(phone, `Payment failed: ${result.displayText}`);
      await sendButtons(phone, "What would you like to do?", [
        { id: `pay_momo_${bookingId}`, title: "Try Again" },
        { id: `pay_card_${bookingId}`, title: "Card Payment" },
        { id: "skip_payment", title: "Pay Later" },
      ]);
    }
  } catch (err) {
    console.error("OTP submission failed:", err);
    await sendText(phone, "Something went wrong verifying your OTP. Please try again.");
    await sendButtons(phone, "Payment options:", [
      { id: `pay_momo_${bookingId}`, title: "Try Again" },
      { id: `pay_card_${bookingId}`, title: "Card Payment" },
      { id: "skip_payment", title: "Pay Later" },
    ]);
  }
}

async function handleCardPayment(phone: string, bookingId: string) {
  const hotelId = getHotelId();
  const hotel = getHotel();
  const booking = await getActiveBooking(hotelId, phone);
  if (!booking || booking.id !== bookingId) {
    await sendText(phone, "Sorry, I couldn't find that booking. Please try again.");
    return;
  }

  if (booking.payment_status === "paid") {
    await sendText(phone, "This booking has already been paid. Thank you! ✅");
    return;
  }

  // Funnel: payment initiated (card)
  const convCard = await getConversation(hotelId, phone);
  if (convCard) logEvent({ hotelId, conversationId: convCard.id, phone, eventType: "funnel_step", funnelStep: "payment_initiated", metadata: { provider: "paystack", booking_id: bookingId } });

  if (!hotel.paystack_subaccount_code) {
    await sendText(
      phone,
      "Sorry, card payments are not available for this hotel yet. Please choose a different payment method."
    );
    await sendButtons(phone, "Payment options:", [
      { id: `pay_momo_${bookingId}`, title: "Mobile Money" },
      { id: "skip_payment", title: "Pay Later" },
    ]);
    return;
  }

  try {
    const platformFee = calculateFee(booking.total_price, hotel.fee_type, hotel.fee_value);
    const total = booking.total_price + platformFee;

    const { authorization_url } = await initializePayment({
      id: booking.id,
      phone,
      guest_name: booking.guest_name,
      total_price: booking.total_price,
      currency: booking.currency,
      check_in: booking.check_in,
      check_out: booking.check_out,
    });

    await upsertConversation(hotelId, phone, { step: "payment_pending" });

    await sendCtaUrlButton(
      phone,
      `💳 *Card Payment*\n\nPay your deposit of *${hotel.currency} ${total}*\n\n_${hotel.currency} ${booking.total_price} (deposit) + ${hotel.currency} ${platformFee} (service fee)_\n\nTap below to pay securely. We'll notify you once confirmed.`,
      "Pay Now",
      authorization_url,
      "Card Payment"
    );
  } catch (err) {
    console.error("Card payment link failed:", err);
    await sendText(
      phone,
      "Sorry, we couldn't create a payment link. Please try again or choose a different payment method."
    );
    await sendButtons(phone, "Payment options:", [
      { id: `pay_card_${bookingId}`, title: "Try Again" },
      { id: `pay_momo_${bookingId}`, title: "Mobile Money" },
      { id: "skip_payment", title: "Pay Later" },
    ]);
  }
}

// --- AI free-text handler ---

async function handleFreeText(
  phone: string,
  text: string,
  guestState: GuestState,
  conversation: Conversation | null
) {
  // If no API key configured, fall back to greeting
  if (!process.env.ANTHROPIC_API_KEY) {
    await sendGreeting(phone, guestState, conversation?.guest_name);
    return;
  }

  try {
    const context: ConversationContext = conversation?.context ?? {};

    const aiStart = Date.now();
    const ai = await interpretMessage(text, guestState, context);
    const aiTime = Date.now() - aiStart;

    // Log AI parse result
    if (conversation) {
      const hotelId = getHotelId();
      logEvent({
        hotelId,
        conversationId: conversation.id,
        phone,
        eventType: "ai_parse",
        aiIntent: ai.intent,
        aiConfidence: "parsed",
        aiInputText: text.slice(0, 500),
        aiResponseTimeMs: aiTime,
        metadata: { extracted: ai.extracted },
      });
    }

    // Map intent to action — some intents route to existing handlers,
    // others use the AI's natural-language reply
    const intentActions: Record<Intent, (() => Promise<void>) | null> = {
      book: () => handleAIBooking(phone, ai),
      view_rooms: () => handleViewRooms(phone),
      check_availability: () => handleAIAvailabilityCheck(phone, ai),
      my_booking: () => handleMyBooking(phone),
      modify_booking: () => handleModifyBooking(phone),
      cancel_booking: () => handleCancelBooking(phone),
      contact: () => handleContactUs(phone),
      leave_review: () => handleLeaveReview(phone),
      room_service: async () => {
        await sendText(phone, ai.reply);
        await handleRoomService(phone);
      },
      concierge: async () => {
        await sendText(phone, ai.reply);
        await handleConcierge(phone);
      },
      greeting: async () => {
        await sendGreeting(phone, guestState, conversation?.guest_name);
      },
      unknown: async () => {
        await sendText(phone, ai.reply);
        await sendButtons(
          phone,
          "How else can I help?",
          getGreetingButtons(guestState)
        );
      },
    };

    const handler = intentActions[ai.intent];
    if (handler) {
      await handler();
    } else {
      await sendText(phone, ai.reply);
    }
  } catch (err) {
    console.error("AI interpretation failed:", err);
    // Log AI fallback
    if (conversation) {
      const hotelId = getHotelId();
      logEvent({
        hotelId,
        conversationId: conversation.id,
        phone,
        eventType: "ai_parse",
        aiIntent: "unknown",
        aiConfidence: "fallback",
        aiInputText: text.slice(0, 500),
      });
    }
    // Fallback to greeting on AI error
    await sendGreeting(phone, guestState, conversation?.guest_name);
  }
}

/** When AI detects booking intent and extracts dates, skip ahead in the flow. */
async function handleAIBooking(
  phone: string,
  _ai: Awaited<ReturnType<typeof interpretMessage>>
) {
  // Always start the step-by-step booking flow — no verbose AI text
  await handleBookingStart(phone);
}

/** When AI detects availability check intent. */
async function handleAIAvailabilityCheck(
  phone: string,
  ai: Awaited<ReturnType<typeof interpretMessage>>
) {
  const dates = ai.extracted.dates;

  if (dates?.check_in && dates?.check_out) {
    try {
      const available = await isAvailable(dates.check_in, dates.check_out);
      if (available) {
        await sendText(
          phone,
          `✅ Good news! We have availability from *${formatDate(dates.check_in)}* to *${formatDate(dates.check_out)}*.\n\nWould you like to book?`
        );
        await sendButtons(phone, "What would you like to do?", [
          { id: "book_now", title: "Book Now" },
          { id: "view_rooms", title: "View Rooms" },
        ]);
      } else {
        await sendText(
          phone,
          `Sorry, we're fully booked from ${formatDate(dates.check_in)} to ${formatDate(dates.check_out)}. 😔\n\nWould you like to check different dates?`
        );
      }
    } catch {
      await sendText(phone, ai.reply);
    }
  } else {
    await sendText(phone, ai.reply);
  }
}

/** Convert YYYY-MM-DD to DD/MM/YYYY for the date input handler. */
function formatDateForInput(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

// --- Utility ---

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hours = h % 12 || 12;
  return `${hours}:${String(m).padStart(2, "0")} ${period}`;
}
