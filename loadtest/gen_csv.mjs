#!/usr/bin/env node
/**
 * gen_csv.mjs — generate a deterministic large synthetic CSV for load testing.
 *
 * Usage:
 *   node loadtest/gen_csv.mjs --rows 100000 --out loadtest/data/large.csv
 *
 * Columns produced (mixed types so it exercises numeric/categorical/datetime/bool
 * profiling, missing values, duplicates and outliers):
 *   id, age, income, score, category, region, active, signup_date
 */
import { mkdirSync, createWriteStream } from "node:fs";
import { dirname } from "node:path";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const rows = parseInt(arg("rows", "100000"), 10);
const out = arg("out", "loadtest/data/large.csv");

// tiny seeded PRNG for reproducible data
let seed = 1337;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0xffffffff;
};
const gauss = (mu, sd) => {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const categories = ["A", "B", "C", "D", "E"];
const regions = ["north", "south", "east", "west"];

mkdirSync(dirname(out), { recursive: true });
const stream = createWriteStream(out);
stream.write("id,age,income,score,category,region,active,signup_date\n");

const startTs = Date.now();
let buf = "";
for (let i = 0; i < rows; i++) {
  const age = Math.max(18, Math.round(gauss(40, 12)));
  // inject ~3% missing income and occasional huge outliers
  const incomeMissing = rand() < 0.03;
  const income = incomeMissing
    ? ""
    : Math.round(gauss(60000, 18000) + (rand() < 0.01 ? 500000 : 0));
  const score = gauss(0.5, 0.15).toFixed(4);
  const category = categories[Math.floor(rand() * categories.length)];
  const region = regions[Math.floor(rand() * regions.length)];
  const active = rand() < 0.5 ? "true" : "false";
  const day = 1 + Math.floor(rand() * 28);
  const month = 1 + Math.floor(rand() * 12);
  const signup = `2023-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // ~1% exact duplicate rows to exercise duplicate detection
  const id = rand() < 0.01 && i > 0 ? i - 1 : i;
  buf += `${id},${age},${income},${score},${category},${region},${active},${signup}\n`;
  if (buf.length > 1 << 20) {
    stream.write(buf);
    buf = "";
  }
}
if (buf) stream.write(buf);
stream.end();

stream.on("finish", () => {
  const secs = ((Date.now() - startTs) / 1000).toFixed(2);
  console.log(`✓ Wrote ${rows.toLocaleString()} rows → ${out} in ${secs}s`);
});
