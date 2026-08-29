#!/usr/bin/env node
/**
 * gen-sbom.mjs — emit a CycloneDX 1.5 SBOM of every resolved dependency
 * (direct + transitive) from the text lockfile, so production builds ship an
 * auditable inventory and reviewers can confirm pinned versions like seroval.
 *
 * Usage: node scripts/gen-sbom.mjs [--out reports/sbom.json] [--assert seroval@1.6.0]
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const direct = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]);

/** name -> { version, integrity } */
const components = new Map();

if (existsSync("bun.lock")) {
  const text = readFileSync("bun.lock", "utf8");
  // Entries look like:  "name": ["name@1.2.3", "<url>", {...}, "sha512-..."],
  const re = /"((?:@[^"/]+\/)?[^"@\s]+)@(\d+\.\d+\.\d+[^"]*)"/g;
  for (const m of text.matchAll(re)) {
    const [, name, version] = m;
    if (!components.has(name)) components.set(name, { version, integrity: null });
  }
  const intRe = /"((?:@[^"/]+\/)?[^"@\s]+)@(\d+\.\d+\.\d+[^"]*)",[\s\S]{0,600}?"(sha512-[^"]+)"/g;
  for (const m of text.matchAll(intRe)) {
    const c = components.get(m[1]);
    if (c && !c.integrity) c.integrity = m[3];
  }
}

if (existsSync("package-lock.json")) {
  const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    const idx = path.lastIndexOf("node_modules/");
    if (idx === -1 || !entry.version) continue;
    const name = path.slice(idx + "node_modules/".length);
    if (!components.has(name))
      components.set(name, { version: entry.version, integrity: entry.integrity ?? null });
  }
}

const purl = (n, v) => `pkg:npm/${n.replace("@", "%40")}@${v}`;

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  serialNumber: `urn:uuid:${crypto.randomUUID()}`,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [{ vendor: "DataIQ Pro", name: "gen-sbom", version: "1.0.0" }],
    component: {
      type: "application",
      "bom-ref": purl(pkg.name ?? "app", pkg.version ?? "0.0.0"),
      name: pkg.name ?? "app",
      version: pkg.version ?? "0.0.0",
    },
    properties: Object.entries({ ...(pkg.overrides ?? {}) }).map(([name, range]) => ({
      name: `override:${name}`,
      value: String(range),
    })),
  },
  components: [...components.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, { version, integrity }]) => ({
      type: "library",
      "bom-ref": purl(name, version),
      name,
      version,
      purl: purl(name, version),
      scope: "required",
      ...(integrity
        ? { hashes: [{ alg: "SHA-512", content: integrity.replace(/^sha512-/, "") }] }
        : {}),
      properties: [{ name: "dependencyType", value: direct.has(name) ? "direct" : "transitive" }],
    })),
};

const out = arg("out", "reports/sbom.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(sbom, null, 2));

console.log(`=== SBOM generated ===`);
console.log(`  components: ${sbom.components.length}`);
console.log(`  file:       ${out}`);

// Optional assertion so CI can prove a specific version shipped, e.g. seroval@1.6.0.
const assertions = process.argv.filter((a, i) => process.argv[i - 1] === "--assert");
let failed = false;
for (const a of assertions) {
  const at = a.lastIndexOf("@");
  const name = a.slice(0, at);
  const want = a.slice(at + 1);
  const got = components.get(name)?.version;
  if (got === want) {
    console.log(`  ✓ ${name}@${want} present in SBOM`);
  } else {
    console.error(`  ✗ expected ${name}@${want} but SBOM has ${got ?? "(absent)"}`);
    failed = true;
  }
}
if (failed) process.exit(1);
