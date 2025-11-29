const express = require("express");
const { chromium } = require("playwright");
const fs = require("fs");

const app = express();
app.use(express.json());

// ==========================================
// Helper: Build Headers With Cookies
// ==========================================
function buildHeaders(cookies) {
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");

  const csrf = cookies.find(c => c.name === "csrftoken")?.value;

  return {
    "Content-Type": "application/json",
    "Cookie": cookieHeader,
    "x-csrftoken": csrf,
    "Referer": "https://leetcode.com",
    "Origin": "https://leetcode.com",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "*/*"
  };
}

// ==========================================
// GraphQL: Fetch questionId
// ==========================================
async function fetchQuestionId(page, slug, headers) {
  const response = await page.request.post("https://leetcode.com/graphql/", {
    headers,
    data: {
      query: `
        query questionData($titleSlug: String!) {
          question(titleSlug: $titleSlug) {
            questionId
          }
        }
      `,
      variables: { titleSlug: slug }
    }
  });

  const json = await response.json();
  return json?.data?.question?.questionId || null;
}

// ==========================================
// /submit Endpoint
// ==========================================
app.post("/submit", async (req, res) => {
  const { slug, lang, code } = req.body;

  if (!slug || !lang || !code) {
    return res.status(400).json({ error: "slug, lang, code required" });
  }

  try {
    const cookies = JSON.parse(fs.readFileSync("./cookies.json", "utf8"));
    const headers = buildHeaders(cookies);

    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const context = await browser.newContext({ storageState: { cookies } });
    const page = await context.newPage();

    // 1) Get questionId
    const questionId = await fetchQuestionId(page, slug, headers);

    if (!questionId) {
      throw new Error("Could not fetch questionId (GraphQL returned null)");
    }

    // 2) Submit
    const submitResp = await page.request.post(
      `https://leetcode.com/problems/${slug}/submit/`,
      {
        headers,
        data: {
          question_id: questionId,
          lang,
          typed_code: code
        }
      }
    );

    const submitJson = await submitResp.json();
    const submissionId =
      submitJson?.submission_id || submitJson?.submissionId;

    if (!submissionId) throw new Error("Failed to obtain submissionId");

    // 3) Poll judge result
    let verdict = "Pending";
    let attempts = 0;

    while (attempts < 120) {
      const checkResp = await page.request.get(
        `https://leetcode.com/submissions/detail/${submissionId}/check/`,
        { headers }
      );

      const checkJson = await checkResp.json();
      const status = checkJson?.status_msg;

      if (status && !["Pending", "Judging"].includes(status)) {
        verdict = status;
        break;
      }

      await new Promise(r => setTimeout(r, 1000));
      attempts++;
    }

    await browser.close();

    return res.json({
      slug,
      submissionId,
      verdict
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PORT
// ==========================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on PORT ${PORT}`);
});
