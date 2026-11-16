import { describe, it, expect } from "vitest";
import { apiRequest, friendlyError, singleFlight, NETWORK_ERROR, SERVER_ERROR, SESSION_EXPIRED } from "./api-client";

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body), { status })) as typeof fetch;
}

describe("friendlyError", () => {
  it("uses a short server message for 4xx", () => {
    expect(friendlyError(400, { error: "Room name is required" })).toBe("Room name is required");
  });
  it("never shows raw technical text", () => {
    expect(friendlyError(400, { error: 'Paystack error: {"status":false}' })).not.toContain("{");
    expect(friendlyError(500, { error: "TypeError: x is undefined" })).toBe(SERVER_ERROR);
  });
  it("maps 401 / 429 / 5xx", () => {
    expect(friendlyError(401, { error: "Unauthorized" })).toBe(SESSION_EXPIRED);
    expect(friendlyError(429, null)).toMatch(/Too many attempts/);
    expect(friendlyError(502, null, "Couldn't save the room.")).toBe("Couldn't save the room.");
  });
});

describe("apiRequest", () => {
  it("returns data on success", async () => {
    const r = await apiRequest("/x", {}, fakeFetch(200, { success: true, room: { id: "1" } }));
    expect(r).toEqual({ ok: true, status: 200, data: { success: true, room: { id: "1" } } });
  });
  it("returns a friendly error on HTTP failure (no throw)", async () => {
    const r = await apiRequest("/x", { method: "DELETE" }, fakeFetch(500, { error: "boom" }));
    expect(r).toEqual({ ok: false, status: 500, error: SERVER_ERROR });
  });
  it("treats { success: false } with 200 as a failure", async () => {
    const r = await apiRequest("/x", {}, fakeFetch(200, { success: false, error: "Phone not verified" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Phone not verified");
  });
  it("handles network errors and non-JSON bodies", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await apiRequest("/x", {}, down)).toEqual({ ok: false, status: 0, error: NETWORK_ERROR });
    const html = await apiRequest("/x", {}, fakeFetch(502, "<html>Bad gateway</html>"));
    expect(html).toEqual({ ok: false, status: 502, error: SERVER_ERROR });
  });
  it("encodes json bodies", async () => {
    let seen: RequestInit | undefined;
    const spy = (async (_u: string, init?: RequestInit) => {
      seen = init;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await apiRequest("/x", { method: "PUT", json: { a: 1 } }, spy);
    expect(seen?.body).toBe('{"a":1}');
    expect((seen?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });
});

describe("singleFlight", () => {
  it("ignores a second call while the first is running", async () => {
    const run = singleFlight();
    let calls = 0;
    let release!: () => void;
    const slow = () =>
      new Promise<string>((res) => {
        calls++;
        release = () => res("done");
      });
    const first = run(slow);
    const second = await run(slow);
    expect(second).toBeNull();
    release();
    expect(await first).toBe("done");
    expect(calls).toBe(1);
    // free again afterwards
    const third = run(async () => "again");
    expect(await third).toBe("again");
  });
});
