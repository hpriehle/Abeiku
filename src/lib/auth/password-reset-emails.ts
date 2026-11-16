// Emails for the hotel-admin forgot-password flow. Sent with sendEmail (Resend).

function appUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.NEXT_PUBLIC_APP_URL ?? "https://abeiku.com").trim().replace(/\/$/, "");
}

export function resetLink(token: string, env: NodeJS.ProcessEnv = process.env): string {
  return `${appUrl(env)}/admin/reset-password?token=${encodeURIComponent(token)}`;
}

export function resetRequestEmail(token: string, env: NodeJS.ProcessEnv = process.env) {
  const link = resetLink(token, env);
  return {
    subject: "Reset your Abeiku password",
    html: `<p style="margin:0 0 16px;color:#222;font-size:15px;">Hello,</p>
<p style="margin:0 0 16px;color:#222;font-size:15px;">Someone asked to reset the password for your Abeiku hotel dashboard. To choose a new password, tap the button below.</p>
<p style="margin:0 0 24px;"><a href="${link}" style="display:inline-block;background:#2D4A3E;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;">Choose a new password</a></p>
<p style="margin:0 0 16px;color:#555;font-size:13px;">The link works for 1 hour and only once. If you didn't ask for this, you can ignore this email. Your password stays the same.</p>
<p style="margin:0;color:#888;font-size:12px;word-break:break-all;">If the button doesn't work, copy this link into your browser:<br>${link}</p>`,
    text: `Hello,

Someone asked to reset the password for your Abeiku hotel dashboard. To choose a new password, open this link:

${link}

The link works for 1 hour and only once. If you didn't ask for this, you can ignore this email. Your password stays the same.`,
  };
}

export function passwordChangedEmail(env: NodeJS.ProcessEnv = process.env) {
  const login = `${appUrl(env)}/admin/login`;
  return {
    subject: "Your Abeiku password was changed",
    html: `<p style="margin:0 0 16px;color:#222;font-size:15px;">Hello,</p>
<p style="margin:0 0 16px;color:#222;font-size:15px;">The password for your Abeiku hotel dashboard was just changed. You can now <a href="${login}" style="color:#2D4A3E;">sign in</a> with your new password.</p>
<p style="margin:0;color:#222;font-size:15px;"><strong>If this wasn't you</strong>, reply to <a href="mailto:hello@abeiku.com" style="color:#2D4A3E;">hello@abeiku.com</a> right away and we'll help you lock your account.</p>`,
    text: `Hello,

The password for your Abeiku hotel dashboard was just changed. You can now sign in with your new password: ${login}

If this wasn't you, reply to hello@abeiku.com right away and we'll help you lock your account.`,
  };
}
