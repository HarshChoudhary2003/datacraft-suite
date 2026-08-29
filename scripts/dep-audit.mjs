#!/usr/bin/env node
/**
 * dep-audit.mjs — fail the build when any high/critical dependency
 * vulnerability is present. Runs `bun audit` (falls back to `npm audit`) and
 * parses the JSON report.
 *
 * Usage: node scripts/dep-audit.mjs [--level critical|high] [--json reports/audit.json]
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const LEVEL = arg("level", "high"); // "high" also includes critical
const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const MIN = RANK[LEVEL] ?? 3;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, shell: true });
  return r.error ? null : (r.stdout || "").trim();
}

let raw = run("bun", ["audit", "--json"]);
let source = "bun audit";
if (!raw || !raw.startsWith("{")) {
  raw = run("npm", ["audit", "--json"]);
  source = "npm audit";
}
if (!raw || !raw.startsWith("{")) {
  console.error("❌ Could not run a dependency audit (bun/npm audit unavailable).");
  process.exit(1);
}

const report = JSON.parse(raw);
const findings = [];

// npm/bun audit v2 shape: { vulnerabilities: { name: { severity, via, range, fixAvailable } } }
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  const severity = String(v.severity ?? "info").toLowerCase();
  if ((RANK[severity] ?? 0) < MIN) continue;
  findings.push({
    name,
    severity,
    range: v.range ?? null,
    fixAvailable: v.fixAvailable ?? false,
    advisories: (Array.isArray(v.via) ? v.via : [])
      .filter((x) => typeof x === "object")
      .map((x) => ({ title: x.title, url: x.url })),
  });
}

const jsonPath = arg("json", "");
if (jsonPath) {
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(
    jsonPath,
    JSON.stringify(
      { scannedAt: new Date().toISOString(), source, level: LEVEL, findings },
      null,
      2,
    ),
  );
}

console.log(`=== Dependency vulnerability monitor (${source}, level >= ${LEVEL}) ===`);
if (!findings.length) {
  console.log("✅ No high or critical dependency vulnerabilities.");
  process.exit(0);
}
console.error(
  `❌ ${findings.length} vulnerable dependenc${findings.length === 1 ? "y" : "ies"} found:`,
);
for (const f of findings) {
  console.error(`  - ${f.name} [${f.severity}] ${f.range ?? ""}`);
  f.advisories.slice(0, 3).forEach((a) => console.error(`      ${a.title ?? ""} ${a.url ?? ""}`));
  console.error(
    `      fix: ${f.fixAvailable ? "upgrade available — add a package.json override and re-lock" : "no automatic fix; pin manually"}`,
  );
}
process.exit(1);
