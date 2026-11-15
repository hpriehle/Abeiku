// Usage: node docs/l2-alert-email/scripts/shots.mjs   (starts a fake Supabase on :54399)
// then:  SUPABASE_URL=http://localhost:54399 SUPABASE_SERVICE_ROLE_KEY=x JWT_SECRET=x npx next start -p 3048
// then:  JWT_SECRET=x PW=/path/to/node_modules/playwright node docs/l2-alert-email/scripts/shots.mjs shoot
// Screenshot of Settings at 375 px with a made-up hotel. The fake Supabase answers reads only;
// in the browser every non-GET request is blocked, so nothing is saved anywhere.
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { SignJWT } from "jose";

const HOTEL = {
  id: "h-test", name: "Palm Lodge (test)", slug: "palm-lodge-test", active: true,
  contact_email: "owner@palmlodge.example", contact_phone: "241234567",
  location_city: "Busua", location_country: "Ghana", currency: "GHS",
  check_in_time: "14:00", check_out_time: "11:00",
  alert_email: "owner@palmlodge.example", momo_phone_verified: false,
};

if (process.argv[2] !== "shoot") {
  createServer((req, res) => {
    const table = new URL(req.url, "http://x").pathname.split("/").pop();
    const one = (req.headers.accept || "").includes("vnd.pgrst.object");
    const body = table === "hotels" ? (one ? HOTEL : [HOTEL]) : one ? null : [];
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end("{}"); }
    res.writeHead(one && body === null ? 406 : 200, { "content-type": "application/json" });
    res.end(JSON.stringify(body ?? { code: "PGRST116", message: "no rows" }));
  }).listen(54399, () => console.log("fake supabase on :54399"));
} else {
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PW || "playwright");
  const base = "http://localhost:3048";
  const out = new URL("..", import.meta.url).pathname;
  const token = await new SignJWT({ userId: "u-test", hotelId: "h-test", email: "owner@palmlodge.example", hotelName: HOTEL.name, role: "owner", typ: "admin" })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret-change-me"));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
  await ctx.addCookies([{ name: "admin_session", value: token, url: base }]);
  const page = await ctx.newPage();
  await page.route("**/*", (r) => (["GET", "HEAD"].includes(r.request().method()) ? r.continue() : r.abort()));
  await page.goto(`${base}/admin/settings`, { waitUntil: "networkidle" });
  const card = page.locator(".admin-card", { hasText: "Booking alerts" });
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: `${out}alert-email-375.png` });
  console.log(await card.innerText());
  await browser.close();
}
