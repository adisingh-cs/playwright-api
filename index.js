const express = require("express");
const { chromium } = require("playwright");
const fs = require("fs");

const app = express();
app.use(express.json());

// Health check route
app.get("/", (req, res) => {
  res.send("LeetCode Browser Automation API is running.");
});

// Main automation route
app.post("/run", async (req, res) => {
  try {
    const cookies = JSON.parse(fs.readFileSync("./cookies.json", "utf8"));

    const browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled"
      ]
    });

    const context = await browser.newContext({
      storageState: { cookies },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "en-US",
      timezoneId: "America/Los_Angeles",
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();

    // Stealth patches
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      window.chrome = { runtime: {} };
    });

    await page.goto("https://leetcode.com/problemset/all/", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    const title = await page.title();

    await browser.close();

    return res.json({
      status: "success",
      title
    });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      error: error.message
    });
  }
});

// Required for Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on PORT ${PORT}`);
});
