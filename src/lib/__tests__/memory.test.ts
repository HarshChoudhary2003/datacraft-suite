import { describe, it, expect } from "vitest";
import {
  chunkArray,
  estimateDatasetMemoryBytes,
  rowsToColumnar,
  columnarToRows,
  getMemoryUsage,
} from "../memory";

describe("Memory Efficiency Engine", () => {
  it("chunks arrays accurately without losing elements", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const chunks = chunkArray(data, 3);

    expect(chunks.length).toBe(4);
    expect(chunks[0]).toEqual([1, 2, 3]);
    expect(chunks[3]).toEqual([10]);
  });

  it("handles empty arrays and edge chunk sizes", () => {
    expect(chunkArray([], 5)).toEqual([]);
    expect(chunkArray([1, 2], 0)).toEqual([[1, 2]]);
  });

  it("estimates memory footprint correctly", () => {
    const columns = ["id", "name", "age", "active"];
    const rows = Array.from({ length: 500 }, (_, i) => ({
      id: i,
      name: `User ${i}`,
      age: 20 + (i % 50),
      active: i % 2 === 0,
    }));

    const bytes = estimateDatasetMemoryBytes(rows, columns);
    expect(bytes).toBeGreaterThan(1000);
    expect(bytes).toBeLessThan(1000000);
  });

  it("converts rows to columnar format and back without data loss", () => {
    const columns = ["a", "b"];
    const originalRows = [
      { a: 10, b: "hello" },
      { a: 20, b: "world" },
      { a: null, b: true },
    ];

    const columnar = rowsToColumnar(originalRows, columns);
    expect(columnar.a).toEqual([10, 20, null]);
    expect(columnar.b).toEqual(["hello", "world", true]);

    const reconstructed = columnarToRows(columnar, columns, 3);
    expect(reconstructed).toEqual(originalRows);
  });

  it("safely queries browser memory API without throwing", () => {
    const memory = getMemoryUsage();
    // Will be null in Node/Vitest test environment, which is expected & handled
    expect(memory === null || typeof memory.usagePct === "number").toBe(true);
  });
});
