// Small client helper for admin screens: every request resolves to either
// { ok: true, data } or { ok: false, error } with a message a hotel owner can
// read. Nothing throws, so a failed action can't disappear silently.

export type ApiResult<T = Record<string, unknown>> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

export const NETWORK_ERROR =
  "We couldn't reach Abeiku. Check your internet connection and try again.";
export const SERVER_ERROR = "Something went wrong on our side. Please try again in a moment.";
export const SESSION_EXPIRED = "Your session has expired. Please sign in again.";

/** Server messages worth showing as-is: short, plain text, no stack traces or JSON. */
function usableServerMessage(msg: unknown): string | null {
  if (typeof msg !== "string") return null;
  const m = msg.trim();
  if (!m || m.length > 200) return null;
  // Terse status words say nothing a person can act on.
  if (/^(not found|unauthorized|forbidden|bad request|internal server error|invalid request)\.?$/i.test(m)) return null;
  if (/[{}<>]|\bat\s+\S+:\d+|Error:|TypeError|ECONN|fetch failed/i.test(m)) return null;
  return m;
}

/** Turn an HTTP status + parsed body into a friendly sentence. */
export function friendlyError(status: number, body: unknown, fallback?: string): string {
  const serverMsg =
    body && typeof body === "object"
      ? usableServerMessage((body as { error?: unknown }).error) ??
        usableServerMessage((body as { message?: unknown }).message)
      : null;

  if (status === 0) return NETWORK_ERROR;
  if (status === 401) return SESSION_EXPIRED;
  if (status === 403) return serverMsg ?? "You don't have permission to do that.";
  if (status === 404) return serverMsg ?? "We couldn't find that. It may have been deleted. Refresh the page.";
  if (status === 429) return serverMsg ?? "Too many attempts. Please wait a few minutes and try again.";
  if (status >= 500) return fallback ?? SERVER_ERROR;
  if (status >= 400) return serverMsg ?? fallback ?? "That didn't work. Please check the form and try again.";
  return fallback ?? SERVER_ERROR;
}

/** fetch() wrapper for admin APIs. JSON bodies are encoded when `json` is given. */
export async function apiRequest<T = Record<string, unknown>>(
  url: string,
  init: RequestInit & { json?: unknown; fallbackError?: string } = {},
  fetchImpl: typeof fetch = fetch
): Promise<ApiResult<T>> {
  const { json, fallbackError, ...rest } = init;
  const req: RequestInit = { ...rest };
  if (json !== undefined) {
    req.body = JSON.stringify(json);
    req.headers = { "Content-Type": "application/json", ...(rest.headers || {}) };
  }

  let res: Response;
  try {
    res = await fetchImpl(url, req);
  } catch {
    return { ok: false, status: 0, error: NETWORK_ERROR };
  }

  let body: unknown = null;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  // Some routes answer 200 with { success: false, error } on failure.
  const softFail =
    res.ok && body && typeof body === "object" && (body as { success?: unknown }).success === false;

  if (!res.ok || softFail) {
    return { ok: false, status: res.status, error: friendlyError(softFail ? 400 : res.status, body, fallbackError) };
  }
  return { ok: true, status: res.status, data: (body ?? {}) as T };
}

/**
 * Guard against double submits: while one call is running, further calls
 * return null immediately instead of firing a second request.
 */
export function singleFlight() {
  let running = false;
  return async function run<R>(fn: () => Promise<R>): Promise<R | null> {
    if (running) return null;
    running = true;
    try {
      return await fn();
    } finally {
      running = false;
    }
  };
}
