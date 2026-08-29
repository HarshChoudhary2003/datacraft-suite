// Auto-clean transformations applied to a dataset's rows.
// Returns the cleaned rows + a per-action summary for before/after preview.
import { type Dataset, isMissing, cleanNumericValue } from "./stats";

export type AutoCleanAction =
  | "trimWhitespace"
  | "normalizeCase" // lowercase categorical strings
  | "fillMissingNumeric" // median fill
  | "fillMissingCategorical" // mode fill
  | "dropDuplicateRows"
  | "dropConstantColumns"
  | "capOutliersIQR";

export interface AutoCleanOptions {
  actions: AutoCleanAction[];
}

export interface AutoCleanResult {
  rows: Record<string, unknown>[];
  before: { rows: number; columns: number; missing: number; duplicates: number };
  after: { rows: number; columns: number; missing: number; duplicates: number };
  changes: { action: AutoCleanAction; count: number; detail?: string }[];
}

export const ACTION_LABELS: Record<AutoCleanAction, string> = {
  trimWhitespace: "Trim leading/trailing whitespace",
  normalizeCase: "Normalize text casing (lowercase)",
  fillMissingNumeric: "Fill missing numerics with median",
  fillMissingCategorical: "Fill missing categoricals with mode",
  dropDuplicateRows: "Drop duplicate rows",
  dropConstantColumns: "Drop constant / zero-variance columns",
  capOutliersIQR: "Cap outliers at IQR bounds (winsorize)",
};

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function mode(values: unknown[]): unknown {
  const c = new Map<string, number>();
  let best: unknown = null,
    max = 0;
  for (const v of values) {
    if (isMissing(v)) continue;
    const k = String(v).trim();
    const n = (c.get(k) ?? 0) + 1;
    c.set(k, n);
    if (n > max) {
      max = n;
      best = v;
    }
  }
  return best;
}

export function autoClean(ds: Dataset, opts: AutoCleanOptions): AutoCleanResult {
  const before = {
    rows: ds.rowCount,
    columns: ds.colCount,
    missing: ds.missingTotal,
    duplicates: ds.duplicateRows,
  };
  let rows = ds.rows.map((r) => ({ ...r }));
  let columns = [...ds.columns];
  const changes: AutoCleanResult["changes"] = [];
  const set = new Set(opts.actions);

  if (set.has("trimWhitespace")) {
    let n = 0;
    for (const r of rows) {
      for (const k of columns) {
        const v = r[k];
        if (typeof v === "string") {
          const t = v.trim();
          if (t !== v) {
            r[k] = t;
            n++;
          }
        }
      }
    }
    changes.push({ action: "trimWhitespace", count: n });
  }

  if (set.has("normalizeCase")) {
    let n = 0;
    const stringCols = ds.profiles.filter((p) => p.type === "categorical").map((p) => p.name);
    for (const r of rows) {
      for (const k of stringCols) {
        const v = r[k];
        if (typeof v === "string") {
          const lc = v.toLowerCase();
          if (lc !== v) {
            r[k] = lc;
            n++;
          }
        }
      }
    }
    changes.push({ action: "normalizeCase", count: n });
  }

  if (set.has("dropConstantColumns")) {
    const drop = ds.profiles
      .filter(
        (p) =>
          (p.type === "numeric" && (p.std ?? 0) === 0 && p.count > 0) ||
          (p.type !== "numeric" && p.unique <= 1 && p.count > 0),
      )
      .map((p) => p.name);
    if (drop.length) {
      columns = columns.filter((c) => !drop.includes(c));
      rows = rows.map((r) => {
        const o: Record<string, unknown> = {};
        for (const c of columns) o[c] = r[c];
        return o;
      });
    }
    changes.push({
      action: "dropConstantColumns",
      count: drop.length,
      detail: drop.join(", ") || undefined,
    });
  }

  if (set.has("fillMissingNumeric")) {
    let n = 0;
    const numCols = ds.profiles
      .filter((p) => p.type === "numeric" && columns.includes(p.name))
      .map((p) => p.name);
    for (const c of numCols) {
      const nums = rows.map((r) => cleanNumericValue(r[c])).filter((x) => !isNaN(x));
      if (nums.length === 0) continue;
      const m = median(nums);
      for (const r of rows) {
        if (isMissing(r[c]) || isNaN(cleanNumericValue(r[c]))) {
          r[c] = m;
          n++;
        }
      }
    }
    changes.push({ action: "fillMissingNumeric", count: n });
  }

  if (set.has("fillMissingCategorical")) {
    let n = 0;
    const catCols = ds.profiles
      .filter((p) => p.type !== "numeric" && columns.includes(p.name))
      .map((p) => p.name);
    for (const c of catCols) {
      const mo = mode(rows.map((r) => r[c]));
      if (mo == null) continue;
      for (const r of rows) {
        if (isMissing(r[c])) {
          r[c] = mo;
          n++;
        }
      }
    }
    changes.push({ action: "fillMissingCategorical", count: n });
  }

  if (set.has("capOutliersIQR")) {
    let n = 0;
    const numCols = ds.profiles.filter((p) => p.type === "numeric" && columns.includes(p.name));
    for (const p of numCols) {
      const lo = p.iqrLower ?? -Infinity,
        hi = p.iqrUpper ?? Infinity;
      for (const r of rows) {
        const v = cleanNumericValue(r[p.name]);
        if (!isNaN(v)) {
          if (v < lo) {
            r[p.name] = lo;
            n++;
          } else if (v > hi) {
            r[p.name] = hi;
            n++;
          }
        }
      }
    }
    changes.push({ action: "capOutliersIQR", count: n });
  }

  if (set.has("dropDuplicateRows")) {
    const seen = new Set<string>();
    const next: Record<string, unknown>[] = [];
    let dropped = 0;
    for (const r of rows) {
      const k = JSON.stringify(r);
      if (seen.has(k)) dropped++;
      else {
        seen.add(k);
        next.push(r);
      }
    }
    rows = next;
    changes.push({ action: "dropDuplicateRows", count: dropped });
  }

  // Recompute statistics after cleaning
  let missing = 0;
  for (const r of rows) for (const c of columns) if (isMissing(r[c])) missing++;
  const seen = new Set<string>();
  let dups = 0;
  for (const r of rows) {
    const k = JSON.stringify(r);
    if (seen.has(k)) dups++;
    else seen.add(k);
  }

  return {
    rows,
    before,
    after: { rows: rows.length, columns: columns.length, missing, duplicates: dups },
    changes,
  };
}
