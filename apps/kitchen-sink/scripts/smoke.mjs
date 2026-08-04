// Headless boot smoke test for the kitchen-sink demo app.
//
// Serves the already-built dist/ via `vite preview`, loads it in headless
// Chromium, and asserts the Caper app actually boots (window.Caper.apps
// gains an entry) with no page errors, no console errors, and a canvas
// present. Run with: node scripts/smoke.mjs (after `pnpm kitchen-sink:build`).

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const distIndex = path.join(appDir, "dist", "index.html");

const PORT = 4173;
const URL = `http://localhost:${PORT}/`;
const SERVER_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 400;
const BOOT_TIMEOUT_MS = 20_000;

if (!existsSync(distIndex)) {
  console.error("dist/index.html not found — run `pnpm kitchen-sink:build` first");
  process.exit(1);
}

async function waitForServer(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res) return true;
    } catch {
      // connection refused / not up yet — keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return false;
}

async function main() {
  const child = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    cwd: appDir,
    stdio: "ignore",
  });

  let browser;
  const failures = [];

  try {
    const serverUp = await waitForServer(URL, SERVER_TIMEOUT_MS);
    if (!serverUp) {
      console.error(`vite preview did not respond at ${URL} within ${SERVER_TIMEOUT_MS}ms`);
      process.exitCode = 1;
      return;
    }

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const pageErrors = [];
    const consoleErrors = [];

    page.on("pageerror", (err) => {
      pageErrors.push(err.stack || err.message || String(err));
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(URL);

    let bootDetected = false;
    try {
      await page.waitForFunction(() => window.Caper?.apps?.size > 0, { timeout: BOOT_TIMEOUT_MS });
      bootDetected = true;
    } catch {
      failures.push("boot not detected (window.Caper.apps never gained an entry)");
    }

    const canvasCount = await page.locator("canvas").count();
    const hasCanvas = canvasCount > 0;
    if (!hasCanvas) {
      failures.push("no <canvas> element found on the page");
    }

    if (pageErrors.length > 0) {
      failures.push(`${pageErrors.length} page error(s): ${pageErrors.join(" | ")}`);
    }
    if (consoleErrors.length > 0) {
      failures.push(`${consoleErrors.length} console error(s): ${consoleErrors.join(" | ")}`);
    }

    if (failures.length === 0) {
      console.log("PASS — kitchen-sink booted headlessly with no errors");
    } else {
      console.error("FAIL — kitchen-sink smoke test failed:");
      for (const reason of failures) {
        console.error(`  - ${reason}`);
      }
      process.exitCode = 1;
    }
  } finally {
    if (browser) await browser.close();
    child.kill();
  }
}

await main();
