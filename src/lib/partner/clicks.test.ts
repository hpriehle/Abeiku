import { describe, expect, it } from "vitest";
import { isCountableClick } from "./clicks";

const NOT_PEOPLE = [
  "WhatsApp/2.23.20.0 A",
  "WhatsApp/2.2343.2 i",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Facebot",
  "Twitterbot/1.0",
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "TelegramBot (like TwitterBot)",
  "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
  "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1)",
  "SomeBot/1.0",
  "ExampleCrawler/2.0",
  "Mozilla/5.0 (compatible; MJ12 spider)",
  "Mozilla/5.0 link preview",
  "curl/8.5.0",
  "Wget/1.21.4",
  "python-requests/2.31.0",
  "node-fetch/1.0 (+https://github.com/bitinn/node-fetch)",
  "axios/1.6.2",
  "Go-http-client/2.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
  "",
  "   ",
  null,
  undefined,
];

const PEOPLE = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; SM-A146P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
  // Instagram / Facebook in-app browsers are people who tapped the link.
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0]",
];

describe("isCountableClick", () => {
  it.each(NOT_PEOPLE)("does not count %j", (ua) => expect(isCountableClick(ua)).toBe(false));
  it.each(PEOPLE)("counts %s", (ua) => expect(isCountableClick(ua)).toBe(true));
});
