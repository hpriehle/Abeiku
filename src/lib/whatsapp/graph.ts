// Shared Graph API settings and a small fetch helper for WhatsApp Cloud API calls.

export const GRAPH_API_VERSION = "v27.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class GraphError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Call the Graph API and return parsed JSON, throwing GraphError with Meta's message on failure. */
export async function graphFetch<T = unknown>(
  path: string,
  token: string,
  init: { method?: string; body?: object; query?: Record<string, string> } = {},
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

  const res = await fetch(url, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (json as { error?: { message?: string; error_user_msg?: string; code?: number } }).error;
    throw new GraphError(
      err?.error_user_msg || err?.message || `Graph API error ${res.status}`,
      res.status,
      err?.code,
      json,
    );
  }
  return json as T;
}
