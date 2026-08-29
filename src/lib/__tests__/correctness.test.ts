import { describe, it, expect } from "vitest";
import { buildDataset, profileColumn, pearson } from "@/lib/stats";
import { autoClean } from "@/lib/autoclean";

const rows = [
  { x: 1, y: "  Alpha  ", z: 10 },
  { x: 2, y: "alpha", z: 20 },
  { x: 2, y: "alpha", z: 20 }, // duplicate
  { x: null, y: "", z: 1000 }, // outlier + missing
  { x: 3, y: "Beta", z: 30 },
];

describe("stats", () => {
  it("profiles a numeric column with mean/median/std", () => {
    const p = profileColumn(
      "x",
      rows.map((r) => r.x),
    );
    expect(p.type).toBe("numeric");
    expect(p.missing).toBe(1);
    expect(p.mean).toBeGreaterThan(0);
  });

  it("computes pearson correctly", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 5);
    expect(pearson([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 5);
  });

  it("builds a dataset with profiles + duplicate detection", () => {
    const ds = buildDataset("t", rows);
    expect(ds.colCount).toBe(3);
    expect(ds.duplicateRows).toBeGreaterThanOrEqual(1);
    expect(ds.profiles.length).toBe(3);
  });
});

describe("autoClean (correctness checks)", () => {
  const ds = buildDataset("t", rows);
  it("trims whitespace and fills missing values", () => {
    const r = autoClean(ds, {
      actions: [
        "trimWhitespace",
        "fillMissingNumeric",
        "fillMissingCategorical",
        "dropDuplicateRows",
      ],
    });
    expect(r.after.missing).toBeLessThanOrEqual(r.before.missing);
    expect(r.after.rows).toBeLessThan(r.before.rows);
    // No row should still have a leading/trailing space in y
    for (const row of r.rows) {
      const y = row.y as string | null;
      if (typeof y === "string") expect(y).toBe(y.trim());
    }
  });

  it("caps outliers within IQR bounds", () => {
    const r = autoClean(ds, { actions: ["capOutliersIQR"] });
    const zs = r.rows.map((r) => Number(r.z)).filter((n) => !isNaN(n));
    expect(Math.max(...zs)).toBeLessThan(1000);
  });
});
