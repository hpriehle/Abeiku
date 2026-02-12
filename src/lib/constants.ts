export const COMMON_AMENITIES = [
  "Air Conditioning",
  "Wi-Fi",
  "TV",
  "Mini Bar",
  "Safe",
  "Balcony",
  "Ocean View",
  "City View",
  "Pool Access",
  "Gym Access",
  "Room Service",
  "Laundry Service",
  "Iron & Ironing Board",
  "Hairdryer",
  "Bathrobes & Slippers",
  "Rain Shower",
  "Soaking Tub",
  "Coffee/Tea Maker",
  "Desk & Chair",
  "Blackout Curtains",
] as const;

export const BED_TYPES = [
  "King",
  "Queen",
  "Twin",
  "Double",
  "Single",
  "Bunk",
] as const;

export const TEMPLATE_TYPES = [
  {
    type: "checkin_reminder",
    label: "Check-in Reminder",
    trigger: "1 day before arrival",
    defaultBody:
      "Hi {guest_name}! Just a reminder that your stay at {hotel_name} begins tomorrow. Check-in is at {check_in_time}. We look forward to welcoming you!",
    placeholders: ["guest_name", "hotel_name", "check_in_time", "check_in_date"],
  },
  {
    type: "checkout_reminder",
    label: "Checkout Reminder",
    trigger: "Morning of departure",
    defaultBody:
      "Good morning {guest_name}! Today is your checkout day. Checkout is at {check_out_time}. We hope you enjoyed your stay at {hotel_name}!",
    placeholders: ["guest_name", "hotel_name", "check_out_time", "check_out_date"],
  },
  {
    type: "review_request",
    label: "Review Request",
    trigger: "2 days after checkout",
    defaultBody:
      "Hi {guest_name}, thank you for staying with us at {hotel_name}! We'd love to hear about your experience. How would you rate your stay?",
    placeholders: ["guest_name", "hotel_name"],
  },
  {
    type: "return_offer",
    label: "Return Offer",
    trigger: "30 days after checkout",
    defaultBody:
      "Hi {guest_name}! We miss you at {hotel_name}. Book your next stay and enjoy a special returning guest discount!",
    placeholders: ["guest_name", "hotel_name", "discount_percent"],
  },
  {
    type: "photo_invite",
    label: "Photo Invite",
    trigger: "5 days after checkout (4+ star rating)",
    defaultBody:
      "Hi {guest_name}! We're so glad you enjoyed your stay at {hotel_name}. Would you like to share any photos from your visit? We'd love to feature them!",
    placeholders: ["guest_name", "hotel_name"],
  },
  {
    type: "wakeup_call",
    label: "Wake-up Call",
    trigger: "Scheduled by guest",
    defaultBody:
      "Good morning {guest_name}! This is your {wakeup_time} wake-up call. Have a wonderful day!",
    placeholders: ["guest_name", "wakeup_time"],
  },
] as const;
