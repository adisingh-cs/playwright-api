import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json({ limit: "10mb" }));

app.post("/run", async (req, res) => {
  const { script, args } = req.body;

  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const result = await eval(`(async () => {
      const api = { page, context, browser, args };
      return (${script})(api);
    })()`);

    await browser.close();

    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.toString() });
  }
});

app.listen(3000, () => {
  console.log("Playwright API running on port 3000");
});
