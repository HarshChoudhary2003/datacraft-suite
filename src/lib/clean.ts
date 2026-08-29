import { isMissing, cleanNumericValue } from "./stats";

export type ImputeStrategy = "mean" | "median" | "mode" | "drop";

export function dropDuplicateRows(
  rows: Record<string, unknown>[],
  duplicateIndices: number[],
): Record<string, unknown>[] {
  if (!duplicateIndices || duplicateIndices.length === 0) return rows;
  const indexSet = new Set(duplicateIndices);
  return rows.filter((_, i) => !indexSet.has(i));
}

export function imputeMissingValues(
  rows: Record<string, unknown>[],
  strategyMap: Record<string, { strategy: ImputeStrategy; replacementValue?: unknown }>,
): Record<string, unknown>[] {
  const dropColumns = Object.keys(strategyMap).filter(
    (col) => strategyMap[col].strategy === "drop",
  );

  let result = rows;
  if (dropColumns.length > 0) {
    result = result.filter((r) => !dropColumns.some((col) => isMissing(r[col])));
  }

  const fillColumns = Object.keys(strategyMap).filter(
    (col) => strategyMap[col].strategy !== "drop",
  );

  if (fillColumns.length === 0) return result;

  return result.map((r) => {
    let modified = false;
    const newRow = { ...r };
    for (const col of fillColumns) {
      if (isMissing(newRow[col])) {
        newRow[col] = strategyMap[col].replacementValue;
        modified = true;
      }
    }
    return modified ? newRow : r;
  });
}

export function capOutliers(
  rows: Record<string, unknown>[],
  columnLimits: Record<string, { min: number; max: number }>,
): Record<string, unknown>[] {
  const cols = Object.keys(columnLimits);
  if (cols.length === 0) return rows;

  return rows.map((r) => {
    let modified = false;
    const newRow = { ...r };
    for (const col of cols) {
      const val = cleanNumericValue(newRow[col]);
      if (!Number.isNaN(val)) {
        const { min, max } = columnLimits[col];
        if (val < min) {
          newRow[col] = min;
          modified = true;
        } else if (val > max) {
          newRow[col] = max;
          modified = true;
        }
      }
    }
    return modified ? newRow : r;
  });
}
