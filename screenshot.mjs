import { chromium } from "playwright";

const PORT = process.env.PORT || "3099";
const BASE = `http://localhost:${PORT}`;
const OUT = "screenshots";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// 1. Landing page
await page.goto(`${BASE}`, { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/landing.png`, fullPage: true });
console.log("1/3 Landing captured");

// 2. Dashboard (demo mode)
await page.goto(`${BASE}/dashboard?demo=1`, { waitUntil: "networkidle", timeout: 15000 });
await page.screenshot({ path: `${OUT}/dashboard.png`, fullPage: true });
console.log("2/3 Dashboard captured");

// 3. Dashboard scrolled to show agent actions + economics
await page.evaluate(() => window.scrollTo(0, 400));
await page.screenshot({ path: `${OUT}/dashboard-actions.png`, fullPage: false });
console.log("3/3 Dashboard actions captured");

await browser.close();
console.log("Done!");