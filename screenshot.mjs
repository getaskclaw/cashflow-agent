import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

// Screenshot 1: Landing page
await page.goto("http://localhost:3333", { waitUntil: "networkidle" });
await page.screenshot({ path: "/root/2604/taxassist/screenshots/landing.png", fullPage: true });
console.log("1/2 Landing page captured");

// Screenshot 2: Dashboard
await page.goto("http://localhost:3333/dashboard", { waitUntil: "networkidle" });
await page.screenshot({ path: "/root/2604/taxassist/screenshots/dashboard.png", fullPage: true });
console.log("2/2 Dashboard captured");

await browser.close();
