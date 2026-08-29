import { describe, it, expect } from "vitest";
import {
  isMissing,
  cleanNumericValue,
  profileColumn,
  correlationMatrix,
  buildDataset,
} from "../stats";
import { coerceTypes } from "../csv";

describe("DataIQ Accuracy Engine", () => {
  it("detects all standard missing value sentinels across Excel, SQL, Pandas, R, SAS, SPSS", () => {
    expect(isMissing(null)).toBe(true);
    expect(isMissing(undefined)).toBe(true);
    expect(isMissing(NaN)).toBe(true);
    expect(isMissing("")).toBe(true);
    expect(isMissing("  ")).toBe(true);
    expect(isMissing("N/A")).toBe(true);
    expect(isMissing("na")).toBe(true);
    expect(isMissing("NULL")).toBe(true);
    expect(isMissing("None")).toBe(true);
    expect(isMissing("undefined")).toBe(true);
    expect(isMissing("#N/A")).toBe(true);
    expect(isMissing("#VALUE!")).toBe(true);
    expect(isMissing("#DIV/0!")).toBe(true);
    expect(isMissing("missing")).toBe(true);
    expect(isMissing("blank")).toBe(true);

    // Valid values must NOT be marked missing
    expect(isMissing(0)).toBe(false);
    expect(isMissing("0")).toBe(false);
    expect(isMissing("false")).toBe(false);
    expect(isMissing("Valid String")).toBe(false);
  });

  it("parses numeric values accurately with currency signs, thousand commas, and percentages", () => {
    expect(cleanNumericValue(1234.56)).toBe(1234.56);
    expect(cleanNumericValue("$1,234.56")).toBe(1234.56);
    expect(cleanNumericValue("€50,000")).toBe(50000);
    expect(cleanNumericValue("£9,999.99")).toBe(9999.99);
    expect(cleanNumericValue("85.5%")).toBe(0.855);
    expect(cleanNumericValue("100%")).toBe(1);
    expect(cleanNumericValue("-1,500.25")).toBe(-1500.25);
    expect(isNaN(cleanNumericValue("invalid text"))).toBe(true);
  });

  it("profiles columns with exact statistics, quantiles, and skewness", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const profile = profileColumn("score", values);

    expect(profile.type).toBe("numeric");
    expect(profile.mean).toBe(55);
    expect(profile.median).toBe(55);
    expect(profile.min).toBe(10);
    expect(profile.max).toBe(100);
    expect(profile.q1).toBe(32.5);
    expect(profile.q3).toBe(77.5);
    expect(profile.iqr).toBe(45);
    expect(profile.missing).toBe(0);
    expect(profile.missingPct).toBe(0);
  });

  it("calculates pairwise correlation accurately even when dataset has missing values in other columns", () => {
    const rows = [
      { a: 10, b: 20, c: "N/A" },
      { a: 20, b: 40, c: 100 },
      { a: 30, b: 60, c: "N/A" },
      { a: 40, b: 80, c: 200 },
      { a: 50, b: 100, c: 300 },
    ];

    const dataset = buildDataset("test.csv", rows);
    const corr = correlationMatrix(dataset);

    expect(corr.columns).toContain("a");
    expect(corr.columns).toContain("b");

    const aIdx = corr.columns.indexOf("a");
    const bIdx = corr.columns.indexOf("b");

    // Perfect linear correlation r = 1.0 between a and b despite column c having missing values
    expect(corr.matrix[aIdx][bIdx]).toBe(1);
  });

  it("accurately detects datetime columns with month names and ISO formats", () => {
    const isoDates = ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04"];
    const monthDates = ["Jan 1, 2024", "Jan 2, 2024", "Jan 3, 2024", "Jan 4, 2024"];

    const isoProfile = profileColumn("date1", isoDates);
    const monthProfile = profileColumn("date2", monthDates);

    expect(isoProfile.type).toBe("datetime");
    expect(monthProfile.type).toBe("datetime");
  });

  it("preserves leading-zero string IDs like ZIP codes while parsing scientific notation floats", () => {
    const raw = [
      { id: "02138", val: "1.25e-3", dec: ".5" },
      { id: "00142", val: "-3.5E4", dec: "-.75" },
    ];
    const coerced = coerceTypes(raw);
    expect(coerced[0].id).toBe("02138");
    expect(coerced[1].id).toBe("00142");
    expect(coerced[0].val).toBe(0.00125);
    expect(coerced[1].val).toBe(-35000);
    expect(coerced[0].dec).toBe(0.5);
    expect(coerced[1].dec).toBe(-0.75);
  });
});
