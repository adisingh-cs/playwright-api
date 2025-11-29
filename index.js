const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process"
    ]
  });

  const context = await browser.newContext({
    storageState: {
      cookies: JSON.parse(fs.readFileSync("./cookies.json", "utf8"))
    },

    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

    locale: "en-US",
    timezoneId: "America/Los_Angeles",

    viewport: { width: 1280, height: 800 },

    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  const page = await context.newPage();

  // Stealth / anti-detection patches
  await page.addInitScript(() => {
    // Remove Playwright detection flags
    Object.defineProperty(navigator, "webdriver", {
      get: () => false,
    });

    // Fake plugins
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3],
    });

    // Fake languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });

    // Fake chrome object
    window.chrome = {
      runtime: {},
    };
  });

  await page.goto("https://leetcode.com/problemset/all/", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  console.log("Final Page Title:", await page.title());

  await browser.close();
})();
