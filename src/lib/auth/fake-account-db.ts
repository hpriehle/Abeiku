// Test helper: an in-memory `admin_users` table with just the Supabase calls account.ts makes.

export interface FakeAdminRow {
  id: string;
  email: string;
  session_version?: number;
  email_verified_at?: string | null;
}

export function fakeAccountDb(rows: FakeAdminRow[], opts: { missingColumns?: boolean } = {}) {
  const missing = { code: "42703", message: "column admin_users.session_version does not exist" };
  const usesNewColumns = (v: object | string) =>
    typeof v === "string" ? /session_version|email_verified_at/.test(v) : "session_version" in v || "email_verified_at" in v;
  return {
    rows,
    opts,
    from(table: string) {
      if (table !== "admin_users") throw new Error(`unexpected table ${table}`);
      return {
        select: (cols: string) => ({
          eq: (_col: string, id: string) => ({
            maybeSingle: async () => {
              if (opts.missingColumns && usesNewColumns(cols)) return { data: null, error: missing };
              return { data: rows.find((r) => r.id === id) ?? null, error: null };
            },
          }),
        }),
        update: (values: Record<string, unknown>) => ({
          eq: async (_col: string, id: string) => {
            if (opts.missingColumns && usesNewColumns(values)) return { error: missing };
            const email = values.email as string | undefined;
            if (email && rows.some((r) => r.id !== id && r.email === email)) {
              return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
            }
            const row = rows.find((r) => r.id === id);
            if (row) Object.assign(row, values);
            return { error: null };
          },
        }),
      };
    },
  };
}
