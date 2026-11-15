// Small shared pieces for the partner portal and the admin Partners page, so buttons, inputs and
// messages look the same everywhere. Colours meet WCAG AA on white: text gray-600 or darker,
// input borders gray-500 (3:1), errors red-700.

export const FONT_BODY = { fontFamily: "var(--font-body), system-ui, sans-serif" };
export const FONT_HEADING = { fontFamily: "var(--font-heading), Georgia, serif" };

export const INPUT =
  "w-full px-4 py-3 border border-gray-500 rounded-lg text-base sm:text-sm text-gray-900 bg-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[#2D4A3E] focus:border-[#2D4A3E]";

export const BUTTON_PRIMARY =
  "inline-flex items-center justify-center gap-2 px-4 py-3 min-h-11 bg-[#2D4A3E] text-white rounded-lg text-sm font-medium hover:bg-[#1E3329] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#2D4A3E] transition-colors disabled:opacity-70 disabled:cursor-not-allowed";

export const BUTTON_SECONDARY =
  "inline-flex items-center justify-center gap-2 px-4 py-3 min-h-11 bg-white text-[#2D4A3E] border border-[#2D4A3E] rounded-lg text-sm font-medium hover:bg-[#2D4A3E]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2D4A3E] transition-colors disabled:opacity-70 disabled:cursor-not-allowed";

export function ErrorMessage({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {children}
    </p>
  );
}

/** Dark full-screen page with a centred white card: login, setup. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#1a1a2e]" style={FONT_BODY}>
      <div className="min-h-full flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-300">Abeiku Partner Portal</p>
            <h1 className="mt-2 text-3xl font-bold text-white tracking-tight" style={FONT_HEADING}>
              {title}
            </h1>
            {subtitle && <p className="text-gray-300 text-sm mt-2">{subtitle}</p>}
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6 sm:p-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-gray-300">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

/** Reads an API error body without ever showing raw JSON or a stack trace. */
export async function apiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    if (data && typeof data.error === "string" && data.error.length < 200) return data.error;
  } catch {
    // not JSON (e.g. a proxy error page)
  }
  return fallback;
}

export const NETWORK_ERROR = "Couldn't reach Abeiku. Check your internet connection and try again.";
