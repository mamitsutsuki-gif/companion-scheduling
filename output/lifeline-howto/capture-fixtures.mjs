import puppeteer from "puppeteer-core";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = path.join(__dirname, "assets");
fs.mkdirSync(outDir, { recursive: true });

const ids = [
  "fx-overview",
  "fx-entrance",
  "fx-event-input",
  "fx-privacy-lock",
  "fx-graph-summary",
];

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--font-render-hinting=none"],
  defaultViewport: { width: 900, height: 750, deviceScaleFactor: 2 },
});

const page = await browser.newPage();
const fileUrl = `file://${path.resolve(__dirname, "fixtures.html")}`;
await page.goto(fileUrl, { waitUntil: "networkidle0", timeout: 60000 });

await page.evaluate(async () => {
  if (document.fonts?.ready) await document.fonts.ready;
});

for (const id of ids) {
  await page.evaluate((sceneId) => {
    document.querySelectorAll(".scene").forEach((s) => {
      s.style.display = s.id === sceneId ? "block" : "none";
      s.style.margin = "0";
    });
    document.body.style.background = "#ffffff";
    document.body.style.padding = "20px";
    window.scrollTo(0, 0);
  }, id);

  await new Promise((r) => setTimeout(r, 200));
  const el = await page.$(`#${id}`);
  if (!el) throw new Error(`missing ${id}`);

  const file = path.join(outDir, `shot-${id}.png`);
  await el.screenshot({ path: file, type: "png" });
  console.log("wrote", file);
}

await browser.close();
console.log("All lifeline fixtures captured successfully.");
