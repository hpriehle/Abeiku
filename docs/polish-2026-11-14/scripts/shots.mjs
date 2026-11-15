// Screenshots of partner pages + admin Partners page. Read-only: every non-GET API call is mocked or aborted.
// Usage: node shots.mjs <before|after> <envfile> <outdir> [baseUrl]
import { chromium } from "playwright";
import { SignJWT } from "/home/riehle/.local/share/uplink-chat/worktrees/abeiku-polish/node_modules/jose/dist/webapi/index.js";
import fs from "fs";

const [prefix, envFile, outDir, base = "http://localhost:3457"] = process.argv.slice(2);
const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; })
);
const ids = JSON.parse(fs.readFileSync("/tmp/abeiku-pw/ids.json", "utf8"));
const secret = new TextEncoder().encode(env.JWT_SECRET);
const sign = (p) => new SignJWT(p).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(secret);
const aracuya = ids.hotels.find((h) => h.slug === "aracuya");
const admin = ids.admins.find((a) => a.hotel_id === aracuya.id);
const partnerToken = await sign({ typ: "partner", influencerId: ids.partner.id, hotelId: aracuya.id, hotelSlug: "aracuya", email: ids.partner.email, name: ids.partner.name });
const adminToken = await sign({ typ: "admin", userId: admin.id, hotelId: aracuya.id, email: admin.email, hotelName: aracuya.name, role: admin.role });
fs.mkdirSync(outDir, { recursive: true });

const STATS = {
  name: "Harrison Riehle (test partner 0)", email: "partner@example.com", code: "harrison-test",
  link_url: "https://aracuya.com/?ref=harrison-test", currency: "GHS", commission_kind: "percent", commission_value: 10,
  totals: { pending: 420, owed: 1050, paid: 2310.5 },
  bookings: [
    { id: "b1", booking_ref: "ARC-1001", check_in: "2026-12-20", check_out: "2026-12-24", nights: 4, status: "pending", commission: 420, payout_paid_at: null },
    { id: "b2", booking_ref: "ARC-0997", check_in: "2026-11-02", check_out: "2026-11-07", nights: 5, status: "owed", commission: 1050, payout_paid_at: null },
    { id: "b3", booking_ref: "ARC-0950", check_in: "2026-09-12", check_out: "2026-09-15", nights: 3, status: "paid", commission: 2310.5, payout_paid_at: "2026-09-30" },
    { id: "b4", booking_ref: "ARC-0941", check_in: "2026-09-01", check_out: "2026-09-02", nights: 1, status: "cancelled", commission: 0, payout_paid_at: null },
  ],
};
const totals0 = { pending: 0, owed: 0, paid: 0 };
const mkPartner = (id, name, extra = {}) => ({ id, name, email: null, whatsapp: "+233241234567", town: "Cape Coast", code: name.toLowerCase().replace(/[^a-z]+/g, "-"), link: "https://aracuya.com/?ref=x", partner_type: "agency", country: "Ghana", currency: "GHS", commission_kind: "percent", commission_value: 15, password_set: true, created_at: "2026-10-01", bookings: 0, totals: totals0, ...extra });
const mkBooking = (id, extra) => ({ id, booking_ref: id.toUpperCase(), partner_id: "p1", partner_name: "Kofi Tours", ref_code: "kofi-tours", check_in: "2026-11-02", check_out: "2026-11-07", nights: 5, room_total_usd: 600, total_ghs: 8930, status: "owed", commission: 1339.5, commission_currency: "GHS", payout_paid_at: null, payout_note: null, ...extra });
const ADMIN_MOCK = (paid) => ({
  partners: [
    mkPartner("p1", "Kofi Tours", { bookings: 2, totals: { pending: 0, owed: paid ? 0 : 1339.5, paid: paid ? 1339.5 + 210 : 210 } }),
    mkPartner("p2", "Ama Travels", { password_set: false, partner_type: "local", currency: "USD", country: "UK", commission_kind: "per_night", commission_value: 5 }),
  ],
  bookings: [
    mkBooking("arc-0997", paid ? { status: "paid", payout_paid_at: "2026-11-14", payout_note: "MoMo 4471" } : {}),
    mkBooking("arc-0950", { status: "paid", commission: 210, payout_paid_at: "2026-10-01", payout_note: "cash" }),
    mkBooking("arc-0901", { partner_id: null, partner_name: null, ref_code: "unknwn", status: "pending", commission: 0, commission_currency: null }),
  ],
});

