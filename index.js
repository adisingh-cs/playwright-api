const express = require("express");
const { chromium } = require("playwright");
const fs = require("fs");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("LeetCode Browser Automation API is running.");
});

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

    return res.json({ status: "success", title });

  } catch (error) {
    return res.status(500).json({
      status: "error",
      error: error.message
    });
  }
});

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
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();

    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      window.chrome = { runtime: {} };
    });

    const problemUrl = `https://leetcode.com/problems/${slug}/`;
    await page.goto(problemUrl, {
      waitUntil: "networkidle",
      timeout: 90000
    });

    await page.waitForSelector(".monaco-editor", { timeout: 60000 });
    await page.waitForTimeout(1500);

    await page.evaluate((code) => {
      const editor = window.monaco?.editor;
      if (editor) {
        let model = editor.getModels()[0];
        if (model) model.setValue(code);
      }
    }, code);

    const submitButton = page.getByRole("button", { name: "Submit" });
    await submitButton.waitFor({ timeout: 45000 });
    await submitButton.click();

    const selectors = [
      ".judge-result",
      ".submission-result",
      "[data-e2e-locator='submission-result__status']",
      ".text-success",
      ".text-danger"
    ];

    let verdict = null;

    for (const sel of selectors) {
      try {
        await page.waitForSelector(sel, { timeout: 30000 });
        verdict = await page.textContent(sel);
        break;
      } catch (_) {}
    }

    await browser.close();

    if (!verdict) verdict = "Unknown (LeetCode UI changed or submission too slow)";

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on PORT ${PORT}`);
});
