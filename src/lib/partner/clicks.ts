// Link previews (WhatsApp, Facebook, Slack…), crawlers and scripts: they fetch the link but are not people.
const NOT_A_PERSON =
  /WhatsApp\/|facebookexternalhit|Facebot|Twitterbot|Slackbot|TelegramBot|LinkedInBot|Discordbot|Googlebot|bingbot|Applebot|bot|crawler|spider|preview|curl|wget|python-requests|node-fetch|axios|Go-http-client|HeadlessChrome/i;

/** True when a partner-link visit with this user agent counts as a click (a person, not a machine). */
export function isCountableClick(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  return ua !== "" && !NOT_A_PERSON.test(ua);
}

/** The same ip_hash for the same partner within this window counts once. */
export const REPEAT_CLICK_WINDOW_MS = 30 * 60 * 1000;
