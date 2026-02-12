import { supabase } from "@/lib/supabase/client";
import { Booking, Conversation, ConversationContext, GuestState } from "@/lib/whatsapp/types";

// --- Hotel types ---

export interface Hotel {
  id: string;
  name: string;
  slug: string;
  contact_phone: string | null;
  contact_email: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_city: string | null;
  location_country: string | null;
  check_in_time: string;
  check_out_time: string;
  wifi_password: string | null;
  currency: string;
  referral_discount_percent: number;
  fee_type: "flat" | "percentage";
  fee_value: number;
  momo_phone: string | null;
  momo_phone_verified: boolean;
  momo_verification_amount: number | null;
  momo_verification_ref: string | null;
  momo_verification_attempts: number;
  momo_verification_sent_at: string | null;
  room_service_menu: RoomServiceCategory[];
  local_recommendations: RecommendationCategory[];
  greeting_message: string | null;
  billing_plan: string;
  whatsapp_access_token: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_waba_id: string | null;
  whatsapp_display_phone: string | null;
  whatsapp_verify_token: string | null;
  stripe_secret_key: string | null;
  stripe_webhook_secret: string | null;
  paystack_subaccount_code: string | null;
  payout_method: "bank" | "momo" | null;
  paystack_transfer_recipient_code: string | null;
  google_place_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoomServiceCategory {
  category: string;
  items: { name: string; price: number }[];
}

export interface RecommendationCategory {
  category: string;
  items: { name: string; description: string; distance: string }[];
}

export interface AdminUser {
  id: string;
  hotel_id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  created_at: string;
}

export interface PricingTier {
  rooms: number;
  price: number;
  label: string;
}

export type RoomType = "standard" | "group" | "individual";

export interface HotelRoom {
  id: string;
  hotel_id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  pricing_tiers: PricingTier[];
  total_rooms: number;
  size: string | null;
  bed_type: string | null;
  occupancy: number;
  amenities: string[];
  airbnb_url: string | null;
  images: { hero?: string; gallery?: string[] };
  calendar_id: string | null;
  room_type: RoomType;
  group_id: string | null;
  active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

// --- Hotel queries ---

export async function getHotelByWhatsAppPhoneNumberId(phoneNumberId: string): Promise<Hotel | null> {
  const { data, error } = await supabase
    .from("hotels")
    .select("*")
    .eq("whatsapp_phone_number_id", phoneNumberId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getHotelById(id: string): Promise<Hotel | null> {
  const { data, error } = await supabase
    .from("hotels")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getHotelBySlug(slug: string): Promise<Hotel | null> {
  const { data, error } = await supabase
    .from("hotels")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAllActiveHotels(): Promise<Hotel[]> {
  const { data, error } = await supabase
    .from("hotels")
    .select("*")
    .eq("active", true);
  if (error) throw error;
  return data ?? [];
}

export async function createHotel(hotel: Partial<Omit<Hotel, "id" | "active" | "created_at" | "updated_at">> & { name: string; slug: string }): Promise<Hotel> {
  const { data, error } = await supabase
    .from("hotels")
    .insert(hotel)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// --- Admin user queries ---

export async function getAdminUserByEmail(email: string): Promise<AdminUser | null> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("*")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createAdminUser(user: {
  hotel_id: string;
  email: string;
  password_hash: string;
  name: string;
  role?: string;
}): Promise<AdminUser> {
  const { data, error } = await supabase
    .from("admin_users")
    .insert({ ...user, email: user.email.toLowerCase() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// --- Room availability ---

export interface RoomAvailability {
  room: HotelRoom;
  availableRooms: number;
}

/** Count overlapping active bookings for a given room slug */
async function getBookedCount(
  hotelId: string,
  roomSlug: string,
  checkIn: string,
  checkOut: string
): Promise<number> {
  const { data, error } = await supabase
    .from("bookings")
    .select("rooms_count")
    .eq("hotel_id", hotelId)
    .eq("room_slug", roomSlug)
    .in("booking_status", ["confirmed", "checked_in"])
    .lt("check_in", checkOut)
    .gt("check_out", checkIn);

  if (error) throw error;
  return (data ?? []).reduce((sum, b) => sum + (b.rooms_count || 1), 0);
}

export async function getRoomAvailability(
  hotelId: string,
  checkIn: string,
  checkOut: string
): Promise<RoomAvailability[]> {
  const rooms = await getHotelRooms(hotelId);
  const results: RoomAvailability[] = [];

  for (const room of rooms) {
    if (room.room_type === "standard") {
      // Standard rooms: unchanged count-based logic
      const booked = await getBookedCount(hotelId, room.slug, checkIn, checkOut);
      results.push({ room, availableRooms: Math.max(0, room.total_rooms - booked) });

    } else if (room.room_type === "individual") {
      // Individual room: blocked if own booking exists OR parent group is booked
      const ownBooked = await getBookedCount(hotelId, room.slug, checkIn, checkOut);
      let groupBooked = 0;
      if (room.group_id) {
        const parentGroup = rooms.find(r => r.id === room.group_id);
        if (parentGroup) {
          groupBooked = await getBookedCount(hotelId, parentGroup.slug, checkIn, checkOut);
        }
      }
      const available = (ownBooked > 0 || groupBooked > 0) ? 0 : 1;
      results.push({ room, availableRooms: available });

    } else if (room.room_type === "group") {
      // Group listing: blocked if own booking exists OR any member room is booked
      const ownBooked = await getBookedCount(hotelId, room.slug, checkIn, checkOut);
      if (ownBooked > 0) {
        results.push({ room, availableRooms: 0 });
        continue;
      }
      const members = rooms.filter(r => r.group_id === room.id);
      let anyMemberBooked = false;
      for (const member of members) {
        const memberBooked = await getBookedCount(hotelId, member.slug, checkIn, checkOut);
        if (memberBooked > 0) { anyMemberBooked = true; break; }
      }
      results.push({ room, availableRooms: anyMemberBooked ? 0 : 1 });
    }
  }

  return results;
}

// --- Hotel room queries ---

export async function getHotelRooms(hotelId: string): Promise<HotelRoom[]> {
  const { data, error } = await supabase
    .from("hotel_rooms")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("active", true)
    .order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getHotelRoomBySlug(hotelId: string, slug: string): Promise<HotelRoom | null> {
  const { data, error } = await supabase
    .from("hotel_rooms")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Get all member rooms belonging to a group */
export async function getRoomGroupMembers(hotelId: string, groupId: string): Promise<HotelRoom[]> {
  const { data, error } = await supabase
    .from("hotel_rooms")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("group_id", groupId)
    .eq("active", true)
    .order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Get the parent group for an individual room (if any) */
export async function getRoomGroup(hotelId: string, roomId: string): Promise<HotelRoom | null> {
  // First get the room to find its group_id
  const { data: room, error: roomError } = await supabase
    .from("hotel_rooms")
    .select("group_id")
    .eq("id", roomId)
    .eq("hotel_id", hotelId)
    .maybeSingle();
  if (roomError) throw roomError;
  if (!room?.group_id) return null;

  const { data, error } = await supabase
    .from("hotel_rooms")
    .select("*")
    .eq("id", room.group_id)
    .eq("hotel_id", hotelId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Get all active bookings linked by a booking_group_id */
export async function getBookingsByGroupId(hotelId: string, bookingGroupId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("booking_group_id", bookingGroupId)
    .in("booking_status", ["confirmed", "checked_in"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Get all active bookings for a phone (supports multi-room bookings) */
export async function getActiveBookings(hotelId: string, phone: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("phone", phone)
    .in("booking_status", ["confirmed", "checked_in"])
    .order("check_in", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Get all group listings for a hotel */
export async function getRoomGroups(hotelId: string): Promise<HotelRoom[]> {
  const { data, error } = await supabase
    .from("hotel_rooms")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("room_type", "group")
    .eq("active", true)
    .order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// --- Conversation queries ---

export async function getConversation(hotelId: string, phone: string): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("phone", phone)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertConversation(
  hotelId: string,
  phone: string,
  updates: Partial<Pick<Conversation, "guest_state" | "step" | "context">> & { guest_name?: string }
): Promise<Conversation> {
  // Build update with only explicitly provided fields (preserves unmentioned columns)
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('guest_state' in updates) fields.guest_state = updates.guest_state;
  if ('step' in updates) fields.step = updates.step;
  if ('context' in updates) fields.context = updates.context;
  if ('guest_name' in updates) fields.guest_name = updates.guest_name;

  // Try update first (existing row — only touches provided fields)
  const { data: updated, error: updateError } = await supabase
    .from("conversations")
    .update(fields)
    .eq("hotel_id", hotelId)
    .eq("phone", phone)
    .select()
    .maybeSingle();

  if (updateError) throw updateError;
  if (updated) return updated;

  // No existing row — insert with defaults
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      hotel_id: hotelId,
      phone,
      guest_name: updates.guest_name ?? null,
      guest_state: updates.guest_state ?? "lead",
      step: updates.step ?? "idle",
      context: updates.context ?? {},
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// --- Booking queries ---

export async function getActiveBooking(hotelId: string, phone: string): Promise<Booking | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("phone", phone)
    .in("booking_status", ["confirmed", "checked_in"])
    .order("check_in", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getRecentBooking(hotelId: string, phone: string): Promise<Booking | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("phone", phone)
    .eq("booking_status", "checked_out")
    .order("check_out", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createBooking(
  hotelId: string,
  booking: Omit<Booking, "id" | "hotel_id" | "created_at" | "updated_at">
): Promise<Booking> {
  const { data, error } = await supabase
    .from("bookings")
    .insert({ ...booking, hotel_id: hotelId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBooking(hotelId: string, id: string, updates: Partial<Booking>): Promise<void> {
  const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = updates;
  const { error } = await supabase
    .from("bookings")
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("hotel_id", hotelId);
  if (error) throw error;
}

export async function getBookingById(hotelId: string, id: string): Promise<Booking | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .eq("hotel_id", hotelId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// --- Guest state determination ---

export async function determineGuestState(hotelId: string, phone: string): Promise<GuestState> {
  const today = new Date().toISOString().split("T")[0];

  // Check for active booking where guest is currently staying
  const { data: currentStay } = await supabase
    .from("bookings")
    .select("id")
    .eq("hotel_id", hotelId)
    .eq("phone", phone)
    .eq("booking_status", "checked_in")
    .lte("check_in", today)
    .gte("check_out", today)
    .limit(1)
    .maybeSingle();

  if (currentStay) return "current_guest";

  // Check for upcoming confirmed booking
  const { data: upcoming } = await supabase
    .from("bookings")
    .select("id")
    .eq("hotel_id", hotelId)
    .eq("phone", phone)
    .eq("booking_status", "confirmed")
    .gte("check_in", today)
    .limit(1)
    .maybeSingle();

  if (upcoming) return "booking_pending";

  // Check for past completed booking
  const { data: past } = await supabase
    .from("bookings")
    .select("id")
    .eq("hotel_id", hotelId)
    .eq("phone", phone)
    .eq("booking_status", "checked_out")
    .limit(1)
    .maybeSingle();

  if (past) return "checked_out";

  return "lead";
}

// --- Payment queries ---

export interface Payment {
  id: string;
  hotel_id: string;
  booking_id: string;
  provider: "momo" | "paystack" | "stripe";
  provider_tx_id: string | null;
  amount: number;
  platform_fee: number;
  hotel_amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "refunded";
  provider_status: string | null;
  phone: string | null;
  momo_phone: string | null;
  disbursement_status: "pending" | "processing" | "completed" | "failed" | null;
  disbursement_reference_id: string | null;
  disbursement_error: string | null;
  stripe_payment_link_id: string | null;
  paystack_reference: string | null;
  payment_channel: "card" | "mobile_money" | null;
  created_at: string;
  updated_at: string;
}

export async function createPayment(
  hotelId: string,
  payment: Omit<Payment, "id" | "hotel_id" | "created_at" | "updated_at">
): Promise<Payment> {
  const { data, error } = await supabase
    .from("payments")
    .insert({ ...payment, hotel_id: hotelId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Global lookup — payment callbacks don't know hotel yet
export async function getPaymentByProviderTx(providerTxId: string): Promise<Payment | null> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("provider_tx_id", providerTxId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Global lookup — Stripe callbacks use link ID
export async function getPaymentByStripeLinkId(linkId: string): Promise<Payment | null> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("stripe_payment_link_id", linkId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Global lookup — Paystack callbacks use reference
export async function getPaymentByPaystackReference(reference: string): Promise<Payment | null> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("paystack_reference", reference)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPendingPayment(hotelId: string, bookingId: string): Promise<Payment | null> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("booking_id", bookingId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updatePayment(hotelId: string, id: string, updates: Partial<Payment>): Promise<void> {
  const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = updates;
  const { error } = await supabase
    .from("payments")
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("hotel_id", hotelId);
  if (error) throw error;
}

// --- Templates sent (lifecycle message tracking) ---

export async function wasTemplateSent(hotelId: string, bookingId: string, templateType: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("templates_sent")
    .select("id")
    .eq("hotel_id", hotelId)
    .eq("booking_id", bookingId)
    .eq("template_type", templateType)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function recordTemplateSent(hotelId: string, bookingId: string, phone: string, templateType: string): Promise<void> {
  const { error } = await supabase
    .from("templates_sent")
    .insert({ hotel_id: hotelId, booking_id: bookingId, phone, template_type: templateType });
  if (error) throw error;
}

// --- Reviews ---

export interface Review {
  id: string;
  hotel_id: string;
  booking_id: string;
  phone: string;
  rating: number | null;
  feedback: string | null;
  created_at: string;
}

export async function hasReview(hotelId: string, bookingId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("reviews")
    .select("id")
    .eq("hotel_id", hotelId)
    .eq("booking_id", bookingId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function createReview(
  hotelId: string,
  review: { booking_id: string; phone: string; rating: number; feedback?: string }
): Promise<void> {
  const { error } = await supabase
    .from("reviews")
    .insert({
      hotel_id: hotelId,
      booking_id: review.booking_id,
      phone: review.phone,
      rating: review.rating,
      feedback: review.feedback ?? null,
    });
  if (error) throw error;
}

// --- Lifecycle queries ---

export async function getBookingsNeedingCheckinReminder(hotelId: string, tomorrow: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("check_in", tomorrow)
    .eq("booking_status", "confirmed");
  if (error) throw error;

  // Filter out those that already received the template
  const ids = (data ?? []).map((b) => b.id);
  if (ids.length === 0) return [];

  const { data: sent } = await supabase
    .from("templates_sent")
    .select("booking_id")
    .eq("hotel_id", hotelId)
    .eq("template_type", "checkin_reminder")
    .in("booking_id", ids);

  const sentIds = new Set((sent ?? []).map((s) => s.booking_id));
  return (data ?? []).filter((b) => !sentIds.has(b.id));
}

export async function getBookingsNeedingCheckoutReminder(hotelId: string, today: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("check_out", today)
    .in("booking_status", ["confirmed", "checked_in"]);
  if (error) throw error;

  const ids = (data ?? []).map((b) => b.id);
  if (ids.length === 0) return [];

  const { data: sent } = await supabase
    .from("templates_sent")
    .select("booking_id")
    .eq("hotel_id", hotelId)
    .eq("template_type", "checkout_reminder")
    .in("booking_id", ids);

  const sentIds = new Set((sent ?? []).map((s) => s.booking_id));
  return (data ?? []).filter((b) => !sentIds.has(b.id));
}

export async function getBookingsNeedingReviewRequest(hotelId: string, twoDaysAgo: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("check_out", twoDaysAgo)
    .eq("booking_status", "checked_out");
  if (error) throw error;

  const ids = (data ?? []).map((b) => b.id);
  if (ids.length === 0) return [];

  // Exclude bookings that already have reviews
  const { data: reviewed } = await supabase
    .from("reviews")
    .select("booking_id")
    .eq("hotel_id", hotelId)
    .in("booking_id", ids);

  // Exclude bookings that already received review_request
  const { data: sent } = await supabase
    .from("templates_sent")
    .select("booking_id")
    .eq("hotel_id", hotelId)
    .eq("template_type", "review_request")
    .in("booking_id", ids);

  const reviewedIds = new Set((reviewed ?? []).map((r) => r.booking_id));
  const sentIds = new Set((sent ?? []).map((s) => s.booking_id));
  return (data ?? []).filter((b) => !reviewedIds.has(b.id) && !sentIds.has(b.id));
}

export async function getGuestsNeedingReturnOffer(hotelId: string, cutoffDate: string): Promise<Booking[]> {
  // Get checked-out bookings before cutoff
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("booking_status", "checked_out")
    .lte("check_out", cutoffDate)
    .order("check_out", { ascending: false });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Exclude guests who have active/upcoming bookings
  const phones = [...new Set(data.map((b) => b.phone))];
  const { data: activeBookings } = await supabase
    .from("bookings")
    .select("phone")
    .eq("hotel_id", hotelId)
    .in("booking_status", ["confirmed", "checked_in"])
    .in("phone", phones);

  const activePhones = new Set((activeBookings ?? []).map((b) => b.phone));

  // Exclude guests who already received return_offer
  const { data: sent } = await supabase
    .from("templates_sent")
    .select("phone")
    .eq("hotel_id", hotelId)
    .eq("template_type", "return_offer")
    .in("phone", phones);

  const sentPhones = new Set((sent ?? []).map((s) => s.phone));

  // Return one booking per phone (most recent)
  const seen = new Set<string>();
  return data.filter((b) => {
    if (activePhones.has(b.phone) || sentPhones.has(b.phone) || seen.has(b.phone)) return false;
    seen.add(b.phone);
    return true;
  });
}

export async function getGuestsNeedingPhotoInvite(hotelId: string, checkoutDate: string): Promise<Booking[]> {
  // Get checked-out bookings for the date
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("check_out", checkoutDate)
    .eq("booking_status", "checked_out");
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const ids = data.map((b) => b.id);

  // Get bookings with good reviews (4+)
  const { data: goodReviews } = await supabase
    .from("reviews")
    .select("booking_id")
    .eq("hotel_id", hotelId)
    .gte("rating", 4)
    .in("booking_id", ids);

  const goodReviewIds = new Set((goodReviews ?? []).map((r) => r.booking_id));

  // Exclude already-sent photo invites
  const { data: sent } = await supabase
    .from("templates_sent")
    .select("booking_id")
    .eq("hotel_id", hotelId)
    .eq("template_type", "photo_invite")
    .in("booking_id", ids);

  const sentIds = new Set((sent ?? []).map((s) => s.booking_id));

  return data.filter((b) => goodReviewIds.has(b.id) && !sentIds.has(b.id));
}

export async function recordTemplateSentByPhone(hotelId: string, phone: string, templateType: string): Promise<void> {
  const { error } = await supabase
    .from("templates_sent")
    .insert({ hotel_id: hotelId, booking_id: null, phone, template_type: templateType });
  if (error) throw error;
}

// --- Wake-up calls ---

export interface WakeupCall {
  id: string;
  hotel_id: string;
  phone: string;
  booking_id: string | null;
  scheduled_date: string;
  scheduled_time: string;
  sent: boolean;
  created_at: string;
}

export async function createWakeupCall(
  hotelId: string,
  call: { phone: string; booking_id?: string; scheduled_date: string; scheduled_time: string }
): Promise<void> {
  const { error } = await supabase
    .from("wakeup_calls")
    .insert({
      hotel_id: hotelId,
      phone: call.phone,
      booking_id: call.booking_id ?? null,
      scheduled_date: call.scheduled_date,
      scheduled_time: call.scheduled_time,
    });
  if (error) throw error;
}

export async function getPendingWakeupCalls(hotelId: string, date: string, currentTime: string): Promise<WakeupCall[]> {
  const { data, error } = await supabase
    .from("wakeup_calls")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("scheduled_date", date)
    .lte("scheduled_time", currentTime)
    .eq("sent", false)
    .order("scheduled_time", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function markWakeupSent(hotelId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("wakeup_calls")
    .update({ sent: true })
    .eq("id", id)
    .eq("hotel_id", hotelId);
  if (error) throw error;
}

// --- Referral codes ---

export interface ReferralCode {
  id: string;
  hotel_id: string;
  code: string;
  referrer_phone: string;
  discount_percent: number;
  uses: number;
  max_uses: number;
  created_at: string;
}

function generateCode(prefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = `${prefix}-`;
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function getOrCreateReferralCode(hotelId: string, phone: string, hotelSlug: string): Promise<ReferralCode> {
  const { data: existing } = await supabase
    .from("referral_codes")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("referrer_phone", phone)
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const prefix = hotelSlug.toUpperCase();
  let code: string;
  let attempts = 0;
  do {
    code = generateCode(prefix);
    const { data: collision } = await supabase
      .from("referral_codes")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    if (!collision) break;
    attempts++;
  } while (attempts < 10);

  const { data, error } = await supabase
    .from("referral_codes")
    .insert({ hotel_id: hotelId, code, referrer_phone: phone })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function lookupReferralCode(hotelId: string, code: string): Promise<ReferralCode | null> {
  const { data, error } = await supabase
    .from("referral_codes")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error) throw error;

  // Check uses < max_uses manually since Supabase doesn't support cross-column filters
  if (data && data.uses >= data.max_uses) return null;
  return data;
}

export async function useReferralCode(hotelId: string, code: string): Promise<void> {
  const { error } = await supabase.rpc("increment_referral_uses", {
    p_hotel_id: hotelId,
    p_code: code.toUpperCase(),
  });
  // Fallback if RPC not set up
  if (error) {
    const { data: existing } = await supabase
      .from("referral_codes")
      .select("uses")
      .eq("hotel_id", hotelId)
      .eq("code", code.toUpperCase())
      .single();
    if (existing) {
      await supabase
        .from("referral_codes")
        .update({ uses: existing.uses + 1 })
        .eq("hotel_id", hotelId)
        .eq("code", code.toUpperCase());
    }
  }
}

// --- OAuth token queries ---

export interface OAuthToken {
  id: string;
  hotel_id: string;
  provider: string;
  scope: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  calendar_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function getOAuthToken(hotelId: string, provider = "google"): Promise<OAuthToken | null> {
  const { data, error } = await supabase
    .from("oauth_tokens")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertOAuthToken(
  hotelId: string,
  token: {
    provider?: string;
    scope: string;
    access_token: string;
    refresh_token: string;
    expires_at: string;
    calendar_id?: string;
  }
): Promise<void> {
  const provider = token.provider ?? "google";
  const { error } = await supabase
    .from("oauth_tokens")
    .upsert(
      {
        hotel_id: hotelId,
        provider,
        scope: token.scope,
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: token.expires_at,
        calendar_id: token.calendar_id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "hotel_id,provider" }
    );
  if (error) throw error;
}

// --- Admin dashboard queries ---

export interface BookingStats {
  total: number;
  confirmed: number;
  checked_in: number;
  checked_out: number;
  cancelled: number;
  totalRevenue: number;
  paidRevenue: number;
}

export async function getBookingStats(hotelId: string): Promise<BookingStats> {
  const { data, error } = await supabase
    .from("bookings")
    .select("booking_status, payment_status, total_price")
    .eq("hotel_id", hotelId);
  if (error) throw error;

  const bookings = data ?? [];
  return {
    total: bookings.length,
    confirmed: bookings.filter((b) => b.booking_status === "confirmed").length,
    checked_in: bookings.filter((b) => b.booking_status === "checked_in").length,
    checked_out: bookings.filter((b) => b.booking_status === "checked_out").length,
    cancelled: bookings.filter((b) => b.booking_status === "cancelled").length,
    totalRevenue: bookings.reduce((sum, b) => sum + (b.total_price ?? 0), 0),
    paidRevenue: bookings
      .filter((b) => b.payment_status === "paid")
      .reduce((sum, b) => sum + (b.total_price ?? 0), 0),
  };
}

export interface ReviewStats {
  totalReviews: number;
  averageRating: number;
  fiveStars: number;
  fourStars: number;
  threeStars: number;
  twoStars: number;
  oneStar: number;
}

export async function getReviewStats(hotelId: string): Promise<ReviewStats> {
  const { data, error } = await supabase
    .from("reviews")
    .select("rating")
    .eq("hotel_id", hotelId)
    .not("rating", "is", null);
  if (error) throw error;

  const reviews = data ?? [];
  const ratings = reviews.map((r) => r.rating as number);
  return {
    totalReviews: ratings.length,
    averageRating: ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
    fiveStars: ratings.filter((r) => r === 5).length,
    fourStars: ratings.filter((r) => r === 4).length,
    threeStars: ratings.filter((r) => r === 3).length,
    twoStars: ratings.filter((r) => r === 2).length,
    oneStar: ratings.filter((r) => r === 1).length,
  };
}

export async function getAllBookings(
  hotelId: string,
  options?: { status?: string; limit?: number; offset?: number }
): Promise<Booking[]> {
  let query = supabase
    .from("bookings")
    .select("*")
    .eq("hotel_id", hotelId)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 50);

  if (options?.status) {
    query = query.eq("booking_status", options.status);
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getTotalBookingCount(hotelId: string, status?: string): Promise<number> {
  let query = supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("hotel_id", hotelId);

  if (status) {
    query = query.eq("booking_status", status);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function getBookingsForMonth(
  hotelId: string,
  year: number,
  month: number // 1-12
): Promise<Booking[]> {
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0); // last day of month
  const lastDayStr = `${year}-${String(month).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("hotel_id", hotelId)
    .neq("booking_status", "cancelled")
    .lte("check_in", lastDayStr)
    .gte("check_out", firstDay)
    .order("check_in", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export interface ReviewWithBooking extends Review {
  guest_name: string;
  room_slug: string;
  check_in: string;
  check_out: string;
}

export async function getAllReviews(hotelId: string, limit = 50, offset = 0): Promise<ReviewWithBooking[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("*, bookings!inner(guest_name, room_slug, check_in, check_out)")
    .eq("hotel_id", hotelId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  // Flatten the join result
  return (data ?? []).map((r) => {
    const booking = r.bookings as unknown as { guest_name: string; room_slug: string; check_in: string; check_out: string };
    return {
      id: r.id,
      hotel_id: r.hotel_id,
      booking_id: r.booking_id,
      phone: r.phone,
      rating: r.rating,
      feedback: r.feedback,
      created_at: r.created_at,
      guest_name: booking.guest_name,
      room_slug: booking.room_slug,
      check_in: booking.check_in,
      check_out: booking.check_out,
    };
  });
}

export async function getConversationCount(hotelId: string): Promise<number> {
  const { count, error } = await supabase
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("hotel_id", hotelId);
  if (error) throw error;
  return count ?? 0;
}

export async function getReferralStats(hotelId: string): Promise<{ totalCodes: number; totalUses: number }> {
  const { data, error } = await supabase
    .from("referral_codes")
    .select("uses")
    .eq("hotel_id", hotelId);
  if (error) throw error;

  const codes = data ?? [];
  return {
    totalCodes: codes.length,
    totalUses: codes.reduce((sum, c) => sum + c.uses, 0),
  };
}

// --- Hotel update ---

export async function updateHotel(
  hotelId: string,
  updates: Partial<Omit<Hotel, "id" | "created_at" | "updated_at" | "active" | "slug">>
): Promise<Hotel> {
  const { data, error } = await supabase
    .from("hotels")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", hotelId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// --- Room CRUD ---

export async function createHotelRoom(
  hotelId: string,
  room: Omit<HotelRoom, "id" | "hotel_id" | "created_at" | "updated_at" | "active">
): Promise<HotelRoom> {
  const { data, error } = await supabase
    .from("hotel_rooms")
    .insert({
      ...room,
      hotel_id: hotelId,
      active: true,
      room_type: room.room_type ?? "standard",
      group_id: room.group_id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateHotelRoom(
  hotelId: string,
  roomId: string,
  updates: Partial<Omit<HotelRoom, "id" | "hotel_id" | "created_at" | "updated_at">>
): Promise<HotelRoom> {
  const { data, error } = await supabase
    .from("hotel_rooms")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", roomId)
    .eq("hotel_id", hotelId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteHotelRoom(hotelId: string, roomId: string): Promise<void> {
  const { error } = await supabase
    .from("hotel_rooms")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", roomId)
    .eq("hotel_id", hotelId);
  if (error) throw error;
}

export async function reorderHotelRooms(hotelId: string, orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("hotel_rooms")
      .update({ position: i, updated_at: new Date().toISOString() })
      .eq("id", orderedIds[i])
      .eq("hotel_id", hotelId);
    if (error) throw error;
  }
}

export async function getNextRoomPosition(hotelId: string): Promise<number> {
  const { data, error } = await supabase
    .from("hotel_rooms")
    .select("position")
    .eq("hotel_id", hotelId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.position ?? -1) + 1;
}

// --- Message templates ---

export interface MessageTemplate {
  id: string;
  hotel_id: string;
  template_type: string;
  body: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getMessageTemplates(hotelId: string): Promise<MessageTemplate[]> {
  try {
    const { data, error } = await supabase
      .from("message_templates")
      .select("*")
      .eq("hotel_id", hotelId)
      .order("template_type");
    if (error) {
      console.warn("getMessageTemplates error (table may not exist yet):", error.message);
      return [];
    }
    return data ?? [];
  } catch {
    return [];
  }
}

export async function upsertMessageTemplate(
  hotelId: string,
  templateType: string,
  body: string,
  active: boolean
): Promise<MessageTemplate> {
  const { data, error } = await supabase
    .from("message_templates")
    .upsert(
      {
        hotel_id: hotelId,
        template_type: templateType,
        body,
        active,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "hotel_id,template_type" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getTemplateSentCounts(hotelId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("templates_sent")
    .select("template_type")
    .eq("hotel_id", hotelId);
  if (error) return {};

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.template_type] = (counts[row.template_type] || 0) + 1;
  }
  return counts;
}

// --- Disbursement queries ---

export interface Disbursement {
  id: string;
  payment_id: string;
  hotel_id: string;
  amount: number;
  recipient_phone: string;
  method: "mtn_direct" | "paystack_transfer";
  mtn_reference_id: string | null;
  paystack_transfer_code: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export async function createDisbursement(
  data: Omit<Disbursement, "id" | "created_at" | "completed_at" | "mtn_reference_id" | "paystack_transfer_code" | "error_message">
): Promise<Disbursement> {
  const { data: disbursement, error } = await supabase
    .from("disbursements")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return disbursement;
}

export async function updateDisbursement(
  id: string,
  updates: Partial<Pick<Disbursement, "status" | "mtn_reference_id" | "paystack_transfer_code" | "error_message" | "completed_at">>
): Promise<void> {
  const { error } = await supabase
    .from("disbursements")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

export async function getDisbursementByPaymentId(paymentId: string): Promise<Disbursement | null> {
  const { data, error } = await supabase
    .from("disbursements")
    .select("*")
    .eq("payment_id", paymentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getDisbursementByMtnReference(mtnReferenceId: string): Promise<Disbursement | null> {
  const { data, error } = await supabase
    .from("disbursements")
    .select("*")
    .eq("mtn_reference_id", mtnReferenceId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getFailedDisbursements(limit = 20): Promise<Disbursement[]> {
  const { data, error } = await supabase
    .from("disbursements")
    .select("*")
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// --- Platform earnings queries ---

export interface PlatformEarning {
  id: string;
  payment_id: string;
  hotel_id: string;
  amount: number;
  fee_type: string;
  fee_value: number;
  created_at: string;
}

export async function createPlatformEarning(
  data: Omit<PlatformEarning, "id" | "created_at">
): Promise<PlatformEarning> {
  const { data: earning, error } = await supabase
    .from("platform_earnings")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return earning;
}

// --- Payment dashboard queries ---

export interface PaymentWithBooking extends Payment {
  guest_name: string | null;
  room_slug: string | null;
}

export async function getPaymentsForHotel(
  hotelId: string,
  filters?: { status?: Payment["status"]; provider?: Payment["provider"]; limit?: number; offset?: number }
): Promise<PaymentWithBooking[]> {
  let query = supabase
    .from("payments")
    .select("*, bookings!inner(guest_name, room_slug)")
    .eq("hotel_id", hotelId)
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.provider) query = query.eq("provider", filters.provider);
  if (filters?.limit) query = query.limit(filters.limit);
  if (filters?.offset) query = query.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => {
    const booking = row.bookings as { guest_name: string | null; room_slug: string | null } | null;
    const { bookings: _, ...payment } = row;
    return {
      ...payment,
      guest_name: booking?.guest_name ?? null,
      room_slug: booking?.room_slug ?? null,
    } as PaymentWithBooking;
  });
}

export async function getPaymentStats(
  hotelId: string
): Promise<{
  total: number;
  completed: number;
  failed: number;
  pending: number;
  totalAmount: number;
  totalFees: number;
}> {
  const { data, error } = await supabase
    .from("payments")
    .select("status, amount, platform_fee")
    .eq("hotel_id", hotelId);
  if (error) throw error;

  const payments = data ?? [];
  return {
    total: payments.length,
    completed: payments.filter((p) => p.status === "completed").length,
    failed: payments.filter((p) => p.status === "failed").length,
    pending: payments.filter((p) => p.status === "pending").length,
    totalAmount: payments
      .filter((p) => p.status === "completed")
      .reduce((sum, p) => sum + (p.amount - p.platform_fee), 0),
    totalFees: payments
      .filter((p) => p.status === "completed")
      .reduce((sum, p) => sum + p.platform_fee, 0),
  };
}

export async function getDisbursementsForHotel(
  hotelId: string,
  limit = 50
): Promise<Disbursement[]> {
  const { data, error } = await supabase
    .from("disbursements")
    .select("*")
    .eq("hotel_id", hotelId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getPlatformStats(): Promise<{
  totalEarnings: number;
  totalProcessed: number;
  activeHotels: number;
}> {
  const [earningsRes, paymentsRes, hotelsRes] = await Promise.all([
    supabase.from("platform_earnings").select("amount"),
    supabase.from("payments").select("amount").eq("status", "completed"),
    supabase.from("hotels").select("id").eq("active", true),
  ]);

  if (earningsRes.error) throw earningsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;
  if (hotelsRes.error) throw hotelsRes.error;

  return {
    totalEarnings: (earningsRes.data ?? []).reduce((sum, e) => sum + e.amount, 0),
    totalProcessed: (paymentsRes.data ?? []).reduce((sum, p) => sum + p.amount, 0),
    activeHotels: (hotelsRes.data ?? []).length,
  };
}

export async function getAllHotelEarnings(): Promise<
  Array<{ hotel_id: string; hotel_name: string; total: number; fee_count: number; payout_method: string | null }>
> {
  const { data: earnings, error: earningsError } = await supabase
    .from("platform_earnings")
    .select("hotel_id, amount");
  if (earningsError) throw earningsError;

  const { data: hotels, error: hotelsError } = await supabase
    .from("hotels")
    .select("id, name, payout_method")
    .eq("active", true);
  if (hotelsError) throw hotelsError;

  const hotelMap = new Map((hotels ?? []).map((h: { id: string; name: string; payout_method: string | null }) => [h.id, h]));
  const grouped: Record<string, { total: number; fee_count: number }> = {};

  for (const e of earnings ?? []) {
    if (!grouped[e.hotel_id]) grouped[e.hotel_id] = { total: 0, fee_count: 0 };
    grouped[e.hotel_id].total += e.amount;
    grouped[e.hotel_id].fee_count += 1;
  }

  return Object.entries(grouped).map(([hotelId, stats]) => {
    const hotel = hotelMap.get(hotelId);
    return {
      hotel_id: hotelId,
      hotel_name: hotel?.name ?? "Unknown",
      total: stats.total,
      fee_count: stats.fee_count,
      payout_method: hotel?.payout_method ?? null,
    };
  });
}

// --- Global payment lookup (no hotel_id needed) ---

export async function getPaymentById(id: string): Promise<Payment | null> {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updatePaymentGlobal(id: string, updates: Partial<Payment>): Promise<void> {
  const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = updates;
  const { error } = await supabase
    .from("payments")
    .update({ ...rest, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// --- Notification preferences ---

import type { NotificationEvent } from "@/lib/notifications/types";

export interface NotificationPreference {
  id: string;
  hotel_id: string;
  event_type: NotificationEvent;
  whatsapp_enabled: boolean;
  email_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export async function getNotificationPreferences(
  hotelId: string
): Promise<NotificationPreference[]> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("hotel_id", hotelId)
    .order("event_type");
  if (error) throw error;
  return data ?? [];
}

export async function upsertNotificationPreference(
  hotelId: string,
  eventType: NotificationEvent,
  updates: { whatsapp_enabled?: boolean; email_enabled?: boolean }
): Promise<void> {
  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      {
        hotel_id: hotelId,
        event_type: eventType,
        ...updates,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "hotel_id,event_type" }
    );
  if (error) throw error;
}

export async function seedDefaultNotificationPreferences(
  hotelId: string
): Promise<void> {
  const events: NotificationEvent[] = [
    "new_booking",
    "payment_received",
    "payment_failed",
    "new_review",
    "disbursement_completed",
    "disbursement_failed",
  ];

  const rows = events.map((event_type) => ({
    hotel_id: hotelId,
    event_type,
    whatsapp_enabled: false,
    email_enabled: true,
  }));

  const { error } = await supabase
    .from("notification_preferences")
    .upsert(rows, { onConflict: "hotel_id,event_type" });
  if (error) throw error;
}

// --- Notification log ---

export interface NotificationLogEntry {
  hotel_id: string;
  event_type: string;
  channel: "whatsapp" | "email";
  recipient: string;
  subject: string | null;
  body_preview: string | null;
  status: "sent" | "failed" | "skipped";
  error_message: string | null;
  metadata: Record<string, unknown>;
}

export async function createNotificationLog(
  entry: NotificationLogEntry
): Promise<void> {
  const { error } = await supabase
    .from("notification_log")
    .insert(entry);
  if (error) {
    console.error("Failed to log notification:", error.message);
  }
}

export async function getNotificationLog(
  hotelId: string,
  limit = 50
): Promise<(NotificationLogEntry & { id: string; created_at: string })[]> {
  const { data, error } = await supabase
    .from("notification_log")
    .select("*")
    .eq("hotel_id", hotelId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// --- Chat analytics types ---

export interface ChatMessage {
  id: string;
  hotel_id: string;
  conversation_id: string;
  phone: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string | null;
  raw_payload: object;
  wa_message_id: string | null;
  sender_type: "guest" | "bot" | "admin";
  sender_name: string | null;
  guest_state: string | null;
  step: string | null;
  created_at: string;
}

export interface ConversationListItem {
  id: string;
  phone: string;
  guest_name: string | null;
  guest_state: string;
  step: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  created_at: string;
}

// --- Chat analytics queries ---

export async function getConversationList(
  hotelId: string,
  options?: { limit?: number; offset?: number; state?: string; search?: string }
): Promise<{ conversations: ConversationListItem[]; total: number }> {
  const limit = options?.limit ?? 30;
  const offset = options?.offset ?? 0;

  let query = supabase
    .from("conversations")
    .select("id, phone, guest_name, guest_state, step, last_message_at, last_message_preview, unread_count, created_at", { count: "exact" })
    .eq("hotel_id", hotelId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (options?.state) {
    query = query.eq("guest_state", options.state);
  }
  if (options?.search) {
    query = query.or(`guest_name.ilike.%${options.search}%,phone.ilike.%${options.search}%`);
  }

  const { data, count, error } = await query;
  if (error) throw error;
  return { conversations: data ?? [], total: count ?? 0 };
}

export async function getMessagesForConversation(
  hotelId: string,
  conversationId: string,
  options?: { limit?: number; before?: string }
): Promise<ChatMessage[]> {
  let query = supabase
    .from("chat_messages")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? 50);

  if (options?.before) {
    query = query.lt("created_at", options.before);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reverse();
}

export async function getLastInboundMessageTime(
  hotelId: string,
  conversationId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("created_at")
    .eq("hotel_id", hotelId)
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.created_at ?? null;
}

export async function resetUnreadCount(hotelId: string, conversationId: string): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId)
    .eq("hotel_id", hotelId);
  if (error) throw error;
}

function getPeriodStart(period: string): string {
  const now = new Date();
  switch (period) {
    case "24h": now.setHours(now.getHours() - 24); break;
    case "7d": now.setDate(now.getDate() - 7); break;
    case "30d": now.setDate(now.getDate() - 30); break;
    case "90d": now.setDate(now.getDate() - 90); break;
    default: now.setDate(now.getDate() - 7);
  }
  return now.toISOString();
}

export interface ChatStats {
  totalMessages: number;
  inboundMessages: number;
  outboundMessages: number;
  activeConversations: number;
  aiSuccessRate: number;
  aiTotal: number;
  conversionRate: number;
  leadsCount: number;
  bookedCount: number;
  funnel: Record<string, number>;
  aiIntents: { intent: string; count: number }[];
  aiAvgResponseMs: number;
  messagesPerDay: { date: string; inbound: number; outbound: number }[];
}

export async function getChatStats(hotelId: string, period: string): Promise<ChatStats> {
  const since = getPeriodStart(period);

  const [messagesRes, funnelRes, aiRes] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("direction, conversation_id, created_at")
      .eq("hotel_id", hotelId)
      .gte("created_at", since),
    supabase
      .from("conversation_events")
      .select("funnel_step, conversation_id")
      .eq("hotel_id", hotelId)
      .eq("event_type", "funnel_step")
      .gte("created_at", since),
    supabase
      .from("conversation_events")
      .select("ai_intent, ai_confidence, ai_response_time_ms")
      .eq("hotel_id", hotelId)
      .eq("event_type", "ai_parse")
      .gte("created_at", since),
  ]);

  if (messagesRes.error) throw messagesRes.error;
  if (funnelRes.error) throw funnelRes.error;
  if (aiRes.error) throw aiRes.error;

  const msgs = messagesRes.data ?? [];
  const inbound = msgs.filter(m => m.direction === "inbound").length;
  const outbound = msgs.filter(m => m.direction === "outbound").length;

  // Active conversations
  const uniqueConvIds = new Set(msgs.map(m => m.conversation_id).filter(Boolean));

  // Funnel data — count unique conversations per step
  const funnel: Record<string, number> = {
    lead: 0, room_view: 0, dates_entered: 0, guest_info: 0,
    confirmed: 0, payment_initiated: 0, booked: 0,
  };
  const funnelConvs: Record<string, Set<string>> = {};
  for (const e of funnelRes.data ?? []) {
    if (e.funnel_step && e.funnel_step in funnel) {
      if (!funnelConvs[e.funnel_step]) funnelConvs[e.funnel_step] = new Set();
      funnelConvs[e.funnel_step].add(e.conversation_id);
    }
  }
  for (const step of Object.keys(funnel)) {
    funnel[step] = funnelConvs[step]?.size ?? 0;
  }

  // AI stats
  const aiList = aiRes.data ?? [];
  const aiSuccess = aiList.filter(e => e.ai_confidence === "parsed").length;
  const aiAvg = aiList.length > 0
    ? Math.round(aiList.reduce((sum, e) => sum + (e.ai_response_time_ms ?? 0), 0) / aiList.length)
    : 0;

  const intentCounts: Record<string, number> = {};
  for (const e of aiList) {
    if (e.ai_intent) {
      intentCounts[e.ai_intent] = (intentCounts[e.ai_intent] || 0) + 1;
    }
  }
  const aiIntents = Object.entries(intentCounts)
    .map(([intent, count]) => ({ intent, count }))
    .sort((a, b) => b.count - a.count);

  // Messages per day
  const dayMap: Record<string, { inbound: number; outbound: number }> = {};
  for (const m of msgs) {
    const day = m.created_at.split("T")[0];
    if (!dayMap[day]) dayMap[day] = { inbound: 0, outbound: 0 };
    dayMap[day][m.direction as "inbound" | "outbound"]++;
  }
  const messagesPerDay = Object.entries(dayMap)
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const leadsCount = funnel.room_view || uniqueConvIds.size;
  const bookedCount = funnel.booked;

  return {
    totalMessages: msgs.length,
    inboundMessages: inbound,
    outboundMessages: outbound,
    activeConversations: uniqueConvIds.size,
    aiSuccessRate: aiList.length > 0 ? Math.round((aiSuccess / aiList.length) * 100) : 100,
    aiTotal: aiList.length,
    conversionRate: leadsCount > 0 ? Math.round((bookedCount / leadsCount) * 100) : 0,
    leadsCount,
    bookedCount,
    funnel,
    aiIntents,
    aiAvgResponseMs: aiAvg,
    messagesPerDay,
  };
}
