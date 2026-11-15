// Usage: PW=/path/to/node_modules/playwright node docs/l2-signup/scripts/shots.mjs [baseUrl]
// Screenshots each sign-up step at 375 wide against a local `next start` with SIGNUP_OPEN=true.
// The sign-up APIs are mocked in the browser (page.route): no database, no Paystack, no Stripe.
// Checks per shot: no sideways scroll, no em dash.
import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || "playwright");
const base = process.argv[2] || "http://localhost:3042";
const out = "docs/l2-signup";

const hotel = (o = {}) => ({
  hotel: { name: "Busua Beach Inn", town: "", rooms: null, contactEmail: "owner@busuainn.com", calendars: null, ...o },
  billing: { access: "needs_card", status: "pending_card", tier: null, provider: null, trialEndsAt: null, legacy: false, exempt: false },
});
const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

const shots = [
  { name: "1-account", path: "/signup", state: [json({ error: "Please log in again." }, 401)] },
  { name: "2-hotel", path: "/signup", state: [json(hotel())], fill: async (p) => { await p.fill("#town", "Busua"); await p.fill("#rooms", "4"); } },
  { name: "3-calendars", path: "/signup", state: [json(hotel({ town: "Busua", rooms: 4 }))] },
  { name: "4-plan-cedis", path: "/signup?step=plan", state: [json({ ...hotel({ town: "Busua", rooms: 4 }), billing: { ...hotel().billing, tier: "small" } })] },
  {
    name: "4-plan-dollars", path: "/signup?step=plan",
    state: [json({ ...hotel({ town: "Busua", rooms: 8 }), billing: { ...hotel().billing, tier: "large" } })],
    fill: async (p) => { await p.check('input[value="stripe"]'); },
  },
  { name: "5-done", path: "/signup/done?provider=paystack&reference=abk_test", complete: json({ success: true, trialEndsAt: "2026-12-15T10:00:00.000Z", access: "full" }) },
  { name: "5-done-error", path: "/signup/done?provider=stripe&session_id=cs_test", complete: json({ error: "Your card was not added. Please try again." }, 402) },
  { name: "error-hotel-step", path: "/signup", state: [json(hotel())], fill: async (p) => {
      await p.fill("#town", "Busua"); await p.fill("#rooms", "4");
      await p.click('button[type="submit"]'); await p.waitForSelector('[role="alert"]');
    }, hotelPost: json({ error: "Enter a valid contact email." }, 400) },
];

const browser = await chromium.launch();
const results = [];
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await page.route("**/api/signup/state", (r) => r.fulfill(s.state?.[0] ?? json({}, 401)));
  await page.route("**/api/signup/complete", (r) => r.fulfill(s.complete ?? json({}, 500)));
  await page.route("**/api/signup/hotel", (r) => r.fulfill(s.hotelPost ?? json({ success: true })));
  const res = await page.goto(base + s.path, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  if (s.fill) await s.fill(page);
  const text = await page.evaluate(() => document.body.innerText);
  results.push({
    shot: s.name, status: res.status(),
    overflowX: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    emDash: text.includes("—"),
    heading: await page.locator("h1").first().innerText().catch(() => null),
  });
  await page.screenshot({ path: `${out}/${s.name}-375.png`, fullPage: true });
  await page.close();
}
await browser.close();
fs.writeFileSync(`${out}/shots-results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
