// Checks docs/go-live-p2-signup-payouts.sql against an in-memory Postgres (no live database):
// runs after docs/go-live-p2-accounts.sql, twice, and touches no existing row.
// Run: npm i --no-save @electric-sql/pglite && node scripts/check-p2-signup-payouts-sql.mjs .
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";

const repo = process.argv[2];
const db = new PGlite();
const q = async (sql, params) => (await db.query(sql, params)).rows;

await db.exec(`CREATE TABLE hotels (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slug TEXT UNIQUE, name TEXT);`);
await db.exec(readFileSync(`${repo}/supabase-migration-influencers.sql`, "utf8"));
await db.exec(readFileSync(`${repo}/supabase-migration-partner-bookings.sql`, "utf8"));

const [h1] = await q(`INSERT INTO hotels (slug, name) VALUES ('aracuya','Aracuya') RETURNING id`);
const [m] = await q(
  `INSERT INTO influencers (hotel_id, slug, name, email, password_hash, partner_type, country, currency,
     commission_kind, commission_value, commission_currency)
   VALUES ($1,'ama','Ama','ama@x.com','hash','agency','Ghana','GHS','percent',15,'GHS') RETURNING id`,
  [h1.id]
);
await q(
  `INSERT INTO referral_bookings (hotel_id, booking_ref, ref_code, influencer_id, status, check_out, commission_amount, commission_currency)
   VALUES ($1,'B1','ama',$2,'paid','2026-10-03',450,'GHS')`,
  [h1.id, m.id]
);

await db.exec(readFileSync(`${repo}/docs/go-live-p2-accounts.sql`, "utf8"));
const before = await q(`SELECT * FROM referral_bookings`);
const accountsBefore = await q(`SELECT id, email, password_hash FROM partner_accounts`);
const sql = readFileSync(`${repo}/docs/go-live-p2-signup-payouts.sql`, "utf8");
await db.exec(sql);
await db.exec(sql); // second run: no error, no change

const checks = {};
const acc = await q(`SELECT email_confirm_pending, email_confirmed_at FROM partner_accounts`);
checks["existing accounts not pending"] = acc.length === 1 && acc[0].email_confirm_pending === false;
const after = await q(`SELECT * FROM referral_bookings`);
checks["bookings unchanged (new payout_id null)"] =
  after.length === 1 && after[0].payout_id === null && after[0].payout_status === before[0].payout_status;
checks["account rows unchanged"] =
  JSON.stringify(accountsBefore) === JSON.stringify(await q(`SELECT id, email, password_hash FROM partner_accounts`));

// Shapes the app writes.
const [p] = await q(
  `INSERT INTO partner_payouts (hotel_id, influencer_id, amount, currency, paid_on, method, reference)
   VALUES ($1,$2,450,'GHS','2026-11-17','Bank transfer','REF') RETURNING id`,
  [h1.id, m.id]
);
await q(`UPDATE referral_bookings SET payout_status='paid', payout_paid_at='2026-11-17', payout_id=$1`, [p.id]);
checks["payout links a booking"] = (await q(`SELECT payout_id FROM referral_bookings`))[0].payout_id === p.id;
const refuse = async (sql, params) => { try { await q(sql, params); return false; } catch { return true; } };
checks["amount must be > 0"] = await refuse(
  `INSERT INTO partner_payouts (hotel_id, influencer_id, amount, currency, paid_on, method) VALUES ($1,$2,0,'GHS','2026-11-17','x')`, [h1.id, m.id]);
checks["currency GHS/USD only"] = await refuse(
  `INSERT INTO partner_payouts (hotel_id, influencer_id, amount, currency, paid_on, method) VALUES ($1,$2,1,'EUR','2026-11-17','x')`, [h1.id, m.id]);
const [a] = await q(`SELECT id FROM partner_accounts LIMIT 1`);
await q(`INSERT INTO partner_tokens (account_id, purpose, token_hash, expires_at) VALUES ($1,'confirm_email','h1', now())`, [a.id]);
checks["token hash unique"] = await refuse(
  `INSERT INTO partner_tokens (account_id, purpose, token_hash, expires_at) VALUES ($1,'reset_password','h1', now())`, [a.id]);
checks["token purpose checked"] = await refuse(
  `INSERT INTO partner_tokens (account_id, purpose, token_hash, expires_at) VALUES ($1,'other','h2', now())`, [a.id]);
await q(`INSERT INTO partner_accounts (email, name, password_hash, email_confirm_pending) VALUES ('new@x.com','New','h',true)`);
checks["sign-up account pending"] = (await q(`SELECT email_confirm_pending FROM partner_accounts WHERE email='new@x.com'`))[0].email_confirm_pending === true;

let failed = 0;
for (const [name, ok] of Object.entries(checks)) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; }
console.log(failed ? `${failed} FAILED` : "ALL PASS");
process.exit(failed ? 1 : 0);
