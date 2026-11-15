import { SignJWT } from "/home/riehle/.local/share/uplink-chat/worktrees/abeiku-polish/node_modules/jose/dist/webapi/index.js";
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const ids = JSON.parse(fs.readFileSync("/tmp/abeiku-pw/ids.json", "utf8"));
const key = new TextEncoder().encode(env.JWT_SECRET);
const sign = (p) => new SignJWT(p).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(key);
const ar = ids.hotels.find((h) => h.slug === "aracuya");
const partnerLegacy = await sign({ influencerId: ids.partner.id, hotelId: ar.id, hotelSlug: "aracuya", email: "x", name: "x" });
const partnerNew = await sign({ typ: "partner", influencerId: ids.partner.id, hotelId: ar.id, hotelSlug: "aracuya", email: "x", name: "x" });
const B = "http://localhost:3457";
const req = async (path, cookie, method = "GET") => { const r = await fetch(B + path, { method, headers: { cookie }, redirect: "manual" }); return `${method} ${path} [${cookie.split("=")[0]}] -> ${r.status}${r.headers.get("location") ? " " + r.headers.get("location").replace(B, "") : ""}${r.headers.get("set-cookie") ? " set-cookie: " + r.headers.get("set-cookie").split(";")[0] + ";" + (r.headers.get("set-cookie").match(/Max-Age=\d+/) || [""])[0] : ""}`; };
for (const [label, t] of [["legacy partner token", partnerLegacy], ["new partner token", partnerNew]]) {
  console.log("--", label, "in admin_session");
  console.log(await req("/api/admin/payments", `admin_session=${t}`));
  console.log(await req("/api/admin/influencers", `admin_session=${t}`));
  console.log(await req("/admin/dashboard", `admin_session=${t}`));
}
console.log("-- partner token in partner_session");
console.log(await req("/partner", `partner_session=${partnerNew}`));
console.log(await req("/partner/login", `partner_session=${partnerNew}`));
console.log(await req("/partner", "x=1"));
console.log(await req("/api/partner/auth/logout", `partner_session=${partnerNew}`, "POST"));
console.log(await req("/api/admin/auth/logout", "admin_session=whatever", "POST"));
console.log(await req("/api/momo/callback", "x=1", "GET"));
console.log(await req("/api/partner/auth/invite?token=definitely-not-a-token", "x=1"));
console.log(await req("/api/partner/auth/invite", "x=1"));