const browser = await chromium.launch();
const results = [];

async function ctxFor(width, cookie) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 812 : 800 }, deviceScaleFactor: 1 });
  if (cookie) await ctx.addCookies([{ name: cookie[0], value: cookie[1], url: base }]);
  // Safety net: nothing but GET reaches the server unless a test routes it first (routes added later win).
  await ctx.route("**/api/**", (route) => {
    const m = route.request().method();
    const u = route.request().url();
    if (m === "GET" || m === "HEAD" || /\/(logout)(\?|$)/.test(u)) return route.continue();
    console.log("  blocked", m, u);
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "blocked by screenshot script" }) });
  });
  return ctx;
}

async function shot(name, width, cookie, fn) {
  const ctx = await ctxFor(width, cookie);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await fn(page);
    await page.waitForTimeout(400);
    // Hide the Next.js dev-mode badge (not part of the app).
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
    const file = `${outDir}/${prefix}-${name}-${width}.png`;
    await page.screenshot({ path: file, fullPage: true });
    const text = await page.evaluate(() => document.body.innerText);
    const bad = ["undefined", "NaN", "null", '{"', "Error:"].filter((s) => text.includes(s));
    results.push({ name: `${name}-${width}`, url: page.url(), title: await page.title(), bad, errors });
  } catch (e) {
    results.push({ name: `${name}-${width}`, fail: e.message.slice(0, 200) });
  }
  await ctx.close();
}

const P = ["partner_session", partnerToken];
const A = ["admin_session", adminToken];
const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

