const express = require("express");
const { chromium } = require("playwright");
const fs = require("fs");

const app = express();
app.use(express.json());

// =================================
// HEALTH CHECK
// =================================
app.get("/", (req, res) => {
  res.send("LeetCode API Submitter (Final Stable Version) is running.");
});

// =================================
// GET QUESTION ID (GraphQL)
// =================================
async function getQuestionId(page, slug) {
  const query = {
    query: `
      query questionData($titleSlug: String!) {
        question(titleSlug: $titleSlug) {
          questionId
        }
      }
    `,
    variables: { titleSlug: slug }
  };

  const resp = await page.request.post("https://leetcode.com/graphql/", {
    headers: {
      "Content-Type": "application/json",
      "Referer": `https://leetcode.com/problems/${slug}/`,
    },
    data: query
  });

  const json = await resp.json();
  return json?.data?.question?.questionId || null;
}

// =================================
// SUBMIT SOLUTION
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

    const context = await browser.newContext({ storageState: { cookies } });
    const page = await context.newPage();

    // 1️⃣ Get questionId using GraphQL
    const questionId = await getQuestionId(page, slug);

    if (!questionId) {
      throw new Error("Could not fetch questionId from GraphQL");
    }

    // 2️⃣ Submit via API
    const submitUrl = `https://leetcode.com/problems/${slug}/submit/`;

    const payload = {
      question_id: questionId,
      lang: lang,
      typed_code: code
    };

    const resp = await page.request.post(submitUrl, {
      headers: {
        "Content-Type": "application/json",
        "Referer": `https://leetcode.com/problems/${slug}/`
      },
      data: payload
    });

    const submitJson = await resp.json();
    const submissionId = submitJson?.submission_id || submitJson?.submissionId;

    if (!submissionId) throw new Error("Failed to obtain submissionId");

    // 3️⃣ Poll submission result
    let verdict = "Pending";
    let attempt = 0;

    while (attempt < 120) {
      const checkResp = await page.request.get(
        `https://leetcode.com/submissions/detail/${submissionId}/check/`
      );

      const checkJson = await checkResp.json();
      const status = checkJson?.status_msg;

      if (status && !["Pending", "Judging"].includes(status)) {
        verdict = status;
        break;
      }

      await new Promise((r) => setTimeout(r, 1000));
      attempt++;
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
