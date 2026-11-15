import { describe, expect, it } from "vitest";
import { hotelView } from "./hotel-view";
import type { Hotel } from "@/lib/db";

const hotel = {
  id: "h1", name: "Aracuya", slug: "aracuya", contact_phone: "+233200000000", contact_email: "a@x.com",
  whatsapp_access_token: "EAAG-secret", whatsapp_verify_token: "verify-secret",
  stripe_secret_key: "sk_live_x", stripe_webhook_secret: "whsec_x",
  momo_phone: "+233240000000", momo_phone_verified: false,
  momo_verification_amount: 37, momo_verification_ref: "ref-123", momo_verification_attempts: 1,
  paystack_subaccount_code: "ACCT_x", paystack_transfer_recipient_code: "RCP_x",
} as unknown as Hotel;

describe("hotelView", () => {
  it("never contains tokens, keys or the MoMo verification amount", () => {
    const json = JSON.stringify(hotelView(hotel));
    for (const secret of ["EAAG-secret", "verify-secret", "sk_live_x", "whsec_x", "ref-123", "RCP_x", "ACCT_x"]) {
      expect(json).not.toContain(secret);
    }
    for (const key of ["whatsapp_access_token", "stripe_secret_key", "momo_verification_amount", "momo_verification_ref"]) {
      expect(json).not.toContain(key);
    }
  });
  it("keeps what the pages show, and says whether WhatsApp is configured", () => {
    expect(hotelView(hotel)).toMatchObject({ name: "Aracuya", contact_phone: "+233200000000", whatsapp_configured: true });
  });
});
