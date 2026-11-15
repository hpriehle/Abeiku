// axe-core WCAG 2 AA audit (color-contrast and more) on the partner pages and the admin Partners page.
// Read-only: non-GET API calls are mocked or blocked. Usage: node axe.mjs <envfile> [base]
import { chromium } from "playwright";
import { SignJWT } from "/home/riehle/.local/share/uplink-chat/worktrees/abeiku-polish/node_modules/jose/dist/webapi/index.js";
import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const [envFile, base = "http://localhost:3457"] = process.argv.slice(2);
const env = Object.fromEntries(fs.readFileSync(envFile, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const ids = JSON.parse(fs.readFileSync("/tmp/abeiku-pw/ids.json", "utf8"));
const key = new TextEncoder().encode(env.JWT_SECRET);
const sign = (p) => new SignJWT(p).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(key);
const ar = ids.hotels.find((h) => h.slug === "aracuya");
const ad = ids.admins.find((a) => a.hotel_id === ar.id);
const P = ["partner_session", await sign({ typ: "partner", influencerId: ids.partner.id, hotelId: ar.id, hotelSlug: "aracuya", email: "p@x", name: "Test" })];
const A = ["admin_session", await sign({ typ: "admin", userId: ad.id, hotelId: ar.id, email: "a@x", hotelName: ar.name, role: ad.role })];
const STATS = { name: "Test", code: "harrison-test", link_url: "https://aracuya.com/?ref=harrison-test", currency: "GHS", commission_kind: "percent", commission_value: 10, totals: { pending: 1, owed: 2, paid: 3 },
  bookings: ["pending", "owed", "paid", "cancelled"].map((s, i) => ({ id: "b" + i, booking_ref: "R" + i, check_in: "2026-11-02", check_out: "2026-11-07", nights: 5, status: s, commission: 10, payout_paid_at: s === "paid" ? "2026-11-10" : null })) };
const json = (b, s = 200) => ({ status: s, contentType: "application/json", body: JSON.stringify(b) });

const pages = [
  ["partner-login", null, "/partner/login", async (p) => { await p.route("**/api/partner/auth/login", (r) => r.fulfill(json({ error: "x" }, 401))); await p.fill("#email", "a@b.c"); await p.fill("#password", "12345678"); await p.click("button[type=submit]"); }],
  ["partner-setup-valid", null, "/partner/setup?token=t", null, (p) => p.route("**/api/partner/auth/invite**", (r) => r.fulfill(json({ valid: true, name: "K", reset: false })))],
  ["partner-setup-expired", null, "/partner/setup?token=t", null, (p) => p.route("**/api/partner/auth/invite**", (r) => r.fulfill(json({ valid: false, reason: "expired" })))],
  ["partner-setup-missing", null, "/partner/setup"],
  ["partner-dashboard", P, "/partner/dashboard", null, (p) => p.route("**/api/partner/stats", (r) => r.fulfill(json(STATS)))],
  ["partner-dashboard-empty", P, "/partner/dashboard", null, (p) => p.route("**/api/partner/stats", (r) => r.fulfill(json({ ...STATS, bookings: [] })))],
  ["admin-partners", A, "/admin/influencers", async (p) => { for (const f of ["All", "Unknown"]) await p.locator("button:visible", { hasText: new RegExp("^" + f) }).first().click(); }],
  ["admin-partners-form", A, "/admin/influencers", async (p) => { await p.locator("button:visible", { hasText: /new partner/i }).click(); }],
];

const browser = await chromium.launch();
let total = 0;
for (const w of [375, 1280]) {
  for (const [name, cookie, path, after, before] of pages) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 812 } });
    if (cookie) await ctx.addCookies([{ name: cookie[0], value: cookie[1], url: base }]);
    await ctx.route("**/api/**", (r) => (r.request().method() === "GET" ? r.continue() : r.fulfill(json({ error: "blocked" }, 503))));
    const p = await ctx.newPage();
    if (before) await before(p);
    await p.goto(base + path);
    await p.waitForTimeout(1200);
    if (after) { await after(p); await p.waitForTimeout(600); }
    await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await p.addScriptTag({ content: axeSource });
    const res = await p.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(" ") + " :: " + (n.any[0]?.message || "").slice(0, 120)) }));
    });
    total += res.reduce((s, v) => s + v.n, 0);
    console.log(`${name}-${w}: ${res.length ? res.map((v) => `${v.id}(${v.n}) ${v.sample.join(" | ")}`).join("\n    ") : "no violations"}`);
    await ctx.close();
  }
}
await browser.close();
console.log("TOTAL violating nodes:", total);
