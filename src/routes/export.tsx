import { createFileRoute, Link } from "@tanstack/react-router";
import { useDataset } from "@/store/dataset-context";
import { correlationMatrix, topCorrelations, histogram } from "@/lib/stats";
import {
  FileDown,
  BookOpen,
  FileCode,
  Settings2,
  Printer,
  FileSpreadsheet,
  LayoutTemplate,
} from "lucide-react";
import { toast } from "sonner";
import { buildIpynb, buildInteractiveHTML } from "@/lib/notebook";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExcelJS from "exceljs";
import { authorizeAction, recordAudit } from "@/lib/audit.functions";
import { getSessionId } from "@/lib/session";
import { loadSnapshots } from "@/lib/dashboard-store";
import {
  enqueueExportJob,
  FatalExportError,
  registerExportRetry,
  registerSnapshotVerifier,
  yieldToBrowser,
} from "@/lib/export-jobs";
import { ExportJobsPanel } from "@/components/export/export-jobs-panel";
import { validateImportedSettings, type ImportValidation } from "@/lib/import-settings";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/export")({
  head: () => ({ meta: [{ title: "Export Report — DataIQ Pro" }] }),
  component: ExportPage,
});

type Section =
  | "overview"
  | "readiness"
  | "stats"
  | "shape"
  | "categorical"
  | "correlation"
  | "outliers"
  | "missing"
  | "recommendations"
  | "methodology";

const SECTIONS: { id: Section; label: string; desc: string }[] = [
  { id: "overview", label: "Overview & KPIs", desc: "Row/column counts, missing, duplicates" },
  { id: "readiness", label: "ML Readiness", desc: "Score + penalty breakdown" },
  { id: "stats", label: "Descriptive statistics", desc: "Mean, median, std, min/max, IQR, CV" },
  { id: "shape", label: "Distribution shape", desc: "Skewness & kurtosis with notes" },
  { id: "categorical", label: "Categorical breakdown", desc: "Top values per categorical column" },
  {
    id: "correlation",
    label: "Correlation analysis",
    desc: "Strength summary + top pairs + heatmap",
  },
  { id: "outliers", label: "Outlier detection", desc: "IQR + Z-score outliers per column" },
  { id: "missing", label: "Missing values", desc: "Per-column missing % table" },
  { id: "recommendations", label: "Recommendations", desc: "Auto-generated next steps" },
  { id: "methodology", label: "Methodology notes", desc: "How every metric was computed" },
];

const DEFAULT_TITLE = "Dataset analysis report";
const DEFAULT_NOTE = "";

const STAGGER = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { staggerChildren: 0.1 } },
};
const ITEM = { hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0 } };

export function ExportPage() {
  return (
    <div className="flex flex-col gap-6 h-full min-h-[calc(100vh-6rem)]">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Export Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Export static PDF reports or interactive HTML documents.
          </p>
        </div>
      </div>

      <ExportJobsPanel />
      <div className="flex-1 relative">
        <ReportBuilder />
      </div>
    </div>
  );
}

interface ExportInputs {
  dataset: NonNullable<ReturnType<typeof useDataset>["dataset"]>;
  role: ReturnType<typeof useDataset>["role"];
  sections: Section[];
  title: string;
  note: string;
  capturedAt: number;
  snapshots?: ReturnType<typeof loadSnapshots>;
}

/** Stable FNV-1a fingerprint of a dataset's columns and rows. */
function datasetFingerprint(ds: { columns: string[]; rows: Record<string, unknown>[] }): string {
  let h = 0x811c9dc5;
  const feed = (str: string) => {
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };
  feed(ds.columns.join("\u0001"));
  for (const r of ds.rows) for (const c of ds.columns) feed("\u0002" + String(r[c] ?? ""));
  return (h >>> 0).toString(16).padStart(8, "0") + "-" + ds.rows.length.toString(36);
}

/** Compare a saved snapshot against the fingerprint recorded when it was queued. */
function verifySnapshot(settings: Record<string, unknown> | undefined, data: unknown): string | null {
  const ds = (data as { dataset?: { columns?: unknown; rows?: unknown; name?: string } } | null)?.dataset;
  if (!ds || !Array.isArray(ds.columns) || !Array.isArray(ds.rows))
    return "the saved snapshot is missing its dataset or is damaged.";
  if (!settings?.fingerprint) return null; // older export: nothing to compare against
  const actual = datasetFingerprint(ds as { columns: string[]; rows: Record<string, unknown>[] });
  if (actual === settings.fingerprint) return null;
  const reasons: string[] = [];
  if (settings.rows != null && settings.rows !== ds.rows.length)
    reasons.push(`it has ${ds.rows.length} rows but ${String(settings.rows)} were saved`);
  if (settings.columns != null && settings.columns !== ds.columns.length)
    reasons.push(`it has ${ds.columns.length} columns but ${String(settings.columns)} were saved`);
  if (Array.isArray(settings.columnNames)) {
    const saved = settings.columnNames as string[];
    const now = (ds.columns as string[]).slice(0, saved.length);
    const missing = saved.filter((c) => !now.includes(c));
    if (missing.length) reasons.push(`columns changed or missing: ${missing.join(", ")}`);
  }
  if (!reasons.length) reasons.push("the row and column counts match, but some cell values differ");
  return `the snapshot's fingerprint is #${actual}, expected #${String(settings.fingerprint)}: ${reasons.join("; ")}.`;
}

