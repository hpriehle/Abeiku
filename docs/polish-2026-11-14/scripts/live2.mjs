import { SignJWT } from "/home/riehle/.local/share/uplink-chat/worktrees/abeiku-polish/node_modules/jose/dist/webapi/index.js";
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const ids = JSON.parse(fs.readFileSync("/tmp/abeiku-pw/ids.json", "utf8"));
const key = new TextEncoder().encode(env.JWT_SECRET);
const ar = ids.hotels.find((h) => h.slug === "aracuya");
const ad = ids.admins.find((a) => a.hotel_id === ar.id);
const base = { userId: ad.id, hotelId: ar.id, email: ad.email, hotelName: ar.name, role: ad.role };
for (const [label, p] of [["admin typ", { ...base, typ: "admin" }], ["admin legacy", base]]) {
  const t = await new SignJWT(p).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(key);
  const h = { cookie: `admin_session=${t}` };
  const pay = await fetch("http://localhost:3457/api/admin/payments", { headers: h });
  const hotel = await (await fetch("http://localhost:3457/api/admin/hotel", { headers: h })).text();
  const settings = await (await fetch("http://localhost:3457/admin/settings", { headers: h })).text();
  const keys = ["whatsapp_access_token", "stripe_secret_key", "stripe_webhook_secret", "momo_verification_amount", "momo_verification_ref", "whatsapp_verify_token", "paystack_transfer_recipient_code"];
  console.log(label, "| /api/admin/payments", pay.status, "| /api/admin/hotel keys leaked:", keys.filter((k) => hotel.includes(k)).join(",") || "none", "| /admin/settings HTML keys leaked:", keys.filter((k) => settings.includes(k)).join(",") || "none", "| settings len", settings.length);
}
