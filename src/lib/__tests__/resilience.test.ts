import { describe, it, expect } from "vitest";
import { ALWAYS_ALLOWED, canRoleAccess, canRolePerform } from "@/lib/permissions";
import { correlationMatrix, type Dataset } from "@/lib/stats";

describe("Production Resilience & Security Safeguards", () => {
  it("allows all roles access to /charts dashboard route", () => {
    expect(ALWAYS_ALLOWED.has("/charts")).toBe(true);
    expect(canRoleAccess("data_analyst", "/charts")).toBe(true);
    expect(canRoleAccess("data_scientist", "/charts")).toBe(true);
    expect(canRoleAccess("ml_engineer", "/charts")).toBe(true);
    expect(canRoleAccess("ai_engineer", "/charts")).toBe(true);
    expect(canRoleAccess("data_engineer", "/charts")).toBe(true);
    expect(canRoleAccess("business_analyst", "/charts")).toBe(true);
  });

  it("permits dashboard export server action across all valid user roles", () => {
    expect(canRolePerform("data_analyst", "dashboard_export")).toBe(true);
    expect(canRolePerform("data_scientist", "dashboard_export")).toBe(true);
    expect(canRolePerform("ml_engineer", "dashboard_export")).toBe(true);
    expect(canRolePerform("ai_engineer", "dashboard_export")).toBe(true);
    expect(canRolePerform("data_engineer", "dashboard_export")).toBe(true);
  });

  it("downsamples correlation matrix calculations on large datasets for performance", () => {
    const rows = Array.from({ length: 10000 }, (_, i) => ({
      a: i,
      b: i * 2,
    }));
    const mockDataset: Dataset = {
      name: "Large Test Dataset",
      rows,
      columns: ["a", "b"],
      profiles: [
        { name: "a", type: "numeric", count: 10000, missing: 0, missingPct: 0, unique: 10000 },
        { name: "b", type: "numeric", count: 10000, missing: 0, missingPct: 0, unique: 10000 },
      ],
      rowCount: 10000,
      colCount: 2,
      missingTotal: 0,
      duplicateRows: 0,
      duplicateIndices: [],
      readinessScore: 100,
      readinessBreakdown: [],
    };

    const startTime = performance.now();
    const result = correlationMatrix(mockDataset);
    const duration = performance.now() - startTime;

    expect(result.columns).toEqual(["a", "b"]);
    expect(result.matrix[0][1]).toBeCloseTo(1.0, 2);
    expect(duration).toBeLessThan(150); // Must complete within 150ms
  });
});
