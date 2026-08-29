import type { Dataset } from "@/lib/stats";

export type TransformOperation =
  | { type: "minmax"; col: string; targetCol: string }
  | { type: "standard"; col: string; targetCol: string }
  | { type: "label"; col: string; targetCol: string }
  | { type: "onehot"; col: string }
  | {
      type: "math";
      colA: string;
      operator: "+" | "-" | "*" | "/";
      colB: string;
      isScalarB: boolean;
      targetCol: string;
    };

export function applyTransformations(
  dataset: Dataset,
  operations: TransformOperation[],
): Record<string, unknown>[] {
  if (operations.length === 0 || dataset.rows.length === 0) return dataset.rows;

  // 1. Pre-computation pass
  const meta: Record<
    string,
    { min?: number; max?: number; mean?: number; std?: number; unique?: string[] }
  > = {};

  for (const op of operations) {
    if (op.type === "minmax" || op.type === "standard") {
      const profile = dataset.profiles.find((p) => p.name === op.col);
      if (profile && profile.type === "numeric") {
        meta[op.col] = {
          min: profile.min ?? 0,
          max: profile.max ?? 1,
          mean: profile.mean ?? 0,
          std: profile.std ?? 1,
        };
      }
    } else if (op.type === "label" || op.type === "onehot") {
      // Find unique values
      const uniqueVals = new Set<string>();
      for (const row of dataset.rows) {
        uniqueVals.add(String(row[op.col] ?? ""));
      }
      meta[op.col] = {
        unique: Array.from(uniqueVals).sort(),
      };
    }
  }

  // 2. Transformation pass
  return dataset.rows.map((r) => {
    const newRow = { ...r };

    for (const op of operations) {
      if (op.type === "minmax") {
        const val = Number(r[op.col]);
        const { min = 0, max = 1 } = meta[op.col] || {};
        newRow[op.targetCol] = !Number.isNaN(val) && max > min ? (val - min) / (max - min) : val;
      } else if (op.type === "standard") {
        const val = Number(r[op.col]);
        const { mean = 0, std = 1 } = meta[op.col] || {};
        newRow[op.targetCol] = !Number.isNaN(val) && std > 0 ? (val - mean) / std : val;
      } else if (op.type === "label") {
        const val = String(r[op.col] ?? "");
        const unique = meta[op.col]?.unique ?? [];
        newRow[op.targetCol] = unique.indexOf(val);
      } else if (op.type === "onehot") {
        const val = String(r[op.col] ?? "");
        const unique = meta[op.col]?.unique ?? [];
        for (const u of unique) {
          // e.g., Color_Red
          newRow[`${op.col}_${u.replace(/\s+/g, "_")}`] = val === u ? 1 : 0;
        }
      } else if (op.type === "math") {
        const valA = Number(r[op.colA]);
        const valB = op.isScalarB ? Number(op.colB) : Number(r[op.colB]);

        let res = NaN;
        if (!Number.isNaN(valA) && !Number.isNaN(valB)) {
          if (op.operator === "+") res = valA + valB;
          else if (op.operator === "-") res = valA - valB;
          else if (op.operator === "*") res = valA * valB;
          else if (op.operator === "/") res = valB !== 0 ? valA / valB : NaN;
        }
        newRow[op.targetCol] = res;
      }
    }

    return newRow;
  });
}
