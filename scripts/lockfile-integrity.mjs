#!/usr/bin/env node
/**
 * lockfile-integrity.mjs — verify the lockfile actually resolves every
 * `overrides` entry in package.json to a satisfying version.
 *
 * A stale lockfile silently keeps a vulnerable transitive version (e.g. seroval)
 * even after an override is added, so this runs before deployment and fails the
 * build on any mismatch.
 *
 * Usage: node scripts/lockfile-integrity.mjs [--json reports/lockfile.json]
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const overrides = { ...(pkg.overrides ?? {}), ...(pkg.resolutions ?? {}) };

/** Minimal semver: parse "1.6.0" -> [1,6,0]; compare numerically. */
function parseVersion(v) {
  const m = String(v).match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function cmp(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}
/** Supports the range styles used in overrides: exact, ^x.y.z, ~x.y.z, >=x.y.z. */
function satisfies(version, range) {
  const v = parseVersion(version);
  const r = parseVersion(range);
  if (!v || !r) return false;
  if (/^\^/.test(range)) return v[0] === r[0] && cmp(v, r) >= 0;
  if (/^~/.test(range)) return v[0] === r[0] && v[1] === r[1] && cmp(v, r) >= 0;
  if (/^>=/.test(range)) return cmp(v, r) >= 0;
  return cmp(v, r) === 0;
}

/** Collect every resolved version of `name` found in the lockfiles. */
function resolvedVersions(name) {
  const found = new Set();

  if (existsSync("package-lock.json")) {
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    for (const [path, entry] of Object.entries(lock.packages ?? {})) {
      if ((path.endsWith(`node_modules/${name}`) || path === `node_modules/${name}`) && entry.version) {
        found.add(entry.version);
      }
    }
  }

  if (found.size === 0 && existsSync("bun.lock")) {
    const text = readFileSync("bun.lock", "utf8");
    const re = new RegExp(
      `"${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}@(\\d+\\.\\d+\\.\\d+[^"]*)"`,
      "g",
    );
    for (const m of text.matchAll(re)) found.add(m[1]);
  }

  return [...found];
}

const results = [];
const failures = [];

for (const [name, range] of Object.entries(overrides)) {
  const versions = resolvedVersions(name);
  if (versions.length === 0) {
    results.push({ name, range, versions, status: "missing" });
    failures.push(
      `${name}: override "${range}" declared but no resolved version found in the lockfile`,
    );
    continue;
  }
  const bad = versions.filter((v) => !satisfies(v, range));
  results.push({ name, range, versions, status: bad.length ? "mismatch" : "ok" });
  if (bad.length) {
    failures.push(
      `${name}: resolved ${bad.join(", ")} does not satisfy override "${range}" — run \`bun install --save-text-lockfile\``,
    );
  }
}

if (!existsSync("bun.lock") && !existsSync("package-lock.json")) {
  failures.push(
    "No text lockfile found (bun.lock / package-lock.json). Run `bun install --save-text-lockfile`.",
  );
}

console.log("=== Lockfile integrity check ===");
for (const r of results) {
  console.log(
    `  ${r.status === "ok" ? "✓" : "✗"} ${r.name} ${r.range} → ${r.versions.join(", ") || "(none)"}`,
  );
}

const jsonPath = arg("json", "");
if (jsonPath) {
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(
    jsonPath,
    JSON.stringify(
      { checkedAt: new Date().toISOString(), passed: failures.length === 0, results, failures },
      null,
      2,
    ),
  );
  console.log(`  report → ${jsonPath}`);
}

if (failures.length) {
  console.error("\n❌ Lockfile integrity failed:");
  failures.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log("\n✅ All package.json overrides are satisfied by the lockfile.");
