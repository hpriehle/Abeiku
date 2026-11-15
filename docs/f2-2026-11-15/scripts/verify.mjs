// F2 browser checks against a local `next dev` (which reads production Supabase).
// READ-ONLY: every non-GET request from the browser is intercepted here and answered by
// the script (a fake failure, or a fake success after capturing the body). Nothing is saved.
// Usage: PW=/path/to/node_modules/playwright node docs/f2-2026-11-15/scripts/verify.mjs .env.local /tmp/ids.json <outDir> [baseUrl]
import fs from "fs";
import { createRequire } from "module";
import { signSessionLocal } from "../../f1-2026-11-15/scripts/sign.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || "playwright");
const [envFile, idsFile, outDir, base = "http://localhost:3020"] = process.argv.slice(2);
const env = Object.fromEntries(fs.readFileSync(envFile, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const ids = JSON.parse(fs.readFileSync(idsFile, "utf8"));
fs.mkdirSync(outDir, { recursive: true });

async function tokenFor(slug) {
  const hotel = ids.hotels.find((h) => h.slug === slug);
  const admin = ids.admins.find((a) => a.hotel_id === hotel.id);
  return signSessionLocal(env.JWT_SECRET, "admin", { userId: admin.id, hotelId: hotel.id, email: "harrison@local", hotelName: hotel.name, role: "owner" });
}

const browser = await chromium.launch();
const results = [];
async function check(name, slug, path, fn, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addCookies([{ name: "admin_session", value: await tokenFor(slug), url: base }]);
  const seen = [];
  // Default: any non-GET gets a 500 (simulated server failure). Checks may add their own handlers first.
  await ctx.route("**/*", (r) => {
    const m = r.request().method();
    if (m === "GET" || m === "HEAD") return r.continue();
    seen.push(`${m} ${r.request().url().replace(base, "")}`);
    return r.fulfill({ status: 500, contentType: "application/json", body: '{"error":"simulated failure"}' });
  });
  const p = await ctx.newPage();
  await p.addInitScript(() => { window.confirm = () => true; });
  try {
    await p.goto(base + path, { waitUntil: "networkidle", timeout: 90000 });
    const detail = await fn(p, ctx, seen);
    await p.screenshot({ path: `${outDir}/${name}.png`, fullPage: false });
    results.push({ name, ok: true, detail, requests: seen });
    console.log(`PASS ${name}: ${JSON.stringify(detail)}`);
  } catch (e) {
    await p.screenshot({ path: `${outDir}/${name}-FAILED.png` }).catch(() => {});
    results.push({ name, ok: false, error: String(e).slice(0, 300), requests: seen });
    console.log(`FAIL ${name}: ${String(e).slice(0, 300)}`);
  }
  await ctx.close();
}
// Non-empty alerts only (Next's route announcer is an empty role=alert). Fails the check if none appears.
const alertText = async (p) => {
  const t = (await p.getByRole("alert").filter({ hasText: /\S/ }).first().textContent({ timeout: 15000 }))?.replace(/×$/, "").trim();
  if (!t) throw new Error("no error message shown");
  return t;
};
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

// 1. Room edit keeps pricing tiers (B6): capture the PUT body, answer with a fake success.
await check("room-edit-keeps-tiers", "aracuya", "/admin/rooms", async (p, ctx) => {
  let body = null;
  await ctx.route(/\/api\/admin\/rooms\/[^/]+$/, (r) => {
    if (r.request().method() !== "PUT") return r.fallback();
    body = JSON.parse(r.request().postData());
    return r.fulfill({ status: 200, contentType: "application/json", body: '{"success":true}' });
  });
  await p.getByRole("button", { name: /^edit$/i }).first().click();
  const price = p.locator("#roomformmo-price");
  const before = await price.inputValue();
  await price.fill(String(Number(before) + 1));
  await p.getByRole("button", { name: /save changes/i }).click();
  await p.waitForTimeout(1500);
  if (!body) throw new Error("no PUT captured");
  expect(Array.isArray(body.pricing_tiers) && body.pricing_tiers.some((t) => t.price === Number(before) + 1), "new price sent inside existing tiers");
  return { priceBefore: before, sentTiers: body.pricing_tiers };
});

// 2. Room form refuses an empty price instead of saving 0.
await check("room-empty-price", "aracuya", "/admin/rooms", async (p) => {
  await p.getByRole("button", { name: /^edit$/i }).first().click();
  await p.locator("#roomformmo-price").evaluate((el) => el.removeAttribute("required"));
  await p.locator("#roomformmo-price").fill("");
  await p.getByRole("button", { name: /save changes/i }).click();
  return { alert: await alertText(p) };
});

// 3. Room delete failure is shown and the room stays.
await check("room-delete-fails", "aracuya", "/admin/rooms", async (p) => {
  const rowsBefore = await p.locator("tbody tr").count();
  await p.getByRole("button", { name: /^delete$/i }).first().click();
  await p.getByRole("button", { name: /^confirm$/i }).first().click();
  const alert = await alertText(p);
  const rowsAfter = await p.locator("tbody tr").count();
  expect(rowsAfter === rowsBefore, "room still listed");
  return { alert, rowsBefore, rowsAfter };
});

// 4. Room reorder failure is shown and the order rolls back.
await check("room-reorder-fails", "aracuya", "/admin/rooms", async (p) => {
  const names = async () => p.locator("tbody tr td:nth-child(2)").allTextContents();
  const before = await names();
  await p.getByRole("button", { name: /down$/i }).first().click();
  const alert = await alertText(p);
  await p.waitForTimeout(300);
  const orderRestored = JSON.stringify(before) === JSON.stringify(await names());
  expect(orderRestored, "order rolled back");
  return { alert, orderRestored };
});

// 5. Booking modal: a failed status change is shown, the modal stays open.
await check("booking-action-fails", "aracuya", "/admin/bookings", async (p) => {
  await p.locator("tr[class*=cursor]:visible, button:visible").filter({ hasText: /\d{4}|\d+ \w{3}/ }).first().click();
  await p.getByRole("dialog").waitFor();
  await p.getByText(/^Loading/).first().waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
  const btn = p.getByRole("dialog").getByRole("button", { name: /check in|check out|mark as paid|mark as refunded/i }).first();
  const label = (await btn.textContent())?.trim();
  await btn.click();
  return { clicked: label, alert: await alertText(p), modalOpen: await p.getByRole("dialog").isVisible() };
});

// 6. Template toggle failure is shown, switch unchanged.
await check("template-toggle-fails", "aracuya", "/admin/communication/templates", async (p) => {
  const sw = p.getByRole("switch").first();
  const before = await sw.getAttribute("aria-checked");
  await sw.click();
  const alert = await alertText(p);
  const unchanged = before === (await sw.getAttribute("aria-checked"));
  expect(unchanged, "switch unchanged");
  return { alert, unchanged };
});

// 7. Template save success updates the list without a reload (fake success).
await check("template-save", "aracuya", "/admin/communication/templates", async (p, ctx) => {
  await ctx.route("**/api/admin/templates", (r) => r.request().method() === "PUT"
    ? r.fulfill({ status: 200, contentType: "application/json", body: '{"success":true}' }) : r.fallback());
  await p.getByRole("button", { name: /^edit$/i }).first().click();
  await p.locator("#templateed-message-body").fill("F2 test text");
  await p.getByRole("button", { name: /save template/i }).click();
  return { status: (await p.getByRole("status").first().textContent({ timeout: 10000 }))?.trim() };
});

// 8. Notification toggle failure: shown and reverted.
await check("notification-toggle-fails", "aracuya", "/admin/settings/notifications", async (p) => {
  const sw = p.getByRole("switch", { name: /by email/i }).first();
  const before = await sw.getAttribute("aria-checked");
  await sw.click();
  const alert = await alertText(p);
  await p.waitForTimeout(300);
  const reverted = before === (await sw.getAttribute("aria-checked"));
  expect(reverted, "toggle reverted");
  return { alert, reverted };
});

// 9. Settings save failure is shown.
await check("settings-save-fails", "aracuya", "/admin/settings", async (p) => {
  await p.getByRole("button", { name: /save changes/i }).first().click();
  return { alert: await alertText(p) };
});

// 10. Simulator explains the bot is off.
await check("simulator-bot-off", "aracuya", "/admin/simulator", async (p) => ({
  status: (await p.getByRole("status").first().textContent())?.trim().slice(0, 80),
}));

// 11. Widget Book button (public, no session needed).
await check("widget-room-book", "aracuya", "/widget/aracuya", async (p) => {
  await p.locator('a[href*="/widget/aracuya/rooms/"]').first().click();
  await p.waitForLoadState("networkidle");
  const a = p.getByRole("link", { name: /book now/i }).first();
  const href = await a.getAttribute("href");
  const whatsappLinks = await p.locator('a[href*="wa.me"]').count();
  expect(href === "https://aracuya.com/reserve" && whatsappLinks === 0, "Book goes to aracuya.com/reserve, no wa.me");
  return { href, whatsappLinks };
}, 375);

// 12. 375px: booking modal failure on a phone.
await check("booking-action-fails-375", "aracuya", "/admin/bookings", async (p) => {
  await p.locator("button:visible").filter({ hasText: /\d/ }).first().click();
  await p.getByRole("dialog").waitFor();
  await p.getByText(/^Loading/).first().waitFor({ state: "detached", timeout: 20000 }).catch(() => {});
  await p.getByRole("dialog").getByRole("button", { name: /check in|check out|mark as paid|mark as refunded/i }).first().click();
  return { alert: await alertText(p) };
}, 375);

await browser.close();
fs.writeFileSync(`${outDir}/verify-results.json`, JSON.stringify(results, null, 2));
console.log(`done: ${results.filter((r) => r.ok).length}/${results.length} passed`);
