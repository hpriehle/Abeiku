// F1: screenshots + horizontal-overflow check + axe-core (WCAG 2 A/AA) on every hotel-admin page, at 375 and 1280.
// Read-only: every non-GET request (API calls and server actions) is blocked before it leaves the browser.
// Signs an admin session for the TEST hotel locally with JWT_SECRET (same shape as src/lib/auth/session.ts).
// Usage (from the repo root, dev server running):
//   node docs/f1-2026-11-15/scripts/lookup.mjs .env.local /tmp/abeiku-f1/ids.json
//   PW=/path/to/node_modules/playwright node docs/f1-2026-11-15/scripts/shots.mjs after .env.local docs/f1-2026-11-15 [baseUrl]
import fs from "fs";
import { createRequire } from "module";
import { signSessionLocal } from "./sign.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || "playwright");
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const [prefix, envFile, outDir, base = "http://localhost:3461"] = process.argv.slice(2);
const env = Object.fromEntries(fs.readFileSync(envFile, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const ids = JSON.parse(fs.readFileSync(process.env.IDS || "/tmp/abeiku-f1/ids.json", "utf8"));
const hotel = ids.hotels.find((h) => h.slug === "test-hotel");
const admin = ids.admins.find((a) => a.hotel_id === hotel.id);
// platform_admin role so /admin/platform renders too (read-only page; the role only gates that page and the nav link).
const token = await signSessionLocal(env.JWT_SECRET, "admin", {
  userId: admin.id, hotelId: hotel.id, email: "harrison@test-hotel.local", hotelName: hotel.name, role: "platform_admin",
});

const PAGES = [
  ["login", "/admin/login", null, false],
  ["root", "/admin"],
  ["dashboard", "/admin/dashboard"],
  ["nav-open", "/admin/dashboard", async (p) => {
    const menu = p.getByRole("button", { name: /^menu$/i });
    if (await menu.isVisible()) await menu.click();
    else await p.getByRole("button", { name: /collapse menu/i }).click(); // desktop: show the collapsed (icons-only) sidebar
  }],
  ["bookings", "/admin/bookings"],
  ["bookings-detail", "/admin/bookings", async (p) => { await p.locator("button:visible, tr[class*=cursor]").filter({ hasText: /\d/ }).first().click();
    await p.getByText(/^Loading/).first().waitFor({ state: "detached", timeout: 20000 }).catch(() => {}); }],
  ["rooms", "/admin/rooms"],
  ["rooms-form", "/admin/rooms", async (p) => { await p.getByRole("button", { name: /add room/i }).first().click(); }],
  ["inbox", "/admin/communication/inbox"],
  ["inbox-thread", "/admin/communication/inbox", async (p) => { await p.locator("main button.text-left:visible").first().click(); }],
  ["templates", "/admin/communication/templates"],
  ["report", "/admin/communication/report"],
  ["reviews", "/admin/reviews"],
  ["payments", "/admin/payments"],
  ["partners", "/admin/influencers"],
  ["settings", "/admin/settings"],
  ["settings-whatsapp", "/admin/settings/whatsapp"],
  ["settings-google", "/admin/settings/google"],
  ["settings-google-reviews", "/admin/settings/google-reviews"],
  ["settings-momo", "/admin/settings/momo"],
  ["settings-paystack", "/admin/settings/paystack"],
  ["settings-notifications", "/admin/settings/notifications"],
  ["simulator", "/admin/simulator"],
  ["onboarding", "/admin/onboarding"],
  ["platform", "/admin/platform"],
];

const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const browser = await chromium.launch();
const results = [];
fs.mkdirSync(outDir, { recursive: true });

for (const w of [375, 1280]) {
  for (const [name, path, act, signedIn = true] of PAGES) {
    if (only && !only.test(name)) continue;
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 812 : 800 }, deviceScaleFactor: 1 });
    if (signedIn) await ctx.addCookies([{ name: "admin_session", value: token, url: base }]);
    const blocked = [];
    await ctx.route("**/*", (r) => {
      const m = r.request().method();
      if (m === "GET" || m === "HEAD") return r.continue();
      blocked.push(`${m} ${r.request().url().replace(base, "")}`);
      return r.fulfill({ status: 503, contentType: "application/json", body: '{"error":"blocked by screenshot script"}' });
    });
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
    const row = { name: `${name}-${w}`, url: path };
    try {
      await p.goto(base + path, { waitUntil: "networkidle" });
      if (act) { await act(p); await p.waitForTimeout(800); }
      await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
      row.url = p.url().replace(base, "");
      // Horizontal overflow: page, and the admin <main> scroller (content wider than the screen).
      row.overflow = await p.evaluate(() => {
        const m = document.querySelector("[data-admin-shell] main");
        const vw = document.documentElement.clientWidth;
        const wide = [...document.querySelectorAll("main *")].filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.right <= vw + 1 || r.width === 0) return false;
          for (let a = el.parentElement; a && a !== m; a = a.parentElement) if (/(auto|scroll|hidden)/.test(getComputedStyle(a).overflowX)) return false;
          return true;
        }).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")}`);
        return { doc: document.documentElement.scrollWidth - vw, main: m ? m.scrollWidth - m.clientWidth : 0, wide };
      });
      await p.addScriptTag({ content: axeSource });
      row.axe = await p.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
        return r.violations.map((v) => ({ id: v.id, n: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(" ") + " :: " + (n.any[0]?.message || n.all[0]?.message || "").slice(0, 140)) }));
      });
      // Unpin the fixed admin shell so a full-page screenshot shows the whole page, not just the first screen.
      await p.addStyleTag({ content: "[data-admin-shell]{position:static!important;min-height:100vh}[data-admin-shell] main{overflow:visible!important}" });
      await p.waitForTimeout(200);
      await p.screenshot({ path: `${outDir}/${prefix}-admin-${name}-${w}.png`, fullPage: true });
      const text = await p.evaluate(() => document.body.innerText);
      row.bad = ["undefined", "NaN", '{"', "Error:"].filter((s) => text.includes(s));
    } catch (e) {
      row.fail = e.message.split("\n")[0].slice(0, 200);
    }
    row.errors = errors;
    row.blocked = blocked;
    results.push(row);
    const ax = (row.axe || []).map((v) => `${v.id}(${v.n})`).join(",");
    console.log(`${row.name} ${row.url} ovf=${row.overflow?.doc}/${row.overflow?.main}${row.overflow?.wide?.length ? " wide=" + row.overflow.wide.join(",") : ""} axe=[${ax}]${row.bad?.length ? " BAD=" + row.bad : ""}${errors.length ? " JSERR=" + errors[0] : ""}${blocked.length ? " blocked=" + blocked.length : ""}${row.fail ? " FAIL " + row.fail : ""}`);
    await ctx.close();
  }
}
await browser.close();
const file = `${outDir}/${prefix}-results.json`;
// With ONLY=..., re-run pages replace their rows in the existing results file.
const merged = only && fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file, "utf8")).map((r) => results.find((x) => x.name === r.name) || r)
  : results;
fs.writeFileSync(file, JSON.stringify(merged, null, 1));
const contrast = merged.reduce((s, r) => s + (r.axe || []).filter((v) => v.id === "color-contrast").reduce((a, v) => a + v.n, 0), 0);
console.log(`pages=${merged.length} failed=${merged.filter((r) => r.fail).length} color-contrast nodes=${contrast} -> ${file}`);
