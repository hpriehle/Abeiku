export type NotificationEvent =
  | "new_booking"
  | "payment_received"
  | "payment_failed"
  | "new_review"
  | "disbursement_completed"
  | "disbursement_failed";

export interface NotificationContent {
  subject: string;
  textBody: string;
  htmlBody: string;
}

export const NOTIFICATION_EVENTS: {
  event: NotificationEvent;
  label: string;
  description: string;
}[] = [
  { event: "new_booking", label: "New Booking", description: "When a guest creates a booking" },
  { event: "payment_received", label: "Payment Received", description: "When a payment completes" },
  { event: "payment_failed", label: "Payment Failed", description: "When a payment attempt fails" },
  { event: "new_review", label: "New Review", description: "When a guest leaves a review" },
  { event: "disbursement_completed", label: "Payout Sent", description: "When your payout arrives" },
  { event: "disbursement_failed", label: "Payout Failed", description: "When a payout fails" },
];
