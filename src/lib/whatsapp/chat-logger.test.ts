import { describe, it, expect, vi, beforeEach } from "vitest";

// Each supabase call resolves only when the test releases it, so we can check
// that logMessage/logEvent wait for the writes instead of returning early.
const pending: { table: string; op: string; release: (r: { error: unknown }) => void }[] = [];

function deferred(table: string, op: string) {
  let release!: (r: { error: unknown }) => void;
  const p = new Promise<{ error: unknown }>((r) => (release = r));
  pending.push({ table, op, release });
  return p;
}

vi.mock("@/lib/supabase/client", () => {
  const from = (table: string) => ({
    insert: () => deferred(table, "insert"),
    update: () => {
      const p = deferred(table, "update");
      const chain = { eq: () => chain, then: p.then.bind(p) };
      return chain;
    },
  });
  return { supabase: { from, rpc: () => deferred("rpc", "increment_unread") } };
});

import { logMessage, logEvent } from "./chat-logger";

const msg = {
  hotelId: "h1",
  conversationId: "c1",
  phone: "233597957528",
  direction: "outbound" as const,
  messageType: "template",
  body: "hello",
  waMessageId: "wamid.1",
  senderType: "admin" as const,
};

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  pending.length = 0;
});

describe("chat-logger", () => {
  it("logMessage resolves only after the insert and conversation update finish", async () => {
    let done = false;
    const p = logMessage(msg).then(() => (done = true));
    await flush();
    expect(pending.map((x) => `${x.table}.${x.op}`)).toEqual(["chat_messages.insert", "conversations.update"]);
    expect(done).toBe(false);

    pending[0].release({ error: null });
    await flush();
    expect(done).toBe(false);

    pending[1].release({ error: null });
    await p;
    expect(done).toBe(true);
  });

  it("logMessage also waits for the unread counter on inbound messages", async () => {
    let done = false;
    const p = logMessage({ ...msg, direction: "inbound", senderType: "guest" }).then(() => (done = true));
    await flush();
    expect(pending).toHaveLength(3);
    pending[0].release({ error: null });
    pending[1].release({ error: null });
    await flush();
    expect(done).toBe(false);
    pending[2].release({ error: null });
    await p;
    expect(done).toBe(true);
  });

  it("logEvent resolves after the insert and never throws on a db error", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    let done = false;
    const p = logEvent({ hotelId: "h1", conversationId: "c1", phone: "1", eventType: "funnel_step" }).then(
      () => (done = true),
    );
    await flush();
    expect(pending.map((x) => `${x.table}.${x.op}`)).toEqual(["conversation_events.insert"]);
    expect(done).toBe(false);
    pending[0].release({ error: { message: "boom" } });
    await expect(p).resolves.toBe(true);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
