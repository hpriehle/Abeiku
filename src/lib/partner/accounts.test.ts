import { describe, expect, it } from "vitest";
import { authenticate, completeSetup, ensureAccount, findExistingAccount, membershipsForSession } from "./accounts";
import { fakeVerify, membership, memoryAccountStore } from "./accounts-memory.test-helper";

const AMA = { id: "acc-ama", email: "ama@x.com", whatsapp: "+233241111111", name: "Ama", password_hash: "hash:secret1" };

function twoHotelAccount() {
  return memoryAccountStore({
    accounts: [{ ...AMA }],
    memberships: [
      membership({ id: "m-a", hotel_id: "hotel-a", slug: "ama", email: "ama@x.com", account_id: AMA.id, password_hash: AMA.password_hash }),
      membership({
        id: "m-b",
        hotel_id: "hotel-b",
        slug: "ama-tours",
        email: "ama@x.com",
        account_id: AMA.id,
        password_hash: AMA.password_hash,
        created_at: "2026-11-15T00:00:00Z",
      }),
    ],
  });
}

describe("authenticate", () => {
  it("logs in to the account by email (any case), opening the oldest hotel", async () => {
    const { store } = twoHotelAccount();
    const r = await authenticate("AMA@x.com", "secret1", store, fakeVerify);
    expect(r?.account?.id).toBe(AMA.id);
    expect(r?.membership?.id).toBe("m-a");
  });

  it("logs in by WhatsApp number in local format", async () => {
    const { store } = twoHotelAccount();
    const r = await authenticate("+233 24 111 1111", "secret1", store, fakeVerify);
    expect(r?.account?.id).toBe(AMA.id);
  });

  it("refuses a wrong password", async () => {
    const { store } = twoHotelAccount();
    expect(await authenticate("ama@x.com", "nope", store, fakeVerify)).toBeNull();
  });

  it("does not accept an old copy of the password on a membership that has an account", async () => {
    const { store, rows } = twoHotelAccount();
    rows[1].password_hash = "hash:old";
    expect(await authenticate("ama@x.com", "old", store, fakeVerify)).toBeNull();
  });

  it("before the SQL: logs in by the hotel row exactly as before P2, no account calls", async () => {
    const { store, calls } = memoryAccountStore({
      ready: false,
      memberships: [membership({ id: "m1", email: "kofi@x.com", password_hash: "hash:pw" })],
    });
    const r = await authenticate("kofi@x.com", "pw", store, fakeVerify);
    expect(r).toEqual({ account: null, membership: expect.objectContaining({ id: "m1" }) });
    expect(calls.createAccount).toBe(0);
  });

  it("before the SQL: WhatsApp login picks the hotel row whose password matches", async () => {
    const { store } = memoryAccountStore({
      ready: false,
      memberships: [
        membership({ id: "m1", hotel_id: "hotel-a", whatsapp: "+233242222222", password_hash: "hash:one" }),
        membership({ id: "m2", hotel_id: "hotel-b", whatsapp: "+233242222222", password_hash: "hash:two" }),
      ],
    });
    expect((await authenticate("+233242222222", "two", store, fakeVerify))?.membership?.id).toBe("m2");
  });

  it("after the SQL: a row made in between (no account yet) logs in and gets its account", async () => {
    const { store, accounts, rows } = memoryAccountStore({
      memberships: [membership({ id: "m1", email: "new@x.com", password_hash: "hash:pw" })],
    });
    const r = await authenticate("new@x.com", "pw", store, fakeVerify);
    expect(r?.account?.email).toBe("new@x.com");
    expect(accounts).toHaveLength(1);
    expect(accounts[0].password_hash).toBe("hash:pw");
    expect(rows[0].account_id).toBe(accounts[0].id);
  });
});

describe("ensureAccount", () => {
  it("never merges a row into someone else's existing account", async () => {
    const { store } = memoryAccountStore({
      accounts: [{ ...AMA }],
      memberships: [membership({ id: "m9", email: "ama@x.com", password_hash: "hash:other" })],
    });
    expect(await ensureAccount((await store.getMembership("m9"))!, store)).toBeNull();
  });
});

