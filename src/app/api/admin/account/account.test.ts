// L3 step 6: change password / email while signed in, confirm links, and sessions ending after a
// password reset or change (gaps audit #7 and #17). Email is mocked; nothing is sent.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { MemoryAttemptStore } from "@/lib/auth/rate-limit";
import { MemoryConfirmStore } from "@/lib/auth/email-confirm";
import { MemoryResetStore, createResetToken } from "@/lib/auth/password-reset";
import { fakeAccountDb, type FakeAdminRow } from "@/lib/auth/fake-account-db";

type User = FakeAdminRow & { hotel_id: string; password_hash: string; role: string; name: string; created_at: string };

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined) }),
}));

let users: User[] = [];
let accountDb = fakeAccountDb([]);
let confirmStore = new MemoryConfirmStore();
let resetStore = new MemoryResetStore();
let attempts = new MemoryAttemptStore();
const sent: { to: string; subject: string; text?: string }[] = [];
let mailFails = false;

vi.mock("@/lib/db", () => ({
  getAdminUserById: async (id: string) => users.find((u) => u.id === id) ?? null,
  getAdminUserByEmail: async (email: string) => users.find((u) => u.email === email.toLowerCase()) ?? null,
  setAdminUserPassword: async (id: string, hash: string) => {
    users.find((u) => u.id === id)!.password_hash = hash;
  },
}));
vi.mock("@/lib/auth/account", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/account")>()),
  getAccountDb: async () => accountDb,
}));
vi.mock("@/lib/auth/email-confirm", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/email-confirm")>()),
  getConfirmStore: async () => confirmStore,
}));
vi.mock("@/lib/auth/password-reset", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/password-reset")>()),
  getResetStore: async () => resetStore,
}));
vi.mock("@/lib/auth/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth/rate-limit")>()),
  getAttemptStore: async () => attempts,
}));
vi.mock("@/lib/notifications/email", () => ({
  sendEmail: async (m: { to: string; subject: string; text?: string }) => {
    if (mailFails) return { success: false, error: "resend down" };
    sent.push(m);
    return { success: true };
  },
}));
// bcrypt cost 12 is slow; cost 4 is enough here.
vi.mock("bcryptjs", async (orig) => {
  const real = (await orig<{ default: typeof import("bcryptjs") }>()).default;
  return { default: { ...real, hash: (pw: string) => real.hash(pw, 4) } };
});

const auth = await import("@/lib/admin/auth");
const passwordRoute = await import("./password/route");
const emailRoute = await import("./email/route");
const verifyRoute = await import("./verify-email/route");
const confirmRoute = await import("../auth/confirm-email/route");
const resetRoute = await import("../auth/reset/route");
const signedOutRoute = await import("../auth/signed-out/route");

const OLD_PW = "old-password-1";

async function signIn(userId = "u1"): Promise<string> {
  const u = users.find((x) => x.id === userId)!;
  const token = await auth.createSessionToken({ userId: u.id, hotelId: u.hotel_id, email: u.email, hotelName: "Aracuya", role: u.role });
  jar.set("admin_session", token);
  return token;
}

function post(url: string, body?: object) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** The token part of the last confirm link we "sent". */
function lastLinkToken(): string {
  const text = sent[sent.length - 1]?.text ?? "";
  const m = text.match(/confirm-email\?token=([^\s]+)/);
  if (!m) throw new Error("no link in last email");
  return decodeURIComponent(m[1]);
}

beforeEach(async () => {
  jar.clear();
  sent.length = 0;
  mailFails = false;
  users = [
    {
      id: "u1",
      hotel_id: "h1",
      email: "owner@aracuya.com",
      password_hash: await bcrypt.hash(OLD_PW, 4),
      role: "admin",
      name: "Aracuya",
      created_at: "2026-01-01T00:00:00Z",
      session_version: 0,
      email_verified_at: null,
    },
    {
      id: "u2",
      hotel_id: "h2",
      email: "someone@else.com",
      password_hash: "x",
      role: "admin",
      name: "Else",
      created_at: "2026-01-01T00:00:00Z",
      session_version: 0,
      email_verified_at: "2026-01-01T00:00:00Z",
    },
  ];
  accountDb = fakeAccountDb(users);
  confirmStore = new MemoryConfirmStore();
  resetStore = new MemoryResetStore();
  attempts = new MemoryAttemptStore();
});

