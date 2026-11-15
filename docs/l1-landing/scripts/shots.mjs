// Usage: PW=/path/to/node_modules/playwright node docs/l1-landing/scripts/shots.mjs [baseUrl]
// Screenshots / and /signup at 375 and 1280 wide, and checks: no sideways scroll,
// no em dash, no WhatsApp booking claims, links point where they should.
import fs from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW || "playwright");
const base = process.argv[2] || "http://localhost:3041";
const out = "docs/l1-landing";
const browser = await chromium.launch();
const results = [];
for (const [name, path] of [["landing", "/"], ["signup", "/signup"]]) {
  for (const width of [375, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    const res = await page.goto(base + path, { waitUntil: "networkidle" });
    const text = await page.evaluate(() => document.body.innerText);
    const r = {
      page: path, width, status: res.status(),
      title: await page.title(),
      overflowX: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      emDash: text.includes("—"),
      bookOnWhatsApp: /book(ing)? (on|via|through) whatsapp|whatsapp (booking|bot)/i.test(text),
      links: await page.$$eval("a", (as) => [...new Set(as.map((a) => a.getAttribute("href")))]),
    };
    results.push(r);
    await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true });
    await page.close();
  }
}
await browser.close();
fs.writeFileSync(`${out}/shots-results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map(({ links, ...r }) => r)));
