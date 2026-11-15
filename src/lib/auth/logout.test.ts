import { describe, expect, it } from "vitest";
import { POST as partnerLogout } from "@/app/api/partner/auth/logout/route";
import { POST as adminLogout } from "@/app/api/admin/auth/logout/route";

const post = (url: string) => new Request(url, { method: "POST", headers: { cookie: "x=1" } });

describe("logout", () => {
  it("partner: 303 to /partner/login and clears partner_session", async () => {
    const res = await partnerLogout(post("https://abeiku.com/api/partner/auth/logout"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://abeiku.com/partner/login");
    expect(res.headers.get("set-cookie")).toMatch(/^partner_session=;.*Max-Age=0/);
  });

  it("admin: 303 to /admin/login and clears admin_session", async () => {
    const res = await adminLogout(post("https://abeiku.com/api/admin/auth/logout"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://abeiku.com/admin/login");
    expect(res.headers.get("set-cookie")).toMatch(/^admin_session=;.*Max-Age=0/);
  });
});
