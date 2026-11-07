import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROLES } from "@/store/dataset-context";
import { nextRoleIndex } from "@/lib/role-picker-keys";

// ---- Theme token parsing (light = :root, dark = .dark) ----
const css = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

function block(selector: string): string {
  const re = new RegExp(`(^|\\n)${selector.replace(".", "\\.")}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const m = css.match(re);
  if (!m) throw new Error(`missing ${selector} block`);
  return m[2];
}
function token(selector: string, name: string): string {
  const m = block(selector).match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`missing --${name} in ${selector}`);
  return m[1].trim();
}

// ---- oklch -> sRGB -> WCAG contrast ----
function oklchToRgb(v: string): [number, number, number] {
  const m = v.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) throw new Error(`not oklch: ${v}`);
  const [L, C, H] = [+m[1], +m[2], +m[3]];
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  return lin.map((x) => Math.min(1, Math.max(0, x))) as [number, number, number];
}
const lum = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b; // linear values
function contrast(a: string, b: string | [number, number, number]): number {
  const la = lum(oklchToRgb(a));
  const lb = lum(typeof b === "string" ? oklchToRgb(b) : b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
const WHITE: [number, number, number] = [1, 1, 1];

const THEMES = [
  { name: "light", sel: ":root" },
  { name: "dark", sel: ".dark" },
] as const;
const TONES = ["analyst", "business", "scientist", "ml", "ai", "engineer"] as const;

describe("role picker — screen reader labels", () => {
  it("has exactly six roles, each with a full spoken name", () => {
    expect(ROLES.map((r) => r.label)).toEqual([
      "Data Analyst",
      "Business Analyst",
      "Data Scientist",
      "ML Engineer",
      "AI Engineer",
      "Data Engineer",
    ]);
  });

  it("spoken labels are unique so each radio is distinguishable", () => {
    expect(new Set(ROLES.map((r) => r.label)).size).toBe(ROLES.length);
  });

  it("every role has an icon and a color tone", () => {
    for (const r of ROLES) {
      expect(r.icon).toBeTruthy();
      expect(TONES).toContain(r.tone);
    }
  });
});

describe("role picker — keyboard navigation", () => {
  const n = ROLES.length;
  it("ArrowRight/ArrowDown move to the next role and wrap from last to first", () => {
    expect(nextRoleIndex("ArrowRight", 0, n)).toBe(1);
    expect(nextRoleIndex("ArrowDown", 2, n)).toBe(3);
    expect(nextRoleIndex("ArrowRight", n - 1, n)).toBe(0);
  });
  it("ArrowLeft/ArrowUp move to the previous role and wrap from first to last", () => {
    expect(nextRoleIndex("ArrowLeft", 3, n)).toBe(2);
    expect(nextRoleIndex("ArrowUp", 0, n)).toBe(n - 1);
  });
  it("Home/End jump to the first and last roles", () => {
    expect(nextRoleIndex("Home", 4, n)).toBe(0);
    expect(nextRoleIndex("End", 1, n)).toBe(n - 1);
  });
  it("other keys (Tab, Enter, Space) are left to the browser", () => {
    for (const k of ["Tab", "Enter", " ", "a"]) expect(nextRoleIndex(k, 2, n)).toBeNull();
  });
});

describe.each(THEMES)("role picker — contrast in $name theme", ({ sel }) => {
  it.each(TONES)("white icon on the %s tile gradient is at least 3:1 at both ends", (tone) => {
    expect(contrast(token(sel, `role-${tone}`), WHITE)).toBeGreaterThanOrEqual(3);
    expect(contrast(token(sel, `role-${tone}-soft`), WHITE)).toBeGreaterThanOrEqual(3);
  });

  it("selected role label text is at least 4.5:1 on the card", () => {
    const label = token(sel, "role-label");
    const fg = label.startsWith("var(") ? token(sel, "primary") : label;
    expect(contrast(fg, token(sel, "card"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(fg, token(sel, "background"))).toBeGreaterThanOrEqual(4.5);
  });

  it("keyboard focus outline color is at least 3:1 against the page", () => {
    expect(contrast(token(sel, "ring"), token(sel, "background"))).toBeGreaterThanOrEqual(3);
  });
});
