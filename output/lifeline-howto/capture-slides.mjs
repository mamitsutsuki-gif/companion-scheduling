import puppeteer from "puppeteer-core";
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const outDir = path.join(__dirname, "slides");
fs.mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--font-render-hinting=none"],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 2 },
});

const page = await browser.newPage();
const fileUrl = `file://${path.resolve(__dirname, "index.html")}`;
await page.goto(fileUrl, { waitUntil: "networkidle0", timeout: 120000 });

await page.evaluate(async () => {
  if (document.fonts?.ready) await document.fonts.ready;
  const imgs = [...document.images];
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((res) => {
            img.onload = img.onerror = () => res();
          }),
    ),
  );
});

const count = await page.$$eval(".slide", (els) => els.length);
console.log("Total slides found:", count);

for (let i = 0; i < count; i++) {
  await page.evaluate((idx) => {
    document.querySelectorAll(".slide").forEach((s, j) => {
      s.style.display = j === idx ? "flex" : "none";
      s.style.pageBreakAfter = "auto";
    });
    document.body.style.background = "#0f172a";
    window.scrollTo(0, 0);
  }, i);

  await new Promise((r) => setTimeout(r, 250));
  const file = path.join(outDir, `slide-${String(i + 1).padStart(2, "0")}.png`);
  const handle = await page.evaluateHandle((idx) => document.querySelectorAll(".slide")[idx], i);
  const el = handle.asElement();
  if (!el) throw new Error(`slide ${i + 1} missing`);

  await el.screenshot({ path: file, type: "png" });
  console.log("Wrote slide PNG:", path.basename(file));
}

await browser.close();

console.log("Generating PDF from slide PNGs...");
const pdf = await PDFDocument.create();
const pageW = 3840;
const pageH = 2160;

for (let i = 0; i < count; i++) {
  const file = path.join(outDir, `slide-${String(i + 1).padStart(2, "0")}.png`);
  const bytes = fs.readFileSync(file);
  const img = await pdf.embedPng(bytes);
  const p = pdf.addPage([pageW, pageH]);
  p.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
}

const pdfBytes = await pdf.save();
const rootPdfPath = path.resolve(__dirname, "../lifeline-howto-16x9.pdf");
const localPdfPath = path.resolve(__dirname, "lifeline-howto-16x9.pdf");

fs.writeFileSync(rootPdfPath, pdfBytes);
fs.writeFileSync(localPdfPath, pdfBytes);

console.log("PDF saved successfully to:");
console.log("-", rootPdfPath);
console.log("-", localPdfPath);
