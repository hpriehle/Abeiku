// Checks docs/go-live-p2-accounts.sql against an in-memory Postgres (no live database).
// Run: npm i --no-save @electric-sql/pglite && node scripts/check-p2-accounts-sql.mjs .
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";

const repo = process.argv[2];
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;

await db.exec(`
CREATE TABLE hotels (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT UNIQUE, name TEXT);
`);
// Real schema files from the repo, in order.
await db.exec(readFileSync(`${repo}/supabase-migration-influencers.sql`, "utf8"));
await db.exec(readFileSync(`${repo}/supabase-migration-partner-bookings.sql`, "utf8"));

const [h1] = await q(`INSERT INTO hotels (slug, name) VALUES ('aracuya','Aracuya') RETURNING id`);
const [h2] = await q(`INSERT INTO hotels (slug, name) VALUES ('other','Other Lodge') RETURNING id`);
const ins = async (hotel, slug, email, whatsapp, pw, lastLogin) =>
  (await q(
    `INSERT INTO influencers (hotel_id, slug, name, email, whatsapp, password_hash, last_login_at,
       partner_type, country, currency, commission_kind, commission_value, commission_currency)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'agency','Ghana','GHS','percent',15,'GHS') RETURNING id`,
    [hotel, slug, slug, email, whatsapp, pw, lastLogin]
  ))[0].id;

const ama = await ins(h1.id, "ama", "ama@x.com", "+233241111111", "hash-ama", "2026-11-10");
const kofi = await ins(h1.id, "kofi-tours", null, "+233242222222", null, null);
const yaw = await ins(h1.id, "yaw", "yaw@x.com", null, null, null);
// Same person as ama, other hotel, different case (allowed by the case-sensitive global unique).
const ama2 = await ins(h2.id, "ama-b", "Ama@X.com", null, "hash-ama-old", "2026-01-01");
// Same WhatsApp, no email, other hotel: stays a separate account (merge is by email only).
const kofi2 = await ins(h2.id, "kofi", null, "+233242222222", null, null);

await q(`INSERT INTO influencer_clicks (influencer_id) VALUES ($1), ($1), ($2)`, [ama, kofi]);
await q(
  `INSERT INTO referral_bookings (hotel_id, booking_ref, ref_code, influencer_id, status)
   VALUES ($1, 'B1', 'ama', $2, 'paid')`,
  [h1.id, ama]
).catch((e) => console.log("booking insert (schema detail):", e.message));

const before = await q(`SELECT id, hotel_id, slug FROM influencers ORDER BY id`);
const sql = readFileSync(`${repo}/docs/go-live-p2-accounts.sql`, "utf8");
await db.exec(sql);
const afterFirst = await q(`SELECT id, slug, account_id FROM influencers ORDER BY id`);
const accountsFirst = await q(`SELECT * FROM partner_accounts ORDER BY email NULLS LAST, whatsapp`);
await db.exec(sql); // second run: no change
const afterSecond = await q(`SELECT id, slug, account_id FROM influencers ORDER BY id`);
const accountsSecond = await q(`SELECT count(*)::int AS n FROM partner_accounts`);

const byId = Object.fromEntries(afterSecond.map((r) => [r.id, r]));
const acct = (id) => accountsFirst.find((a) => a.id === byId[id].account_id);
const checks = {
  "ids and codes unchanged": JSON.stringify(before.map((r) => [r.id, r.slug])) === JSON.stringify(afterSecond.map((r) => [r.id, r.slug])),
  "every row linked": afterSecond.every((r) => r.account_id),
  "ama@x.com in two hotels -> one account": byId[ama].account_id === byId[ama2].account_id,
  "merged account keeps the most recent password": acct(ama).password_hash === "hash-ama",
  "merged account email lowercase": acct(ama).email === "ama@x.com",
  "merged account keeps whatsapp": acct(ama).whatsapp === "+233241111111",
  "whatsapp-only rows: one account each": byId[kofi].account_id !== byId[kofi2].account_id,
  "yaw has own account, no password": acct(yaw).email === "yaw@x.com" && acct(yaw).password_hash === null,
  "4 accounts after first run": accountsFirst.length === 4,
  "second run changes nothing": JSON.stringify(afterFirst) === JSON.stringify(afterSecond) && accountsSecond[0].n === 4,
  "clicks still on same rows": (await q(`SELECT count(*)::int n FROM influencer_clicks WHERE influencer_id=$1`, [ama]))[0].n === 2,
  "global email unique dropped": (await q(`SELECT count(*)::int n FROM pg_constraint WHERE conrelid='influencers'::regclass AND conname='influencers_email_key'`))[0].n === 0,
};
// Same email in one hotel is still refused; same email in another hotel is now allowed.
try { await ins(h1.id, "dup", "AMA@x.com", null, null, null); checks["per-hotel email unique"] = false; }
catch { checks["per-hotel email unique"] = true; }
try { const h3 = (await q(`INSERT INTO hotels (slug,name) VALUES ('third','Third') RETURNING id`))[0];
  await ins(h3.id, "ama", "ama@x.com", null, null, null); checks["same email at another hotel allowed"] = true; }
catch (e) { checks["same email at another hotel allowed"] = false; console.log(e.message); }

let failed = 0;
for (const [name, ok] of Object.entries(checks)) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; }
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
