const express = require("express");
const { chromium } = require("playwright");
const fs = require("fs");

const app = express();
app.use(express.json());

// =================================
// HEALTH CHECK
// =================================
app.get("/", (req, res) => {
  res.send("LeetCode API Submitter (No UI, Cloudflare-proof) is running.");
});

// =================================
// SUBMIT SOLUTION (No UI Webpage)
// =================================
app.post("/submit", async (req, res) => {
  const { slug, lang, code } = req.body;

  if (!slug || !lang || !code) {
    return res.status(400).json({ error: "slug, lang, code required" });
  }

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

    // Request URL
    const submitUrl = `https://leetcode.com/problems/${slug}/submit/`;

    // Request Payload
    const payload = {
      question_id: null, // We'll fetch this
      typed_code: code,
      lang: lang,
    };

    // Fetch question metadata first to get ID
    const questionResp = await page.request.get(
      `https://leetcode.com/api/problems/${slug.replace(/-/g, "_")}/`
    );
    const questionJson = await questionResp.json();
    payload.question_id = questionJson.stat.question_id;

    // Submit the solution
    const response = await page.request.post(submitUrl, {
      headers: {
        "Content-Type": "application/json",
        "Referer": `https://leetcode.com/problems/${slug}/`,
      },
      data: payload
    });

    const submitData = await response.json();
    const submissionId = submitData.submission_id || submitData.submissionId;

    if (!submissionId) {
      throw new Error("Failed to get submission ID");
    }

    // ==== POLL RESULTS ====
    let verdict = "Pending";
    let attempts = 0;

    while (attempts < 100) {
      const checkResp = await page.request.get(
        `https://leetcode.com/submissions/detail/${submissionId}/check/`
      );
      const checkJson = await checkResp.json();

      if (
        checkJson?.status_msg &&
        !["Pending", "Judging"].includes(checkJson.status_msg)
      ) {
        verdict = checkJson.status_msg;
        break;
      }

      attempts++;
      await new Promise((r) => setTimeout(r, 1000));
    }

    await browser.close();

    return res.json({
      slug,
      submissionId,
      verdict
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// =================================
// REQUIRED FOR RENDER
// =================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on PORT ${PORT}`);
});
