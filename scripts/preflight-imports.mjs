#!/usr/bin/env node
/**
 * Preflight check: detect forbidden server↔client boundary violations before
 * dev/build. Catches the class of bugs that crash Vite with a 500 at request
 * time (e.g. a client-reachable file importing from `src/server/`).
 *
 * Rules enforced (all client-reachable files — anything that is NOT itself a
 * server-only `*.server.*` module):
 *   1. server-import  (error)   import from `src/server/` — excluded from client bundle
 *   2. secret-module  (error)   import of a `*.server` module (e.g. client.server)
 *   3. server-only    (error)   import of the `server-only` package marker
 *   4. env-access     (warning)  raw `process.env` read outside a server boundary
 *
 * Side effects:
 *   - Always writes a machine-readable report to src/generated/preflight-report.json
 *     so the in-app "Preflight Report" page can render it.
 *   - Prints a human-readable summary.
 *   - Exits 1 when any ERROR-severity violation is found (warnings never fail).
 *
 * Flags:
 *   --json <path>   override the report output path
 */
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

const argv = process.argv.slice(2);
const jsonFlagIdx = argv.indexOf("--json");
const REPORT_PATH =
  jsonFlagIdx !== -1 && argv[jsonFlagIdx + 1]
    ? join(ROOT, argv[jsonFlagIdx + 1])
    : join(SRC, "generated", "preflight-report.json");

/** Files that are allowed to import server code (server-only modules). */
const SERVER_ONLY_FILE = /\.(server)\.(ts|tsx|js|jsx|mjs|cjs)$/;
/** Files whose `process.env` usage is legitimate (server fn handlers / server routes). */
const SERVER_FN_FILE = /\.functions\.(ts|tsx|js|jsx)$/;

/** Rule definitions: each tests a single source line. */
const RULES = [
  {
    id: "server-import",
    severity: "error",
    test: /from\s+["'](?:@\/server\/|src\/server\/|\.{1,2}\/(?:\.{1,2}\/)*server\/)/,
    message:
      "Imports from `src/server/` are excluded from the client bundle and crash Vite at runtime. Move the module to `src/lib/*.functions.ts` (RPC) or import it only from `*.server.ts` files.",
  },
  {
    id: "secret-module",
    severity: "error",
    test: /from\s+["'][^"']*\.server["']/,
    message:
      "Importing a `*.server` module (e.g. client.server) into client-reachable code leaks server secrets / breaks the bundle. Access it through a server function instead.",
  },
  {
    id: "server-only",
    severity: "error",
    test: /(?:import\s+["']server-only["']|from\s+["']server-only["'])/,
    message:
      "`server-only` modules must never be reachable from the client bundle. Wrap the logic in a server function (`createServerFn`).",
  },
  {
    id: "env-access",
    severity: "warning",
    test: /\bprocess\.env\.[A-Za-z_$]/,
    message:
      "Raw `process.env` access outside a server boundary is `undefined` on the client and may leak config. Read env inside a `createServerFn().handler()` or use `import.meta.env.VITE_*`.",
    // env reads are legitimate inside server-fn handlers, server-only modules,
    // server routes, and the auto-generated Supabase integration clients.
    skipFile: (file) =>
      SERVER_FN_FILE.test(file) ||
      SERVER_ONLY_FILE.test(file) ||
      /[\\/]routes[\\/]api[\\/]/.test(file) ||
      /[\\/]integrations[\\/]supabase[\\/]/.test(file),
  },
];

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === ".git" || entry === "generated") continue;
      walk(full, acc);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

const files = walk(SRC);
const violations = [];

for (const file of files) {
  const isServerOnly = SERVER_ONLY_FILE.test(file);
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      // Server-only files may legitimately import/use server code & secrets.
      if (isServerOnly && rule.id !== "env-access") continue;
      if (rule.skipFile && rule.skipFile(file)) continue;
      if (rule.test.test(line)) {
        violations.push({
          rule: rule.id,
          severity: rule.severity,
          file: rel,
          line: i + 1,
          code: line.trim(),
          message: rule.message,
        });
      }
    }
  });
}

const errors = violations.filter((v) => v.severity === "error");
const warnings = violations.filter((v) => v.severity === "warning");

const report = {
  generatedAt: new Date().toISOString(),
  passed: errors.length === 0,
  summary: {
    filesScanned: files.length,
    errors: errors.length,
    warnings: warnings.length,
  },
  rules: RULES.map((r) => ({ id: r.id, severity: r.severity, message: r.message })),
  violations,
};

// Always persist the report so the in-app page can render the latest scan.
try {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
} catch (e) {
  console.error("preflight: failed to write report:", e?.message ?? e);
}

// Human-readable output.
if (warnings.length > 0) {
  console.warn(`\n\x1b[33m⚠ Preflight warnings (${warnings.length}):\x1b[0m`);
  for (const v of warnings) {
    console.warn(`  \x1b[33m${v.file}:${v.line}\x1b[0m [${v.rule}]\n    ${v.code}`);
  }
}

if (errors.length > 0) {
  console.error(
    `\n\x1b[31m✖ Preflight failed: ${errors.length} forbidden server↔client boundary violation(s)\x1b[0m`,
  );
  for (const v of errors) {
    console.error(
      `  \x1b[33m${v.file}:${v.line}\x1b[0m [${v.rule}]\n    ${v.code}\n    → ${v.message}`,
    );
  }
  console.error("");
  process.exit(1);
}

console.log(
  `\x1b[32m✓ Preflight passed:\x1b[0m scanned ${files.length} files, 0 errors` +
    (warnings.length ? `, ${warnings.length} warning(s)` : ""),
);
