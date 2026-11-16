// Public marketing site (landing page, sign-up placeholder): one place for the
// contact address and the prices shown to hotels. Prices are display only;
// billing is built in L2.

export const CONTACT_EMAIL = "hello@abeiku.com";

export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://abeiku.com").replace(/\/$/, "");

export const TRIAL_DAYS = 30;

export const PLANS = [
  { name: "Up to 5 rooms", ghs: 300, usd: 25 },
  { name: "6 rooms or more", ghs: 500, usd: 40 },
] as const;
