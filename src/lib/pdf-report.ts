// Comprehensive PDF report generator (client-side, jsPDF). Bundles the four
// deliverables into one downloadable document:
//   1. Data quality summary   2. Correlation analysis
//   3. Validated codegen results   4. Telemetry timing breakdown
import { jsPDF } from "jspdf";
import type { Dataset } from "@/lib/stats";
import { correlationMatrix, topCorrelations } from "@/lib/stats";
import type { CodeValidation } from "@/lib/codegen-validate";
import type { ProcessingTelemetry } from "@/lib/processing-telemetry";
import { formatMs } from "@/lib/processing-telemetry";

export interface FullReportInput {
  dataset: Dataset;
  role: string;
  codeValidation: CodeValidation[];
  codeContext?: { template: string; target: string; features: number };
  telemetry: ProcessingTelemetry | null;
  history?: ProcessingTelemetry[];
}

const MARGIN = 48;
const LINE = 16;

export function buildFullReportPDF(input: FullReportInput): void {
  const { dataset: ds } = input;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  let y = MARGIN;

  const ensure = (needed = LINE) => {
    if (y + needed > pageH - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };
  const text = (
    s: string,
    opts?: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number },
  ) => {
    const size = opts?.size ?? 10;
    doc.setFontSize(size);
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setTextColor(...(opts?.color ?? [30, 41, 59]));
    const lines = doc.splitTextToSize(s, contentW);
    for (const ln of lines) {
      ensure(size + 4);
      doc.text(ln, MARGIN, y);
      y += size + 4;
    }
    if (opts?.gap) y += opts.gap;
  };
  const heading = (s: string) => {
    y += 6;
    ensure(30);
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(99, 102, 241);
    doc.rect(MARGIN, y - 10, 4, 16, "F");
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(s, MARGIN + 12, y + 3);
    y += 22;
  };
  // Simple 2-column key/value grid row.
  const kv = (pairs: [string, string][]) => {
    const colW = contentW / 2;
    for (let i = 0; i < pairs.length; i += 2) {
      ensure(LINE);
      for (let c = 0; c < 2; c++) {
        const p = pairs[i + c];
        if (!p) continue;
        const x = MARGIN + c * colW;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(p[0], x, y);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(15, 23, 42);
        doc.text(p[1], x + 130, y);
      }
      y += LINE;
    }
  };
  const tableRow = (
    cells: string[],
    widths: number[],
    opts?: { bold?: boolean; color?: [number, number, number] },
  ) => {
    ensure(LINE);
    doc.setFontSize(9);
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setTextColor(...(opts?.color ?? [51, 65, 85]));
    let x = MARGIN;
    cells.forEach((cell, i) => {
      const w = widths[i];
      const lines = doc.splitTextToSize(cell, w - 6);
      doc.text(lines[0] ?? "", x, y);
      x += w;
    });
    y += LINE;
  };

  // ---------- Header ----------
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("DataIQ Pro — Full Analysis Report", MARGIN, y + 6);
  y += 28;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Dataset: ${ds.name}   ·   Role: ${input.role}   ·   ${new Date().toLocaleString()}`,
    MARGIN,
    y,
  );
  y += 10;
  doc.setDrawColor(226, 232, 240);
  doc.line(MARGIN, y, pageW - MARGIN, y);
  y += 8;

  // ---------- 1. Data quality summary ----------
  heading("1. Data Quality Summary");
  const totalCells = Math.max(1, ds.rowCount * ds.colCount);
  const missPct = ((ds.missingTotal / totalCells) * 100).toFixed(2);
  const dupPct = ((ds.duplicateRows / Math.max(1, ds.rowCount)) * 100).toFixed(2);
  kv([
    ["Rows", ds.rowCount.toLocaleString()],
    ["Columns", String(ds.colCount)],
    ["Missing values", `${ds.missingTotal.toLocaleString()} (${missPct}%)`],
    ["Duplicate rows", `${ds.duplicateRows.toLocaleString()} (${dupPct}%)`],
    ["ML readiness score", `${ds.readinessScore}/100`],
    ["Numeric columns", String(ds.profiles.filter((p) => p.type === "numeric").length)],
  ]);
  if (ds.readinessBreakdown?.length) {
    y += 4;
    text("Readiness penalties:", { size: 10, bold: true });
    ds.readinessBreakdown.forEach((b) => text(`• ${b.reason}  (−${b.penalty})`, { size: 9 }));
  }
  // Column-level quality issues
  const issues = ds.profiles
    .map((p) => ({
      name: p.name,
      miss: p.missingPct,
      skew: Math.abs(p.skewness ?? 0),
      out: p.outliersIQR ?? 0,
    }))
    .filter((r) => r.miss > 0 || r.skew > 1 || r.out > 0)
    .sort((a, b) => b.miss + b.skew + b.out - (a.miss + a.skew + a.out))
    .slice(0, 12);
  if (issues.length) {
    y += 8;
    text("Top column-level quality flags:", { size: 10, bold: true });
    const w = [contentW * 0.4, contentW * 0.2, contentW * 0.2, contentW * 0.2];
    tableRow(["Column", "Missing %", "|Skew|", "Outliers"], w, {
      bold: true,
      color: [71, 85, 105],
    });
    issues.forEach((r) =>
      tableRow([r.name, `${r.miss.toFixed(1)}%`, r.skew.toFixed(2), String(r.out)], w),
    );
  }

  // ---------- 2. Correlation analysis ----------
  heading("2. Correlation Analysis");
  const corr = ds.correlation || correlationMatrix(ds);
  if (!corr.columns.length) {
    text("Not enough numeric columns to compute correlations.", {
      size: 9,
      color: [100, 116, 139],
    });
  } else {
    const top = topCorrelations(corr, 15);
    if (!top.length) {
      text("No correlated numeric pairs found.", { size: 9, color: [100, 116, 139] });
    } else {
      text(`Pearson r across ${corr.columns.length} numeric columns. Top pairs by |r|:`, {
        size: 9,
        color: [100, 116, 139],
      });
      y += 4;
      const w = [contentW * 0.35, contentW * 0.35, contentW * 0.15, contentW * 0.15];
      tableRow(["Column A", "Column B", "r", "Strength"], w, { bold: true, color: [71, 85, 105] });
      top.forEach((p) => {
        const a = Math.abs(p.r);
        const strength = a >= 0.7 ? "Strong" : a >= 0.4 ? "Moderate" : "Weak";
        tableRow([p.a, p.b, p.r.toFixed(3), `${strength} ${p.r >= 0 ? "+" : "−"}`], w);
      });
    }
  }

  // ---------- 3. Validated codegen results ----------
  heading("3. Validated Code Generation Results");
  if (input.codeContext) {
    kv([
      ["Template", input.codeContext.template],
      ["Target", input.codeContext.target || "—"],
      ["Feature count", String(input.codeContext.features)],
    ]);
    y += 4;
  }
  const errs = input.codeValidation.filter((c) => c.level === "error");
  const warns = input.codeValidation.filter((c) => c.level === "warn");
  const oks = input.codeValidation.filter((c) => c.level === "ok");
  text(
    `Status: ${errs.length} error(s), ${warns.length} warning(s) — ${errs.length + warns.length === 0 ? "FULLY VALID ✓" : "needs attention"}`,
    {
      size: 10,
      bold: true,
      color: errs.length + warns.length === 0 ? [22, 163, 74] : [220, 38, 38],
    },
  );
  y += 4;
  const CAT: Record<CodeValidation["category"], string> = {
    reader: "Reader",
    schema: "Schema",
    cli: "Run command",
    general: "General",
  };
  [...errs, ...warns].forEach((c) => {
    text(`[${c.level.toUpperCase()} · ${CAT[c.category]}] ${c.msg}`, {
      size: 9,
      color: c.level === "error" ? [220, 38, 38] : [180, 120, 20],
    });
    if (c.fix) text(`   Fix: ${c.fix}`, { size: 8, color: [100, 116, 139] });
  });
  oks.forEach((c) => text(`[OK · ${CAT[c.category]}] ${c.msg}`, { size: 9, color: [22, 163, 74] }));

  // ---------- 4. Telemetry timing breakdown ----------
  heading("4. Processing Telemetry — Timing Breakdown");
  const t = input.telemetry;
  if (!t) {
    text("No processing telemetry recorded for this session yet.", {
      size: 9,
      color: [100, 116, 139],
    });
  } else {
    kv([
      ["Total time", formatMs(t.totalMs)],
      ["Throughput", `${t.rowsPerSec.toLocaleString()} rows/s`],
      ["Rows processed", t.rowCount.toLocaleString()],
      ["Resumed after reload", t.resumed ? "Yes" : "No"],
    ]);
    y += 4;
    const w = [contentW * 0.5, contentW * 0.25, contentW * 0.25];
    tableRow(["Stage", "Time", "% of total"], w, { bold: true, color: [71, 85, 105] });
    t.stages.forEach((s) => {
      const pct = t.totalMs > 0 ? ((s.ms / t.totalMs) * 100).toFixed(1) : "0.0";
      tableRow([s.label, formatMs(s.ms), `${pct}%`], w);
    });
  }
  if (input.history && input.history.length > 1) {
    y += 8;
    text(`Recent runs (${Math.min(8, input.history.length)}):`, { size: 10, bold: true });
    const w = [contentW * 0.4, contentW * 0.2, contentW * 0.2, contentW * 0.2];
    tableRow(["Dataset", "Rows", "Total", "Rows/s"], w, { bold: true, color: [71, 85, 105] });
    input.history
      .slice(0, 8)
      .forEach((h) =>
        tableRow(
          [
            h.fileName,
            h.rowCount.toLocaleString(),
            formatMs(h.totalMs),
            h.rowsPerSec.toLocaleString(),
          ],
          w,
        ),
      );
  }

  // Footer page numbers
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`DataIQ Pro · page ${i} of ${pages}`, MARGIN, pageH - 20);
  }

  const stem = ds.name.replace(/\.(csv|xlsx?|json)$/i, "");
  doc.save(`${stem}_full_report.pdf`);
}
