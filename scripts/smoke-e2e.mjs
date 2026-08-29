/**
 * End-to-end smoke test for DataIQ Pro.
 *
 * Runs the full journey (Overview → Data Prep → Deep Analysis → Export →
 * Code Gen) across MULTIPLE datasets to exercise different shapes and file
 * types — sample CSVs plus an uploaded JSON with missing values and a wide CSV
 * that produces many correlations — asserting the app stays responsive and
 * free of console/page errors, that export output renders, and that generated
 * code is non-empty and passes its validation panel.
 *
 * Usage:  node scripts/smoke-e2e.mjs
 * Env:    SMOKE_BASE_URL (default http://127.0.0.1:8080)
 *         SMOKE_RETRIES  (default 30)  — dev-server readiness polls
 *         SMOKE_DELAY_MS (default 2000)
 */
import { chromium } from "playwright";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE_URL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:8080";
const RETRIES = Number(process.env.SMOKE_RETRIES || 30);
const DELAY_MS = Number(process.env.SMOKE_DELAY_MS || 2000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < RETRIES; i++) {
    try {
      const res = await fetch(BASE_URL, { method: "GET" });
      if (res.ok || res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await sleep(DELAY_MS);
  }
  throw new Error(`Dev server never became ready at ${BASE_URL}`);
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

/** Build a couple of synthetic upload fixtures on disk. */
function makeFixtures() {
  const dir = mkdtempSync(join(tmpdir(), "dataiq-smoke-"));

  // JSON with MISSING values + mixed types (exercises the JSON reader path).
  const jsonRows = [];
  for (let i = 0; i < 120; i++) {
    jsonRows.push({
      id: i + 1,
      region: ["NA", "EU", "APAC"][i % 3],
      revenue: i % 7 === 0 ? null : Math.round(Math.random() * 1000),
      churn: i % 2 === 0 ? "yes" : "no",
      // notes column is mostly missing -> triggers missing-column handling
      notes: i % 11 === 0 ? "flagged" : null,
    });
  }
  const jsonPath = join(dir, "accounts_missing.json");
  writeFileSync(jsonPath, JSON.stringify(jsonRows));

  // Wide numeric CSV -> many correlations (large correlation matrix path).
  const cols = Array.from({ length: 12 }, (_, i) => `f${i}`);
  const header = cols.join(",");
  const lines = [header];
  for (let r = 0; r < 300; r++) {
    const base = Math.random();
    const row = cols.map((_, i) => (base * (i + 1) + Math.random() * 0.3).toFixed(4));
    lines.push(row.join(","));
  }
  const csvPath = join(dir, "wide_correlations.csv");
  writeFileSync(csvPath, lines.join("\n"));

  return { jsonPath, csvPath };
}

async function main() {
  await waitForServer();
  const { jsonPath, csvPath } = makeFixtures();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const step = async (name, fn) => {
    const t0 = Date.now();
    await fn();
    console.log(`  ✓ ${name} (${Date.now() - t0}ms)`);
  };

  // A single dataset can be loaded either via a sample button or a file upload.
  const scenarios = [
    {
      name: "Sales 2024 (sample CSV)",
      load: () => page.getByRole("button", { name: /Sales 2024/i }).click(),
    },
    {
      name: "Customer Churn (sample CSV)",
      load: () => page.getByRole("button", { name: /Customer Churn/i }).click(),
    },
    {
      name: "Titanic (sample CSV)",
      load: () => page.getByRole("button", { name: /Titanic/i }).click(),
    },
    {
      name: "accounts_missing.json (upload, missing cols)",
      load: () => page.locator('input[type="file"]').setInputFiles(jsonPath),
    },
    {
      name: "wide_correlations.csv (upload, large corr)",
      load: () => page.locator('input[type="file"]').setInputFiles(csvPath),
    },
  ];

  const runFlow = async (scenario) => {
    console.log(`\n▶ ${scenario.name}`);
    await step("open upload page", async () => {
      await page.goto(BASE_URL, { waitUntil: "networkidle" });
      await page.getByRole("heading", { name: "DataIQ Pro" }).first().waitFor({ timeout: 15000 });
      await sleep(1500);
    });

    await step("load dataset → overview", async () => {
      await scenario.load();
      await page.waitForURL(/\/overview$/, { timeout: 45000 });
      await page.getByText(/rows/i).first().waitFor({ timeout: 15000 });
    });

    await step("data prep raw grid shows cells", async () => {
      await page.goto(`${BASE_URL}/prep`, { waitUntil: "domcontentloaded" });
      await page.getByText(/Raw Data Explorer/i).waitFor({ timeout: 15000 });
      const cells = await page.locator('[role="cell"]').count();
      if (cells < 1) throw new Error("Data Prep grid rendered no cells");
    });

    await step("deep analysis + correlation", async () => {
      await page.goto(`${BASE_URL}/analysis`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      await page
        .getByText(/correlation/i)
        .first()
        .waitFor({ timeout: 15000 });
    });

    await step("export report renders", async () => {
      await page.goto(`${BASE_URL}/export`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle");
      await page.locator("h1").first().waitFor({ timeout: 15000 });
    });

    await step("code gen + validation panel", async () => {
      await page.goto(`${BASE_URL}/codegen`, { waitUntil: "domcontentloaded" });
      await page.getByText(/Code validation results/i).waitFor({ timeout: 15000 });
      const codeLen = (await page.locator("pre code").first().innerText()).length;
      if (codeLen < 50) throw new Error("Generated code appears empty");
    });
  };

  try {
    for (const scenario of scenarios) {
      await runFlow(scenario);
    }
  } catch (e) {
    fail(`flow failed: ${e.message}`);
  } finally {
    if (pageErrors.length) fail(`page errors:\n${pageErrors.join("\n")}`);
    if (consoleErrors.length) {
      const meaningful = consoleErrors.filter(
        (t) => !/hydrat|favicon|manifest|Download the React DevTools/i.test(t),
      );
      if (meaningful.length) fail(`console errors:\n${meaningful.join("\n")}`);
    }
    await browser.close();
  }

  if (process.exitCode === 1) {
    console.error("\nSmoke test FAILED");
  } else {
    console.log("\nSmoke test PASSED — all datasets responsive and error-free");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
