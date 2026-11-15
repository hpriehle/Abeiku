// Read-only: finds the test hotel and one of its admin users (ids only) for signing a local session.
// Usage (from the repo root): node docs/f1-2026-11-15/scripts/lookup.mjs .env.local /tmp/abeiku-f1/ids.json
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const [envFile, out] = process.argv.slice(2);
const env = Object.fromEntries(fs.readFileSync(envFile, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const sb = createClient(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: hotels, error: e1 } = await sb.from("hotels").select("id,slug,name");
const { data: admins, error: e2 } = await sb.from("admin_users").select("id,hotel_id,role");
if (e1 || e2) throw new Error((e1 || e2).message);
console.log(hotels.map((h) => `${h.slug} | ${h.name} | admins: ${admins.filter((a) => a.hotel_id === h.id).length}`).join("\n"));
fs.writeFileSync(out, JSON.stringify({ hotels, admins }));
