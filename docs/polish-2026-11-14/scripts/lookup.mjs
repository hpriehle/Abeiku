import { createClient } from "/home/riehle/.local/share/uplink-chat/worktrees/abeiku-polish/node_modules/@supabase/supabase-js/dist/index.mjs";
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(process.argv[2], "utf8").split("\n").filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data: p, error: e1 } = await sb.from("influencers").select("id,hotel_id,name,email,whatsapp,slug").eq("slug", "harrison-test");
const { data: hotels } = await sb.from("hotels").select("id,slug,name");
const { data: admins, error: e2 } = await sb.from("admin_users").select("id,hotel_id,email,role");
console.log(JSON.stringify({ p, e1, hotels, admins: admins?.map(a => ({ ...a, email: a.email.replace(/^(.).*@/, "$1***@") })), e2 }, null, 1));
fs.writeFileSync("/tmp/abeiku-pw/ids.json", JSON.stringify({ partner: p?.[0], hotels, admins }));
