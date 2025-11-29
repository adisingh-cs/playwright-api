const { chromium } = require("playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const context = await browser.newContext({
    storageState: {
      cookies: JSON.parse(fs.readFileSync("./cookies.json", "utf8"))
    }
  });

  const page = await context.newPage();

  await page.goto("https://leetcode.com/problemset/all/", {
    waitUntil: "domcontentloaded"
  });

  console.log("Final Page Title:", await page.title());

  await browser.close();
})();
