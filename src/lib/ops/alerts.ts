// L3: email Harrison when a background job fails (booking sync, billing and WhatsApp webhooks,
// booking-alert sends). At most one email per failure kind per hour.
//
// The throttle lives in the ops_alerts table (docs/go-live-l3-ops.sql), so it holds across
// serverless instances; until that table exists (or if the database is down) an in-memory
// throttle per instance is used instead. Nothing here ever throws.
//
// Relative imports only: netlify/functions/booking-sync.mts imports this file, and the Netlify
// bundler doesn't know the "@/" alias.

import { sendEmail } from "../notifications/email";
import { supabase } from "../supabase/client";

export const DEFAULT_OPS_ALERT_EMAIL = "hpriehle@gmail.com";
export const OPS_ALERT_WINDOW_MS = 60 * 60 * 1000;

export function opsAlertEmail(env: NodeJS.ProcessEnv = process.env): string {
  return env.OPS_ALERT_EMAIL?.trim() || DEFAULT_OPS_ALERT_EMAIL;
}

/** Claims the right to send one email for `kind` now. True = send. */
export type ThrottleClaim = (kind: string, now: number, windowMs: number) => Promise<boolean>;

export type OpsMailer = (msg: { to: string; subject: string; html: string; text: string }) => Promise<{ success: boolean; error?: string }>;

const lastSent = new Map<string, number>();

/** Per-instance throttle. */
export function memoryClaim(kind: string, now: number, windowMs: number, sent: Map<string, number> = lastSent): boolean {
  const last = sent.get(kind);
  if (last !== undefined && now - last < windowMs) return false;
  sent.set(kind, now);
  return true;
}

/** Test helper. */
export function resetOpsAlertMemory() {
  lastSent.clear();
}

/**
 * Shared throttle in ops_alerts (kind primary key, last_sent_at). Atomic per row:
 * update the row only if it is older than the window; else insert it if it is missing.
 * Throws if the table is missing, so the caller can fall back to memory.
 */
export const supabaseClaim: ThrottleClaim = async (kind, now, windowMs) => {
  const at = new Date(now).toISOString();
  const cutoff = new Date(now - windowMs).toISOString();
  const upd = await supabase.from("ops_alerts").update({ last_sent_at: at }).eq("kind", kind).lt("last_sent_at", cutoff).select("kind");
  if (upd.error) throw upd.error;
  if (upd.data?.length) return true;
  const ins = await supabase
    .from("ops_alerts")
    .upsert({ kind, last_sent_at: at }, { onConflict: "kind", ignoreDuplicates: true })
    .select("kind");
  if (ins.error) throw ins.error;
  return (ins.data?.length ?? 0) > 0;
};

export interface OpsAlertDeps {
  claim?: ThrottleClaim;
  mailer?: OpsMailer;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}

export function errorText(err: unknown): string {
  if (err === undefined || err === null) return "";
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === "string") return err;
  if (typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function opsAlertEmailContent(kind: string, summary: string, detail: string, at: Date) {
  const subject = `Abeiku alert: ${summary}`.slice(0, 180);
  const lines = [
    summary,
    "",
    `Kind: ${kind}`,
    `When: ${at.toISOString()}`,
    ...(detail ? ["", detail] : []),
    "",
    "You get at most one email per kind per hour; later failures of the same kind in that hour are only in the logs.",
  ];
  const text = lines.join("\n");
  const html =
    `<p style="font-size:16px;font-weight:600;margin:0 0 12px">${esc(summary)}</p>` +
    `<p style="margin:0 0 4px;color:#555">Kind: <code>${esc(kind)}</code></p>` +
    `<p style="margin:0 0 12px;color:#555">When: ${esc(at.toISOString())}</p>` +
    (detail ? `<pre style="white-space:pre-wrap;font-size:12px;background:#f5f5f5;padding:12px;border-radius:8px">${esc(detail)}</pre>` : "") +
    `<p style="font-size:12px;color:#888">At most one email per kind per hour; later failures of the same kind in that hour are only in the logs.</p>`;
  return { subject, text, html };
}

/**
 * Emails Harrison about a failure of `kind` (e.g. "stripe-webhook", "booking-sync-feed:aracuya"),
 * unless one was sent for the same kind in the last hour. Never throws; returns what happened.
 * Keep guest data (names, phone numbers) out of `summary` and `detail`.
 */
export async function opsAlert(
  kind: string,
  summary: string,
  detail?: unknown,
  deps: OpsAlertDeps = {},
): Promise<"sent" | "throttled" | "not-configured" | "failed"> {
  try {
    const env = deps.env ?? process.env;
    const now = (deps.now ?? Date.now)();
    const detailText = errorText(detail).slice(0, 2000);
    console.error(`[ops-alert] ${kind}: ${summary}${detailText ? ` (${detailText.slice(0, 300)})` : ""}`);
    if (!deps.mailer && !env.RESEND_API_KEY) return "not-configured";

    // Memory first (no DB round trip for repeats in this instance), then the shared table.
    if (!memoryClaim(kind, now, OPS_ALERT_WINDOW_MS)) return "throttled";
    const claim = deps.claim ?? supabaseClaim;
    try {
      if (!(await claim(kind, now, OPS_ALERT_WINDOW_MS))) return "throttled";
    } catch (err) {
      console.warn(`[ops-alert] shared throttle unavailable (docs/go-live-l3-ops.sql?), using this instance only: ${errorText(err).slice(0, 200)}`);
    }

    const { subject, text, html } = opsAlertEmailContent(kind, summary, detailText, new Date(now));
    const mailer = deps.mailer ?? sendEmail;
    const res = await mailer({ to: opsAlertEmail(env), subject, html, text });
    if (!res.success) {
      console.error(`[ops-alert] email for ${kind} not sent: ${res.error ?? "unknown"}`);
      return "failed";
    }
    return "sent";
  } catch (err) {
    console.error("[ops-alert] failed:", err);
    return "failed";
  }
}

/** L3: one alert per hotel whose calendar feeds failed this sync run (kind booking-sync-feed:<slug>). */
export async function alertFeedFailures(
  items: { slug: string; errors: string[] }[],
  alert: typeof opsAlert = opsAlert,
): Promise<void> {
  for (const { slug, errors } of items) {
    if (!errors.length) continue;
    const n = errors.length;
    await alert(`booking-sync-feed:${slug}`, `Booking sync: ${n} calendar feed${n === 1 ? "" : "s"} of ${slug} failed`, errors.join("\n"));
  }
}
