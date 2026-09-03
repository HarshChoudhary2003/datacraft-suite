// Theme-aware chart palettes using CSS custom properties so Recharts auto-adjusts to dark/light.
// Palettes carry 8 stops so multi-series (breakdown) charts stay readable without repeating hues.
export const THEMES: Record<string, string[]> = {
  Default: [
    "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)",
    "var(--chart-5)", "color-mix(in oklch, var(--chart-1) 55%, var(--chart-3))",
    "color-mix(in oklch, var(--chart-2) 55%, var(--chart-5))",
    "color-mix(in oklch, var(--chart-4) 55%, var(--chart-2))",
  ],
  "Ocean Breeze": ["#0077b6", "#00b4d8", "#90e0ef", "#03045e", "#00f5d4", "#48cae4", "#023e8a", "#5fa8d3"],
  "Neon Cyberpunk": ["#f72585", "#b5179e", "#7209b7", "#4361ee", "#4cc9f0", "#ff006e", "#3a0ca3", "#80ffdb"],
  "Sunset Glow": ["#ff7b00", "#ff9500", "#c1121f", "#780000", "#ffea00", "#e85d04", "#9d0208", "#ffba08"],
  "Emerald Mint": ["#10b981", "#34d399", "#059669", "#6ee7b7", "#047857", "#a7f3d0", "#065f46", "#22c55e"],
  "Violet Dusk": ["#8b5cf6", "#a78bfa", "#6d28d9", "#c4b5fd", "#4c1d95", "#7c3aed", "#ddd6fe", "#5b21b6"],
  "Amber Gold": ["#f59e0b", "#fbbf24", "#d97706", "#fde047", "#b45309", "#facc15", "#92400e", "#fef08a"],
  "Cyan Prism": ["#06b6d4", "#22d3ee", "#0891b2", "#67e8f9", "#0e7490", "#a5f3fc", "#155e75", "#38bdf8"],
  "Coral Reef": ["#ff6b6b", "#f06595", "#ffa94d", "#ffd43b", "#4dd4ac", "#845ef7", "#e64980", "#ff922b"],
  "Slate Contrast": ["#334155", "#64748b", "#94a3b8", "#0ea5e9", "#f43f5e", "#22c55e", "#eab308", "#a855f7"],
  "Forest Canopy": ["#14532d", "#166534", "#4d7c0f", "#65a30d", "#a3e635", "#0f766e", "#2dd4bf", "#bef264"],
};

export const DEFAULT_THEME = "Default";
export const CHART_COLORS = THEMES[DEFAULT_THEME];

export function resolvePalette(name?: string | null): string[] {
  return name && THEMES[name] ? THEMES[name] : THEMES[DEFAULT_THEME];
}

export function seriesColorAt(palette: string[], index: number, offset = 0): string {
  const list = palette.length > 0 ? palette : THEMES[DEFAULT_THEME];
  const i = ((index + offset) % list.length + list.length) % list.length;
  return list[i];
}

export function withAlpha(color: string, alpha: number): string {
  const pct = Math.max(0, Math.min(100, Math.round(alpha * 100)));
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

export function dimmedColor(color: string): string {
  return `color-mix(in srgb, ${color} 22%, var(--muted))`;
}

export function shiftColor(color: string, towards: "light" | "dark", amount = 0.25): string {
  const pct = Math.max(0, Math.min(100, Math.round(amount * 100)));
  return `color-mix(in srgb, ${color} ${100 - pct}%, ${towards === "light" ? "white" : "black"})`;
}

export interface GradientStop { offset: string; color: string; opacity: number; }

export function gradientStops(color: string, variant: "area" | "bar" | "spark" = "area"): GradientStop[] {
  if (variant === "bar") return [
    { offset: "0%", color: shiftColor(color, "light", 0.18), opacity: 1 },
    { offset: "100%", color, opacity: 0.78 },
  ];
  if (variant === "spark") return [
    { offset: "0%", color, opacity: 0.45 },
    { offset: "100%", color, opacity: 0 },
  ];
  return [
    { offset: "0%", color: shiftColor(color, "light", 0.1), opacity: 0.6 },
    { offset: "55%", color, opacity: 0.28 },
    { offset: "100%", color, opacity: 0.02 },
  ];
}

export function gradientId(widgetId: string, key = "main"): string {
  return `grad-${widgetId}-${key.replace(/\W+/g, "_")}`;
}

export const tooltipStyle = {
  background: "color-mix(in srgb, var(--popover) 88%, transparent)",
  backdropFilter: "blur(22px) saturate(160%)",
  WebkitBackdropFilter: "blur(22px) saturate(160%)",
  color: "var(--popover-foreground)",
  border: "1px solid color-mix(in srgb, var(--primary) 32%, var(--border))",
  borderRadius: 14,
  boxShadow: "0 18px 48px -12px rgba(0, 0, 0, 0.35), inset 0 1px 1px color-mix(in srgb, white 12%, transparent)",
  fontSize: 12,
  padding: "10px 12px",
};

export const axisStyle = { stroke: "var(--muted-foreground)", fontSize: 11 };
export const gridStyle = { stroke: "var(--border)", strokeDasharray: "4 4", opacity: 0.45 };

export function correlationColor(r: number, isDark: boolean): string {
  const a = Math.min(1, Math.abs(r));
  const L = isDark ? 0.22 + a * 0.38 : 0.96 - a * 0.42;
  const C = 0.03 + a * 0.24;
  const H = r >= 0 ? 275 : 195;
  return `oklch(${L} ${C} ${H})`;
}