describe("sessions end after a password reset (#17)", () => {
  it("a session issued before the reset stops working; one issued after works", async () => {
    const before = await signIn();
    expect((await auth.checkSessionToken(before)).session?.userId).toBe("u1");

    const resetToken = await createResetToken(resetStore, "u1");
    const res = await resetRoute.POST(post("/api/admin/auth/reset", { token: resetToken, password: "brand-new-pw" }));
    expect(res.status).toBe(200);
    expect(users[0].session_version).toBe(1);

    expect(await auth.checkSessionToken(before)).toEqual({ session: null, revoked: true });
    expect(await auth.getSession()).toBeNull();
    const after = await signIn();
    expect((await auth.checkSessionToken(after)).session?.userId).toBe("u1");
  });

  it("tokens from before this change (no sv claim) keep working until a reset", async () => {
    const { signSession } = await import("@/lib/auth/session");
    const legacy = await signSession("admin", { userId: "u1", hotelId: "h1", email: "owner@aracuya.com", hotelName: "A", role: "admin" });
    expect((await auth.checkSessionToken(legacy)).session).not.toBeNull();
    users[0].session_version = 1;
    expect((await auth.checkSessionToken(legacy)).revoked).toBe(true);
  });

  it("before the SQL has run nobody is signed out", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    accountDb = fakeAccountDb(users, { missingColumns: true });
    const token = await signIn();
    expect((await auth.checkSessionToken(token)).session?.userId).toBe("u1");
    const resetToken = await createResetToken(resetStore, "u1");
    expect((await resetRoute.POST(post("/api/admin/auth/reset", { token: resetToken, password: "brand-new-pw" }))).status).toBe(200);
    expect((await auth.checkSessionToken(token)).session?.userId).toBe("u1");
    spy.mockRestore();
  });

  it("a deleted admin's session is refused", async () => {
    const token = await signIn();
    users.splice(0, 1);
    expect((await auth.checkSessionToken(token)).revoked).toBe(true);
  });

  it("/api/admin/auth/signed-out clears a revoked cookie, but keeps a good one", async () => {
    const token = await signIn();
    const keep = await signedOutRoute.GET(new NextRequest("http://localhost/api/admin/auth/signed-out", { headers: { cookie: `admin_session=${token}` } }));
    expect(keep.headers.get("location")).toBe("http://localhost/admin");
    expect(keep.cookies.get("admin_session")).toBeUndefined();

    users[0].session_version = 1;
    const out = await signedOutRoute.GET(new NextRequest("http://localhost/api/admin/auth/signed-out", { headers: { cookie: `admin_session=${token}` } }));
    expect(out.headers.get("location")).toBe("http://localhost/admin/login?signedOut=1");
    expect(out.cookies.get("admin_session")?.value).toBe("");
  });
});

