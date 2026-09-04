import { createFileRoute, Link } from "@tanstack/react-router";
import { useDataset } from "@/store/dataset-context";
import { CanvasScatter } from "@/components/analysis/canvas-scatter";
import type { Dataset } from "@/lib/stats";
import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { ComponentErrorBoundary } from "@/components/ui/component-error-boundary";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  ReferenceLine,
  LabelList,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ComposedChart,
  Brush,
  FunnelChart,
  Funnel,
} from "recharts";
import type { TooltipProps } from "recharts";
import {
  LayoutDashboard,
  Wand2,
  Plus,
  Settings2,
  Trash2,
  Download,
  Filter,
  Palette,
  Bot,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Camera,
  X,
  SlidersHorizontal,
  TrendingUp,
  TrendingDown,
  Minus,
  Maximize2,
  RotateCcw,
  LayoutTemplate,
  Save,
  FileText,
  Image as ImageIcon,
  Table2,
  Check,
  Copy,
  FileSpreadsheet,
  FileCode,
  Code,
  Layers,
  Sliders,
} from "lucide-react";
import {
  THEMES,
  tooltipStyle,
  resolvePalette,
  seriesColorAt,
  dimmedColor,
  gradientStops,
  gradientId,
} from "@/lib/chart-theme";
import html2canvas from "html2canvas";
import { toast } from "sonner";
import { authorizeAction, recordAudit } from "@/lib/audit.functions";
import { getSessionId } from "@/lib/session";
import { formatValue, NUMBER_FORMAT_OPTIONS } from "@/lib/number-format";
import { downloadCSV } from "@/lib/csv";
import {
  applyPdfDocumentTags,
  addPdfBookmark,
  addInvisibleAltText,
  appendAltTextAppendix,
  describeFilterContext,
  type VisualAltText,
} from "@/lib/pdf-a11y";

import { DrillThrough, type DrillSpec } from "@/components/dashboard/drill-through";
import {
  builtinTemplates,
  listUserTemplates,
  saveUserTemplate,
  deleteUserTemplate,
  instantiate,
  type DashboardTemplate,
} from "@/lib/dashboard-templates";
import {
  timeBucket,
  saveLayout,
  loadLayout,
  saveSnapshots,
  type Widget,
  type ChartType,
  type ChartSnapshot,
} from "@/lib/dashboard-store";

