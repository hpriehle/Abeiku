// Usage: JWT_SECRET=<same as the server> PW=/path/to/node_modules/playwright node docs/l2-feeds/scripts/shots.mjs [baseUrl]
// Screenshots of Settings > Calendars at 375 px. The calendar-feeds API is mocked in the
// browser (made-up hotel, made-up links); every other non-GET request is blocked.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { SignJWT } from "jose";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || "playwright");
const base = process.argv[2] || "http://localhost:3047";
const out = new URL("..", import.meta.url).pathname;

const token = await new SignJWT({
  userId: "u-test",
  hotelId: "h-test",
  email: "owner@example.com",
  hotelName: "Palm Lodge (test)",
  role: "owner",
  typ: "admin",
})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me"));

const now = Date.now();
const iso = (minsAgo) => new Date(now - minsAgo * 60_000).toISOString();
const data = {
  shareWith: "abeiku-sync@abeiku-calendar.iam.gserviceaccount.com",
  rooms: [
    { slug: "garden", name: "Garden room" },
    { slug: "family", name: "Family room" },
  ],
  feeds: [
    { id: "f1", kind: "airbnb", label: "Airbnb", display: "www.airbnb.com/…12.ics", room: "garden", roomName: "Garden room", lastSyncedAt: iso(6), lastError: null, lastErrorAt: null, lastCount: 4 },
    { id: "f2", kind: "booking_com", label: "Booking.com", display: "ical.booking.com/…export", room: null, roomName: null, lastSyncedAt: iso(300), lastError: "This calendar link no longer works. Copy a fresh link from the booking site.", lastErrorAt: iso(5), lastCount: 2 },
    { id: "f3", kind: "google_calendar", label: "Google calendar", display: "palmlodge.bookings@gmail.com", room: null, roomName: null, lastSyncedAt: null, lastError: null, lastErrorAt: null, lastCount: null },
  ],
};

const shots = [
  { name: "calendars", act: async () => {} },
  { name: "calendars-google", act: async (p) => p.check('input[name="add-type"][value="google"]') },
  { name: "calendars-edit", act: async (p) => p.getByRole("button", { name: "Change" }).first().click() },
  {
    name: "calendars-add-error",
    act: async (p) => {
      await p.fill("#add-value", "https://www.airbnb.com/rooms/12345");
      await p.click('button[type="submit"]:has-text("Check and add")');
      await p.waitForSelector('[role="alert"]');
    },
  },
];

const browser = await chromium.launch();
const results = [];
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 2000 } });
  await ctx.addCookies([{ name: "admin_session", value: token, url: base }]);
  const page = await ctx.newPage();
  const writes = [];
  await page.route("**/*", (r) => {
    const req = r.request();
    const url = req.url();
    if (url.includes("/api/admin/calendar-feeds")) {
      if (req.method() === "GET") return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
      return r.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "This link opens a web page, not a calendar. Copy the export or iCal link instead." }) });
    }
    if (req.method() !== "GET" && req.method() !== "HEAD") {
      writes.push(`${req.method()} ${new URL(url).pathname}`);
      return r.abort();
    }
    return r.continue();
  });
  const res = await page.goto(`${base}/admin/settings/calendars`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=Your calendars");
  await s.act(page);
  await page.waitForTimeout(200);
  const text = await page.evaluate(() => document.body.innerText);
  results.push({
    shot: s.name,
    status: res.status(),
    overflowX: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    emDash: text.includes("—"),
    blockedWrites: writes,
  });
  await page.screenshot({ path: `${out}${s.name}-375.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
writeFileSync(`${out}shots-results.json`, JSON.stringify(results, null, 2) + "\n");
console.log(JSON.stringify(results));