describe("change password while signed in", () => {
  it("needs a session", async () => {
    expect((await passwordRoute.POST(post("/api/admin/account/password", { currentPassword: OLD_PW, newPassword: "new-password-1" }))).status).toBe(401);
  });

  it("wrong current password: refused and counted toward the login lockout", async () => {
    await signIn();
    const res = await passwordRoute.POST(post("/api/admin/account/password", { currentPassword: "nope", newPassword: "new-password-1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/current password/);
    expect(await bcrypt.compare(OLD_PW, users[0].password_hash)).toBe(true);
    for (let i = 0; i < 9; i++) await passwordRoute.POST(post("/api/admin/account/password", { currentPassword: "nope", newPassword: "new-password-1" }));
    expect((await passwordRoute.POST(post("/api/admin/account/password", { currentPassword: OLD_PW, newPassword: "new-password-1" }))).status).toBe(429);
  });

  it("short new password is refused", async () => {
    await signIn();
    expect((await passwordRoute.POST(post("/api/admin/account/password", { currentPassword: OLD_PW, newPassword: "short" }))).status).toBe(400);
  });

  it("changes it, ends other sessions, keeps this one, sends a note", async () => {
    const otherDevice = await signIn();
    const thisDevice = await signIn();
    const res = await passwordRoute.POST(post("/api/admin/account/password", { currentPassword: OLD_PW, newPassword: "new-password-1" }));
    expect(res.status).toBe(200);
    expect(await bcrypt.compare("new-password-1", users[0].password_hash)).toBe(true);
    expect(users[0].session_version).toBe(1);

    expect((await auth.checkSessionToken(otherDevice)).revoked).toBe(true);
    expect((await auth.checkSessionToken(thisDevice)).revoked).toBe(true);
    const fresh = res.cookies.get("admin_session")?.value ?? "";
    expect((await auth.checkSessionToken(fresh)).session).toMatchObject({ userId: "u1", sv: 1, email: "owner@aracuya.com" });
    expect(sent).toEqual([expect.objectContaining({ to: "owner@aracuya.com", subject: "Your Abeiku password was changed" })]);
  });
});

describe("change login email", () => {
  it("needs the current password", async () => {
    await signIn();
    const res = await emailRoute.POST(post("/api/admin/account/email", { newEmail: "new@aracuya.com", currentPassword: "nope" }));
    expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("refuses an email another admin uses, and junk", async () => {
    await signIn();
    expect((await emailRoute.POST(post("/api/admin/account/email", { newEmail: "Someone@Else.com", currentPassword: OLD_PW }))).status).toBe(409);
    expect((await emailRoute.POST(post("/api/admin/account/email", { newEmail: "not-an-email", currentPassword: OLD_PW }))).status).toBe(400);
    expect(sent).toHaveLength(0);
  });

  it("sends a link to the new address and switches only when it's opened; old address is told", async () => {
    await signIn();
    const res = await emailRoute.POST(post("/api/admin/account/email", { newEmail: "New@Aracuya.com", currentPassword: OLD_PW }));
    expect(res.status).toBe(200);
    expect(sent).toEqual([expect.objectContaining({ to: "new@aracuya.com", subject: "Confirm your new email for Abeiku" })]);
    expect(users[0].email).toBe("owner@aracuya.com");

    const confirm = await confirmRoute.POST(post("/api/admin/auth/confirm-email", { token: lastLinkToken() }));
    expect(confirm.status).toBe(200);
    expect(await confirm.json()).toMatchObject({ kind: "change", email: "new@aracuya.com" });
    expect(users[0]).toMatchObject({ email: "new@aracuya.com" });
    expect(users[0].email_verified_at).toBeTruthy();
    expect(sent[1]).toMatchObject({ to: "owner@aracuya.com", subject: "Your Abeiku login email was changed" });
    // Signed in here: the session shows the new email straight away.
    const cookie = confirm.cookies.get("admin_session")?.value ?? "";
    expect((await auth.checkSessionToken(cookie)).session?.email).toBe("new@aracuya.com");
  });

  it("the link works once; if the address got taken meanwhile it is refused", async () => {
    await signIn();
    await emailRoute.POST(post("/api/admin/account/email", { newEmail: "new@aracuya.com", currentPassword: OLD_PW }));
    const token = lastLinkToken();
    users[1].email = "new@aracuya.com";
    expect((await confirmRoute.POST(post("/api/admin/auth/confirm-email", { token }))).status).toBe(409);
    expect(users[0].email).toBe("owner@aracuya.com");
    expect((await confirmRoute.POST(post("/api/admin/auth/confirm-email", { token }))).status).toBe(400);
  });

  it("at most 3 links an hour", async () => {
    await signIn();
    for (let i = 0; i < 3; i++) {
      expect((await emailRoute.POST(post("/api/admin/account/email", { newEmail: `n${i}@x.com`, currentPassword: OLD_PW }))).status).toBe(200);
    }
    expect((await emailRoute.POST(post("/api/admin/account/email", { newEmail: "n9@x.com", currentPassword: OLD_PW }))).status).toBe(429);
  });
});

describe("confirm the sign-up email", () => {
  it("unconfirmed: readSession reports it (banner); resend sends a link; opening it confirms", async () => {
    await signIn();
    expect(await auth.readSession()).toMatchObject({ emailVerified: false });

    const res = await verifyRoute.POST();
    expect(res.status).toBe(200);
    expect(sent).toEqual([expect.objectContaining({ to: "owner@aracuya.com", subject: "Confirm your email for Abeiku" })]);

    // Works signed out too (link opened on another phone).
    jar.clear();
    const confirm = await confirmRoute.POST(post("/api/admin/auth/confirm-email", { token: lastLinkToken() }));
    expect(confirm.status).toBe(200);
    expect(await confirm.json()).toMatchObject({ kind: "verify" });
    expect(users[0].email_verified_at).toBeTruthy();
    await signIn();
    expect(await auth.readSession()).toMatchObject({ emailVerified: true });
  });

  it("resend: nothing sent once confirmed; 3 per hour", async () => {
    await signIn("u2");
    expect(await (await verifyRoute.POST()).json()).toMatchObject({ alreadyConfirmed: true });
    expect(sent).toHaveLength(0);

    await signIn("u1");
    for (let i = 0; i < 3; i++) expect((await verifyRoute.POST()).status).toBe(200);
    expect((await verifyRoute.POST()).status).toBe(429);
  });

  it("a confirm link for an email the admin no longer uses doesn't confirm the new one", async () => {
    await signIn();
    await verifyRoute.POST();
    const token = lastLinkToken();
    users[0].email = "changed@aracuya.com";
    expect((await confirmRoute.POST(post("/api/admin/auth/confirm-email", { token }))).status).toBe(400);
    expect(users[0].email_verified_at).toBeNull();
  });

  it("bad, expired or reused links get a clear message", async () => {
    const res = await confirmRoute.POST(post("/api/admin/auth/confirm-email", { token: "garbage-garbage-garbage" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ linkProblem: "invalid" });
  });
});
