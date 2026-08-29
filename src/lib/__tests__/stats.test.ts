import { describe, it, expect } from "vitest";
import { profileColumn, pearson, histogram } from "../stats";

describe("stats.ts mathematics", () => {
  it("profileColumn calculates accurate numeric statistics", () => {
    // Array with known stats: mean = 5, median = 5
    // q1 = 3, q3 = 7, iqr = 4
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const profile = profileColumn("test_col", data);

    expect(profile.type).toBe("numeric");
    expect(profile.count).toBe(9);
    expect(profile.missing).toBe(0);
    expect(profile.mean).toBe(5);
    expect(profile.median).toBe(5);
    expect(profile.min).toBe(1);
    expect(profile.max).toBe(9);
    expect(profile.q1).toBe(3);
    expect(profile.q3).toBe(7);
    expect(profile.iqr).toBe(4);

    // std calculation: variance of 1..9 is sum((x-5)^2)/8 = (16*2 + 9*2 + 4*2 + 1*2)/8 = 60/8 = 7.5
    // std = sqrt(7.5) ≈ 2.7386
    expect(profile.std).toBeCloseTo(2.7386, 4);
  });

  it("profileColumn handles missing and null values correctly", () => {
    const data = [10, "NA", null, 20, 30, "", 40];
    const profile = profileColumn("with_missing", data);

    expect(profile.type).toBe("numeric");
    expect(profile.count).toBe(4); // 10, 20, 30, 40
    expect(profile.missing).toBe(3);
    expect(profile.mean).toBe(25); // (10+20+30+40)/4 = 25
  });

  it("profileColumn detects categorical data correctly", () => {
    const data = ["apple", "banana", "apple", "orange", "apple"];
    const profile = profileColumn("fruits", data);

    expect(profile.type).toBe("categorical");
    expect(profile.count).toBe(5);
    expect(profile.unique).toBe(3);
    expect(profile.topValues?.[0].value).toBe("apple");
    expect(profile.topValues?.[0].count).toBe(3);
  });

  it("pearson correlation calculates accurate r values", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10]; // perfectly correlated
    expect(pearson(x, y)).toBe(1);

    const y_inv = [10, 8, 6, 4, 2]; // perfectly negatively correlated
    expect(pearson(x, y_inv)).toBe(-1);

    const x_flat = [1, 1, 1, 1, 1]; // zero variance
    expect(pearson(x_flat, y)).toBe(0);
  });

  it("histogram accurately buckets numeric data", () => {
    const data = [1, 1.5, 2, 2.5, 9, 9.5, 10];
    const bins = histogram(data, 2); // 2 bins: [1 to 5.5] and [5.5 to 10]

    expect(bins.length).toBe(2);
    expect(bins[0].count).toBe(4); // 1, 1.5, 2, 2.5
    expect(bins[1].count).toBe(3); // 9, 9.5, 10
  });
});
