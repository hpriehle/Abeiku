// WhatsApp Cloud API types

export type GuestState = "lead" | "booking_pending" | "current_guest" | "checked_out";

export type ConversationStep =
  | "idle"
  | "greeting"
  | "guest_count"
  | "room_browsing"
  | "room_selection"
  | "date_selection"
  | "guest_info"
  | "confirmation"
  | "payment_choice"
  | "payment_pending"
  | "modify_dates"
  | "room_service_order"
  | "review_feedback"
  | "confirm_momo_number"
  | "momo_number_input"
  | "momo_network_select"
  | "momo_otp_input"
  | "done";

export interface Conversation {
  id: string;
  hotel_id: string;
  phone: string;
  guest_name: string | null;
  guest_state: GuestState;
  step: ConversationStep;
  context: ConversationContext; // JSONB object, no longer a JSON string
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  hotel_id: string;
  phone: string;
  guest_name: string;
  room_slug: string;
  rooms_count: number;
  check_in: string;
  check_out: string;
  total_price: number;
  currency: string;
  payment_status: "unpaid" | "pending" | "paid" | "refunded";
  payment_provider: "momo" | "paystack" | null;
  booking_status: "confirmed" | "checked_in" | "checked_out" | "cancelled";
  calendar_event_id: string | null;
  booking_group_id: string | null;
  created_at: string;
  updated_at: string;
}

// WhatsApp webhook payload types
export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  value: {
    messaging_product: string;
    metadata: {
      display_phone_number: string;
      phone_number_id: string;
    };
    contacts?: { profile: { name: string }; wa_id: string }[];
    messages?: WhatsAppMessage[];
    statuses?: unknown[];
  };
  field: string;
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "text" | "interactive" | "image" | "document" | "audio" | "video" | "location" | "button";
  text?: { body: string };
  interactive?: {
    type: "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { text: string; payload: string };
}

// Outbound message types
export interface ButtonAction {
  id: string;
  title: string;
}

export interface ListSection {
  title: string;
  rows: { id: string; title: string; description?: string }[];
}

export interface ConversationContext {
  guest_name?: string;
  guest_count?: number;
  selected_room?: string;
  rooms_count?: number;
  check_in?: string;
  check_out?: string;
  total_price?: number;
  language?: string;
  booking_id?: string;
  booking_group_id?: string;
  modify_booking_id?: string;
  review_booking_id?: string;
  awaiting_wakeup?: boolean;
  review_rating?: number;
  momo_booking_id?: string;
  momo_network?: "mtn" | "vod" | "atl";
  momo_phone?: string;
  paystack_charge_reference?: string;
}
