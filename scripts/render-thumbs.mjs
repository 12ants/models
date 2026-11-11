#!/usr/bin/env node
/**
 * Renders the sidebar thumbnails by opening the viewer in thumbnail mode.
 *
 *   1. npm start
 *   2. npm run thumbs        (needs `npx playwright install chromium` once)
 *
 * Set CHROME_PATH=/path/to/chrome to use a specific Chromium build.
 */
import { chromium } from "playwright";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { models } from "../src/models.js";

const BASE = process.env.BASE_URL || "http://localhost:5173";
const LAUNCH_ARGS = ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];

/**
 * Locate a cached Chromium build. Playwright pins one exact build number, so
 * plain chromium.launch() fails when the cache holds a different one; falling
 * back to whatever build exists keeps `npm run thumbs` working.
 */
function detectChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(cache)) return undefined;
  const builds = readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort()
    .reverse();
  for (const build of builds) {
    for (const sub of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
      const path = join(cache, build, sub);
      if (existsSync(path)) return path;
    }
  }
  return undefined;
}

async function launchBrowser() {
  try {
    return await chromium.launch({ args: LAUNCH_ARGS });
  } catch (err) {
    const chrome = detectChromium();
    if (!chrome) {
      throw new Error(
        `Could not launch Chromium (${err.message.split("\n")[0]}). ` +
          "Run `npx playwright install chromium` or set CHROME_PATH.",
      );
    }
    console.log(`Playwright's pinned Chromium is unavailable — using ${chrome}`);
    return chromium.launch({ args: LAUNCH_ARGS, executablePath: chrome });
  }
}

async function webpFromPng(page, png) {
  const b64 = png.toString("base64");
  const out = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d").drawImage(img, 0, 0);
    return canvas.toDataURL("image/webp", 0.86).split(",")[1];
  }, b64);
  return Buffer.from(out, "base64");
}

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 384, height: 384 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("pageerror:", e.message));

let ok = 0;
for (const m of models) {
  const out = `thumbs/${m.file.replace(/\.glb$/i, "")}.webp`;
  try {
    await page.goto(`${BASE}/?thumb=${encodeURIComponent(m.file)}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction(() => window.__thumbReady === true, { timeout: 90000 });
    await page.waitForTimeout(300);
    const png = await page.screenshot({ animations: "disabled" });
    writeFileSync(out, await webpFromPng(page, png));
    ok++;
    console.log(`✓ ${m.file}`);
  } catch (err) {
    console.error(`✗ ${m.file}: ${err.message.split("\n")[0]}`);
  }
}

await browser.close();
console.log(`\n${ok}/${models.length} thumbnails written to thumbs/`);
