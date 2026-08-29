// Configurable data validation rules.
import type { Dataset } from "./stats";

export type RuleSeverity = "error" | "warning" | "info";

export interface ValidationConfig {
  maxMissingPct: number; // per-column % missing threshold
  maxOutlierPct: number; // per-column IQR outlier % threshold
  minUnique: number; // flag columns with fewer unique values
  maxCardinalityRatio: number; // unique/total > ratio → likely identifier in non-key cols
  maxAbsSkew: number; // |skew| threshold
  maxDuplicatePct: number; // overall duplicate %
  requireColumns: string[]; // schema: required column names (case-insensitive)
  forbidLeadingTrailingSpaces: boolean;
  flagMixedCase: boolean; // categorical columns where same value appears with different casing
  flagConstantColumns: boolean; // std=0 numeric or single-value categorical
}

export const DEFAULT_CONFIG: ValidationConfig = {
  maxMissingPct: 20,
  maxOutlierPct: 5,
  minUnique: 2,
  maxCardinalityRatio: 0.95,
  maxAbsSkew: 2,
  maxDuplicatePct: 1,
  requireColumns: [],
  forbidLeadingTrailingSpaces: true,
  flagMixedCase: true,
  flagConstantColumns: true,
};

export interface ValidationIssue {
  ruleId: string;
  severity: RuleSeverity;
  column?: string;
  message: string;
  detail?: string;
}

export interface ValidationReport {
  passed: number;
  warnings: number;
  errors: number;
  total: number;
  issues: ValidationIssue[];
  score: number; // 0-100
  config: ValidationConfig;
}

const STORAGE_KEY = "dataiq_validation_config";

export function loadConfig(): ValidationConfig {
  if (typeof localStorage === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(cfg: ValidationConfig) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function validate(ds: Dataset, cfg: ValidationConfig = loadConfig()): ValidationReport {
  const issues: ValidationIssue[] = [];

  // Schema
  const lowerCols = new Set(ds.columns.map((c) => c.toLowerCase()));
  for (const req of cfg.requireColumns) {
    if (!lowerCols.has(req.toLowerCase())) {
      issues.push({
        ruleId: "schema.required",
        severity: "error",
        message: `Required column missing: "${req}"`,
      });
    }
  }

  // Duplicates
  const dupPct = (ds.duplicateRows / Math.max(1, ds.rowCount)) * 100;
  if (dupPct > cfg.maxDuplicatePct) {
    issues.push({
      ruleId: "rows.duplicates",
      severity: "warning",
      message: `${ds.duplicateRows} duplicate rows (${dupPct.toFixed(2)}%) exceeds threshold ${cfg.maxDuplicatePct}%`,
    });
  }

  // Per-column rules
  for (const p of ds.profiles) {
    if (p.missingPct > cfg.maxMissingPct) {
      issues.push({
        ruleId: "missing.threshold",
        severity: p.missingPct > cfg.maxMissingPct * 2 ? "error" : "warning",
        column: p.name,
        message: `${p.missingPct.toFixed(1)}% missing values`,
        detail: `Threshold: ${cfg.maxMissingPct}%`,
      });
    }

    if (cfg.flagConstantColumns) {
      if (p.type === "numeric" && (p.std ?? 0) === 0 && p.count > 0) {
        issues.push({
          ruleId: "constant.numeric",
          severity: "warning",
          column: p.name,
          message: "Zero variance — constant column",
        });
      }
      if (p.type !== "numeric" && p.unique <= 1 && p.count > 0) {
        issues.push({
          ruleId: "constant.cat",
          severity: "warning",
          column: p.name,
          message: "Single unique value",
        });
      }
    }

    if (p.unique < cfg.minUnique && p.count >= cfg.minUnique) {
      issues.push({
        ruleId: "min.unique",
        severity: "info",
        column: p.name,
        message: `Only ${p.unique} unique values (min ${cfg.minUnique})`,
      });
    }

    if (p.count > 0 && p.unique / p.count > cfg.maxCardinalityRatio) {
      issues.push({
        ruleId: "high.cardinality",
        severity: "info",
        column: p.name,
        message: `Near-unique (${((p.unique / p.count) * 100).toFixed(1)}%) — likely identifier`,
      });
    }

    if (p.type === "numeric") {
      const outPct = p.count ? ((p.outliersIQR ?? 0) / p.count) * 100 : 0;
      if (outPct > cfg.maxOutlierPct) {
        issues.push({
          ruleId: "outliers.iqr",
          severity: outPct > cfg.maxOutlierPct * 2 ? "error" : "warning",
          column: p.name,
          message: `${outPct.toFixed(1)}% IQR outliers`,
          detail: `Bounds [${p.iqrLower?.toFixed(2)}, ${p.iqrUpper?.toFixed(2)}]`,
        });
      }
      if (Math.abs(p.skewness ?? 0) > cfg.maxAbsSkew) {
        issues.push({
          ruleId: "shape.skew",
          severity: "warning",
          column: p.name,
          message: `Highly skewed (${(p.skewness ?? 0).toFixed(2)})`,
          detail: "Consider log/sqrt transform",
        });
      }
    }
  }

  // String content checks (sample first 500 rows for speed)
  if (cfg.forbidLeadingTrailingSpaces || cfg.flagMixedCase) {
    const sample = ds.rows.slice(0, 500);
    const stringCols = ds.profiles.filter((p) => p.type === "categorical").map((p) => p.name);
    for (const col of stringCols) {
      let spaces = 0;
      const caseMap = new Map<string, Set<string>>();
      for (const r of sample) {
        const v = r[col];
        if (v == null) continue;
        const s = String(v);
        if (cfg.forbidLeadingTrailingSpaces && s !== s.trim() && s.length > 0) spaces++;
        if (cfg.flagMixedCase) {
          const k = s.toLowerCase();
          if (!caseMap.has(k)) caseMap.set(k, new Set());
          caseMap.get(k)!.add(s);
        }
      }
      if (cfg.forbidLeadingTrailingSpaces && spaces > 0) {
        issues.push({
          ruleId: "string.whitespace",
          severity: "warning",
          column: col,
          message: `${spaces} values have leading/trailing whitespace`,
        });
      }
      if (cfg.flagMixedCase) {
        const variants = [...caseMap.values()].filter((s) => s.size > 1);
        if (variants.length > 0) {
          issues.push({
            ruleId: "string.case",
            severity: "info",
            column: col,
            message: `${variants.length} values appear with different casing`,
            detail: variants
              .slice(0, 3)
              .map((s) => [...s].join(" / "))
              .join("; "),
          });
        }
      }
    }
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const totalRulesChecked = ds.profiles.length * 6 + 4; // rough
  const passed = Math.max(0, totalRulesChecked - issues.length);
  const score = Math.max(
    0,
    Math.min(100, 100 - errors * 8 - warnings * 3 - (issues.length - errors - warnings) * 1),
  );
  return { passed, warnings, errors, total: issues.length, issues, score, config: cfg };
}
