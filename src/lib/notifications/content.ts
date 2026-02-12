import type { Hotel } from "@/lib/db";
import type { NotificationContent } from "./types";

export function buildContent(
  event: string,
  hotel: Hotel,
  data: Record<string, unknown>
): NotificationContent {
  const c = hotel.currency;

  switch (event) {
    case "new_booking": {
      const { guest_name, room_slug, check_in, check_out, total_price } = data as {
        guest_name: string; room_slug: string; check_in: string; check_out: string; total_price: number;
      };
      return {
        subject: `New booking at ${hotel.name}`,
        textBody:
          `New booking!\n\nGuest: ${guest_name}\nRoom: ${room_slug}\n` +
          `Dates: ${check_in} to ${check_out}\nTotal: ${c} ${total_price}`,
        htmlBody: `<h2>New Booking at ${hotel.name}</h2>
          <p><strong>Guest:</strong> ${guest_name}</p>
          <p><strong>Room:</strong> ${room_slug}</p>
          <p><strong>Dates:</strong> ${check_in} &rarr; ${check_out}</p>
          <p><strong>Total:</strong> ${c} ${total_price}</p>`,
      };
    }

    case "payment_received": {
      const { guest_name, amount, provider } = data as {
        guest_name: string; amount: number; provider: string;
      };
      return {
        subject: `Payment received - ${c} ${amount}`,
        textBody: `Payment received!\n\nGuest: ${guest_name}\nAmount: ${c} ${amount}\nProvider: ${provider}`,
        htmlBody: `<h2>Payment Received</h2>
          <p><strong>Guest:</strong> ${guest_name}</p>
          <p><strong>Amount:</strong> ${c} ${amount}</p>
          <p><strong>Provider:</strong> ${provider}</p>`,
      };
    }

    case "payment_failed": {
      const { guest_name, amount, reason } = data as {
        guest_name: string; amount: number; reason: string;
      };
      return {
        subject: `Payment failed - ${guest_name}`,
        textBody: `Payment failed.\n\nGuest: ${guest_name}\nAmount: ${c} ${amount}\nReason: ${reason}`,
        htmlBody: `<h2>Payment Failed</h2>
          <p><strong>Guest:</strong> ${guest_name}</p>
          <p><strong>Amount:</strong> ${c} ${amount}</p>
          <p><strong>Reason:</strong> ${reason}</p>`,
      };
    }

    case "new_review": {
      const { guest_name, rating, feedback } = data as {
        guest_name: string; rating: number; feedback: string | null;
      };
      const stars = "\u2605".repeat(rating) + "\u2606".repeat(5 - rating);
      return {
        subject: `New ${rating}-star review at ${hotel.name}`,
        textBody:
          `New review!\n\nGuest: ${guest_name}\nRating: ${stars} (${rating}/5)\n` +
          (feedback ? `Feedback: ${feedback}` : "No written feedback"),
        htmlBody: `<h2>New Review</h2>
          <p><strong>Guest:</strong> ${guest_name}</p>
          <p><strong>Rating:</strong> ${stars} (${rating}/5)</p>
          ${feedback ? `<p><strong>Feedback:</strong> ${feedback}</p>` : ""}`,
      };
    }

    case "disbursement_completed": {
      const { amount, recipient_phone } = data as {
        amount: number; recipient_phone: string;
      };
      return {
        subject: `Payout of ${c} ${amount} sent`,
        textBody: `Your payout of ${c} ${amount} has been sent to ${recipient_phone}.`,
        htmlBody: `<h2>Payout Completed</h2>
          <p>Your payout of <strong>${c} ${amount}</strong> has been sent to ${recipient_phone}.</p>`,
      };
    }

    case "disbursement_failed": {
      const { amount, error_message } = data as {
        amount: number; error_message: string;
      };
      return {
        subject: `Payout failed - ${c} ${amount}`,
        textBody: `Your payout of ${c} ${amount} failed.\n\nError: ${error_message}\n\nPlease check your MoMo number in settings.`,
        htmlBody: `<h2>Payout Failed</h2>
          <p>Your payout of <strong>${c} ${amount}</strong> failed.</p>
          <p><strong>Error:</strong> ${error_message}</p>
          <p>Please check your MoMo phone number in your hotel settings.</p>`,
      };
    }

    default:
      return {
        subject: `Notification from ${hotel.name}`,
        textBody: JSON.stringify(data),
        htmlBody: `<p>${JSON.stringify(data)}</p>`,
      };
  }
}
