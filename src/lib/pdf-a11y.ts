// Accessibility helpers for client-side generated PDFs (jsPDF).
//
// jsPDF cannot emit a full PDF/UA structure tree, so we make exports navigable
// and readable with the three things assistive tech actually consumes:
//   1. Document metadata + language + "display document title" viewer pref, so
//      screen readers announce a real title instead of the filename.
//   2. Outline bookmarks (the PDF navigation pane / SR "landmarks" list).
//   3. A real text layer: chart images get an invisible-but-selectable text
//      alternative next to them, plus a readable appendix listing every
//      visual, its legend entries and the filter context it was rendered with.
import type { jsPDF } from "jspdf";

export interface PdfDocMeta {
  title: string;
  subject: string;
  /** Comma-joined keywords, e.g. the dataset name and visual types. */
  keywords?: string;
  author?: string;
  lang?: string;
}

/** Metadata + language + viewer preference so SRs announce the document title. */
export function applyPdfDocumentTags(doc: jsPDF, meta: PdfDocMeta): void {
  const lang = meta.lang ?? "en";
  doc.setProperties({
    title: meta.title,
    subject: meta.subject,
    keywords: meta.keywords ?? "",
    author: meta.author ?? "DataIQ Pro",
    creator: "DataIQ Pro",
  });
  // Not in older typings on every jsPDF build — guard both calls.
  const anyDoc = doc as unknown as {
    setLanguage?: (l: string) => void;
    viewerPreferences?: (p: Record<string, boolean>) => void;
  };
  anyDoc.setLanguage?.(lang);
  anyDoc.viewerPreferences?.({ DisplayDocTitle: true });
}

/** Add an outline bookmark pointing at a page. Safe no-op if unsupported. */
export function addPdfBookmark(doc: jsPDF, title: string, pageNumber: number): void {
  try {
    const outline = (doc as unknown as {
      outline?: { add: (p: null, t: string, o: { pageNumber: number }) => unknown };
    }).outline;
    outline?.add(null, title, { pageNumber });
  } catch {
    /* outline plugin unavailable — bookmarks are additive, never required */
  }
}

/**
 * Draw an invisible text layer. The glyphs are not painted but they are part of
 * the page content stream, so screen readers and text extraction read them in
 * order — this is how a chart image gets an alt text in a jsPDF document.
 */
export function addInvisibleAltText(
  doc: jsPDF,
  altText: string,
  opts: { x: number; y: number; maxWidth: number; lineHeight?: number },
): void {
  const lines = doc.splitTextToSize(altText, opts.maxWidth) as string[];
  const lh = opts.lineHeight ?? 10;
  doc.setFontSize(8);
  lines.forEach((line, i) => {
    doc.text(line, opts.x, opts.y + i * lh, {
      renderingMode: "invisible",
    } as Parameters<jsPDF["text"]>[3]);
  });
}

export interface VisualAltText {
  title: string;
  /** Visual type, e.g. "bar", "donut", "kpi". */
  type: string;
  /** Aggregation caption shown under the visual. */
  caption?: string;
  /** Legend / category labels in render order. */
  legend?: string[];
  /** Aggregated data points backing the visual. */
  series?: { x: string; y: number }[];
}

const num = (n: number) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n)
    : "n/a";

/** One-sentence-per-fact description of a visual, read top to bottom. */
export function describeVisual(v: VisualAltText, index: number, total: number): string {
  const parts: string[] = [
    `Visual ${index + 1} of ${total}: ${v.title}. Chart type: ${v.type}.`,
  ];
  if (v.caption) parts.push(`Measure: ${v.caption}.`);
  if (v.legend?.length) parts.push(`Legend entries: ${v.legend.join(", ")}.`);
  const s = v.series ?? [];
  if (s.length) {
    const values = s.map((p) => p.y).filter((n) => Number.isFinite(n));
    const max = s[values.indexOf(Math.max(...values))];
    const min = s[values.indexOf(Math.min(...values))];
    parts.push(`${s.length} data point${s.length === 1 ? "" : "s"}.`);
    if (max) parts.push(`Highest: ${max.x} at ${num(max.y)}.`);
    if (min) parts.push(`Lowest: ${min.x} at ${num(min.y)}.`);
    parts.push(
      `Data: ${s
        .slice(0, 40)
        .map((p) => `${p.x} = ${num(p.y)}`)
        .join("; ")}${s.length > 40 ? `; and ${s.length - 40} more` : ""}.`,
    );
  }
  return parts.join(" ");
}

/** Sentence describing the filter context an export was rendered under. */
export function describeFilterContext(
  filters: string[],
  scope?: { filteredRows: number; totalRows: number },
): string {
  const f = filters.length
    ? `Active filter context: ${filters.join("; ")}.`
    : "Filter context: no filters applied; all rows included.";
  const s = scope
    ? ` Row scope: ${scope.filteredRows.toLocaleString()} of ${scope.totalRows.toLocaleString()} rows.`
    : "";
  return f + s;
}

/**
 * Append a readable "Accessible text alternatives" section: a bookmarked page
 * with the filter context and one described visual after another.
 */
export function appendAltTextAppendix(
  doc: jsPDF,
  visuals: VisualAltText[],
  filterSentence: string,
  opts?: { margin?: number },
): void {
  const margin = opts?.margin ?? 32;
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const contentW = pw - margin * 2;
  doc.addPage();
  addPdfBookmark(doc, "Accessible text alternatives", doc.getNumberOfPages());
  let y = margin + 6;

  const line = (
    s: string,
    o?: { size?: number; bold?: boolean; color?: [number, number, number]; gap?: number },
  ) => {
    const size = o?.size ?? 9;
    doc.setFontSize(size);
    doc.setFont("helvetica", o?.bold ? "bold" : "normal");
    doc.setTextColor(...(o?.color ?? [30, 41, 59]));
    for (const ln of doc.splitTextToSize(s, contentW) as string[]) {
      if (y + size + 4 > ph - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(ln, margin, y);
      y += size + 4;
    }
    y += o?.gap ?? 0;
  };

  line("Accessible text alternatives", { size: 15, bold: true, color: [15, 23, 42], gap: 4 });
  line(
    "Text equivalents for every visual in this report, in the same order as the pages above. Charts, legends and filter context are described so the report can be read without seeing the images.",
    { size: 9, color: [100, 116, 139], gap: 6 },
  );
  line("Filter context", { size: 11, bold: true, color: [15, 23, 42] });
  line(filterSentence, { gap: 8 });
  line(`Visuals in this report: ${visuals.length}`, { size: 11, bold: true, gap: 4 });
  visuals.forEach((v, i) => {
    line(`${i + 1}. ${v.title} (${v.type})`, { size: 10, bold: true });
    line(describeVisual(v, i, visuals.length), { gap: 6 });
  });
}
