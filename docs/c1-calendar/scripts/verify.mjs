// C1 calendar browser checks against a local `next dev`.
// MOCK DATA ONLY: /api/admin/calendar is answered by this script with made-up bookings (no real guests),
// and every non-GET request is answered with a fake 500, so nothing is written anywhere.
// Usage: PW=/path/to/node_modules/playwright node docs/c1-calendar/scripts/verify.mjs <.env file> <ids.json> <outDir> [baseUrl]
import fs from "fs";
import { createRequire } from "module";
import { signSessionLocal } from "../../f1-2026-11-15/scripts/sign.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || "playwright");
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const [envFile, idsFile, outDir, base = "http://localhost:3031"] = process.argv.slice(2);
const env = Object.fromEntries(fs.readFileSync(envFile, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const ids = JSON.parse(fs.readFileSync(idsFile, "utf8"));
fs.mkdirSync(outDir, { recursive: true });

const hotel = ids.hotels.find((h) => h.slug === "aracuya");
const admin = ids.admins.find((a) => a.hotel_id === hotel.id);
const token = await signSessionLocal(env.JWT_SECRET, "admin", { userId: admin.id, hotelId: hotel.id, email: "owner@example.com", hotelName: hotel.name, role: "owner" });

// ---------- mock bookings, relative to today ----------
const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const d = (n) => { const x = new Date(`${today}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
let seq = 0;
const row = (p) => ({
  id: `mock-${++seq}`, source: null, external_ref: null, guest_name: "", phone: null, guest_email: null, guests: null,
  room_slug: "suite", rooms_count: 1, total_price: 0, currency: "USD", payment_status: "unpaid", payment_provider: null,
  booking_status: "confirmed", ref_code: null, paid_at: null, created_at: `${d(-10)}T09:30:00Z`, ...p,
});
const MOCK = [
  // Staff entered a 3-night stay as three one-night Google events: shown as one stay.
  ...[0, 1, 2].map((i) => row({ source: "google_calendar", external_ref: `evt${i}`, guest_name: "Kwame Asante", check_in: d(i), check_out: d(i + 1) })),
  row({ source: "aracuya_web", external_ref: "ARC-MOCK0001", payment_provider: "stripe", guest_name: "Lena Fischer", guest_email: "lena@example.com", phone: "+49 151 0000 0000", guests: 4, rooms_count: 2, check_in: d(1), check_out: d(4), total_price: 540, payment_status: "paid", ref_code: "KOFI10", paid_at: `${d(-6)}T14:02:00Z` }),
  row({ source: "aracuya_web", external_ref: "ARC-MOCK0002", payment_provider: "momo", guest_name: "Efua Owusu", phone: "+233 20 000 0000", guests: 2, check_in: d(-2), check_out: d(1), total_price: 2400, currency: "GHS", payment_status: "paid" }),
  row({ source: "airbnb", external_ref: "ab1@airbnb.com", guest_name: "Airbnb · Reserved", rooms_count: 3, check_in: d(5), check_out: d(8) }),
  row({ source: "vrbo", external_ref: "vr1", guest_name: "Daniel Moreau", rooms_count: 3, check_in: d(9), check_out: d(12) }),
  row({ source: "booking_com", external_ref: "bc1", guest_name: "Booking.com · Closed", check_in: d(12), check_out: d(14) }),
  row({ source: null, guest_name: "Abena Boateng", phone: "+233 24 000 0000", guests: 2, check_in: d(4), check_out: d(5), total_price: 900, currency: "GHS", payment_status: "unpaid" }),
  row({ source: "manual", guest_name: "Yaw Mensah", phone: "+233 27 000 0000", check_in: d(16), check_out: d(18), total_price: 1200, currency: "GHS", payment_status: "paid", rooms_count: 2 }),
  row({ source: "aracuya_web", external_ref: "ARC-MOCK0003", payment_provider: "stripe", guest_name: "Tom Hart", check_in: d(2), check_out: d(4), booking_status: "cancelled", total_price: 300, payment_status: "refunded" }),
  row({ source: "google_calendar", external_ref: "evt9", guest_name: "Sophie Laurent", check_in: d(-3), check_out: d(0) }),
];

function calendarHandler(mode) {
  return async (r) => {
    const u = new URL(r.request().url());
    const from = u.searchParams.get("from"), to = u.searchParams.get("to");
    if (mode === "error") return r.fulfill({ status: 500, contentType: "application/json", body: '{"error":"x"}' });
    if (mode === "slow") await new Promise((res) => setTimeout(res, 60_000));
    const bookings = mode === "empty" ? [] : MOCK.filter((b) => b.check_in <= to && b.check_out >= from);
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bookings, totalRooms: 3, currency: "USD", rooms: [{ slug: "suite", name: "Suite" }] }) });
  };
}

const browser = await chromium.launch();
const results = [];
const expect = (cond, what) => { if (!cond) throw new Error(`expected: ${what}`); };

async function check(name, path, { width = 1280, mode = "data", act, fullPage = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 800 : 900 } });
  await ctx.addCookies([{ name: "admin_session", value: token, url: base }]);
  const writes = [];
  await ctx.route("**/*", (r) => {
    const m = r.request().method();
    if (m === "GET" || m === "HEAD") return r.fallback();
    writes.push(`${m} ${r.request().url().replace(base, "")}`);
    return r.fulfill({ status: 500, contentType: "application/json", body: '{"error":"blocked by test"}' });
  });
  await ctx.route(/\/api\/admin\/calendar\?/, calendarHandler(mode));
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const res = { name, width, path };
  try {
    await p.goto(base + path, { waitUntil: mode === "slow" ? "domcontentloaded" : "networkidle", timeout: 120000 });
    if (mode !== "slow") await p.getByText("Loading bookings…").waitFor({ state: "detached", timeout: 30000 });
    else await p.getByText("Loading bookings…").waitFor({ timeout: 30000 });
    res.detail = act ? await act(p) : undefined;
    await p.waitForTimeout(300);
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    res.overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await p.addScriptTag({ content: axeSource });
    res.axe = await p.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return r.violations.map((v) => ({ id: v.id, n: v.nodes.length, sample: v.nodes.slice(0, 2).map((n) => n.target.join(" ")) }));
    });
    if (fullPage) {
      // Grow the viewport to the content height instead of unpinning the shell, so widths stay true.
      const h = await p.evaluate(() => { const m = document.querySelector("[data-admin-shell] main"); return Math.max(m ? m.scrollHeight + (m.getBoundingClientRect().top || 0) : 0, document.documentElement.scrollHeight); });
      await p.setViewportSize({ width, height: Math.min(h, 6000) });
      await p.waitForTimeout(300);
    }
    await p.screenshot({ path: `${outDir}/${name}-${width}.png` });
    const text = await p.evaluate(() => document.body.innerText);
    res.bad = ["undefined", "NaN", "Invalid Date"].filter((s) => text.includes(s));
    res.ok = !res.overflow && res.axe.length === 0 && res.bad.length === 0 && errors.length === 0;
  } catch (e) {
    res.ok = false;
    res.fail = String(e).split("\n")[0].slice(0, 300);
    await p.screenshot({ path: `${outDir}/${name}-${width}-FAILED.png` }).catch(() => {});
  }
  res.errors = errors;
  res.writes = writes;
  results.push(res);
  console.log(`${res.ok ? "PASS" : "FAIL"} ${name}@${width} ovf=${res.overflow} axe=[${(res.axe || []).map((v) => `${v.id}(${v.n}) ${v.sample.join("|")}`).join(", ")}]${res.detail ? " " + JSON.stringify(res.detail) : ""}${res.fail ? " " + res.fail : ""}${errors.length ? " JSERR " + errors[0] : ""}${res.bad?.length ? " BAD " + res.bad : ""}`);
  await ctx.close();
}

const bar = (p, name) => p.getByRole("button", { name: new RegExp(`^${name},`) }).first();

for (const width of [375, 1280]) {
  await check("calendar-timeline", "/admin/calendar", {
    width,
    act: async (p) => {
      const kwame = await bar(p, "Kwame Asante").getAttribute("aria-label");
      expect(/3 nights/.test(kwame), "three one-night Google rows shown as one 3-night stay");
      expect((await p.getByRole("button", { name: /^Tom Hart,/ }).count()) === 0, "cancelled hidden by default");
      const occ = await p.locator("text=/3 of 3 rooms booked/").count();
      return { kwame, fullNights: occ };
    },
  });
  await check("calendar-cancelled-shown", "/admin/calendar", {
    width,
    act: async (p) => {
      await p.getByLabel("Show cancelled").check();
      const n = await p.getByRole("button", { name: /^Tom Hart,.*cancelled/ }).count();
      expect(n >= 1, "cancelled booking appears after the toggle");
      return { tomHart: n };
    },
  });
  await check("calendar-month", "/admin/calendar", {
    width,
    act: async (p) => {
      await p.getByRole("button", { name: "Month", exact: true }).click();
      await p.getByText("Loading bookings…").waitFor({ state: "detached" });
      const days = await p.locator("button[aria-pressed]").filter({ hasText: /^\d/ }).count();
      return { dayButtons: days };
    },
  });
  await check("drawer-website", "/admin/calendar", {
    width,
    fullPage: false,
    act: async (p) => {
      await bar(p, "Lena Fischer").click();
      const dlg = p.getByRole("dialog");
      const t = await dlg.innerText();
      expect(/Edit this in/.test(t), "read-only note");
      expect(/KOFI10/.test(t) && /540/.test(t) && /paid/.test(t), "partner code, amount, paid");
      expect((await dlg.getByRole("button", { name: /Check in, change/ }).count()) === 0, "no edit actions for imported");
      expect((await dlg.getByRole("link", { name: /Call/ }).getAttribute("href")).startsWith("tel:+49"), "tap to call");
      return { readOnly: true };
    },
  });
  await check("drawer-whatsapp", "/admin/calendar", {
    width,
    fullPage: false,
    act: async (p) => {
      await bar(p, "Abena Boateng").click();
      const dlg = p.getByRole("dialog");
      expect((await dlg.getByRole("button", { name: /Check in, change/ }).count()) === 1, "edit actions for WhatsApp booking");
      const wa = await dlg.getByRole("link", { name: /WhatsApp/ }).getAttribute("href");
      expect(wa === "https://wa.me/233240000000", "WhatsApp link");
      await p.keyboard.press("Escape");
      expect((await p.getByRole("dialog").count()) === 0, "Escape closes");
      await bar(p, "Abena Boateng").click();
      return { wa };
    },
  });
  await check("drawer-grouped", "/admin/calendar", {
    width,
    fullPage: false,
    act: async (p) => {
      await bar(p, "Kwame Asante").click();
      const t = await p.getByRole("dialog").innerText();
      expect(/3 one-night entries in Google calendar/.test(t), "grouping note");
      return { note: true };
    },
  });
  await check("arrivals", "/admin/calendar", {
    width,
    act: async (p) => {
      const a = await p.getByRole("region", { name: "Arrivals" }).innerText().catch(() => p.locator("section[aria-labelledby=mv-arrivals]").innerText());
      expect(/Kwame Asante/.test(a), "today's arrival listed");
      await p.locator("section[aria-labelledby=mv-arrivals]").scrollIntoViewIfNeeded();
      return { ok: true };
    },
  });
  await check("dashboard", "/admin/dashboard", { width });
  await check("state-empty", "/admin/calendar", { width, mode: "empty" });
  await check("state-error", "/admin/calendar", {
    width,
    mode: "error",
    act: async (p) => {
      const t = await p.getByRole("alert").filter({ hasText: /\S/ }).first().innerText();
      return { alert: t.replace(/×$/, "").trim() };
    },
  });
  await check("state-loading", "/admin/calendar", { width, mode: "slow" });
}

await browser.close();
fs.writeFileSync(`${outDir}/verify-results.json`, JSON.stringify(results, null, 1));
console.log(`${results.filter((r) => r.ok).length}/${results.length} pass; writes attempted: ${results.reduce((s, r) => s + r.writes.length, 0)}`);
