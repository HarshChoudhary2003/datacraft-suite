import type { NumberFormat } from "./dashboard-store";

export interface FormatOpts {
  format?: NumberFormat;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

/**
 * Single source of truth for numeric display across a dashboard visual — axes,
 * data labels, tooltips and KPI values all read from here so a widget's
 * formatting choice is applied consistently.
 */
export function formatValue(n: number, opts: FormatOpts = {}): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const { format = "auto", decimals, prefix = "", suffix = "" } = opts;
  const abs = Math.abs(n);
  const dp =
    decimals ??
    (format === "percent" || format === "currency" ? 2 : abs < 10 && !Number.isInteger(n) ? 2 : 0);

  let out: string;
  switch (format) {
    case "compact":
      out = new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: Math.min(dp, 2),
      }).format(n);
      break;
    case "currency":
      out = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: dp,
        maximumFractionDigits: dp,
      }).format(n);
      break;
    case "percent":
      out = `${new Intl.NumberFormat("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n)}%`;
      break;
    case "full":
      out = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: dp,
        maximumFractionDigits: dp,
      }).format(n);
      break;
    default:
      out =
        abs >= 10_000
          ? new Intl.NumberFormat("en-US", {
              notation: "compact",
              maximumFractionDigits: 1,
            }).format(n)
          : new Intl.NumberFormat("en-US", {
              minimumFractionDigits: dp,
              maximumFractionDigits: dp,
            }).format(n);
  }
  return `${prefix}${out}${suffix}`;
}

export const NUMBER_FORMAT_OPTIONS: { value: NumberFormat; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "compact", label: "Compact (1.2K)" },
  { value: "full", label: "Full (1,234.00)" },
  { value: "currency", label: "Currency ($)" },
  { value: "percent", label: "Percent (%)" },
];