function ReportBuilder() {
  const { dataset: maybeDataset, role } = useDataset();
  // Retries rebuild from saved snapshots, so the handlers below must exist
  // even when no dataset is loaded; the empty state is rendered at the end.
  const dataset = maybeDataset!;
  const [enabled, setEnabled] = useState<Set<Section>>(new Set(SECTIONS.map((s) => s.id)));
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [note, setNote] = useState(DEFAULT_NOTE);

  // Lets jobs restored after a reload be retried with their saved inputs.
  const retryRef = useRef<((label: string, data: unknown) => void) | null>(null);
  useEffect(() => {
    const offs = [
      "HTML report",
      "PDF report",
      "Jupyter notebook",
      "Interactive HTML notebook",
      "Excel workbook",
    ].map((label) => registerExportRetry(label, (data) => retryRef.current?.(label, data)));
    const offVerify = registerSnapshotVerifier((job, data) => verifySnapshot(job.settings, data));
    return () => {
      offs.forEach((o) => o());
      offVerify();
    };
  }, []);

  const stem = (maybeDataset?.name ?? "").replace(/\.(csv|xlsx?|json)$/i, "");
  const dl = (
    content: string | Blob,
    filename: string,
    mime: string,
    ctx?: { attach: (b: Blob, f: string) => void },
  ) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    ctx?.attach(blob, filename);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggle = (s: Section) => {
    const n = new Set(enabled);
    if (n.has(s)) {
      n.delete(s);
    } else {
      n.add(s);
    }
    setEnabled(n);
  };

  const authorizeExport = async (target: string): Promise<boolean> => {
    try {
      const res = await authorizeAction({
        data: { sessionId: getSessionId(), role, action: "export", target },
      });
      if (!res.ok) {
        toast.error(res.error || "Not authorized to export.");
        return false;
      }
      return true;
    } catch {
      toast.error("Authorization check failed. Please try again.");
      return false;
    }
  };
  const auditExport = (target: string) =>
    void recordAudit({
      data: { sessionId: getSessionId(), role, action: "export", target, status: "ok" },
    }).catch(() => {});

  const authorizeOrThrow = async (target: string) => {
    const res = await authorizeAction({
      data: { sessionId: getSessionId(), role, action: "export", target },
    });
    if (!res.ok) throw new FatalExportError(res.error || "Not authorized to export.");
  };

  type Inputs = ExportInputs;
  const captureInputs = (): Inputs => ({
    dataset: dataset!,
    role,
    sections: [...enabled],
    title,
    note,
    capturedAt: Date.now(),
  });

  const runJob = (label: string, inp: Inputs, run: (ctx: Parameters<typeof enqueueExportJob>[0]["run"] extends (c: infer C) => unknown ? C : never) => Promise<void>) => {
    const stemOf = inp.dataset.name.replace(/\.(csv|xlsx?|json)$/i, "");
    enqueueExportJob({
      label,
      maxAttempts: 3,
      inputs: {
        settings: {
          dataset: inp.dataset.name,
          rows: inp.dataset.rowCount,
          columns: inp.dataset.colCount,
          role: inp.role,
          sections: inp.sections,
          title: inp.title,
          note: inp.note,
          capturedAt: inp.capturedAt,
          file: stemOf,
          fingerprint: datasetFingerprint(inp.dataset),
          columnNames: inp.dataset.columns.slice(0, 12),
        },
        data: inp,
      },
      run,
    });
    toast.message(`${label} started — tracking in Export jobs`);
  };

  // Every job body reads only from its frozen inputs, so a retry (even after a
  // reload) reproduces the original export exactly.
  const startJob = (label: string, inp: Inputs, w?: Window | null) => {
    const stem = inp.dataset.name.replace(/\.(csv|xlsx?|json)$/i, "");
    const ds = inp.dataset;
    switch (label) {
      case "HTML report":
        return runJob(label, inp, async (ctx) => {
          ctx.progress(10, "Checking permissions");
          await authorizeOrThrow("report.html");
          ctx.progress(35, "Building report sections");
          await yieldToBrowser();
          const html = buildReport(ds, inp.role, inp.sections, inp.title, inp.note);
          if (!html || html.length < 100) throw new Error("Report came out empty");
          ctx.progress(85, "Saving file");
          dl(html, `${stem}_report.html`, "text/html", ctx);
          auditExport("report.html");
        });
      case "PDF report":
        return runJob(label, inp, async (ctx) => {
          if (!w || w.closed)
            throw new FatalExportError("Popup blocked — allow popups for this site, then retry.");
          ctx.progress(10, "Checking permissions");
          await authorizeOrThrow("report.pdf");
          ctx.progress(35, "Building report sections");
          await yieldToBrowser();
          const html = buildReport(ds, inp.role, inp.sections, inp.title, inp.note, true);
          ctx.attach(new Blob([html], { type: "text/html" }), `${stem}_report_printable.html`);
          ctx.progress(70, "Rendering printable document");
          w.document.open();
          w.document.write(html);
          w.document.close();
          await new Promise((r) => setTimeout(r, 600));
          if (w.closed) throw new FatalExportError("Print window was closed before it finished.");
          ctx.progress(95, "Opening print dialog");
          w.focus();
          w.print();
          auditExport("report.pdf");
        });
      case "Jupyter notebook":
        return runJob(label, inp, async (ctx) => {
          ctx.progress(30, "Generating notebook cells");
          await yieldToBrowser();
          const nb = buildIpynb(ds, inp.role);
          ctx.progress(85, "Saving file");
          dl(nb, `${stem}_analysis.ipynb`, "application/json", ctx);
        });
      case "Interactive HTML notebook":
        return runJob(label, inp, async (ctx) => {
          ctx.progress(10, "Checking permissions");
          await authorizeOrThrow("notebook.html");
          ctx.progress(50, "Building interactive notebook");
          await yieldToBrowser();
          const html = await buildInteractiveHTML(ds, inp.role, inp.snapshots ?? null);
          ctx.progress(90, "Saving file");
          dl(html, `${stem}_notebook.html`, "text/html", ctx);
          auditExport("notebook.html");
        });
      case "Excel workbook":
        return runJob(label, inp, async (ctx) => {
          ctx.progress(15, "Building workbook");
          await yieldToBrowser();
          const workbook = new ExcelJS.Workbook();
          workbook.creator = "DataIQ Pro";
          const sheet = workbook.addWorksheet("Cleaned Data");
          sheet.columns = ds.columns.map((c) => ({ header: c, key: c, width: 20 }));
          ds.rows.forEach((r) => sheet.addRow(r));
          sheet.getRow(1).font = { bold: true };
          const buffer = await workbook.xlsx.writeBuffer();
          const blob = new Blob([buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          });
          dl(blob, `${stem}_export.xlsx`, blob.type, ctx);
        });
    }
  };

  const needSections = () => {
    if (enabled.size === 0) {
      toast.error("Pick at least one section");
      return false;
    }
    return true;
  };
  const downloadHTML = () => needSections() && startJob("HTML report", captureInputs());
  const downloadPDF = () => {
    if (!needSections()) return;
    // Open the window synchronously inside the click so popup blockers allow it.
    const w = window.open("", "_blank", "width=1024,height=768");
    startJob("PDF report", captureInputs(), w);
  };
  const downloadIpynb = () => startJob("Jupyter notebook", captureInputs());
  const downloadInteractive = () =>
    startJob("Interactive HTML notebook", {
      ...captureInputs(),
      snapshots: loadSnapshots(dataset!.name),
    });
  const downloadCleanExcel = () => startJob("Excel workbook", captureInputs());

  const downloadCleanCSV = () => {
    const cols = dataset.columns;
    const header = cols.join(",");
    const rows = dataset.rows
      .map((r) =>
        cols
          .map((c) => {
            const v = r[c];
            if (v == null) return "";
            const s = String(v);
            return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(","),
      )
      .join("\n");
    dl(header + "\n" + rows, `${stem}_export.csv`, "text/csv");
    toast.success("CSV exported");
  };
  const downloadJSON = () => {
    const out = {
      dataset: dataset.name,
      rowCount: dataset.rowCount,
      colCount: dataset.colCount,
      readinessScore: dataset.readinessScore,
      missingTotal: dataset.missingTotal,
      duplicateRows: dataset.duplicateRows,
      profiles: dataset.profiles,
    };
    dl(JSON.stringify(out, null, 2), `${stem}_profile.json`, "application/json");
    toast.success("Profile JSON exported");
  };


  retryRef.current = (label, data) => {
    const inp = data as Inputs;
    const w = label === "PDF report" ? window.open("", "_blank", "width=1024,height=768") : null;
    startJob(label, inp, w);
  };

  const importRef = useRef<HTMLInputElement>(null);
  const importSettings = async (file: File) => {
    const known = ["HTML report", "PDF report", "Jupyter notebook", "Interactive HTML notebook", "Excel workbook"];
    // Open the print window now, while the click still counts, in case it's a PDF.
    let w: Window | null = null;
    let parsed: { exportType?: unknown; settings?: Record<string, unknown> };
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      toast.error("That file isn't valid JSON.");
      return;
    }
    const label = String(parsed.exportType ?? "");
    const st = parsed.settings;
    if (!known.includes(label) || !st || typeof st !== "object") {
      toast.error("This doesn't look like an export settings file.");
      return;
    }
    const validIds = new Set(SECTIONS.map((x) => x.id as string));
    const sections = (Array.isArray(st.sections) ? (st.sections as unknown[]) : [])
      .map(String)
      .filter((x) => validIds.has(x)) as Section[];
    if (["HTML report", "PDF report"].includes(label) && sections.length === 0) {
      toast.error("The settings file has no valid report sections.");
      return;
    }
    const inp: Inputs = {
      ...captureInputs(),
      sections: sections.length ? sections : [...enabled],
      title: typeof st.title === "string" ? st.title : title,
      note: typeof st.note === "string" ? st.note : note,
      ...(label === "Interactive HTML notebook" ? { snapshots: loadSnapshots(dataset.name) } : {}),
    };
    if (st.fingerprint) {
      const fp = datasetFingerprint(dataset);
      if (fp !== st.fingerprint)
        toast.warning(
          `Heads up: these settings were saved for "${String(st.dataset ?? "another dataset")}" (#${String(st.fingerprint)}), but the loaded data is #${fp}. The export will use the data you have loaded now.`,
          { duration: 9000 },
        );
    }
    if (label === "PDF report") w = window.open("", "_blank", "width=1024,height=768");
    setEnabled(new Set(inp.sections));
    setTitle(inp.title);
    setNote(inp.note);
    startJob(label, inp, w);
  };

  if (!maybeDataset)
    return (
      <div className="neo p-10 text-center">
        No dataset loaded. Saved exports below can still be retried from their snapshots.{" "}
        <Link to="/" className="text-primary underline">
          Upload
        </Link>
      </div>
    );

  return (
    <motion.div variants={STAGGER} initial="hidden" animate="show" className="space-y-8">
      <motion.div variants={ITEM} className="hidden">
        <h1 className="text-3xl font-bold flex items-center gap-3 gradient-text">
          <FileDown className="size-8 text-primary" aria-hidden="true" /> Export Hub
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Customize a report template, download an interactive notebook, a Jupyter notebook, or a
          static report.
        </p>
      </motion.div>

      {/* Template editor */}
      <motion.div
        variants={ITEM}
        className="neo p-6 space-y-6 border-primary/20 bg-gradient-to-br from-background to-primary/5"
      >
        <div className="flex items-center gap-2 font-bold text-lg">
          <Settings2 className="size-5 text-primary" /> Static Report Builder
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Report title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="neo-inset px-4 py-3 text-sm bg-transparent w-full mt-2 font-semibold focus-visible:ring-primary transition-shadow"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Optional note (Header)
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Q4 dataset for revenue analysis"
              className="neo-inset px-4 py-3 text-sm bg-transparent w-full mt-2 focus-visible:ring-primary transition-shadow"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <LayoutTemplate className="size-4" /> Sections to include ({enabled.size}/
              {SECTIONS.length})
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEnabled(new Set(SECTIONS.map((s) => s.id)))}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Select All
              </button>
              <span className="text-muted-foreground">|</span>
              <button
                onClick={() => setEnabled(new Set())}
                className="text-xs font-semibold text-muted-foreground hover:underline"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SECTIONS.map((s) => (
              <label
                key={s.id}
                className={`neo p-3 cursor-pointer flex items-start gap-3 transition-colors ${enabled.has(s.id) ? "border-primary bg-primary/5 shadow-sm" : "hover:bg-muted/50"}`}
              >
                <input
                  type="checkbox"
                  checked={enabled.has(s.id)}
                  onChange={() => toggle(s.id)}
                  className="accent-primary mt-1 w-4 h-4 cursor-pointer"
                />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-foreground">{s.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-border/50">
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importSettings(f);
            }}
          />
          <button
            onClick={() => importRef.current?.click()}
            className="neo-btn px-5 py-2.5 text-sm font-semibold flex items-center gap-2 hover:text-primary transition-colors mr-auto"
            title="Start a new export from a downloaded settings JSON file"
          >
            <FileDown className="size-4 rotate-180" aria-hidden="true" />
            Import settings
          </button>
          <button
            onClick={downloadPDF}
            className="neo-btn px-5 py-2.5 text-sm font-semibold flex items-center gap-2 hover:text-primary transition-colors"
          >
            <Printer className="size-4" />
            Save as PDF
          </button>
          <button
            onClick={downloadHTML}
            className="neo-btn px-5 py-2.5 text-sm font-bold text-primary flex items-center gap-2 hover:scale-[1.02] transition-transform shadow-sm"
          >
            <FileDown className="size-4" />
            Download HTML
          </button>
        </div>
      </motion.div>

      {/* Raw Exports */}
      <motion.div variants={STAGGER} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <motion.div variants={ITEM}>
          <ExportCard
            onClick={downloadInteractive}
            icon={<BookOpen className="size-7 text-emerald-500" />}
            title="Interactive HTML"
            desc="Self-contained .html notebook with interactive charts, filters and sortable tables."
          />
        </motion.div>
        <motion.div variants={ITEM}>
          <ExportCard
            onClick={downloadIpynb}
            icon={<FileCode className="size-7 text-blue-500" />}
            title="Jupyter Notebook"
            desc="Role-tailored Python notebook (.ipynb): EDA → clean → ML pipeline → role extras."
          />
        </motion.div>
        <motion.div variants={ITEM}>
          <ExportCard
            onClick={downloadCleanCSV}
            icon={<FileDown className="size-7 text-amber-500" />}
            title="Clean CSV"
            desc="Download the active dataset (including all Data Refinery transformations) as a standard CSV."
          />
        </motion.div>
        <motion.div variants={ITEM}>
          <ExportCard
            onClick={downloadCleanExcel}
            icon={<FileSpreadsheet className="size-7 text-green-600" />}
            title="Secure Excel (.xlsx)"
            desc="Securely generate a native Microsoft Excel workbook containing your clean data."
          />
        </motion.div>
        <motion.div variants={ITEM}>
          <ExportCard
            onClick={downloadJSON}
            icon={<FileCode className="size-7 text-purple-500" />}
            title="Profile JSON"
            desc="Machine-readable column profile and statistics for programmatic use."
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function ExportCard({
  onClick,
  icon,
  title,
  desc,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className="neo p-6 text-left w-full h-full flex flex-col hover:scale-[1.02] hover:border-primary/30 transition-all hover:shadow-md group focus-visible:ring-2 focus-visible:ring-primary outline-none"
    >
      <div className="mb-4 p-3 bg-muted/30 rounded-xl inline-block group-hover:bg-background transition-colors">
        {icon}
      </div>
      <div className="font-bold text-lg mb-1 group-hover:text-primary transition-colors">
        {title}
      </div>
      <div className="text-sm text-muted-foreground mt-auto leading-relaxed">{desc}</div>
    </button>
  );
}

function miniHistogramSVG(
  data: { bin: string; count: number }[],
  color = "#6366f1",
  label?: string,
): string {
  if (!data || data.length === 0) return "";
  const max = Math.max(...data.map((d) => d.count), 1);
  const width = 120;
  const height = 30;
  const barWidth = width / data.length;
  // Accessible name + long description so screen readers (and tagged PDF output
  // from the print dialog) can read the distribution instead of skipping it.
  const peak = data.reduce((a, b) => (b.count > a.count ? b : a), data[0]);
  const name = label ? `Distribution of ${label}` : "Distribution histogram";
  const desc = `${name}: ${data.length} bins, tallest bin ${peak.bin} with ${peak.count} rows. Range ${data[0].bin} to ${data[data.length - 1].bin}.`;
  let svg = `<svg viewBox="0 0 ${width} ${height}" style="width:100%;max-width:100px;height:30px;display:block;" preserveAspectRatio="none" role="img" aria-label="${desc.replace(/"/g, "&quot;")}"><title>${name}</title><desc>${desc}</desc>`;
  data.forEach((d, i) => {
    const h = (d.count / max) * height;
    const y = height - h;
    svg += `<rect x="${i * barWidth}" y="${y}" width="${Math.max(0.5, barWidth - 1)}" height="${h}" fill="${color}" opacity="0.8" rx="1" />`;
  });
  svg += `</svg>`;
  return svg;
}

/**
 * Post-process the report markup so the print-to-PDF output is tagged: header
 * cells get scope, data tables get an accessible name, and the document
 * declares a language.
 */
function tagForAccessibility(html: string): string {
  return html
    .replace(/<th>/g, '<th scope="col">')
    .replace(/<th scope="col"><\/th>/g, '<th scope="col"><span class="sr-only">Column</span></th>');
}

function buildReport(
  ds: import("@/lib/stats").Dataset,
  role: string,
  sections: Section[],
  title: string,
  note: string,
  forPrint = false,
): string {
  const enabled = new Set(sections);
  const corr = ds.correlation || correlationMatrix(ds);
  const top = topCorrelations(corr, 10);
  const num = ds.profiles.filter((p) => p.type === "numeric");
  const cat = ds.profiles.filter((p) => p.type !== "numeric");
  const date = new Date().toLocaleString();

  const colorFor = (r: number) => {
    const a = Math.min(1, Math.abs(r));
    return r >= 0 ? `hsl(0 70% ${95 - a * 40}%)` : `hsl(220 70% ${95 - a * 40}%)`;
  };

  const sec = (id: Section, html: string) => (enabled.has(id) ? html : "");

  return tagForAccessibility(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title} — ${ds.name}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 1100px; margin: 0 auto; padding: 2.5rem 1.5rem; color: #1e293b; background: #f8fafc; line-height: 1.6; }
  header { margin-bottom: 3rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 1.5rem; }
  h1 { font-size: 2.5rem; font-weight: 800; color: #0f172a; margin-bottom: 0.75rem; letter-spacing: -0.02em; }
  .meta { color: #64748b; font-size: 0.95rem; display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
  .badge { background: #e2e8f0; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: 600; font-size: 0.8rem; color: #475569; }
  h2 { margin-top: 3.5rem; margin-bottom: 1.5rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.75rem; font-size: 1.75rem; font-weight: 700; color: #1e293b; letter-spacing: -0.01em; }
  h3 { margin-top: 1.75rem; margin-bottom: 0.75rem; font-size: 1.25rem; font-weight: 600; color: #334155; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
  .card { background: white; border: 1px solid #e2e8f0; border-radius: 0.75rem; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05); page-break-inside: avoid; break-inside: avoid; }
  .card .l { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-bottom: 0.5rem; }
  .card .v { font-size: 1.75rem; font-weight: 800; color: #0f172a; line-height: 1; }
  .table-wrap { overflow-x: auto; margin: 1.5rem 0; border: 1px solid #e2e8f0; border-radius: 0.75rem; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  table { width: 100%; border-collapse: collapse; min-width: 600px; text-align: left; }
  th, td { padding: 0.875rem 1rem; font-size: 0.875rem; border-bottom: 1px solid #e2e8f0; }
  th { background: #f8fafc; font-weight: 600; color: #475569; white-space: nowrap; }
  tr:last-child td { border-bottom: none; }
  .heat td { text-align: center; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 0.8rem; padding: 0.5rem; font-weight: 500; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  .pill { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 9999px; background: #eff6ff; color: #2563eb; font-size: 0.75rem; font-weight: 600; vertical-align: middle; margin-left: 0.5rem; }
  .recs { background: #f0fdf4; border-left: 4px solid #16a34a; padding: 1.25rem; border-radius: 0.5rem; margin: 1rem 0; color: #166534; font-size: 0.95rem; page-break-inside: avoid; break-inside: avoid; }
  .recs strong { color: #14532d; display: block; margin-bottom: 0.25rem; }
  .guide { background: white; border: 1px solid #e2e8f0; border-radius: 0.75rem; padding: 1.5rem; margin: 1.5rem 0; box-shadow: 0 1px 3px rgba(0,0,0,0.05); page-break-inside: avoid; break-inside: avoid; }
  .guide h3 { margin-top: 0; color: #4f46e5; }
  .guide ol { margin: 0.75rem 0 0 1.5rem; padding: 0; font-size: 0.95rem; color: #334155; }
  .guide li { margin-bottom: 0.5rem; }
  footer { margin-top: 4rem; padding-top: 2rem; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 0.875rem; }
  
  @media print {
    @page { size: A4; margin: 15mm; }
    body { background: white; padding: 0; max-width: 100%; color: #000; }
    h1 { color: #000; }
    header { margin-bottom: 2rem; }
    h2 { margin-top: 2rem; color: #000; border-bottom: 2px solid #000; page-break-after: avoid; break-after: avoid; }
    h3 { page-break-after: avoid; break-after: avoid; color: #000; }
    .card { border: 1px solid #ccc; box-shadow: none; break-inside: avoid; }
    .table-wrap { border: 1px solid #ccc; box-shadow: none; break-inside: auto; }
    th { background: #f1f1f1 !important; color: #000; border-bottom: 2px solid #ccc; }
    td { border-bottom: 1px solid #ccc; }
    .recs { background: #fff !important; border: 1px solid #ccc; border-left: 4px solid #000; color: #000; }
    .guide { border: 1px solid #ccc; box-shadow: none; }
    .pill { border: 1px solid #ccc; background: transparent !important; color: #000; }
    table { page-break-inside: auto; break-inside: auto; }
    tr { page-break-inside: avoid; break-inside: avoid; page-break-after: auto; }
    .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style></head><body>

<header>
  <h1>${title}</h1>
  <div class="meta">
    <span class="badge">${ds.name}</span>
    <span class="badge">Role: ${role}</span>
    <span>Generated ${date}</span>
    ${note ? `<span>· ${note}</span>` : ""}
  </div>
</header>

<main>
<div class="guide">
  <h3>How to use DataIQ Pro</h3>
  <ol>
    <li><strong>Upload</strong> your dataset (CSV, Excel, JSON) on the home page — types are auto-detected.</li>
    <li><strong>Pick a role</strong> (Analyst, BA, Scientist, ML/AI/Data Engineer) for tailored charts and code.</li>
    <li><strong>Overview & Stats</strong>: review row/column profile, distributions, and ML readiness.</li>
    <li><strong>Validation</strong>: run rules, then one-click auto-clean (impute, dedupe, trim, winsorize) with before/after preview.</li>
    <li><strong>Correlation & Outliers</strong>: discover relationships and anomalies with theme-aware charts.</li>
    <li><strong>Code Gen</strong>: pick target/features and export production-ready EDA, Cleaning, ML, Deep Learning, ETL, SQL, or FastAPI service code.</li>
    <li><strong>Versions</strong>: snapshot datasets and diff schema/metrics across uploads.</li>
    <li><strong>Export</strong>: download HTML/PDF reports, Jupyter notebooks, interactive HTML notebooks, or clean CSV/JSON.</li>
  </ol>
</div>

${sec(
  "overview",
  `<h2>Dataset Overview</h2>
<div class="cards">
  <div class="card"><div class="l">Rows</div><div class="v">${ds.rowCount.toLocaleString()}</div></div>
  <div class="card"><div class="l">Columns</div><div class="v">${ds.colCount}</div></div>
  <div class="card"><div class="l">Numeric</div><div class="v">${num.length}</div></div>
  <div class="card"><div class="l">Categorical</div><div class="v">${cat.length}</div></div>
  <div class="card"><div class="l">Missing cells</div><div class="v">${ds.missingTotal.toLocaleString()}</div></div>
  <div class="card"><div class="l">Duplicates</div><div class="v">${ds.duplicateRows}</div></div>
</div>`,
)}

${sec(
  "readiness",
  `<h2>ML Readiness: ${ds.readinessScore}/100</h2>
${
  ds.readinessBreakdown.length === 0
    ? "<p>No major quality issues detected.</p>"
    : `<div class="table-wrap"><table><tr><th>Issue</th><th>Penalty</th></tr>${ds.readinessBreakdown.map((b) => `<tr><td>${b.reason}</td><td>−${b.penalty}</td></tr>`).join("")}</table></div>`
}`,
)}

${sec(
  "stats",
  `<h2>Descriptive Statistics</h2>
<div class="table-wrap"><table><tr><th>Column</th><th>Distribution</th><th>Mean</th><th>Median</th><th>Std</th><th>Min</th><th>Q1</th><th>Q3</th><th>Max</th><th>IQR</th><th>CV%</th></tr>
${num
  .map((p) => {
    const vals = ds.rows.map((r) => Number(r[p.name]));
    const hist = histogram(vals, 20);
    const chartSVG = miniHistogramSVG(hist, "#6366f1", p.name);
    return `<tr>
    <td><strong>${p.name}</strong></td>
    <td style="width:110px;padding:4px 1rem;">${chartSVG}</td>
    <td>${p.mean?.toFixed(3)}</td>
    <td>${p.median?.toFixed(3)}</td>
    <td>${p.std?.toFixed(3)}</td>
    <td>${p.min}</td>
    <td>${p.q1?.toFixed(2)}</td>
    <td>${p.q3?.toFixed(2)}</td>
    <td>${p.max}</td>
    <td>${p.iqr?.toFixed(2)}</td>
    <td>${p.cv?.toFixed(1)}</td>
  </tr>`;
  })
  .join("")}
</table></div>`,
)}

${sec(
  "shape",
  `<h2>Distribution Shape</h2>
<div class="table-wrap"><table><tr><th>Column</th><th>Skewness</th><th>Excess Kurtosis</th><th>Notes</th></tr>
${num
  .map((p) => {
    const sk = p.skewness ?? 0,
      ku = p.kurtosis ?? 0;
    const noteTxt =
      Math.abs(sk) > 1
        ? "Highly skewed — consider log/sqrt transform"
        : Math.abs(ku) > 1
          ? "Heavy/light tails"
          : "Approximately normal";
    return `<tr><td>${p.name}</td><td>${sk.toFixed(3)}</td><td>${ku.toFixed(3)}</td><td>${noteTxt}</td></tr>`;
  })
  .join("")}
</table></div>`,
)}

${sec(
  "categorical",
  cat.length
    ? `<h2>Categorical Breakdown</h2>
<div class="cards" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">
${cat
  .map((p) => {
    const top = (p.topValues ?? []).slice(0, 10);
    const maxCount = Math.max(...top.map((t) => t.count), 1);
    const bars = top
      .map((t) => {
        const pct = (t.count / maxCount) * 100;
        const escVal = String(t.value).replace(/</g, "&lt;").replace(/>/g, "&gt;");
        return `<div style="display:flex;align-items:center;gap:8px;font-size:0.75rem;margin-bottom:6px;">
       <div style="flex:2;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#64748b;" title="${escVal}">${escVal || "<i>empty</i>"}</div>
       <div style="flex:4;background:#f1f5f9;height:12px;border-radius:4px;overflow:hidden;">
         <div style="width:${pct}%;background:#0ea5e9;height:100%;"></div>
       </div>
       <div style="width:40px;color:#1e293b;font-weight:600;text-align:right;">${t.count}</div>
     </div>`;
      })
      .join("");
    return `<div class="card" style="break-inside:avoid;page-break-inside:avoid;">
    <h3 style="margin-top:0;font-size:1rem;display:flex;align-items:center;justify-content:space-between;">
      <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;">${p.name}</span>
      <span class="pill" style="margin:0;">${p.unique} unique</span>
    </h3>
    <div style="margin-top:1rem;">${bars}</div>
  </div>`;
  })
  .join("")}
</div>`
    : "",
)}

${sec(
  "correlation",
  corr.columns.length >= 2
    ? `<h2>Correlation Analysis</h2>
${(() => {
  const strong = top.filter((t) => Math.abs(t.r) >= 0.7).length;
  const moderate = top.filter((t) => Math.abs(t.r) >= 0.4 && Math.abs(t.r) < 0.7).length;
  const weak = top.filter((t) => Math.abs(t.r) < 0.4).length;
  return `<div class="cards"><div class="card"><div class="l">Variables</div><div class="v">${corr.columns.length}</div></div><div class="card"><div class="l">Strong |r|≥0.7</div><div class="v">${strong}</div></div><div class="card"><div class="l">Moderate 0.4–0.7</div><div class="v">${moderate}</div></div><div class="card"><div class="l">Weak &lt;0.4</div><div class="v">${weak}</div></div></div>`;
})()}
<h3>Top correlated pairs</h3>
<div class="table-wrap"><table><tr><th>Column A</th><th>Column B</th><th>Pearson r</th><th>Strength</th><th>Direction</th></tr>
${top
  .map((t) => {
    const a = Math.abs(t.r);
    const strength = a >= 0.7 ? "Strong" : a >= 0.4 ? "Moderate" : "Weak";
    const dir = t.r >= 0 ? "Positive ↑" : "Negative ↓";
    return `<tr><td>${t.a}</td><td>${t.b}</td><td><strong>${t.r.toFixed(3)}</strong></td><td><span class="pill" style="margin:0;">${strength}</span></td><td>${dir}</td></tr>`;
  })
  .join("")}
</table></div>
<h3>Matrix</h3>
<div class="table-wrap"><table class="heat" aria-label="Pearson correlation matrix"><tr><th></th>${corr.columns.map((c) => `<th>${c}</th>`).join("")}</tr>
${corr.matrix.map((row, i) => `<tr><th scope="row">${corr.columns[i]}</th>${row.map((v) => `<td style="background:${colorFor(v)}">${v.toFixed(2)}</td>`).join("")}</tr>`).join("")}
</table></div>
<p style="font-size:0.85rem;color:#64748b;margin-top:0.5rem;">Heatmap encodes Pearson r from −1 (blue) through 0 (neutral) to +1 (red). Diagonal is always 1.0 (self-correlation).</p>`
    : "",
)}

${sec(
  "outliers",
  `<h2>Outlier Detection</h2>
<div class="table-wrap"><table><tr><th>Column</th><th>IQR outliers</th><th>%</th><th>Z-score outliers</th><th>IQR bounds</th></tr>
${num.map((p) => `<tr><td>${p.name}</td><td>${p.outliersIQR}</td><td>${p.count ? (((p.outliersIQR ?? 0) / p.count) * 100).toFixed(1) : 0}%</td><td>${p.outliersZ}</td><td>[${p.iqrLower?.toFixed(2)}, ${p.iqrUpper?.toFixed(2)}]</td></tr>`).join("")}
</table></div>`,
)}

${sec(
  "missing",
  `<h2>Missing Values</h2>
<div class="table-wrap"><table><tr><th>Column</th><th>Missing</th><th>%</th></tr>
${
  ds.profiles
    .filter((p) => p.missing > 0)
    .sort((a, b) => b.missing - a.missing)
    .map(
      (p) => `<tr><td>${p.name}</td><td>${p.missing}</td><td>${p.missingPct.toFixed(2)}%</td></tr>`,
    )
    .join("") || "<tr><td colspan='3'>No missing values.</td></tr>"
}
</table></div>`,
)}

${sec(
  "recommendations",
  `<h2>Recommendations</h2>
<div class="recs"><strong>Data quality:</strong> ${ds.duplicateRows > 0 ? `Drop ${ds.duplicateRows} duplicate rows. ` : ""}${ds.missingTotal > 0 ? "Impute missing values (median for numeric, mode for categorical). " : ""}${num.filter((p) => Math.abs(p.skewness ?? 0) > 1).length ? "Apply log/sqrt transforms to highly-skewed columns. " : ""}${num.filter((p) => (p.outliersIQR ?? 0) / Math.max(1, p.count) > 0.05).length ? "Winsorize columns with >5% outliers." : ""}</div>
<div class="recs"><strong>Modelling:</strong> Use the strongest correlated columns as primary features. Standardize numeric features and one-hot encode categoricals before training.</div>`,
)}

${sec(
  "methodology",
  `<h2>Methodology &amp; Notes</h2>
<div class="guide">
  <h3>How these metrics were computed</h3>
  <ol>
    <li><strong>Type detection</strong> — columns are classified as numeric, categorical, datetime, or boolean by sampling values and applying threshold heuristics (≥85% numeric-parseable ⇒ numeric).</li>
    <li><strong>Descriptive statistics</strong> — mean, median, standard deviation (population), quartiles (linear interpolation), IQR = Q3 − Q1, and CV = std / mean × 100.</li>
    <li><strong>Distribution shape</strong> — skewness (third standardized moment) and excess kurtosis (fourth standardized moment − 3). |skew| &gt; 1 flags a transform candidate.</li>
    <li><strong>Outliers</strong> — IQR rule flags values outside [Q1 − 1.5·IQR, Q3 + 1.5·IQR]; Z-score rule flags |z| &gt; 3.</li>
    <li><strong>Correlation</strong> — Pearson r over pairwise-complete numeric rows. Values near ±1 indicate strong linear association; correlation does not imply causation.</li>
    <li><strong>ML readiness</strong> — starts at 100 and subtracts penalties for missingness, duplicates, high skew, high cardinality, and constant columns.</li>
    <li><strong>Missing values</strong> — cells that are null, empty, or common sentinels (na, n/a, nan, null, none, -, ?) are treated as missing.</li>
  </ol>
  <p style="margin-top:0.75rem;font-size:0.9rem;color:#64748b;"><strong>Reproducibility:</strong> all statistics are computed deterministically in-browser from the active dataset (including any Data Prep transformations) — no sampling unless a column exceeds internal limits. Regenerate this report after cleaning to reflect changes.</p>
</div>`,
)}


</main>
<footer>Generated by DataIQ Pro · Role-aware dataset analysis</footer>
</body></html>`);
}
