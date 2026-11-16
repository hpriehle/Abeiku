// Public marketing site (landing page, sign-up placeholder): one place for the
// contact address and the prices shown to hotels. Prices are display only;
// billing is built in L2.

export const CONTACT_EMAIL = "hello@abeiku.com";

/** The company that runs Abeiku and takes payment. Shown on the legal pages and in the footer. */
export const LEGAL_ENTITY = "Automaddie LLC";

/** "Last updated" date on /privacy, /terms, /refunds and /data-deletion. */
export const LEGAL_UPDATED = "16 November 2026";

/** Days a hotel keeps full access after a failed payment, before the admin is locked to the billing page. */
export const PAYMENT_GRACE_DAYS = 14;

export const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refunds", label: "Refunds" },
  { href: "/data-deletion", label: "Data deletion" },
] as const;

export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://abeiku.com").replace(/\/$/, "");

export const TRIAL_DAYS = 30;

export const PLANS = [
  { name: "Up to 5 rooms", ghs: 300, usd: 25 },
  { name: "6 rooms or more", ghs: 500, usd: 40 },
] as const;
