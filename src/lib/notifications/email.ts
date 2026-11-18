import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");
  }
  return _resend;
}

/** Resend's verified domain is abeiku.com (its DNS records live on send.abeiku.com). */
export const DEFAULT_FROM_EMAIL = "notifications@abeiku.com";

export function fromEmail(env: NodeJS.ProcessEnv = process.env): string {
  return env.NOTIFICATION_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL;
}

export async function sendEmail(params: {
  /** One address, or several (all in To, one email). */
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text version (shown by mail apps that prefer it). */
  text?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await getResend().emails.send({
      from: `Abeiku <${fromEmail()}>`,
      to: params.to,
      subject: params.subject,
      html: wrapInTemplate(params.html),
      ...(params.text ? { text: params.text } : {}),
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown email error",
    };
  }
}

function wrapInTemplate(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:system-ui,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e5e5;">
      ${bodyHtml}
    </div>
    <p style="text-align:center;font-size:12px;color:#888;margin-top:24px;">
      Sent by Abeiku &middot; Hotel Management Platform
    </p>
  </div>
</body>
</html>`;
}
