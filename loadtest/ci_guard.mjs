#!/usr/bin/env node
/**
 * ci_guard.mjs — fail CI when benchmark results regress.
 *
 * Reads the JSON emitted by ui_bench.mjs (--json) and (optionally) backend_bench.py
 * (--json) and enforces thresholds so a deployment is blocked when the UI render
 * pipeline gets slow or model accuracy drops.
 *
 * Usage:
 *   node loadtest/ci_guard.mjs --ui loadtest/reports/ui.json [--backend loadtest/reports/backend.json]
 *
 * Thresholds (override via env):
 *   BENCH_MAX_TOTAL_MS  (default 6000)  — max allowed UI pipeline total per run
 *   BENCH_MIN_ACCURACY  (default 0.80)  — min allowed backend /predict accuracy
 *   BENCH_MAX_P99_MS    (default 4000)  — max allowed backend p99 latency
 */
import { readFileSync, existsSync } from "node:fs";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const num = (v, d) => (v === undefined || v === null || v === "" ? d : Number(v));

const MAX_TOTAL = num(process.env.BENCH_MAX_TOTAL_MS, 6000);
const MIN_ACC = num(process.env.BENCH_MIN_ACCURACY, 0.8);
const MAX_P99 = num(process.env.BENCH_MAX_P99_MS, 4000);

const failures = [];
const notes = [];

const uiPath = arg("ui", "");
if (uiPath && existsSync(uiPath)) {
  const ui = JSON.parse(readFileSync(uiPath, "utf8"));
  for (const run of ui.runs ?? []) {
    notes.push(`UI ${run.label}: total=${run.total}ms verdict=${run.verdict}`);
    if (run.verdict === "REVIEW") failures.push(`UI run "${run.label}" verdict REVIEW`);
    if (run.total > MAX_TOTAL)
      failures.push(`UI run "${run.label}" total ${run.total}ms > ${MAX_TOTAL}ms`);
  }
} else if (uiPath) {
  failures.push(`UI benchmark JSON not found at ${uiPath}`);
}

const bePath = arg("backend", "");
if (bePath && existsSync(bePath)) {
  const be = JSON.parse(readFileSync(bePath, "utf8"));
  // accuracy is an object { min, mean, max, passed } (in-process mode) or null (http mode).
  const accMin = be.accuracy?.min;
  if (accMin !== undefined && accMin !== null) {
    notes.push(`Backend accuracy min=${accMin} mean=${be.accuracy.mean}`);
    if (accMin < MIN_ACC) failures.push(`Backend accuracy min ${accMin} < ${MIN_ACC}`);
  }
  // p99 from the /predict endpoint stats.
  const predict = (be.endpoints ?? []).find((e) => String(e.endpoint).includes("/predict"));
  if (predict?.p99 !== undefined) {
    notes.push(`Backend /predict p99=${predict.p99}ms`);
    if (predict.p99 > MAX_P99)
      failures.push(`Backend /predict p99 ${predict.p99}ms > ${MAX_P99}ms`);
  }
}

console.log("=== Benchmark CI guard ===");
notes.forEach((n) => console.log("  • " + n));

if (failures.length) {
  console.error("\n❌ Benchmark regression detected:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log("\n✅ Benchmarks within thresholds — deployment allowed.");
