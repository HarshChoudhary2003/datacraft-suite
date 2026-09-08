import { describe, it, expect } from "vitest";
import { validateGeneratedCode } from "../codegen-validate";
import type { Dataset } from "../types";

const ds = {
  name: "sales.csv",
  columns: ["revenue", "region", "churn"],
  rows: [{ revenue: 1, region: "EU", churn: 0 }],
} as unknown as Dataset;

const good = `# SETUP
# pip install -r requirements.txt
import pandas as pd
FEATURES = ["revenue", "region"]
TARGET = "churn"
df = pd.read_csv("sales.csv")
if __name__ == "__main__":
    print(df.shape)
`;

describe("validateGeneratedCode", () => {
  it("accepts a well-formed script", () => {
    const out = validateGeneratedCode(good, ds, "ml");
    expect(out.some((c) => c.level === "error")).toBe(false);
    expect(out.some((c) => c.category === "setup" && c.level === "ok")).toBe(true);
  });

  it("flags a missing setup block", () => {
    const out = validateGeneratedCode(good.replace(/# SETUP\n# pip install -r requirements.txt\n/, ""), ds, "ml");
    expect(out.some((c) => c.category === "setup" && c.level === "warn")).toBe(true);
  });

  it("flags target leakage into the feature list", () => {
    const out = validateGeneratedCode(good.replace('["revenue", "region"]', '["revenue", "churn"]'), ds, "ml");
    expect(out.some((c) => c.level === "error" && /leakage/i.test(c.msg))).toBe(true);
  });

  it("flags duplicate feature columns", () => {
    const out = validateGeneratedCode(good.replace('["revenue", "region"]', '["revenue", "revenue"]'), ds, "ml");
    expect(out.some((c) => c.level === "error" && /Duplicate/i.test(c.msg))).toBe(true);
  });

  it("flags leftover placeholders", () => {
    const out = validateGeneratedCode(good + "\n# TODO fill this in\n", ds, "ml");
    expect(out.some((c) => /TODO/.test(c.msg))).toBe(true);
  });

  it("flags unpinned requirements", () => {
    const out = validateGeneratedCode("# deps\npandas\nnumpy>=1.24\n", ds, "requirements");
    expect(out.some((c) => c.level === "warn" && /version constraint/.test(c.msg))).toBe(true);
  });
});
