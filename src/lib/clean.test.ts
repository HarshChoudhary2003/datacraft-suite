import { describe, it, expect } from "vitest";
import { dropDuplicateRows, imputeMissingValues, capOutliers } from "./clean";

describe("Data Cleansing Engine", () => {
  it("drops duplicate rows by index", () => {
    const rows = [
      { id: 1, name: "Alice" },
      { id: 1, name: "Alice" }, // dup
      { id: 2, name: "Bob" },
      { id: 2, name: "Bob" }, // dup
    ];
    // Indices 1 and 3 are duplicates
    const cleaned = dropDuplicateRows(rows, [1, 3]);
    expect(cleaned).toHaveLength(2);
    expect(cleaned[0].id).toBe(1);
    expect(cleaned[1].id).toBe(2);
  });

  it("imputes missing values with replacement value", () => {
    const rows = [
      { id: 1, age: 20 },
      { id: 2, age: null },
      { id: 3, age: "" },
      { id: 4, age: NaN },
    ];
    const cleaned = imputeMissingValues(rows, {
      age: { strategy: "mean", replacementValue: 20 },
    });
    expect(cleaned[1].age).toBe(20);
    expect(cleaned[2].age).toBe(20);
    expect(cleaned[3].age).toBe(20);
  });

  it("drops rows where specified columns are missing", () => {
    const rows = [
      { id: 1, age: 20 },
      { id: 2, age: null },
      { id: 3, age: 30 },
    ];
    const cleaned = imputeMissingValues(rows, {
      age: { strategy: "drop" },
    });
    expect(cleaned).toHaveLength(2);
    expect(cleaned[0].id).toBe(1);
    expect(cleaned[1].id).toBe(3);
  });

  it("caps outliers at specified min/max bounds", () => {
    const rows = [
      { id: 1, score: 5 },
      { id: 2, score: 50 },
      { id: 3, score: 95 },
    ];
    const cleaned = capOutliers(rows, {
      score: { min: 10, max: 90 },
    });
    expect(cleaned[0].score).toBe(10);
    expect(cleaned[1].score).toBe(50);
    expect(cleaned[2].score).toBe(90);
  });
});
