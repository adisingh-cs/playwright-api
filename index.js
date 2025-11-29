const express = require("express");
const { chromium } = require("playwright");
const fs = require("fs");

const app = express();
app.use(express.json());

// Health check route
app.get("/", (req, res) => {
  res.send("LeetCode Browser Automation API is running.");
});

// Test automation route
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
      viewport: { width: 1280, height: 800 }
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

// ===============================
// NEW: LeetCode Submission Route
// ===============================
app.post("/submit", async (req, res) => {
  const { slug, lang, code } = req.body;

  if (!slug || !lang || !code) {
    return res.status(400).json({
      error: "slug, lang, and code are required"
    });
  }

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
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    });

    const page = await context.newPage();

    // Stealth patches
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      window.chrome = { runtime: {} };
    });

    const problemUrl = `https://leetcode.com/problems/${slug}/`;
    await page.goto(problemUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForSelector(".monaco-editor", { timeout: 30000 });

    // Insert code in Monaco
    await page.evaluate((code) => {
      window.monaco.editor.getModels()[0].setValue(code);
    }, code);

    // Click submit
    await page.click("button[data-e2e-locator='submit-code-btn']");

    // Wait for result popup
    await page.waitForSelector(".notification__content", {
      timeout: 60000
    });

    const verdict = await page.innerText(".notification__content");

    await browser.close();

    return res.json({
      slug,
      verdict
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
});

// Required for Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on PORT ${PORT}`);
});
