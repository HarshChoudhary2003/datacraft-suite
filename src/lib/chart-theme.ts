// Theme-aware chart palette using CSS custom properties so Recharts auto-adjusts to dark/light.
export const THEMES: Record<string, string[]> = {
  Default: [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ],
  "Ocean Breeze": ["#0077b6", "#00b4d8", "#90e0ef", "#03045e", "#00f5d4"],
  "Neon Cyberpunk": ["#f72585", "#b5179e", "#7209b7", "#4361ee", "#4cc9f0"],
  "Sunset Glow": ["#ff7b00", "#ff9500", "#c1121f", "#780000", "#ffea00"],
  "Emerald Mint": ["#10b981", "#34d399", "#059669", "#6ee7b7", "#047857"],
  "Violet Dusk": ["#8b5cf6", "#a78bfa", "#6d28d9", "#c4b5fd", "#4c1d95"],
  "Amber Gold": ["#f59e0b", "#fbbf24", "#d97706", "#fde047", "#b45309"],
  "Cyan Prism": ["#06b6d4", "#22d3ee", "#0891b2", "#67e8f9", "#0e7490"],
};

// Backwards compatibility for other files
export const CHART_COLORS = THEMES["Default"];

export const tooltipStyle = {
  background: "color-mix(in srgb, var(--popover) 85%, transparent)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  color: "var(--popover-foreground)",
  border: "1px solid color-mix(in srgb, var(--primary) 40%, transparent)",
  borderRadius: 14,
  boxShadow: "0 12px 36px rgba(0, 0, 0, 0.16), inset 0 1px 1px rgba(255, 255, 255, 0.1)",
  fontSize: 12,
  padding: "10px 14px",
};

export const axisStyle = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
};

export const gridStyle = {
  stroke: "var(--border)",
  strokeDasharray: "4 4",
  opacity: 0.45,
};

// Diverging color used in correlation matrix; theme-aware via OKLCH lightness.
export function correlationColor(r: number, isDark: boolean): string {
  const a = Math.min(1, Math.abs(r));
  const L = isDark ? 0.22 + a * 0.38 : 0.96 - a * 0.42;
  const C = 0.03 + a * 0.24;
  const H = r >= 0 ? 275 : 195;
  return `oklch(${L} ${C} ${H})`;
}
