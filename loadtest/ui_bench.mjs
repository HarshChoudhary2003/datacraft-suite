#!/usr/bin/env node
/**
 * ui_bench.mjs — benchmark the UI's data-rendering pipeline on large CSV files.
 *
 * This measures the exact pure functions that drive every on-screen table and
 * chart (stats profiling, dataset build, auto-clean, correlation, histogram).
 * These dominate render time far more than React itself, so they are the right
 * thing to load-test for "table rendering" responsiveness.
 *
 * Usage:
 *   node loadtest/ui_bench.mjs --file loadtest/data/large.csv
 *   node loadtest/ui_bench.mjs --rows 50000,200000,500000   (generates in-memory)
 */
import { readFileSync, existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { register } from "node:module";

// Allow importing the project's TypeScript libs directly.
let tsImport;
try {
  register("tsx/esm", pathToFileURL("./"));
} catch {
  /* tsx loader optional; bun runs TS natively */
}

const base = new URL("../src/lib/", import.meta.url);
const { buildDataset, buildDatasetScaled, correlationMatrix, histogram } = await import(new URL("stats.ts", base).href);
const { autoClean } = await import(new URL("autoclean.ts", base).href);

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split(",");
  const rows = new Array(lines.length - 1);
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const obj = {};
    for (let c = 0; c < header.length; c++) {
      const v = cells[c];
      const n = v === "" ? "" : Number(v);
      obj[header[c]] = v === "" || Number.isNaN(n) ? v : n;
    }
    rows[i - 1] = obj;
  }
  return rows;
}

function synth(n) {
  const cats = ["A", "B", "C", "D", "E"];
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    rows[i] = {
      id: i,
      age: 18 + (i % 50),
      income: i % 33 === 0 ? "" : 40000 + (i % 1000) * 30,
      score: (i % 100) / 100,
      category: cats[i % cats.length],
      active: i % 2 === 0 ? "true" : "false",
    };
  }
  return rows;
}

function time(label, fn) {
  const t0 = performance.now();
  const out = fn();
  const ms = performance.now() - t0;
  return { label, ms, out };
}

function fmt(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms.toFixed(1)}ms`;
}

function benchOne(rows, label) {
  console.log(
    `\n▶ ${label} — ${rows.length.toLocaleString()} rows × ${Object.keys(rows[0]).length} cols`,
  );
  const build = time("buildDataset (profiling + table data)", () => buildDatasetScaled(label, rows));
  const ds = build.out;
  const corr = time("correlationMatrix", () => correlationMatrix(ds));
  const numericCol = ds.profiles.find((p) => p.type === "numeric");
  const vals = numericCol
    ? rows.map((r) => Number(r[numericCol.name])).filter((v) => !Number.isNaN(v))
    : [];
  const hist = time("histogram (chart prep)", () => histogram(vals, 30));
  const clean = time("autoClean (all actions)", () =>
    autoClean(ds, {
      actions: [
        "trimWhitespace",
        "fillMissingNumeric",
        "fillMissingCategorical",
        "dropDuplicateRows",
        "capOutliersIQR",
      ],
    }),
  );

  const results = [build, corr, hist, clean];
  for (const r of results) {
    const perRow = (r.ms / rows.length) * 1000; // µs per row
    console.log(
      `  • ${r.label.padEnd(42)} ${fmt(r.ms).padStart(8)}  (${perRow.toFixed(2)} µs/row)`,
    );
  }
  const total = results.reduce((s, r) => s + r.ms, 0);
  const verdict = total < 1500 ? "EXCELLENT" : total < 4000 ? "GOOD" : "REVIEW";
  console.log(`  Σ total pipeline: ${fmt(total)}  →  ${verdict}`);
  return {
    label,
    rows: rows.length,
    cols: Object.keys(rows[0]).length,
    total,
    verdict,
    readiness: ds.readinessScore,
    stages: results.map((r) => ({
      name: r.label,
      ms: Number(r.ms.toFixed(2)),
      usPerRow: Number(((r.ms / rows.length) * 1000).toFixed(3)),
    })),
  };
}

const file = arg("file", "");
const jsonOut = arg("json", "");
const summaries = [];

if (file && existsSync(file)) {
  const text = readFileSync(file, "utf8");
  const rows = parseCsv(text);
  summaries.push(benchOne(rows, file));
} else {
  const sizes = arg("rows", "50000,200000,500000,1000000")
    .split(",")
    .map((s) => parseInt(s, 10));
  for (const n of sizes) summaries.push(benchOne(synth(n), `synthetic-${n}`));
}

console.log("\n=== UI render-pipeline summary ===");
for (const s of summaries) {
  console.log(
    `  ${s.label.padEnd(24)} total=${fmt(s.total).padStart(8)}  readiness=${s.readiness}/100`,
  );
}

if (jsonOut) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(jsonOut), { recursive: true });
  writeFileSync(
    jsonOut,
    JSON.stringify({ generatedAt: new Date().toISOString(), runs: summaries }, null, 2),
  );
  console.log(`\n✓ Wrote UI benchmark JSON → ${jsonOut}`);
}
