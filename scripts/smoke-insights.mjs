#!/usr/bin/env node
/**
 * Smoke test: hits the Insights health endpoint and fails (exit 1) on any 5xx.
 *
 * Usage:
 *   node scripts/smoke-insights.mjs                 # uses SMOKE_BASE_URL or localhost:8080
 *   SMOKE_BASE_URL=https://app.lovable.app node scripts/smoke-insights.mjs
 *
 * Intended for CI: run after the server is up to guard against the insights
 * route returning a 500 (e.g. forbidden server→client import regressions).
 */
const BASE = (process.env.SMOKE_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const PATH = "/api/public/insights-health";
const url = `${BASE}${PATH}`;
const RETRIES = Number(process.env.SMOKE_RETRIES || 10);
const DELAY_MS = Number(process.env.SMOKE_DELAY_MS || 2000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.status >= 500) {
        const body = await res.text().catch(() => "");
        console.error(`\x1b[31m✖ Smoke test FAILED: ${url} returned ${res.status}\x1b[0m`);
        console.error(`  Body: ${body.slice(0, 500)}`);
        process.exit(1);
      }
      const body = await res.json().catch(() => ({}));
      console.log(`\x1b[32m✓ Smoke test passed: ${url} -> ${res.status}\x1b[0m`, body);
      process.exit(0);
    } catch (e) {
      lastErr = e;
      console.log(`… server not ready (attempt ${attempt}/${RETRIES}): ${e.message}`);
      await sleep(DELAY_MS);
    }
  }
  console.error(`\x1b[31m✖ Smoke test FAILED: could not reach ${url}\x1b[0m`);
  console.error(`  ${lastErr?.message ?? "unknown error"}`);
  process.exit(1);
}

main();