for (const w of [375, 1280]) {
  await shot("partner-login", w, null, (p) => p.goto(`${base}/partner/login`));
  await shot("partner-login-wrong-password", w, null, async (p) => {
    await p.route("**/api/partner/auth/login", (r) => r.fulfill(json({ error: "Invalid credentials" }, 401)));
    await p.goto(`${base}/partner/login`);
    await p.fill("#email", "partner@example.com");
    await p.fill("#password", "wrongpass1");
    await p.click("button[type=submit]");
  });
  await shot("partner-login-network-error", w, null, async (p) => {
    await p.route("**/api/partner/auth/login", (r) => r.abort());
    await p.goto(`${base}/partner/login`);
    await p.fill("#email", "partner@example.com");
    await p.fill("#password", "whatever12");
    await p.click("button[type=submit]");
  });
  await shot("partner-login-signed-in", w, P, (p) => p.goto(`${base}/partner/login`));
  await shot("partner-root", w, P, (p) => p.goto(`${base}/partner`));
  await shot("partner-setup-valid", w, null, async (p) => {
    await p.route("**/api/partner/auth/invite**", (r) => r.fulfill(json({ valid: true, name: "Kofi Tours" })));
    await p.goto(`${base}/partner/setup?token=mock-valid-token`);
  });
  await shot("partner-setup-expired", w, null, async (p) => {
    await p.route("**/api/partner/auth/invite**", (r) => r.fulfill(json({ valid: false, reason: "expired" })));
    await p.route("**/api/partner/auth/set-password", (r) => r.fulfill(json({ error: "Invite link has expired" }, 400)));
    await p.goto(`${base}/partner/setup?token=mock-expired-token`);
    if (await p.locator("#password").count()) {
      await p.fill("#password", "longenough1");
      await p.fill("#confirm", "longenough1");
      await p.click("button[type=submit]");
    }
  });
  await shot("partner-setup-missing-token", w, null, (p) => p.goto(`${base}/partner/setup`));
  await shot("partner-dashboard", w, P, async (p) => {
    await p.route("**/api/partner/stats", (r) => r.fulfill(json(STATS)));
    await p.goto(`${base}/partner/dashboard`);
    await p.getByText(/Welcome/).first().waitFor();
  });
  await shot("partner-dashboard-empty", w, P, async (p) => {
    await p.route("**/api/partner/stats", (r) => r.fulfill(json({ ...STATS, totals: totals0, bookings: [] })));
    await p.goto(`${base}/partner/dashboard`);
    await p.waitForTimeout(800);
  });
  await shot("partner-dashboard-load-error", w, P, async (p) => {
    await p.route("**/api/partner/stats", (r) => r.abort());
    await p.goto(`${base}/partner/dashboard`);
    await p.waitForTimeout(800);
  });
  await shot("partner-logout", w, P, async (p) => {
    await p.route("**/api/partner/stats", (r) => r.fulfill(json(STATS)));
    await p.goto(`${base}/partner/dashboard`);
    await p.getByRole("button", { name: /log out/i }).click();
    await p.waitForLoadState("networkidle");
  });
  await shot("admin-partners", w, A, (p) => p.goto(`${base}/admin/influencers`));
  await shot("admin-partners-create-form", w, A, async (p) => {
    await p.goto(`${base}/admin/influencers`);
    await p.getByRole("button", { name: /new partner/i }).click();
    await p.fill("input >> nth=0", "Kofi Tours (Cape Coast) / Elmina");
  });
  await shot("admin-partners-setup-link", w, A, async (p) => {
    await p.route("**/api/admin/influencers/*/setup-link", (r) => r.fulfill(json({ setup_url: "https://abeiku.com/partner/setup?token=0123456789abcdef", setup_expires_at: "2026-11-29T00:00:00Z" })));
    await p.goto(`${base}/admin/influencers`);
    await p.locator("button:visible", { hasText: /setup link/i }).first().click();
    await p.waitForTimeout(500);
  });
  // Mocked data: create (mocked) triggers a refresh, which returns mock partners/bookings.
  for (const step of ["mock-list", "filter-all", "filter-unknown", "mark-paid-form", "marked-paid"]) {
    await shot(`admin-partners-${step}`, w, A, async (p) => {
      let paid = false;
      await p.route("**/api/admin/influencers", (r) =>
        r.request().method() === "POST"
          ? r.fulfill(json({ success: true, partner: { id: "p9", code: "x", name: "x" }, setup_url: "https://abeiku.com/partner/setup?token=abc", setup_expires_at: "2026-11-29T00:00:00Z" }, 201))
          : r.fulfill(json(ADMIN_MOCK(paid))));
      await p.route("**/api/admin/influencers/bookings/*/payout", (r) => { paid = JSON.parse(r.request().postData()).paid; return r.fulfill(json({ success: true })); });
      await p.goto(`${base}/admin/influencers`);
      await p.getByRole("button", { name: /new partner/i }).click();
      await p.fill("input >> nth=0", "Mock");
      await p.fill("input[type=tel]", "+233241234567");
      await p.getByRole("button", { name: /create partner/i }).click();
      await p.waitForTimeout(800);
      const close = p.locator("button:visible", { hasText: /✕/ }).first();
      if (await close.count()) await close.click();
      if (step === "filter-all") await p.getByRole("button", { name: /^all/i }).click();
      if (step === "filter-unknown") await p.getByRole("button", { name: /unknown/i }).click();
      if (step === "mark-paid-form" || step === "marked-paid") await p.locator("button:visible", { hasText: /mark paid/i }).first().click();
      if (step === "marked-paid") { await p.locator("button:visible", { hasText: /^save/i }).first().click(); await p.waitForTimeout(800); await p.getByRole("button", { name: /^all/i }).click(); }
    });
  }
  await shot("admin-nav-open", w, A, async (p) => {
    await p.goto(`${base}/admin/influencers`);
    const menu = p.getByRole("button", { name: /^menu$/i });
    if (await menu.isVisible().catch(() => false)) await menu.click();
  });
  await shot("admin-logout", w, A, async (p) => {
    // Old admin logout posts an empty form to the login route (no credentials, nothing written).
    await p.route("**/api/admin/auth", (r) => (r.request().postData() || "").includes("password") ? r.abort() : r.continue());
    await p.goto(`${base}/admin/influencers`);
    const menu = p.getByRole("button", { name: /^menu$/i });
    if (await menu.isVisible().catch(() => false)) await menu.click();
    await p.locator("button:visible", { hasText: /log out/i }).first().click();
    await p.waitForLoadState("networkidle");
  });
}
await browser.close();
fs.writeFileSync(`${outDir}/${prefix}-results.json`, JSON.stringify(results, null, 1));
for (const r of results) console.log(r.fail ? `FAIL ${r.name}: ${r.fail}` : `${r.name} | ${r.title} | ${r.url.replace(base, "")}${r.bad.length ? " | BAD " + r.bad.join(",") : ""}${r.errors.length ? " | JSERR " + r.errors[0].slice(0, 80) : ""}`);