export const Route = createFileRoute("/charts")({
  head: () => ({
    meta: [
      { title: "BI Report Canvas — DataIQ Pro" },
      {
        name: "description",
        content:
          "Power BI style report canvas with slicers, KPI cards, cross-filtering and export-ready visuals.",
      },
      { property: "og:title", content: "BI Report Canvas — DataIQ Pro" },
      {
        property: "og:description",
        content: "Build interactive dashboards with slicers, KPI cards and cross-filtering.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

const CustomSelect = ({
  value,
  options,
  onChange,
  placeholder,
  icon: Icon,
  compact,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder: string;
  icon?: React.ElementType;
  compact?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div className={`relative ${open ? "z-50" : "z-10"}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full bg-background/60 hover:bg-background transition-colors ${compact ? "px-2.5 py-1" : "px-3 py-1.5"} rounded-xl border border-border text-sm font-medium shadow-sm flex items-center justify-between gap-2 cursor-pointer min-w-0`}
      >
        <span className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="w-3.5 h-3.5 text-primary shrink-0" />}
          <span className={`truncate ${selected ? "text-foreground" : "text-muted-foreground"}`}>
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute top-full left-0 right-0 mt-1.5 p-1.5 rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl z-50 flex flex-col gap-0.5 max-h-[280px] overflow-y-auto min-w-[160px]"
            >
              {options.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors truncate ${value === opt.value ? "bg-primary/15 text-primary" : "hover:bg-muted text-muted-foreground hover:text-foreground"}`}
                >
                  {opt.label}
                </div>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const fmtCompact = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/* ------------------------------------------------------------------ */
/* Report page                                                         */
/* ------------------------------------------------------------------ */

type Slicers = Record<string, string[]>;

function DashboardPage() {
  const { dataset, role, hydrated } = useDataset();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [theme, setTheme] = useState("Default");
  const [slicers, setSlicers] = useState<Slicers>({});
  const [crossFilter, setCrossFilter] = useState<{ col: string; val: string } | null>(null);
  const [slicerOpen, setSlicerOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [drill, setDrill] = useState<DrillSpec | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [userTemplates, setUserTemplates] = useState<DashboardTemplate[]>([]);
  const restoredFor = useRef<string | null>(null);
  const seriesRef = useRef<
    Map<string, { series: { x: string; y: number }[]; caption: string; title: string }>
  >(new Map());

  const catCols = useMemo(
    () =>
      dataset?.profiles.filter(
        (p) => (p.type === "categorical" || p.type === "boolean") && p.unique <= 200,
      ) ?? [],
    [dataset],
  );

  const autoGenerate = useCallback(() => {
    if (!dataset) return;
    const newWidgets: Widget[] = [];
    // Prefer real measures over identifier-like numeric columns.
    const isIdLike = (n: string) => /(^|_)id$|^id|index|_no$|zip|code/i.test(n);
    const allNums = dataset.profiles.filter((p) => p.type === "numeric");
    const numCols =
      allNums.filter((p) => !isIdLike(p.name)).length > 0
        ? allNums.filter((p) => !isIdLike(p.name))
        : allNums;
    const catColsData = dataset.profiles.filter(
      (p) => p.type === "categorical" || p.type === "boolean",
    );
    const dateCols = dataset.profiles.filter((p) => p.type === "datetime");
    const id = () => Math.random().toString(36).slice(2);

    newWidgets.push({ id: id(), type: "kpi", xAxis: "Total Rows", yAxis: "", compactNumber: true });
    if (numCols[0])
      newWidgets.push({
        id: id(),
        type: "kpi",
        xAxis: "Sum",
        yAxis: numCols[0].name,
        compactNumber: true,
      });
    if (numCols[1] ?? numCols[0])
      newWidgets.push({
        id: id(),
        type: "kpi",
        xAxis: "Average",
        yAxis: (numCols[1] ?? numCols[0]).name,
        decimals: true,
      });
    newWidgets.push({
      id: id(),
      type: "kpi",
      xAxis: "Missing Values",
      yAxis: "",
      compactNumber: true,
    });

    if (dateCols.length > 0 && numCols.length > 0) {
      newWidgets.push({
        id: id(),
        type: "area",
        xAxis: dateCols[0].name,
        yAxis: numCols[0].name,
        timeGroup: "month",
        aggregation: "sum",
        size: "wide",
      });
    }
    if (catColsData.length > 0 && numCols.length > 0) {
      const lowCat = catColsData.find((c) => c.unique > 1 && c.unique <= 8) || catColsData[0];
      newWidgets.push({
        id: id(),
        type: "donut",
        xAxis: lowCat.name,
        yAxis: numCols[numCols.length - 1].name,
        showLegend: true,
        size: "small",
      });
    }
    if (catColsData.length > 0 && numCols.length > 0) {
      const highCat = catColsData.find((c) => c.unique > 8) || catColsData[catColsData.length - 1];
      newWidgets.push({
        id: id(),
        type: "h-bar",
        xAxis: highCat.name,
        yAxis: numCols[0].name,
        limit: 10,
        aggregation: "sum",
        size: "standard",
      });
    }
    if (numCols.length >= 2) {
      newWidgets.push({
        id: id(),
        type: "scatter",
        xAxis: numCols[0].name,
        yAxis: numCols[1].name,
        size: "standard",
      });
    }
    newWidgets.push({ id: id(), type: "summary", xAxis: "", yAxis: "" });

    if (newWidgets.length <= 5 && dataset.columns.length >= 2) {
      newWidgets.push({
        id: id(),
        type: "bar",
        xAxis: dataset.columns[0],
        yAxis: dataset.columns[1],
        size: "standard",
      });
    }
    setWidgets(newWidgets);
    saveLayout({ widgets: newWidgets, theme, datasetName: dataset.name });
    toast.success(`AI generated ${newWidgets.length} optimized visuals based on schema.`);
  }, [dataset, theme]);

  // Restore a saved layout for this dataset; otherwise auto-generate one.
  useEffect(() => {
    if (!dataset || restoredFor.current === dataset.name) return;
    restoredFor.current = dataset.name;
    const saved = loadLayout(dataset.name);
    if (saved && saved.widgets.length > 0) {
      const validWidgets = saved.widgets.filter((w) => {
        if (w.type === "kpi" || w.type === "summary") return true;
        if (!w.xAxis || !w.yAxis) return false;
        return dataset.columns.includes(w.xAxis) && dataset.columns.includes(w.yAxis);
      });
      if (validWidgets.length > 0) {
        setWidgets(validWidgets);
        if (saved.theme && THEMES[saved.theme]) setTheme(saved.theme);
      } else {
        autoGenerate();
      }
    } else {
      autoGenerate();
    }
  }, [dataset, autoGenerate]);

  useEffect(() => {
    if (!dataset || widgets.length === 0) return;
    saveLayout({ widgets, theme, datasetName: dataset.name });
  }, [widgets, theme, dataset]);

  /** Server-side capability check, cached per action for this page visit. */
  const authCache = useRef<Map<string, boolean>>(new Map());
  const authorize = async (action: "dashboard_create" | "dashboard_export", target: string) => {
    const cached = authCache.current.get(action);
    if (cached !== undefined) {
      if (!cached) toast.error("Your role is not authorized for this dashboard action.");
      return cached;
    }
    try {
      const res = await authorizeAction({
        data: { sessionId: getSessionId(), role, action, target },
      });
      authCache.current.set(action, res.ok);
      if (!res.ok) toast.error(res.error || "Not authorized.");
      return res.ok;
    } catch (e) {
      console.warn("Server RPC offline or unconfigured, proceeding with client preference:", e);
      authCache.current.set(action, true);
      return true;
    }
  };

  /** Slicer values + click-to-cross-filter, applied together like a Power BI page filter. */
  const filteredDataset = useMemo(() => {
    if (!dataset) return null;
    const active = Object.entries(slicers).filter(([, vals]) => vals.length > 0);
    if (active.length === 0 && !crossFilter) return dataset;
    const rows = dataset.rows.filter((r) => {
      for (const [col, vals] of active) if (!vals.includes(String(r[col]))) return false;
      if (crossFilter && String(r[crossFilter.col]) !== crossFilter.val) return false;
      return true;
    });
    return { ...dataset, rows, rowCount: rows.length };
  }, [dataset, slicers, crossFilter]);

  const activeFilterCount =
    Object.values(slicers).reduce((n, v) => n + v.length, 0) + (crossFilter ? 1 : 0);
  /** Canonical filter labels shared by the ribbon, drill-through and exports. */
  const activeFilterLabels = useMemo(() => {
    const labels = Object.entries(slicers).flatMap(([col, vals]) =>
      vals.map((v) => `${col}: ${v}`),
    );
    if (crossFilter) labels.push(`${crossFilter.col}: ${crossFilter.val}`);
    return labels;
  }, [slicers, crossFilter]);

  const toggleSlicer = (col: string, val: string) => {
    setSlicers((s) => {
      const cur = s[col] ?? [];
      const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
      return { ...s, [col]: next };
    });
  };

  const clearFilters = () => {
    setSlicers({});
    setCrossFilter(null);
  };

  const addWidget = async () => {
    if (!dataset) return;
    if (!(await authorize("dashboard_create", "widget:chart"))) return;
    const x = dataset.columns[0];
    const y = dataset.profiles.find((p) => p.type === "numeric")?.name || dataset.columns[1] || x;
    setWidgets((w) => [
      ...w,
      {
        id: Math.random().toString(36).slice(2),
        type: "bar",
        xAxis: x,
        yAxis: y,
        size: "standard",
      },
    ]);
  };

  const addKpiWidget = async () => {
    if (!dataset) return;
    if (!(await authorize("dashboard_create", "widget:kpi"))) return;
    setWidgets((w) => [
      ...w,
      { id: Math.random().toString(36).slice(2), type: "kpi", xAxis: "Total Rows", yAxis: "" },
    ]);
  };

  const removeWidget = (id: string) => {
    setWidgets((w) => w.filter((x) => x.id !== id));
    seriesRef.current.delete(id);
  };

  const updateWidget = (id: string, updates: Partial<Widget>) => {
    setWidgets((w) => w.map((x) => (x.id === id ? { ...x, ...updates } : x)));
  };

  /** Move a widget within its own group (KPI / chart) keeping order stable. */
  const moveWidget = (id: string, dir: -1 | 1) => {
    setWidgets((prev) => {
      const groupOf = (w: Widget) => (w.type === "kpi" ? 0 : 1);
      const target = prev.find((w) => w.id === id);
      if (!target) return prev;
      const g = groupOf(target);
      const indices = prev
        .map((w, i) => ({ w, i }))
        .filter(({ w }) => groupOf(w) === g)
        .map(({ i }) => i);
      const pos = indices.indexOf(prev.indexOf(target));
      const swapWith = indices[pos + dir];
      if (swapWith === undefined) return prev;
      const next = [...prev];
      const a = indices[pos];
      [next[a], next[swapWith]] = [next[swapWith], next[a]];
      return next;
    });
  };

  const reportSeries = useCallback(
    (
      id: string,
      payload: { series: { x: string; y: number }[]; caption: string; title: string },
    ) => {
      seriesRef.current.set(id, payload);
    },
    [],
  );

  const exportDashboard = async () => {
    if (!dataset) {
      toast.error("No dataset loaded.");
      return;
    }
    if (!(await authorize("dashboard_export", "dashboard.png"))) return;
    const el = document.getElementById("dashboard-content");
    if (!el) {
      toast.error("Dashboard canvas not found.");
      return;
    }
    const tid = toast.loading("Capturing high-resolution PNG dashboard...");
    try {
      const bg = window.getComputedStyle(document.body).backgroundColor || "#09090b";
      const canvas = await html2canvas(el, {
        backgroundColor: bg,
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      });
      const link = document.createElement("a");
      link.download = `${dataset?.name ? dataset.name.replace(/\W+/g, "_") : "dataiq"}_dashboard.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("Dashboard PNG downloaded successfully!", { id: tid });
      void recordAudit({
        data: {
          sessionId: getSessionId(),
          role,
          action: "dashboard_export",
          target: "dashboard.png",
          status: "ok",
        },
      }).catch(() => {});
    } catch (e) {
      console.error(e);
      toast.error("PNG export failed. Please retry.", { id: tid });
    }
  };

  const exportLayoutJson = async () => {
    if (!dataset || widgets.length === 0) {
      toast.error("No layout to export.");
      return;
    }
    if (!(await authorize("dashboard_export", "dashboard.json"))) return;
    const data = JSON.stringify(
      { datasetName: dataset.name, theme, widgets, exportedAt: new Date().toISOString() },
      null,
      2,
    );
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${dataset.name.replace(/\W+/g, "_")}_layout.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Dashboard JSON layout downloaded.");
    void recordAudit({
      data: {
        sessionId: getSessionId(),
        role,
        action: "dashboard_export",
        target: "dashboard.json",
        status: "ok",
      },
    }).catch(() => {});
  };

  const captureForReport = async () => {
    if (!dataset) return;
    if (!(await authorize("dashboard_export", "dashboard.snapshots"))) return;
    setCapturing(true);
    const tid = toast.loading("Capturing visuals for notebook report...");
    try {
      const bg = window.getComputedStyle(document.body).backgroundColor || "#09090b";
      const charts: ChartSnapshot[] = [];
      for (const w of widgets) {
        if (w.type === "summary") continue;
        const el = document.getElementById(`widget-${w.id}`);
        if (!el) continue;
        const canvas = await html2canvas(el, {
          backgroundColor: bg,
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
        });
        const meta = seriesRef.current.get(w.id);
        charts.push({
          id: w.id,
          title: meta?.title || w.customTitle || w.type,
          image: canvas.toDataURL("image/png"),
          caption: meta?.caption || "",
          series: meta?.series ?? [],
        });
      }
      if (charts.length === 0) {
        toast.error("Nothing to capture — add a chart or KPI first.", { id: tid });
        return;
      }
      const stored = saveSnapshots({
        datasetName: dataset.name,
        role,
        capturedAt: new Date().toISOString(),
        charts,
      });
      if (!stored) {
        toast.error("Capture too large for browser storage — remove a few widgets and retry.", {
          id: tid,
        });
        return;
      }
      void recordAudit({
        data: {
          sessionId: getSessionId(),
          role,
          action: "dashboard_export",
          target: "dashboard.snapshots",
          status: "ok",
          meta: { charts: charts.length },
        },
      }).catch(() => {});
      toast.success(`${charts.length} chart(s) captured — included in Export → notebook`, {
        id: tid,
      });
    } catch (e) {
      console.error(e);
      toast.error("Capture failed. Please retry.", { id: tid });
    } finally {
      setCapturing(false);
    }
  };

  /** Full-canvas PDF: dashboard image plus the active filter context. */
  const exportPdf = async () => {
    if (!dataset) {
      toast.error("No dataset loaded.");
      return;
    }
    if (!(await authorize("dashboard_export", "dashboard.pdf"))) return;
    const el = document.getElementById("dashboard-content");
    if (!el) {
      toast.error("Dashboard canvas not found.");
      return;
    }
    const tid = toast.loading("Generating landscape PDF report...");
    try {
      const { default: JsPDF } = await import("jspdf");
      const bg = window.getComputedStyle(document.body).backgroundColor || "#ffffff";
      const canvas = await html2canvas(el, {
        backgroundColor: bg,
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      });
      const pdf = new JsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const margin = 28;
      const docTitle = `${dataset.name} — Report Canvas`;
      const filterSentence = describeFilterContext(activeFilterLabels, {
        filteredRows: filteredDataset?.rowCount ?? dataset.rowCount,
        totalRows: dataset.rowCount,
      });
      // Text alternatives for every visual, in canvas order.
      const altVisuals: VisualAltText[] = widgets.map((w) => {
        const meta = seriesRef.current.get(w.id);
        return {
          title: meta?.title || w.customTitle || `${w.type} visual`,
          type: w.type,
          caption: meta?.caption,
          legend: meta?.series?.map((p) => p.x).slice(0, 20),
          series: meta?.series,
        };
      });
      applyPdfDocumentTags(pdf, {
        title: docTitle,
        subject: `Accessible dashboard export of ${dataset.name}. ${filterSentence}`,
        keywords: ["dashboard", dataset.name, ...widgets.map((w) => w.type)].join(", "),
      });
      addPdfBookmark(pdf, "Report canvas", 1);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(15);
      pdf.text(docTitle, margin, 32);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(110);
      pdf.text(
        `${filteredDataset?.rowCount.toLocaleString() ?? 0} of ${dataset.rowCount.toLocaleString()} rows · ${new Date().toLocaleString()}` +
          (activeFilterLabels.length
            ? ` · Filters: ${activeFilterLabels.join("; ").slice(0, 150)}`
            : " · No filters applied"),
        margin,
        46,
      );
      const top = 58;
      const availW = pw - margin * 2;
      const availH = ph - top - margin;
      const ratio = Math.min(availW / canvas.width, availH / canvas.height);
      pdf.addImage(
        canvas.toDataURL("image/png"),
        "PNG",
        margin,
        top,
        canvas.width * ratio,
        canvas.height * ratio,
      );
      // Invisible text layer behind the canvas image: screen readers and text
      // extraction get the filter context and a summary of each visual.
      addInvisibleAltText(
        pdf,
        `${docTitle}. ${filterSentence} This page is an image of the report canvas containing ${altVisuals.length} visual(s): ${altVisuals
          .map((v, i) => `${i + 1}. ${v.title} (${v.type})`)
          .join("; ")}. Full descriptions follow on the accessible text alternatives page.`,
        { x: margin, y: top + 12, maxWidth: availW },
      );
      appendAltTextAppendix(pdf, altVisuals, filterSentence, { margin });
      pdf.save(`${dataset.name.replace(/\W+/g, "_")}_dashboard.pdf`);

      void recordAudit({
        data: {
          sessionId: getSessionId(),
          role,
          action: "dashboard_export",
          target: "dashboard.pdf",
          status: "ok",
        },
      }).catch(() => {});
      toast.success("Dashboard PDF downloaded successfully!", { id: tid });
    } catch (e) {
      console.error(e);
      toast.error("PDF export failed. Please retry.", { id: tid });
    }
  };

  /** Export every visual's aggregated series (respecting active filters) as CSV. */
  const exportDataCsv = async () => {
    if (!dataset) {
      toast.error("No dataset loaded.");
      return;
    }
    if (!(await authorize("dashboard_export", "dashboard.csv"))) return;
    const rows: Record<string, unknown>[] = [];
    const filterNote = activeFilterLabels.join(" | ") || "none";
    for (const w of widgets) {
      const meta = seriesRef.current.get(w.id);
      if (meta && meta.series.length > 0) {
        for (const p of meta.series) {
          rows.push({
            visual: meta.title,
            dimension: w.xAxis,
            category: p.x,
            measure: w.yAxis,
            aggregation: w.aggregation ?? "avg",
            value: p.y,
            filters: filterNote,
          });
        }
      } else if (w.type === "kpi") {
        rows.push({
          visual: w.customTitle || "KPI",
          dimension: w.xAxis,
          category: w.yAxis || "KPI",
          measure: w.yAxis || "",
          aggregation: "kpi",
          value: dataset.rowCount,
          filters: filterNote,
        });
      }
    }
    if (rows.length === 0) {
      toast.error("No aggregated series to export — add a chart first.");
      return;
    }
    downloadCSV(`${dataset.name.replace(/\W+/g, "_")}_dashboard_data`, rows, [
      "visual",
      "dimension",
      "category",
      "measure",
      "aggregation",
      "value",
      "filters",
    ]);
    toast.success("Dashboard data CSV downloaded.");
  };

  /* ---------------- Templates ---------------- */

  const templates = useMemo(
    () => (dataset ? [...builtinTemplates(dataset), ...userTemplates] : []),
    [dataset, userTemplates],
  );

  useEffect(() => {
    if (dataset) setUserTemplates(listUserTemplates(dataset.name));
  }, [dataset]);

  const applyTemplate = async (t: DashboardTemplate) => {
    if (!(await authorize("dashboard_create", `template:${t.name}`))) return;
    setWidgets(instantiate(t));
    if (t.theme && THEMES[t.theme]) setTheme(t.theme);
    setTemplatesOpen(false);
    toast.success(`Applied “${t.name}” — edit any visual to refine it.`);
  };

  const saveTemplate = async () => {
    if (!dataset || widgets.length === 0) {
      toast.error("Add at least one visual before saving a template.");
      return;
    }
    if (!(await authorize("dashboard_create", "template:save"))) return;
    const name = window.prompt("Template name", `${dataset.name} layout`);
    if (!name) return;
    const saved = saveUserTemplate({
      name,
      description: `${widgets.length} visuals · saved from ${dataset.name}`,
      theme,
      datasetName: dataset.name,
      widgets,
    });
    if (!saved) {
      toast.error("Could not save template — browser storage is full.");
      return;
    }
    setUserTemplates(listUserTemplates(dataset.name));
    toast.success("Template saved.");
  };

  const removeTemplate = (id: string) => {
    deleteUserTemplate(id);
    if (dataset) setUserTemplates(listUserTemplates(dataset.name));
  };

  if (!hydrated) {
    return (
      <div className="bento-card mx-auto mt-20 max-w-xl p-10 text-center">
        <div className="font-semibold">Restoring dataset…</div>
        <p className="mt-2 text-sm text-muted-foreground">
          Loading your latest upload from local storage.
        </p>
      </div>
    );
  }
  if (!dataset || !filteredDataset) {
    return (
      <div className="bento-card p-10 text-center mx-auto max-w-xl mt-20">
        No dataset loaded.{" "}
        <Link to="/" className="text-primary font-bold">
          Upload one
        </Link>
      </div>
    );
  }

  const kpiWidgets = widgets.filter((w) => w.type === "kpi");
  const chartWidgets = widgets.filter((w) => w.type !== "kpi");
  const activeColors = THEMES[theme] || THEMES["Default"];
  const focused = focusId ? widgets.find((w) => w.id === focusId) : null;

  const cardProps = (w: Widget) => ({
    widget: w,
    dataset: filteredDataset,
    fullDataset: dataset,
    colors: activeColors,
    crossFilter,
    onCrossFilter: (col: string, val: string) =>
      setCrossFilter((c) => (c && c.col === col && c.val === val ? null : { col, val })),
    onUpdate: (u: Partial<Widget>) => updateWidget(w.id, u),
    onRemove: () => removeWidget(w.id),
    onMove: (d: -1 | 1) => moveWidget(w.id, d),
    onFocus: () => setFocusId(w.id),
    onSeries: reportSeries,
    onDrill: (spec: DrillSpec) => setDrill(spec),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-4"
    >
      {/* ---------------- Ribbon ---------------- */}
      <div className="bento-card sticky top-2 z-40 px-3 sm:px-4 py-3 !overflow-visible">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <LayoutDashboard className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg sm:text-xl font-bold tracking-tight">
                Report Canvas
              </h1>
              <p className="truncate text-xs text-muted-foreground font-medium">
                {dataset.name} · {filteredDataset.rowCount.toLocaleString()} of{" "}
                {dataset.rowCount.toLocaleString()} rows
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            <button
              onClick={() => setSlicerOpen((v) => !v)}
              className={`relative flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-bold transition-colors xl:hidden ${slicerOpen ? "bg-primary/15 text-primary" : "hover:bg-muted"}`}
            >
              <SlidersHorizontal className="size-4" /> Filters
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <div className="w-36 sm:w-44">
              <CustomSelect
                icon={Palette}
                placeholder="Theme"
                value={theme}
                onChange={(t) => {
                  setTheme(t);
                  if (dataset) saveLayout({ widgets, theme: t, datasetName: dataset.name });
                  toast.success(`Theme updated to “${t}”`);
                }}
                options={Object.keys(THEMES).map((t) => ({ value: t, label: t }))}
                compact
              />
            </div>
            <div className="hidden sm:block w-px h-6 bg-border" />
            <div className="flex items-center gap-1.5">
              {/* Templates */}
              <div className="relative">
                <button
                  onClick={() => {
                    setTemplatesOpen((v) => !v);
                    setDownloadOpen(false);
                  }}
                  title="Dashboard templates"
                  className={`flex items-center gap-1.5 rounded-xl border border-border px-2.5 py-2 text-xs font-bold transition-colors ${templatesOpen ? "bg-primary/15 text-primary" : "text-primary hover:bg-muted"}`}
                >
                  <LayoutTemplate className="size-4" />{" "}
                  <span className="hidden lg:inline">Templates</span>
                </button>
                <AnimatePresence>
                  {templatesOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setTemplatesOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute right-0 top-full z-50 mt-2 w-[320px] max-h-[420px] overflow-y-auto rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-2xl"
                      >
                        <div className="px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Apply a template
                        </div>
                        {templates.map((t) => (
                          <div
                            key={t.id}
                            className="group/t flex items-start gap-2 rounded-xl px-2 py-2 hover:bg-muted"
                          >
                            <button
                              onClick={() => applyTemplate(t)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="flex items-center gap-1.5 truncate text-sm font-bold">
                                {t.name}
                                {!t.builtin && (
                                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-primary">
                                    Saved
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                                {t.description}
                              </div>
                            </button>
                            {!t.builtin && (
                              <button
                                onClick={() => removeTemplate(t.id)}
                                aria-label={`Delete ${t.name}`}
                                className="mt-1 rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover/t:opacity-100"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={saveTemplate}
                          className="mt-1 flex w-full items-center gap-2 rounded-xl border border-border px-2.5 py-2 text-xs font-bold text-primary hover:bg-muted"
                        >
                          <Save className="size-3.5" /> Save current layout as template
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Download */}
              <div className="relative">
                <button
                  onClick={() => {
                    setDownloadOpen((v) => !v);
                    setTemplatesOpen(false);
                  }}
                  title="Download dashboard"
                  className={`flex items-center gap-1.5 rounded-xl border border-border px-2.5 py-2 text-xs font-bold transition-colors ${downloadOpen ? "bg-primary/15 text-primary" : "text-primary hover:bg-muted"}`}
                >
                  {capturing ? (
                    <Camera className="size-4 animate-pulse" />
                  ) : (
                    <Download className="size-4" />
                  )}{" "}
                  <span className="hidden lg:inline">{capturing ? "Capturing…" : "Download"}</span>
                </button>
                <AnimatePresence>
                  {downloadOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setDownloadOpen(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute right-0 top-full z-50 mt-2 w-[270px] rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-2xl"
                      >
                        {[
                          {
                            icon: FileText,
                            label: "Dashboard PDF",
                            hint: "Landscape A4 with filter context",
                            run: exportPdf,
                          },
                          {
                            icon: ImageIcon,
                            label: "Dashboard PNG",
                            hint: "Full canvas high-res image",
                            run: exportDashboard,
                          },
                          {
                            icon: Table2,
                            label: "Dashboard data CSV",
                            hint: "All visual series, filters applied",
                            run: exportDataCsv,
                          },
                          {
                            icon: Code,
                            label: "Dashboard JSON layout",
                            hint: "Export layout configuration JSON",
                            run: exportLayoutJson,
                          },
                          {
                            icon: Camera,
                            label: "Capture for report",
                            hint: "Embed visuals in notebook export",
                            run: captureForReport,
                          },
                        ].map((o) => (
                          <button
                            key={o.label}
                            onClick={() => {
                              setDownloadOpen(false);
                              void o.run();
                            }}
                            className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-muted"
                          >
                            <o.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-bold">{o.label}</span>
                              <span className="block text-[11px] text-muted-foreground">
                                {o.hint}
                              </span>
                            </span>
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              <button
                onClick={autoGenerate}
                title="Auto-generate report"
                className="rounded-xl border border-border p-2 text-primary hover:bg-muted"
              >
                <Wand2 className="size-4" />
              </button>
              <button
                onClick={addKpiWidget}
                className="rounded-xl border border-border px-3 py-2 text-xs font-bold flex items-center gap-1.5 text-primary hover:bg-muted"
              >
                <Plus className="size-3.5" /> KPI
              </button>
              <button
                onClick={addWidget}
                className="rounded-xl bg-primary px-3 py-2 text-xs font-bold flex items-center gap-1.5 text-primary-foreground hover:opacity-90"
              >
                <Plus className="size-3.5" /> Visual
              </button>
            </div>
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Filters
            </span>
            {Object.entries(slicers).flatMap(([col, vals]) =>
              vals.map((v) => (
                <button
                  key={`${col}:${v}`}
                  onClick={() => toggleSlicer(col, v)}
                  className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20"
                >
                  <span className="max-w-[160px] truncate">
                    {col}: {v}
                  </span>
                  <X className="size-3" />
                </button>
              )),
            )}
            {crossFilter && (
              <button
                onClick={() => setCrossFilter(null)}
                className="flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground hover:opacity-80"
              >
                <span className="max-w-[160px] truncate">Selected · {crossFilter.val}</span>
                <X className="size-3" />
              </button>
            )}
            <button
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3" /> Reset
            </button>
          </div>
        )}
      </div>

      {/* ---------------- Canvas ---------------- */}
      <div className="flex gap-4 items-start">
        {/* Slicer rail */}
        <aside
          className={`${slicerOpen ? "block" : "hidden"} xl:block w-full xl:w-64 shrink-0 fixed xl:static inset-x-3 top-24 z-30 xl:z-auto max-h-[70vh] xl:max-h-none overflow-y-auto bento-card p-4 space-y-4`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
              <Filter className="size-3.5" /> Slicers
            </div>
            <button
              className="xl:hidden text-muted-foreground hover:text-foreground"
              onClick={() => setSlicerOpen(false)}
              aria-label="Close filters"
            >
              <X className="size-4" />
            </button>
          </div>
          {catCols.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No categorical columns available to slice.
            </p>
          )}
          {catCols.slice(0, 6).map((c) => (
            <SlicerBlock
              key={c.name}
              column={c.name}
              dataset={dataset}
              scopeDataset={filteredDataset}
              selected={slicers[c.name] ?? []}
              onToggle={(v) => toggleSlicer(c.name, v)}
            />
          ))}
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-[11px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="size-3" /> Clear all filters
            </button>
          )}
        </aside>

        {/* Visuals */}
        <div
          id="dashboard-content"
          className="relative flex-1 min-w-0 rounded-3xl p-3 sm:p-5 overflow-hidden"
        >
          <div className="animated-mesh-bg" />
          <div className="relative z-10 space-y-4">
            {/* Canvas header — travels with PNG/PDF exports */}
            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border/60 pb-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-black tracking-tight sm:text-lg">
                  {dataset.name}
                </h2>
                <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                  {filteredDataset.rowCount.toLocaleString()} of {dataset.rowCount.toLocaleString()}{" "}
                  rows ·{" "}
                  {activeFilterLabels.length
                    ? activeFilterLabels.join(" · ")
                    : "No filters applied"}
                </p>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {new Date().toLocaleDateString()} · {theme}
              </p>
            </div>

            {kpiWidgets.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
                <AnimatePresence mode="popLayout">
                  {kpiWidgets.map((w) => (
                    <WidgetErrorBoundary key={w.id} onRemove={() => removeWidget(w.id)}>
                      <WidgetCard {...cardProps(w)} />
                    </WidgetErrorBoundary>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {chartWidgets.length > 0 && (
              <div className="grid grid-cols-12 gap-3 sm:gap-4 auto-rows-min">
                <AnimatePresence mode="popLayout">
                  {chartWidgets.map((w) => (
                    <WidgetErrorBoundary key={w.id} onRemove={() => removeWidget(w.id)}>
                      <WidgetCard {...cardProps(w)} />
                    </WidgetErrorBoundary>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {widgets.length === 0 && (
              <div className="bento-card p-12 text-center text-muted-foreground flex flex-col items-center">
                <LayoutDashboard className="size-16 mb-4 opacity-20" />
                <p className="text-lg font-medium text-foreground">Your report canvas is empty.</p>
                <p className="text-sm mt-1 opacity-70">
                  Click the wand to auto-generate an intelligent report.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---------------- Focus mode ---------------- */}
      <AnimatePresence>
        {focused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm p-4 sm:p-10 flex items-center justify-center"
            onClick={() => setFocusId(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-6xl h-[80vh]"
            >
              <WidgetCard {...cardProps(focused)} focusMode onFocus={() => setFocusId(null)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------- Drill-through ---------------- */}
      <AnimatePresence>
        {drill && (
          <DrillThrough
            spec={drill}
            dataset={filteredDataset}
            activeFilters={activeFilterLabels}
            onClose={() => setDrill(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Slicer                                                              */
/* ------------------------------------------------------------------ */

function SlicerBlock({
  column,
  dataset,
  scopeDataset,
  selected,
  onToggle,
}: {
  column: string;
  dataset: Dataset;
  scopeDataset: Dataset;
  selected: string[];
  onToggle: (v: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [q, setQ] = useState("");

  // Full-domain values keep the list stable; in-scope counts reflect every other
  // active slicer / cross-filter so the rail stays in sync with the visuals.
  const values = useMemo(() => {
    const total = new Map<string, number>();
    for (const r of dataset.rows) {
      const v = String(r[column] ?? "");
      if (!v || v === "undefined" || v === "null") continue;
      total.set(v, (total.get(v) ?? 0) + 1);
    }
    const scope = new Map<string, number>();
    for (const r of scopeDataset.rows) {
      const v = String(r[column] ?? "");
      if (!v) continue;
      scope.set(v, (scope.get(v) ?? 0) + 1);
    }
    return [...total.entries()]
      .map(([v, n]) => ({ v, n, inScope: scope.get(v) ?? 0 }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 60);
  }, [dataset, scopeDataset, column]);

  const shown = q
    ? values.filter((d) => d.v.toLowerCase().includes(q.toLowerCase()))
    : values.slice(0, 25);
  const max = values[0]?.n ?? 1;

  return (
    <div className="rounded-2xl border border-border bg-background/40 p-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-bold">{column}</span>
          {selected.length > 0 && (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-black text-primary">
              {selected.length}
            </span>
          )}
        </span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <>
          {values.length > 12 && (
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search values…"
              aria-label={`Search ${column} values`}
              className="mt-2 w-full rounded-lg border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-primary"
            />
          )}
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
            {shown.map(({ v, n, inScope }) => {
              const on = selected.includes(v);
              const dim = inScope === 0 && !on;
              return (
                <button
                  key={v}
                  onClick={() => onToggle(v)}
                  title={`${v} — ${inScope.toLocaleString()} of ${n.toLocaleString()} rows in scope`}
                  className={`relative flex w-full items-center justify-between gap-2 overflow-hidden rounded-lg px-2 py-1 text-left text-[11px] font-medium transition-colors ${on ? "text-primary" : dim ? "text-muted-foreground/40" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-lg bg-primary/[0.07]"
                    style={{ width: `${(n / max) * 100}%` }}
                  />
                  <span
                    className={`absolute inset-y-0 left-0 rounded-lg ${on ? "bg-primary/25" : "bg-primary/15"}`}
                    style={{ width: `${(inScope / max) * 100}%` }}
                  />
                  <span className="relative truncate">{v}</span>
                  <span className="relative shrink-0 tabular-nums opacity-70">
                    {fmtCompact(inScope)}
                  </span>
                </button>
              );
            })}
            {shown.length === 0 && (
              <p className="text-[11px] text-muted-foreground">No matching values.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Widget Error Boundary                                              */
/* ------------------------------------------------------------------ */

class WidgetErrorBoundary extends React.Component<
  { children: React.ReactNode; onRemove?: () => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; onRemove?: () => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Widget render error caught by boundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bento-card p-6 flex flex-col items-center justify-center text-center space-y-3 col-span-12 lg:col-span-6 h-[220px]">
          <div className="text-destructive font-bold text-sm">Visual Render Warning</div>
          <p className="text-xs text-muted-foreground max-w-sm">
            {this.state.error?.message ||
              "Could not render this widget with current dataset configuration."}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-3 py-1 rounded-lg border border-border text-xs font-semibold hover:bg-muted"
            >
              Retry
            </button>
            {this.props.onRemove && (
              <button
                onClick={this.props.onRemove}
                className="px-3 py-1 rounded-lg bg-destructive/15 text-destructive text-xs font-semibold hover:bg-destructive/25"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ------------------------------------------------------------------ */
/* Widget                                                              */
/* ------------------------------------------------------------------ */

const truncateLabel = (value: string, maxChars: number) =>
  value.length > maxChars ? `${value.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…` : value;

const wrapLabel = (value: string, maxChars: number, maxLines = 2) => {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars) line = next;
    else if (line) {
      lines.push(line);
      line = word;
    } else {
      lines.push(truncateLabel(word, maxChars));
      line = "";
    }
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && value.length > lines.join(" ").length)
    lines[maxLines - 1] = truncateLabel(lines[maxLines - 1], Math.max(1, maxChars - 1));
  return lines.length ? lines : ["—"];
};

function WrappedAxisTick({ x, y, payload, maxChars = 14 }: { x?: number; y?: number; payload?: { value?: unknown }; maxChars?: number }) {
  const label = String(payload?.value ?? "");
  const lines = wrapLabel(label, maxChars);
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <title>{label}</title>
      <text textAnchor="middle" fill="var(--muted-foreground)" fontSize={10}>
        {lines.map((line, index) => <tspan key={index} x="0" dy={index === 0 ? 0 : 12}>{line}</tspan>)}
      </text>
    </g>
  );
}

type ChartTooltipPayload = NonNullable<TooltipProps<number, string>["payload"]>[number];
function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  categoryName,
}: TooltipProps<number, string> & { formatValue: (value: number) => string; categoryName: string }) {
  if (!active || !payload?.length) return null;
  const category = String(label ?? payload[0]?.payload?.x ?? "");
  return (
    <div className="min-w-[150px] max-w-[260px] space-y-2 rounded-xl border border-border/70 bg-popover/95 p-2.5 text-popover-foreground shadow-xl backdrop-blur-xl">
      <div className="truncate border-b border-border/60 pb-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {categoryName}: <span className="text-foreground">{category}</span>
      </div>
      <div className="space-y-1">
        {payload.map((entry: ChartTooltipPayload, index) => {
          const value = typeof entry.value === "number" ? entry.value : Number(entry.value);
          if (!Number.isFinite(value)) return null;
          return (
            <div key={`${String(entry.dataKey)}-${index}`} className="flex items-center justify-between gap-4 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="size-2 shrink-0 rounded-full" style={{ background: entry.color || "var(--primary)" }} />
                <span className="truncate">{String(entry.name || entry.dataKey || "Value")}</span>
              </span>
              <strong className="shrink-0 tabular-nums">{formatValue(value)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const WidgetCard = ({
  widget,
  dataset,
  fullDataset,
  colors,
  onUpdate,
  onRemove,
  onMove,
  onSeries,
  onCrossFilter,
  crossFilter,
  onFocus,
  onDrill,
  focusMode,
}: {
  widget: Widget;
  dataset: Dataset;
  fullDataset: Dataset;
  colors: string[];
  crossFilter: { col: string; val: string } | null;
  onCrossFilter: (col: string, val: string) => void;
  onUpdate: (u: Partial<Widget>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onFocus: () => void;
  onDrill: (spec: DrillSpec) => void;
  onSeries: (
    id: string,
    payload: { series: { x: string; y: number }[]; caption: string; title: string },
  ) => void;
  focusMode?: boolean;
}) => {
  const [editing, setEditing] = useState(false);
  const [hoveredSeries, setHoveredSeries] = useState<string | null>(null);
  const numCols = dataset.profiles.filter((p) => p.type === "numeric");
  const xType = dataset.profiles.find((p) => p.name === widget.xAxis)?.type;
  const isDateX = xType === "datetime";
  const palette = resolvePalette(widget.palette) ?? colors;
  const gradId = gradientId(widget.id);

  const chartData = useMemo(() => {
    if (!dataset || !widget.xAxis || !widget.yAxis) return [];
    if (widget.type === "kpi" || widget.type === "summary") return [];

    if (widget.type === "scatter") {
      return dataset.rows
        .slice(0, 1000)
        .map((r: Record<string, unknown>) => ({
          x: Number(r[widget.xAxis]),
          y: Number(r[widget.yAxis]),
          name: String(r[widget.xAxis]),
        }))
        .filter((r) => !isNaN(r.x) && !isNaN(r.y));
    }

    const group = widget.timeGroup ?? "none";
    const map = new Map<string, { sum: number; count: number; values: number[] }>();
    for (const r of dataset.rows) {
      const rawX = String(r[widget.xAxis] ?? "Unknown");
      const xVal = (group === "none" ? rawX : timeBucket(rawX, group)).substring(0, 30);
      const yVal = Number(r[widget.yAxis]);
      if (!isNaN(yVal)) {
        const entry = map.get(xVal) ?? { sum: 0, count: 0, values: [] };
        entry.sum += yVal;
        entry.count += 1;
        entry.values.push(yVal);
        map.set(xVal, entry);
      }
    }

    const aggregated = Array.from(map.entries()).map(([x, { sum, count, values }]) => {
      let yVal = 0;
      const agg = widget.aggregation ?? "avg";
      if (agg === "sum") yVal = Number(sum.toFixed(2));
      else if (agg === "count") yVal = count;
      else if (agg === "avg") yVal = Number((sum / count).toFixed(2));
      else if (agg === "min") {
        let min = values[0] ?? 0;
        for (let i = 1; i < values.length; i++) {
          if (values[i] < min) min = values[i];
        }
        yVal = Number(min.toFixed(2));
      } else if (agg === "max") {
        let max = values[0] ?? 0;
        for (let i = 1; i < values.length; i++) {
          if (values[i] > max) max = values[i];
        }
        yVal = Number(max.toFixed(2));
      } else if (agg === "median") {
        const s = [...values].sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        yVal = Number((s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2).toFixed(2));
      } else if (agg === "std") {
        const mean = sum / count;
        const sqDiffs = values.map((v) => Math.pow(v - mean, 2));
        const avgSqDiff = sqDiffs.reduce((a, b) => a + b, 0) / count;
        yVal = Number(Math.sqrt(avgSqDiff).toFixed(2));
      }

      const s = [...values].sort((a, b) => a - b);
      const minVal = s[0] ?? 0;
      const maxVal = s[s.length - 1] ?? 0;
      const q1Val = s[Math.floor(s.length * 0.25)] ?? minVal;
      const medVal = s[Math.floor(s.length * 0.5)] ?? minVal;
      const q3Val = s[Math.floor(s.length * 0.75)] ?? maxVal;

      return {
        x,
        y: yVal,
        min: minVal,
        q1: q1Val,
        median: medVal,
        q3: q3Val,
        max: maxVal,
        y2: Number((yVal * 1.05).toFixed(2)),
      };
    });

    const isTimeSeries =
      widget.type === "line" || widget.type === "area" || xType === "datetime" || group !== "none";
    const chronoSort = (a: { x: string }, b: { x: string }) => {
      const ta = Date.parse(a.x);
      const tb = Date.parse(b.x);
      if (!isNaN(ta) && !isNaN(tb)) return ta - tb;
      return a.x.localeCompare(b.x, undefined, { numeric: true });
    };

    if (widget.sortBy === "asc") aggregated.sort((a, b) => a.y - b.y);
    else if (widget.sortBy === "desc") aggregated.sort((a, b) => b.y - a.y);
    else if (widget.sortBy === "az")
      aggregated.sort(
        isTimeSeries ? chronoSort : (a, b) => a.x.localeCompare(b.x, undefined, { numeric: true }),
      );
    else if (isTimeSeries) aggregated.sort(chronoSort);
    else aggregated.sort((a, b) => b.y - a.y);

    return aggregated.slice(0, widget.limit || 40);
  }, [
    dataset,
    widget.xAxis,
    widget.yAxis,
    widget.type,
    widget.sortBy,
    widget.limit,
    widget.aggregation,
    widget.timeGroup,
    xType,
  ]);

  /* ---------- Breakdown pivot: multi-series (stacked / grouped) ---------- */
  const breakdownCol =
    widget.breakdownBy && dataset.columns.includes(widget.breakdownBy) ? widget.breakdownBy : null;

  const { seriesKeys, plotData } = useMemo<{
    seriesKeys: string[];
    plotData: Record<string, unknown>[];
  }>(() => {
    const supports = ["bar", "h-bar", "line", "area", "composed"].includes(widget.type);
    if (!breakdownCol || !supports || chartData.length === 0)
      return { seriesKeys: [], plotData: chartData as Record<string, unknown>[] };

    const group = widget.timeGroup ?? "none";
    const agg = widget.aggregation ?? "avg";
    const known = new Set(chartData.map((d) => (d as { x: string }).x));
    const cells = new Map<string, { sum: number; count: number; values: number[] }>();
    const totals = new Map<string, number>();

    for (const r of dataset.rows) {
      const rawX = String(r[widget.xAxis] ?? "Unknown");
      const xVal = (group === "none" ? rawX : timeBucket(rawX, group)).substring(0, 30);
      if (!known.has(xVal)) continue;
      const yVal = Number(r[widget.yAxis]);
      if (isNaN(yVal)) continue;
      const key = String(r[breakdownCol] ?? "Unknown").substring(0, 24);
      const cellKey = `${xVal}\u0000${key}`;
      const entry = cells.get(cellKey) ?? { sum: 0, count: 0, values: [] };
      entry.sum += yVal;
      entry.count += 1;
      entry.values.push(yVal);
      cells.set(cellKey, entry);
      totals.set(key, (totals.get(key) ?? 0) + Math.abs(yVal));
    }

    const reduce = ({ sum, count, values }: { sum: number; count: number; values: number[] }) => {
      if (agg === "sum") return Number(sum.toFixed(2));
      if (agg === "count") return count;
      if (agg === "min") return Number(Math.min(...values).toFixed(2));
      if (agg === "max") return Number(Math.max(...values).toFixed(2));
      if (agg === "median") {
        const s = [...values].sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        return Number((s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2).toFixed(2));
      }
      if (agg === "std") {
        const mean = sum / count;
        return Number(
          Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / count).toFixed(2),
        );
      }
      return Number((sum / count).toFixed(2));
    };

    const ranked = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
    const keys = ranked.slice(0, 8);
    const rest = new Set(ranked.slice(8));
    if (rest.size > 0) keys.push("Other");

    const data = chartData.map((d) => {
      const row: Record<string, unknown> = { ...(d as Record<string, unknown>) };
      const x = (d as { x: string }).x;
      let other = 0;
      for (const [cellKey, entry] of cells) {
        const [cx, key] = cellKey.split("\u0000");
        if (cx !== x) continue;
        if (rest.has(key)) other += reduce(entry);
        else row[key] = reduce(entry);
      }
      if (rest.size > 0) row["Other"] = Number(other.toFixed(2));
      return row;
    });

    if (widget.stackMode === "percent") {
      for (const row of data) {
        const total = keys.reduce((a, k) => a + (Number(row[k]) || 0), 0);
        if (total > 0)
          for (const k of keys) row[k] = Number((((Number(row[k]) || 0) / total) * 100).toFixed(2));
      }
    }

    return { seriesKeys: keys, plotData: data };
  }, [
    chartData,
    dataset,
    breakdownCol,
    widget.type,
    widget.xAxis,
    widget.yAxis,
    widget.aggregation,
    widget.timeGroup,
    widget.stackMode,
  ]);

  const stackId = widget.stackMode === "grouped" ? undefined : "stack";
  const seriesOpacity = (key: string) =>
    hoveredSeries && hoveredSeries !== key ? 0.25 : 1;


  /* --------------------- KPI ---------------------- */

  const kpi = useMemo(() => {
    const metricOf = (rows: Record<string, unknown>[]) => {
      const nums = () => rows.map((r) => Number(r[widget.yAxis])).filter((n) => !isNaN(n));
      switch (widget.xAxis) {
        case "Total Rows":
          return rows.length;
        case "Missing Values": {
          let m = 0;
          for (const r of rows)
            for (const c of dataset.columns) {
              const v = r[c];
              if (v === null || v === undefined || v === "") m++;
            }
          return m;
        }
        case "Average": {
          const v = nums();
          return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
        }
        case "Sum":
          return nums().reduce((a, b) => a + b, 0);
        case "Min": {
          const v = nums();
          return v.length ? Math.min(...v) : 0;
        }
        case "Max": {
          const v = nums();
          return v.length ? Math.max(...v) : 0;
        }
        default:
          return 0;
      }
    };
    const rows = dataset.rows;
    const value = metricOf(rows);
    const half = Math.floor(rows.length / 2);
    const prev = half > 0 ? metricOf(rows.slice(0, half)) : 0;
    const curr = half > 0 ? metricOf(rows.slice(half)) : value;
    const delta = prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : 0;
    // Sparkline across the row stream, bucketed into 20 slices.
    const buckets = 20;
    const spark: { i: number; v: number }[] = [];
    if (rows.length > buckets) {
      const size = Math.floor(rows.length / buckets);
      for (let i = 0; i < buckets; i++)
        spark.push({ i, v: metricOf(rows.slice(i * size, (i + 1) * size)) });
    }
    return { value, delta, spark };
  }, [dataset, widget.xAxis, widget.yAxis]);

  const renderSummary = () => {
    const topCat = dataset.profiles.find((p) => p.type === "categorical");
    const topNum = dataset.profiles.find((p) => p.type === "numeric");
    return (
      <div className="flex h-full flex-col justify-center p-5 text-sm relative">
        <div className="absolute top-0 right-0 p-6 opacity-[0.03]">
          <Bot className="size-28" />
        </div>
        <div className="mb-2 flex items-center gap-2 text-base font-bold tracking-tight text-primary">
          <Bot className="size-5" /> Smart narrative
        </div>
        <p className="relative z-10 leading-relaxed text-foreground/80">
          This page reflects{" "}
          <strong className="text-foreground">{dataset.rowCount.toLocaleString()}</strong> records
          {fullDataset.rowCount !== dataset.rowCount && (
            <> (filtered from {fullDataset.rowCount.toLocaleString()})</>
          )}
          .{topNum && ` The primary measure detected is '${topNum.name}'.`}
          {topCat && ` The main dimension is '${topCat.name}'.`}
          {dataset.rowCount === 0 && " No records match the current filters."} Use slicers on the
          left, or click any bar or slice to cross-filter the whole page.
        </p>
      </div>
    );
  };

  const renderKPI = () => {
    let kpiTitle = widget.xAxis;
    if (["Average", "Sum", "Min", "Max"].includes(widget.xAxis) && widget.yAxis)
      kpiTitle = `${widget.xAxis} of ${widget.yAxis}`;
    const displayTitle = widget.customTitle || kpiTitle;

    const formattedVal = fmtVal(kpi.value);

    const accent = colors[(widget.themeColor ?? 0) % colors.length];
    const up = kpi.delta > 0.5,
      down = kpi.delta < -0.5;
    const DeltaIcon = up ? TrendingUp : down ? TrendingDown : Minus;

    return (
      <button
        type="button"
        onClick={() => drillInto()}
        title="Show underlying rows"
        className="flex h-full w-full flex-col justify-between gap-2 p-4 text-left transition-colors hover:bg-muted/30"
      >
        <div className="flex w-full items-start justify-between gap-2">
          <span className="truncate text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {displayTitle}
          </span>
          <span className="size-2 shrink-0 rounded-full" style={{ background: accent }} />
        </div>
        <div className="min-w-0 w-full">
          <div
            className="truncate text-3xl sm:text-4xl font-black tracking-tighter tabular-nums"
            style={{ color: accent }}
          >
            {formattedVal}
          </div>

          <div
            className={`mt-1 flex items-center gap-1 text-[11px] font-bold ${up ? "text-emerald-500" : down ? "text-rose-500" : "text-muted-foreground"}`}
          >
            <DeltaIcon className="size-3.5" />
            {Math.abs(kpi.delta).toFixed(1)}%{" "}
            <span className="font-medium text-muted-foreground">vs first half</span>
          </div>
        </div>
        {kpi.spark.length > 1 && (
          <div className="h-8 -mx-1 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={kpi.spark} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`spark-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={accent}
                  strokeWidth={1.5}
                  fill={`url(#spark-${widget.id})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </button>
    );
  };

  /* --------------------- Charts ---------------------- */

  const axisTick = { fontSize: 10, fill: "var(--muted-foreground)" } as const;
  const gridProps = {
    strokeDasharray: "3 3",
    stroke: "var(--border)",
    opacity: widget.hideGrid ? 0 : 0.55,
  } as const;
  const cursorFill = { fill: "color-mix(in srgb, var(--foreground) 6%, transparent)" };

  /** Widget-scoped value formatter used for axes, labels and tooltips. */
  const fmtVal = (v: number) =>
    formatValue(v, {
      // Legacy compact/decimal toggles map onto the new format model.
      format: widget.numberFormat ?? (widget.compactNumber ? "compact" : "auto"),
      decimals: widget.decimalPlaces ?? (widget.decimals ? 2 : undefined),
      prefix: widget.prefix,
      suffix: widget.suffix,
    });

  // legendPosition wins when set; otherwise fall back to the legacy flag.
  const legendPos: NonNullable<Widget["legendPosition"]> =
    widget.legendPosition ??
    (widget.showLegend ||
    (widget.showLegend !== false && (widget.type === "pie" || widget.type === "donut"))
      ? "bottom"
      : "none");
  const showLegend = legendPos !== "none";
  const legendProps =
    legendPos === "right"
      ? {
          align: "right" as const,
          verticalAlign: "middle" as const,
          layout: "vertical" as const,
          iconType: "circle" as const,
          iconSize: 8,
          wrapperStyle: { fontSize: 11, paddingLeft: 8 },
        }
      : {
          verticalAlign: legendPos === "top" ? ("top" as const) : ("bottom" as const),
          height: 28,
          iconType: "circle" as const,
          iconSize: 8,
          wrapperStyle: { fontSize: 11 },
        };

  // Value-axis scaling + manual bounds (blank = auto).
  const yAxisScale = widget.yScale === "log" ? ("log" as const) : ("linear" as const);
  const yDomain: [number | "auto", number | "auto"] = [
    widget.yMin ?? (yAxisScale === "log" ? "auto" : "auto"),
    widget.yMax ?? "auto",
  ];
  const valueAxisProps = {
    tick: axisTick,
    tickMargin: 6,
    axisLine: false as const,
    tickLine: false as const,
    tickFormatter: fmtVal,
    scale: yAxisScale,
    domain: yDomain,
    allowDataOverflow: widget.yMin !== undefined || widget.yMax !== undefined,
  };

  const drillInto = (value?: string) =>
    onDrill({
      title,
      column: value !== undefined ? widget.xAxis : undefined,
      value,
      measure: widget.yAxis,
      caption,
    });

  // Recharts passes shape props on bar clicks (where `x` is a pixel offset), so
  // always read the category from the bound data payload. Alt/⌘-click drills
  // through to the underlying rows instead of cross-filtering the page.
  const barClick = (
    entry: unknown,
    _index?: number,
    ev?: { altKey?: boolean; metaKey?: boolean },
  ) => {
    const e = entry as { x?: unknown; payload?: { x?: unknown } } | null;
    const raw = e?.payload?.x ?? (typeof e?.x === "string" ? e.x : undefined);
    if (raw === undefined || raw === null || !widget.xAxis) return;
    if (ev?.altKey || ev?.metaKey) drillInto(String(raw));
    else onCrossFilter(widget.xAxis, String(raw));
  };

  const selectedX = crossFilter && crossFilter.col === widget.xAxis ? crossFilter.val : null;
  const colorFor = (i: number, x: string, base: string) =>
    selectedX && selectedX !== x
      ? "color-mix(in srgb, var(--muted-foreground) 40%, transparent)"
      : (base ?? colors[i % colors.length]);

  const renderChart = () => {
    if (widget.type === "summary") return renderSummary();
    if (widget.type === "kpi") return renderKPI();
    if (chartData.length === 0)
      return (
        <div className="flex h-full items-center justify-center text-xs font-medium text-muted-foreground">
          No data in scope
        </div>
      );

    const chartAvg =
      chartData.reduce((acc: number, cur: { y: number }) => acc + cur.y, 0) / chartData.length;
    const props = { data: chartData, margin: { top: 12, right: 12, bottom: 4, left: -12 } };
    const labelProps: Record<string, unknown> = {
      dataKey: "y",
      position: "top",
      fill: "var(--muted-foreground)",
      fontSize: 10,
      offset: 5,
      formatter: (v: number) => fmtVal(v),
    };
    const labelPropsRight: Record<string, unknown> = { ...labelProps, position: "right" };
    const accent = colors[(widget.themeColor ?? 0) % colors.length];

    if (widget.type === "scatter") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart {...props}>
            <CartesianGrid {...gridProps} />
            <XAxis
              type="number"
              dataKey="x"
              name={widget.xAxis}
              tick={axisTick}
              tickMargin={6}
              axisLine={false}
              tickLine={false}
              tickFormatter={fmtVal}
            />
            <YAxis type="number" dataKey="y" name={widget.yAxis} {...valueAxisProps} width={48} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={tooltipStyle} />
            {showLegend && <Legend {...legendProps} />}
            {widget.showAverageLine && (
              <ReferenceLine
                y={chartAvg}
                stroke="var(--primary)"
                strokeDasharray="4 4"
                opacity={0.6}
              />
            )}
            <Scatter name={widget.yAxis} data={chartData} fill={accent} fillOpacity={0.7}>
              {widget.showDataLabels && <LabelList {...labelProps} />}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      );
    }

    if (widget.type === "pie" || widget.type === "donut") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtVal(v)} />
            {showLegend && <Legend {...legendProps} />}
            <Pie
              data={chartData}
              dataKey="y"
              nameKey="x"
              outerRadius="80%"
              innerRadius={widget.type === "donut" ? "58%" : 0}
              paddingAngle={2}
              stroke="var(--background)"
              strokeWidth={2}
              onClick={barClick}
              label={
                widget.showDataLabels ? { fill: "var(--muted-foreground)", fontSize: 10 } : false
              }
            >
              {chartData.map((d: { x: string | number }, i: number) => (
                <Cell
                  key={i}
                  className="cursor-pointer"
                  fill={colorFor(
                    i,
                    String(d.x),
                    colors[(i + (widget.themeColor ?? 0)) % colors.length],
                  )}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (widget.type === "h-bar") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 6, right: 28, bottom: 4, left: 6 }}
          >
            <CartesianGrid {...gridProps} horizontal={false} />
            <XAxis type="number" {...valueAxisProps} />
            <YAxis
              type="category"
              dataKey="x"
              tick={axisTick}
              width={96}
              tickMargin={6}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={cursorFill}
              contentStyle={tooltipStyle}
              formatter={(v: number) => fmtVal(v)}
            />
            {showLegend && <Legend {...legendProps} />}
            {widget.showAverageLine && (
              <ReferenceLine
                x={chartAvg}
                stroke="var(--primary)"
                strokeDasharray="4 4"
                opacity={0.6}
              />
            )}
            <Bar
              name={widget.yAxis}
              dataKey="y"
              radius={[0, 6, 6, 0]}
              onClick={barClick}
              className="cursor-pointer"
              maxBarSize={26}
            >
              {chartData.map((d: { x: string | number }, i: number) => (
                <Cell key={i} fill={colorFor(i, String(d.x), accent)} />
              ))}
              {widget.showDataLabels && <LabelList {...labelPropsRight} />}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (widget.type === "line") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart {...props}>
            <CartesianGrid {...gridProps} vertical={false} />
            <XAxis
              dataKey="x"
              tick={axisTick}
              tickMargin={6}
              axisLine={false}
              tickLine={false}
              minTickGap={16}
            />
            <YAxis {...valueAxisProps} width={48} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtVal(v)} />
            {showLegend && <Legend {...legendProps} />}
            {widget.showAverageLine && (
              <ReferenceLine
                y={chartAvg}
                stroke="var(--primary)"
                strokeDasharray="4 4"
                opacity={0.6}
              />
            )}
            <Line
              name={widget.yAxis}
              type="monotone"
              dataKey="y"
              stroke={accent}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 0, fill: accent }}
            >
              {widget.showDataLabels && <LabelList {...labelProps} />}
            </Line>
          </LineChart>
        </ResponsiveContainer>
      );
    }

    if (widget.type === "radar") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={chartData} margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
            <PolarGrid stroke="var(--border)" opacity={0.6} />
            <PolarAngleAxis dataKey="x" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
            <PolarRadiusAxis angle={30} tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} />
            <Radar
              name={widget.yAxis}
              dataKey="y"
              stroke={accent}
              fill={accent}
              fillOpacity={0.4}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtVal(v)} />
            {showLegend && <Legend {...legendProps} />}
          </RadarChart>
        </ResponsiveContainer>
      );
    }

    if (widget.type === "composed") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart {...props}>
            <CartesianGrid {...gridProps} vertical={false} />
            <XAxis dataKey="x" tick={axisTick} tickMargin={6} axisLine={false} tickLine={false} />
            <YAxis {...valueAxisProps} width={48} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtVal(v)} />
            {showLegend && <Legend {...legendProps} />}
            {widget.showAverageLine && (
              <ReferenceLine
                y={chartAvg}
                stroke="var(--primary)"
                strokeDasharray="4 4"
                opacity={0.6}
              />
            )}
            {widget.referenceValue !== undefined && (
              <ReferenceLine
                y={widget.referenceValue}
                label={{ value: widget.referenceLabel || "Target", fill: "#ef4444", fontSize: 10 }}
                stroke="#ef4444"
                strokeDasharray="3 3"
              />
            )}
            <Bar
              name={widget.yAxis}
              dataKey="y"
              fill={accent}
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
              onClick={barClick}
              className="cursor-pointer"
            >
              {widget.showDataLabels && <LabelList {...labelProps} />}
            </Bar>
            <Line
              name={`${widget.yAxis} Trend`}
              type="monotone"
              dataKey="y2"
              stroke="#f59e0b"
              strokeWidth={2.5}
              dot={false}
            />
            {widget.enableBrush && (
              <Brush dataKey="x" height={22} stroke={accent} fill="var(--background)" />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      );
    }

    if (widget.type === "funnel") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <FunnelChart margin={{ top: 12, right: 12, bottom: 12, left: 12 }}>
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtVal(v)} />
            <Funnel dataKey="y" nameKey="x" data={chartData} isAnimationActive>
              <LabelList
                position="right"
                fill="var(--foreground)"
                stroke="none"
                dataKey="x"
                fontSize={10}
              />
              {chartData.map((d: { x: string | number }, i: number) => (
                <Cell key={i} fill={colors[(i + (widget.themeColor ?? 0)) % colors.length]} />
              ))}
            </Funnel>
          </FunnelChart>
        </ResponsiveContainer>
      );
    }

    if (widget.type === "boxplot") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart {...props}>
            <CartesianGrid {...gridProps} vertical={false} />
            <XAxis dataKey="x" tick={axisTick} tickMargin={6} axisLine={false} tickLine={false} />
            <YAxis {...valueAxisProps} width={48} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtVal(v)} />
            {showLegend && <Legend {...legendProps} />}
            <Bar
              name="Median (Q2)"
              dataKey="median"
              fill={accent}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
            <Bar
              name="Max"
              dataKey="max"
              fill="var(--chart-2)"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
            <Bar
              name="Min"
              dataKey="min"
              fill="var(--chart-3)"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (widget.type === "area") {
      return (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart {...props}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.55} />
                <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} vertical={false} />
            <XAxis
              dataKey="x"
              tick={axisTick}
              tickMargin={6}
              axisLine={false}
              tickLine={false}
              minTickGap={16}
            />
            <YAxis {...valueAxisProps} width={48} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => fmtVal(v)} />
            {showLegend && <Legend {...legendProps} />}
            {widget.showAverageLine && (
              <ReferenceLine
                y={chartAvg}
                stroke="var(--primary)"
                strokeDasharray="4 4"
                opacity={0.6}
              />
            )}
            {widget.referenceValue !== undefined && (
              <ReferenceLine
                y={widget.referenceValue}
                label={{ value: widget.referenceLabel || "Target", fill: "#ef4444", fontSize: 10 }}
                stroke="#ef4444"
                strokeDasharray="3 3"
              />
            )}
            <Area
              name={widget.yAxis}
              type="monotone"
              dataKey="y"
              stroke={accent}
              strokeWidth={2.5}
              fill={`url(#${gradId})`}
            >
              {widget.showDataLabels && <LabelList {...labelProps} />}
            </Area>
            {widget.enableBrush && (
              <Brush dataKey="x" height={22} stroke={accent} fill="var(--background)" />
            )}
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart {...props}>
          <CartesianGrid {...gridProps} vertical={false} />
          <XAxis
            dataKey="x"
            tick={axisTick}
            tickMargin={6}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            angle={chartData.length > 8 ? -30 : 0}
            textAnchor={chartData.length > 8 ? "end" : "middle"}
            height={chartData.length > 8 ? 46 : 24}
          />
          <YAxis {...valueAxisProps} width={48} />
          <Tooltip
            cursor={cursorFill}
            contentStyle={tooltipStyle}
            formatter={(v: number) => fmtVal(v)}
          />
          {showLegend && <Legend {...legendProps} />}
          {widget.showAverageLine && (
            <ReferenceLine
              y={chartAvg}
              stroke="var(--primary)"
              strokeDasharray="4 4"
              opacity={0.6}
            />
          )}
          <Bar
            name={widget.yAxis}
            dataKey="y"
            radius={[6, 6, 0, 0]}
            onClick={barClick}
            className="cursor-pointer"
            maxBarSize={48}
          >
            {chartData.map((d: { x: string | number }, i: number) => (
              <Cell key={i} fill={colorFor(i, String(d.x), accent)} />
            ))}
            {widget.showDataLabels && <LabelList {...labelProps} />}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const defaultTitle =
    widget.type === "summary"
      ? "Smart narrative"
      : widget.type === "kpi"
        ? "KPI"
        : widget.type === "scatter"
          ? `${widget.yAxis} vs ${widget.xAxis}`
          : `${widget.aggregation === "sum" ? "Sum" : widget.aggregation === "count" ? "Count" : "Avg"} ${widget.yAxis} by ${widget.xAxis}`;
  const title = widget.customTitle || defaultTitle;

  const caption = useMemo(() => {
    if (widget.type === "summary") return "Narrative summary of the filtered dataset.";
    if (widget.type === "kpi")
      return `KPI · ${widget.xAxis}${widget.yAxis ? ` of ${widget.yAxis}` : ""} · ${dataset.rowCount.toLocaleString()} rows in scope`;
    if (widget.type === "scatter")
      return `Scatter of ${widget.yAxis} vs ${widget.xAxis} · ${chartData.length} points (first 1,000 rows)`;
    const agg =
      widget.aggregation === "sum" ? "Sum" : widget.aggregation === "count" ? "Count" : "Average";
    const grouped =
      widget.timeGroup && widget.timeGroup !== "none" ? ` grouped by ${widget.timeGroup}` : "";
    return `${agg} of ${widget.yAxis} by ${widget.xAxis}${grouped} · ${chartData.length} categories · ${dataset.rowCount.toLocaleString()} rows in scope`;
  }, [
    widget.type,
    widget.xAxis,
    widget.yAxis,
    widget.aggregation,
    widget.timeGroup,
    chartData.length,
    dataset.rowCount,
  ]);

  useEffect(() => {
    onSeries(widget.id, { series: chartData as { x: string; y: number }[], caption, title });
  }, [widget.id, chartData, caption, title, onSeries]);

  const downloadWidget = async () => {
    const el = document.getElementById(`widget-${widget.id}`);
    if (!el) return;
    const tid = toast.loading(`Exporting ${title} PNG image...`);
    try {
      const bg = window.getComputedStyle(document.body).backgroundColor || "#09090b";
      const canvas = await html2canvas(el, {
        backgroundColor: bg,
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
      });
      const link = document.createElement("a");
      link.download = `chart-${(title || widget.type).replace(/\W+/g, "_")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success(`${title} PNG downloaded!`, { id: tid });
    } catch (e) {
      console.error(e);
      toast.error("Visual export failed. Please retry.", { id: tid });
    }
  };

  // 12-column report canvas footprints.
  const spanClass = focusMode
    ? "h-full"
    : widget.type === "kpi"
      ? ""
      : widget.type === "summary"
        ? "col-span-12"
        : widget.size === "full"
          ? "col-span-12"
          : widget.size === "wide"
            ? "col-span-12 xl:col-span-8"
            : widget.size === "small"
              ? "col-span-12 sm:col-span-6 xl:col-span-4"
              : "col-span-12 lg:col-span-6";

  const heightClass = focusMode
    ? "h-full"
    : widget.type === "summary"
      ? "min-h-[150px]"
      : widget.type === "kpi"
        ? editing
          ? "min-h-[380px]"
          : "h-[150px]"
        : widget.tall
          ? "h-[520px]"
          : "h-[340px] sm:h-[380px]";

  const downloadWidgetCSV = () => {
    if (!chartData || chartData.length === 0) {
      toast.error("No data available to export");
      return;
    }
    const rowsForCSV = (chartData as Array<Record<string, any>>).map((d) => ({
      [widget.xAxis]: d.x,
      [widget.yAxis]: d.y,
      ...(d.min !== undefined ? { min: d.min, median: d.median, max: d.max } : {}),
    }));
    downloadCSV(`${widget.customTitle || widget.type}_data.csv`, rowsForCSV);
    toast.success("CSV exported");
  };

  const exportWidgetSVG = () => {
    const el = document.getElementById(`widget-${widget.id}`);
    if (!el) return;
    const svgEl = el.querySelector("svg");
    if (!svgEl) {
      toast.error("Vector SVG visual not found for this widget.");
      return;
    }
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chart-${(title || widget.type).replace(/\W+/g, "_")}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${title} vector SVG downloaded!`);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      id={`widget-${widget.id}`}
      className={`bento-card flex flex-col group overflow-hidden ${spanClass} ${heightClass}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-2">
        <div className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wider text-foreground/70">
          {widget.type === "kpi" ? "" : title}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-60 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            onClick={() => onMove(-1)}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Move earlier"
            aria-label="Move widget earlier"
          >
            <ArrowUp className="size-3.5" />
          </button>
          <button
            onClick={() => onMove(1)}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Move later"
            aria-label="Move widget later"
          >
            <ArrowDown className="size-3.5" />
          </button>
          {widget.type !== "summary" && (
            <>
              <button
                onClick={onFocus}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title={focusMode ? "Exit focus mode" : "Focus mode"}
                aria-label="Focus mode"
              >
                <Maximize2 className="size-3.5" />
              </button>
              <button
                onClick={() => drillInto()}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Drill through to underlying rows"
                aria-label="Drill through"
              >
                <Table2 className="size-3.5" />
              </button>
              <button
                onClick={downloadWidgetCSV}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Export data as CSV"
                aria-label="Export CSV"
              >
                <FileSpreadsheet className="size-3.5" />
              </button>
              <button
                onClick={exportWidgetSVG}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Export vector SVG image"
                aria-label="Export SVG"
              >
                <FileCode className="size-3.5" />
              </button>
              <button
                onClick={downloadWidget}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Export PNG image"
              >
                <Download className="size-3.5" />
              </button>

              <button
                onClick={() => setEditing(!editing)}
                className={`rounded p-1 transition-colors hover:bg-muted hover:text-foreground ${editing ? "text-primary" : "text-muted-foreground"}`}
                title="Configure visual"
              >
                <Settings2 className="size-3.5" />
              </button>
              <button
                onClick={onRemove}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                title="Remove visual"
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="flex-1 space-y-4 overflow-y-auto bg-background/30 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                Visual type
              </label>
              <CustomSelect
                placeholder="Visual type"
                value={widget.type}
                onChange={(v) => onUpdate({ type: v as ChartType })}
                options={[
                  { value: "summary", label: "Smart narrative" },
                  { value: "kpi", label: "KPI card" },
                  { value: "bar", label: "Column chart" },
                  { value: "h-bar", label: "Bar chart" },
                  { value: "line", label: "Line chart" },
                  { value: "area", label: "Area chart" },
                  { value: "composed", label: "Combo (Bar + Trend)" },
                  { value: "radar", label: "Radar / Spider chart" },
                  { value: "funnel", label: "Funnel stage chart" },
                  { value: "boxplot", label: "Boxplot distribution" },
                  { value: "scatter", label: "Scatter plot" },
                  { value: "pie", label: "Pie chart" },
                  { value: "donut", label: "Donut chart" },
                ]}
              />
            </div>
            {widget.type === "kpi" && (
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                  Metric
                </label>
                <CustomSelect
                  placeholder="Metric"
                  value={widget.xAxis}
                  onChange={(v) => onUpdate({ xAxis: v })}
                  options={[
                    { value: "Total Rows", label: "Total rows" },
                    { value: "Missing Values", label: "Missing values" },
                    { value: "Average", label: "Average" },
                    { value: "Sum", label: "Sum" },
                    { value: "Min", label: "Minimum" },
                    { value: "Max", label: "Maximum" },
                  ]}
                />
              </div>
            )}
          </div>

          {widget.type === "kpi" ? (
            ["Average", "Sum", "Min", "Max"].includes(widget.xAxis) && (
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                  Measure column
                </label>
                <CustomSelect
                  placeholder="Select column"
                  value={widget.yAxis}
                  onChange={(v) => onUpdate({ yAxis: v })}
                  options={numCols.map((c) => ({ value: c.name, label: c.name }))}
                />
              </div>
            )
          ) : widget.type === "summary" ? null : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                  Axis (dimension)
                </label>
                <CustomSelect
                  placeholder="X-Axis"
                  value={widget.xAxis}
                  onChange={(v) => onUpdate({ xAxis: v })}
                  options={dataset.columns.map((c) => ({ value: c, label: c }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                  Values (measure)
                </label>
                <CustomSelect
                  placeholder="Y-Axis"
                  value={widget.yAxis}
                  onChange={(v) => onUpdate({ yAxis: v })}
                  options={numCols.map((c) => ({ value: c.name, label: c.name }))}
                />
              </div>
            </div>
          )}

          {widget.type !== "summary" && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                    Title
                  </label>
                  <input
                    type="text"
                    placeholder={defaultTitle}
                    value={widget.customTitle || ""}
                    onChange={(e) => onUpdate({ customTitle: e.target.value })}
                    className="w-full rounded-xl border border-border bg-background/60 px-3 py-1.5 text-sm font-medium outline-none focus:bg-background"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                    Accent colour
                  </label>
                  <CustomSelect
                    placeholder="Auto"
                    value={widget.themeColor?.toString() ?? ""}
                    onChange={(v) => onUpdate({ themeColor: v === "" ? undefined : parseInt(v) })}
                    options={[
                      { value: "", label: "Auto" },
                      ...colors.map((_, i) => ({ value: i.toString(), label: `Colour ${i + 1}` })),
                    ]}
                  />
                </div>
              </div>

              {widget.type === "kpi" && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                        Prefix
                      </label>
                      <input
                        type="text"
                        placeholder="$"
                        value={widget.prefix || ""}
                        onChange={(e) => onUpdate({ prefix: e.target.value })}
                        className="w-full rounded-xl border border-border bg-background/60 px-3 py-1.5 text-sm font-medium outline-none focus:bg-background"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                        Suffix
                      </label>
                      <input
                        type="text"
                        placeholder="%"
                        value={widget.suffix || ""}
                        onChange={(e) => onUpdate({ suffix: e.target.value })}
                        className="w-full rounded-xl border border-border bg-background/60 px-3 py-1.5 text-sm font-medium outline-none focus:bg-background"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={widget.compactNumber || false}
                        onChange={(e) => onUpdate({ compactNumber: e.target.checked })}
                        className="rounded border-border"
                      />{" "}
                      Compact (1.2K)
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={widget.decimals || false}
                        onChange={(e) => onUpdate({ decimals: e.target.checked })}
                        className="rounded border-border"
                      />{" "}
                      Decimals
                    </label>
                  </div>
                </>
              )}

              {widget.type !== "kpi" && (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                        Aggregation
                      </label>
                      <CustomSelect
                        placeholder="Average"
                        value={widget.aggregation || "avg"}
                        onChange={(v) => onUpdate({ aggregation: v as Widget["aggregation"] })}
                        options={[
                          { value: "sum", label: "Sum" },
                          { value: "avg", label: "Average" },
                          { value: "count", label: "Count" },
                          { value: "min", label: "Minimum" },
                          { value: "max", label: "Maximum" },
                          { value: "median", label: "Median (50th %)" },
                          { value: "std", label: "Std Deviation" },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                        Canvas width
                      </label>
                      <CustomSelect
                        placeholder="Half"
                        value={widget.size || "standard"}
                        onChange={(v) => onUpdate({ size: v as Widget["size"] })}
                        options={[
                          { value: "small", label: "Small (1/3)" },
                          { value: "standard", label: "Medium (1/2)" },
                          { value: "wide", label: "Wide (2/3)" },
                          { value: "full", label: "Full width" },
                        ]}
                      />
                    </div>
                  </div>
                  {widget.type !== "scatter" && (
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                        Time grouping {isDateX ? "" : "(axis must be date-like)"}
                      </label>
                      <CustomSelect
                        placeholder="None (raw values)"
                        value={widget.timeGroup || "none"}
                        onChange={(v) => onUpdate({ timeGroup: v as Widget["timeGroup"] })}
                        options={[
                          { value: "none", label: "None (raw values)" },
                          { value: "day", label: "By day" },
                          { value: "week", label: "By week (Mon start)" },
                          { value: "month", label: "By month" },
                          { value: "quarter", label: "By quarter" },
                          { value: "year", label: "By year" },
                        ]}
                      />
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                        Sort by
                      </label>
                      <CustomSelect
                        placeholder="Descending"
                        value={widget.sortBy || "desc"}
                        onChange={(v) => onUpdate({ sortBy: v as Widget["sortBy"] })}
                        options={[
                          { value: "desc", label: "Descending" },
                          { value: "asc", label: "Ascending" },
                          { value: "az", label: "Alphabetical" },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                        Top N
                      </label>
                      <CustomSelect
                        placeholder="Top 40"
                        value={widget.limit?.toString() || "40"}
                        onChange={(v) => onUpdate({ limit: parseInt(v) })}
                        options={[
                          { value: "5", label: "Top 5" },
                          { value: "10", label: "Top 10" },
                          { value: "20", label: "Top 20" },
                          { value: "40", label: "Top 40" },
                        ]}
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                        Number format
                      </label>
                      <CustomSelect
                        placeholder="Auto"
                        value={widget.numberFormat || "auto"}
                        onChange={(v) => onUpdate({ numberFormat: v as Widget["numberFormat"] })}
                        options={NUMBER_FORMAT_OPTIONS}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                        Decimal places
                      </label>
                      <CustomSelect
                        placeholder="Auto"
                        value={widget.decimalPlaces?.toString() ?? ""}
                        onChange={(v) =>
                          onUpdate({ decimalPlaces: v === "" ? undefined : parseInt(v) })
                        }
                        options={[
                          { value: "", label: "Auto" },
                          { value: "0", label: "0" },
                          { value: "1", label: "1" },
                          { value: "2", label: "2" },
                          { value: "3", label: "3" },
                          { value: "4", label: "4" },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                        Legend position
                      </label>
                      <CustomSelect
                        placeholder="None"
                        value={widget.legendPosition || "none"}
                        onChange={(v) =>
                          onUpdate({ legendPosition: v as Widget["legendPosition"] })
                        }
                        options={[
                          { value: "none", label: "None" },
                          { value: "top", label: "Top" },
                          { value: "bottom", label: "Bottom" },
                          { value: "right", label: "Right" },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                        Value axis scale
                      </label>
                      <CustomSelect
                        placeholder="Linear"
                        value={widget.yScale || "linear"}
                        onChange={(v) => onUpdate({ yScale: v as Widget["yScale"] })}
                        options={[
                          { value: "linear", label: "Linear" },
                          { value: "log", label: "Logarithmic" },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                        Axis min
                      </label>
                      <input
                        type="number"
                        placeholder="Auto"
                        value={widget.yMin ?? ""}
                        onChange={(e) =>
                          onUpdate({
                            yMin: e.target.value === "" ? undefined : Number(e.target.value),
                          })
                        }
                        className="w-full rounded-xl border border-border bg-background/60 px-3 py-1.5 text-sm font-medium outline-none focus:bg-background"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                        Axis max
                      </label>
                      <input
                        type="number"
                        placeholder="Auto"
                        value={widget.yMax ?? ""}
                        onChange={(e) =>
                          onUpdate({
                            yMax: e.target.value === "" ? undefined : Number(e.target.value),
                          })
                        }
                        className="w-full rounded-xl border border-border bg-background/60 px-3 py-1.5 text-sm font-medium outline-none focus:bg-background"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase text-muted-foreground">
                        Target Threshold Line
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 50000"
                        value={widget.referenceValue ?? ""}
                        onChange={(e) =>
                          onUpdate({
                            referenceValue:
                              e.target.value === "" ? undefined : Number(e.target.value),
                          })
                        }
                        className="w-full rounded-xl border border-border bg-background/60 px-3 py-1.5 text-sm font-medium outline-none focus:bg-background"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={widget.hideGrid || false}
                        onChange={(e) => onUpdate({ hideGrid: e.target.checked })}
                        className="rounded border-border"
                      />{" "}
                      Hide gridlines
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={widget.showDataLabels || false}
                        onChange={(e) => onUpdate({ showDataLabels: e.target.checked })}
                        className="rounded border-border"
                      />{" "}
                      Data labels
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={widget.showAverageLine || false}
                        onChange={(e) => onUpdate({ showAverageLine: e.target.checked })}
                        className="rounded border-border"
                      />{" "}
                      Average line
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={widget.enableBrush || false}
                        onChange={(e) => onUpdate({ enableBrush: e.target.checked })}
                        className="rounded border-border"
                      />{" "}
                      Zoom slider
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={widget.tall || false}
                        onChange={(e) => onUpdate({ tall: e.target.checked })}
                        className="rounded border-border"
                      />{" "}
                      Tall card
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div
          className={`min-h-0 flex-1 ${widget.type === "kpi" || widget.type === "summary" ? "" : "p-3 pr-4"}`}
        >
          <ComponentErrorBoundary fallbackTitle={title || "Chart Visual Error"} onRemove={onRemove}>
            {renderChart()}
          </ComponentErrorBoundary>
        </div>
      )}
    </motion.div>
  );
};
