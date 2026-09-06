// Automatic validation for generated code — verifies the dataset reader,
// schema column references, and a runnable CLI command before the user copies.
import type { Dataset } from "@/lib/stats";
import type { CodeTab } from "@/lib/role-presets";

export interface CodeValidation {
  level: "error" | "warn" | "ok";
  category: "reader" | "schema" | "cli" | "setup" | "syntax" | "general";
  msg: string;
  /** Actionable recommendation for how to resolve the mismatch. */
  fix?: string;
}

/** Tabs that emit pandas-based Python and therefore need a matching reader. */
const PY_DATA_TABS: CodeTab[] = ["eda", "cleaning", "ml", "dl", "etl", "api", "streamlit"];

function expectedReader(filename: string): { fn: string; label: string } {
  if (/\.xlsx?$/i.test(filename)) return { fn: "pd.read_excel", label: "Excel" };
  if (/\.json$/i.test(filename)) return { fn: "pd.read_json", label: "JSON" };
  return { fn: "pd.read_csv", label: "CSV" };
}

/** Extract a Python list literal assigned as `NAME = [ "a", "b" ]`. */
function extractList(code: string, name: string): string[] | null {
  const m = code.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]*)"|'([^']*)'/g)].map((x) => x[1] ?? x[2]);
}

/** Extract a Python string literal assigned as `NAME = "value"`. */
function extractString(code: string, name: string): string | null {
  const m = code.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`));
  return m ? m[1] : null;
}

/**
 * Validate a generated code string against the active dataset. Runs three checks:
 *   1. reader   — the pandas reader matches the dataset's file type
 *   2. schema   — every referenced column exists in the dataset
 *   3. cli      — a runnable command / entrypoint is present
 */
export function validateGeneratedCode(code: string, ds: Dataset, tab: CodeTab): CodeValidation[] {
  const out: CodeValidation[] = [];
  const cols = new Set(ds.columns);

  // 1. Reader check.
  if (PY_DATA_TABS.includes(tab) && code.includes("pd.read_")) {
    const { fn, label } = expectedReader(ds.name);
    if (!code.includes(fn)) {
      out.push({
        level: "error",
        category: "reader",
        msg: `Reader mismatch: "${ds.name}" is a ${label} file but the code does not call ${fn}().`,
        fix: `Replace the pandas reader with ${fn}("${ds.name}") so the script can open your ${label} file.`,
      });
    }
  }

  // 2. Schema column check.
  const referenced: string[] = [];
  const t = extractString(code, "TARGET");
  if (t) referenced.push(t);
  for (const name of ["FEATURES", "NUMERIC", "CATEGORICAL", "REQUIRED"]) {
    const list = extractList(code, name);
    if (list) referenced.push(...list);
  }
  const missing = [...new Set(referenced)].filter((c) => !cols.has(c));
  if (missing.length) {
    out.push({
      level: "error",
      category: "schema",
      msg: `Schema mismatch: ${missing.length} column(s) referenced but not in the dataset — ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}.`,
      fix: `Remove or rename ${missing.length > 1 ? "these columns" : "this column"} in the generation options so every referenced column matches the dataset schema.`,
    });
  } else if (referenced.length) {
    out.push({
      level: "ok",
      category: "schema",
      msg: `Schema verified: all ${new Set(referenced).size} referenced column(s) exist in the dataset.`,
    });
  }

  // 3. Runnable CLI command check.
  if (tab !== "requirements") {
    const hasCli =
      /Run:|python\s+\S+\.py|uvicorn\s|streamlit\s+run|docker\s+build|docker\s+run|CMD\s*\[/.test(
        code,
      );
    if (!hasCli) {
      out.push({
        level: "warn",
        category: "cli",
        msg: "No runnable command detected — the snippet has no CLI entrypoint or run instructions.",
        fix: "Add a run command (e.g. `python script.py`, `uvicorn app:app`, or `streamlit run app.py`) so the code is executable end-to-end.",
      });
    }
  }

  // 4. Setup / prerequisites block.
  const hasSetup = /SETUP/.test(code) && /pip install|docker build|no install required/.test(code);
  if (!hasSetup) {
    out.push({
      level: "warn",
      category: "setup",
      msg: "No setup block detected — the snippet does not state its prerequisites.",
      fix: "Include a header with the environment setup, install command, input file location and expected output.",
    });
  } else {
    out.push({
      level: "ok",
      category: "setup",
      msg: "Setup steps present: environment, install command, input file and expected output.",
    });
  }

  // 5. Leakage / duplicate feature checks on the emitted constants.
  const featureList = extractList(code, "FEATURES") ?? [];
  if (t && featureList.includes(t)) {
    out.push({
      level: "error",
      category: "schema",
      msg: `Target leakage: "${t}" is listed in FEATURES as well as TARGET.`,
      fix: "Deselect the target column from the feature list before exporting.",
    });
  }
  const dupes = featureList.filter((c, i) => featureList.indexOf(c) !== i);
  if (dupes.length) {
    out.push({
      level: "error",
      category: "schema",
      msg: `Duplicate feature column(s): ${[...new Set(dupes)].join(", ")}.`,
      fix: "Remove the duplicate selections so each feature appears exactly once.",
    });
  }
  if (PY_DATA_TABS.includes(tab) && (tab === "ml" || tab === "dl") && featureList.length === 0) {
    out.push({
      level: "error",
      category: "schema",
      msg: "FEATURES is empty — the model has nothing to train on.",
      fix: "Select at least one feature column in the generation options.",
    });
  }

  // 6. Structural sanity: unbalanced brackets or leftover placeholders.
  if (tab !== "requirements" && tab !== "sql") {
    const pairs: Array<[string, string]> = [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ];
    const unbalanced = pairs.filter(([a, b]) => {
      const count = (ch: string) => code.split(ch).length - 1;
      return count(a) !== count(b);
    });
    if (unbalanced.length) {
      out.push({
        level: "error",
        category: "syntax",
        msg: `Unbalanced ${unbalanced.map(([a, b]) => `${a}${b}`).join(", ")} in the generated code.`,
        fix: "Regenerate the snippet; a column name with unusual characters may have broken a literal.",
      });
    }
  }
  if (/\bTODO\b|<PLACEHOLDER>|FIXME/.test(code)) {
    out.push({
      level: "warn",
      category: "general",
      msg: "Placeholder marker (TODO/FIXME) found — the code is not ready to run as-is.",
      fix: "Fill in or remove the placeholder before shipping the script.",
    });
  }

  // 7. Requirements pinning.
  if (tab === "requirements") {
    const pkgs = code
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    const unpinned = pkgs.filter((l) => !/[><=~]=|>=/.test(l));
    if (unpinned.length) {
      out.push({
        level: "warn",
        category: "general",
        msg: `${unpinned.length} dependency line(s) have no version constraint: ${unpinned.slice(0, 3).join(", ")}.`,
        fix: "Add a minimum version (e.g. `pandas>=2.0.0`) so installs stay reproducible.",
      });
    } else if (pkgs.length) {
      out.push({
        level: "ok",
        category: "general",
        msg: `All ${pkgs.length} dependencies carry version constraints.`,
      });
    }
  }

  if (!out.some((c) => c.level !== "ok")) {
    out.push({
      level: "ok",
      category: "general",
      msg: "Reader, schema columns, and run command all verified.",
    });
  }
  return out;
}
