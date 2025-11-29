const express = require("express");
const { chromium } = require("playwright");
const fs = require("fs");

const app = express();
app.use(express.json());

// ===============================
// Health Check
// ===============================
app.get("/", (req, res) => {
  res.send("LeetCode Browser Automation API is running.");
});

// ===============================
// Simple Test Route
// ===============================
app.post("/run", async (req, res) => {
  try {
    const cookies = JSON.parse(fs.readFileSync("./cookies.json", "utf8"));

    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const context = await browser.newContext({
      storageState: { cookies }
    });

    const page = await context.newPage();
    await page.goto("https://leetcode.com/problemset/all/", { waitUntil: "domcontentloaded" });

    const title = await page.title();
    await browser.close();

    return res.json({ status: "success", title });

  } catch (error) {
    return res.status(500).json({ status: "error", error: error.message });
  }
});

// ===============================
// FULL SUBMISSION ROUTE (REST API BACKUP)
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
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    let submissionId = null;

    const context = await browser.newContext({
      storageState: { cookies }
    });

    // Intercept network to capture submission ID
    context.on("response", async (response) => {
      try {
        const url = response.url();
        if (url.includes("/submit/")) {
          const json = await response.json().catch(() => null);
          if (json?.submission_id) {
            submissionId = json.submission_id;
          } else if (json?.submissionId) {
            submissionId = json.submissionId;
          }
        }
      } catch (_) {}
    });

    const page = await context.newPage();

    await page.goto(`https://leetcode.com/problems/${slug}/`, {
      waitUntil: "networkidle",
      timeout: 120000
    });

    // Wait for Monaco editor
    await page.waitForSelector(".monaco-editor", { timeout: 60000 });
    await page.waitForTimeout(1500);

    // Insert code into Monaco
    await page.evaluate((code) => {
      const editor = window.monaco.editor;
      const model = editor.getModels()[0];
      model.setValue(code);
    }, code);

    // Try multiple submit button names
    const submitNames = ["Submit", "Submit Code", "Submit Solution", "Run and Submit"];

    let submitButton = null;

    for (let name of submitNames) {
      try {
        submitButton = page.getByRole("button", { name });
        await submitButton.waitFor({ timeout: 5000 });
        break;
      } catch (_) {}
    }

    if (!submitButton) throw new Error("Submit button not found");

    await submitButton.click();

    // Wait 3 seconds for submission API response
    const start = Date.now();
    while (!submissionId && Date.now() - start < 8000) {
      await page.waitForTimeout(300);
    }

    // Fallback: fetch latest submission via REST API
    if (!submissionId) {
      const apiUrl = `https://leetcode.com/api/submissions/${slug}/`;
      const latest = await page.request.get(apiUrl);
      const data = await latest.json();

      if (!data?.submissions_dump?.length) {
        throw new Error("Could not fetch latest submissions");
      }

      submissionId = data.submissions_dump[0].id;
    }

    // Poll submission status
    let verdict = "Unknown";
    const maxWait = 180000;
    const pollStart = Date.now();

    while (Date.now() - pollStart < maxWait) {
      const checkUrl = `https://leetcode.com/submissions/detail/${submissionId}/check/`;
      const resp = await page.request.get(checkUrl);
      const data = await resp.json();

      if (data?.status_msg && data.status_msg !== "Pending" && data.status_msg !== "Judging") {
        verdict = data.status_msg;
        break;
      }

      await page.waitForTimeout(800);
    }

    await browser.close();

    return res.json({
      slug,
      verdict,
      submissionId
    });

  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
});

// ===============================
// REQUIRED FOR RENDER
// ===============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on PORT ${PORT}`);
});