describe("completeSetup (setup link used)", () => {
  const setRow = (rows: ReturnType<typeof memoryAccountStore>["rows"]) => async (id: string, hash: string) => {
    const m = rows.find((r) => r.id === id)!;
    m.password_hash = hash;
    m.invite_token = null;
  };

  it("new partner: creates the account with the password and links the row", async () => {
    const { store, rows, accounts } = memoryAccountStore({
      memberships: [membership({ id: "m1", email: "esi@x.com", whatsapp: "+233243333333", invite_token: "tok" })],
    });
    const out = await completeSetup(rows[0], "hash:pw", store, setRow(rows));
    expect(out.kind).toBe("done");
    expect(accounts).toEqual([
      expect.objectContaining({ email: "esi@x.com", whatsapp: "+233243333333", password_hash: "hash:pw" }),
    ]);
    expect(rows[0]).toMatchObject({ account_id: accounts[0].id, password_hash: "hash:pw", invite_token: null });
  });

  it("reset link at one hotel changes the password for all hotels of the account", async () => {
    const { store, rows, accounts } = twoHotelAccount();
    rows[1].invite_token = "reset";
    const out = await completeSetup(rows[1], "hash:new", store, setRow(rows));
    expect(out.kind).toBe("done");
    expect(accounts[0].password_hash).toBe("hash:new");
    expect(rows.map((r) => r.password_hash)).toEqual(["hash:new", "hash:new"]);
  });

  it("email already has an account with a password: links the hotel, keeps that password", async () => {
    const { store, rows, accounts } = memoryAccountStore({
      accounts: [{ ...AMA }],
      memberships: [membership({ id: "m1", hotel_id: "hotel-c", email: "ama@x.com", invite_token: "tok" })],
    });
    const out = await completeSetup(rows[0], "hash:hijack", store, setRow(rows));
    expect(out.kind).toBe("has_account");
    expect(accounts[0].password_hash).toBe("hash:secret1");
    expect(rows[0]).toMatchObject({ account_id: AMA.id, invite_token: null, password_hash: "hash:secret1" });
  });

  it("account without a password yet (migrated, never set up): this link sets it up", async () => {
    const { store, rows, accounts } = memoryAccountStore({
      accounts: [{ ...AMA, password_hash: null }],
      memberships: [membership({ id: "m1", email: "ama@x.com", account_id: AMA.id, invite_token: "tok" })],
    });
    expect((await completeSetup(rows[0], "hash:pw", store, setRow(rows))).kind).toBe("done");
    expect(accounts[0].password_hash).toBe("hash:pw");
  });

  it("before the SQL: only the row's password is set, as before P2", async () => {
    const { store, rows, calls } = memoryAccountStore({
      ready: false,
      memberships: [membership({ id: "m1", email: "esi@x.com", invite_token: "tok" })],
    });
    const out = await completeSetup(rows[0], "hash:pw", store, setRow(rows));
    expect(out).toMatchObject({ kind: "done", account: null });
    expect(rows[0].password_hash).toBe("hash:pw");
    expect(calls.createAccount + calls.setAccountPassword).toBe(0);
  });
});

describe("membershipsForSession (sessions are per account)", () => {
  it("account session sees every hotel of the account", async () => {
    const { store } = twoHotelAccount();
    const ms = await membershipsForSession({ accountId: AMA.id, influencerId: "m-a" }, store);
    expect(ms.map((m) => m.hotel_id)).toEqual(["hotel-a", "hotel-b"]);
  });

  it("a session from before P2 (no accountId) also sees every hotel once the row has an account", async () => {
    const { store } = twoHotelAccount();
    const ms = await membershipsForSession({ influencerId: "m-b" }, store);
    expect(ms.map((m) => m.id)).toEqual(["m-a", "m-b"]);
  });

  it("before the SQL: only the session's own row", async () => {
    const { store } = memoryAccountStore({ ready: false, memberships: [membership({ id: "m1" })] });
    expect((await membershipsForSession({ influencerId: "m1" }, store)).map((m) => m.id)).toEqual(["m1"]);
  });

  it("deleted row: nothing", async () => {
    const { store } = memoryAccountStore();
    expect(await membershipsForSession({ influencerId: "gone" }, store)).toEqual([]);
  });
});

describe("findExistingAccount", () => {
  it("matches email first, then a WhatsApp number held by exactly one account", async () => {
    const { store } = twoHotelAccount();
    expect((await findExistingAccount("ama@x.com", null, store))?.id).toBe(AMA.id);
    expect((await findExistingAccount(null, "+233241111111", store))?.id).toBe(AMA.id);
  });

  it("a WhatsApp match with a different email is a different person", async () => {
    const { store } = twoHotelAccount();
    expect(await findExistingAccount("someone@else.com", "+233241111111", store)).toBeNull();
  });

  it("two accounts with the same number: no guess", async () => {
    const { store } = memoryAccountStore({
      accounts: [
        { id: "a1", email: null, whatsapp: "+233245555555", name: "A", password_hash: null },
        { id: "a2", email: null, whatsapp: "+233245555555", name: "B", password_hash: null },
      ],
    });
    expect(await findExistingAccount(null, "+233245555555", store)).toBeNull();
  });
});
