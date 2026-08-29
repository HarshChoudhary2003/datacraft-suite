// Dashboard templates: a reusable visual layout + default metrics that can be
// applied to a dataset in one click and then edited.
//
// Built-in templates are generated from the dataset profile (so the metrics are
// always valid for the loaded schema). User templates are snapshots of the
// current canvas, stored in localStorage per dataset.

import type { Dataset } from "./stats";
import type { Widget } from "./dashboard-store";

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  theme?: string;
  /** Dataset the template was captured from (user templates only). */
  datasetName?: string;
  savedAt?: string;
  widgets: Widget[];
  builtin?: boolean;
}

const KEY = "dataiq.dashboard.templates.v1";
const uid = () => Math.random().toString(36).slice(2);

const isIdLike = (n: string) => /(^|_)id$|^id|index|_no$|zip|code|uuid/i.test(n);

interface Cols {
  nums: string[];
  cats: { name: string; unique: number }[];
  dates: string[];
}

function profileCols(ds: Dataset): Cols {
  const allNums = ds.profiles.filter((p) => p.type === "numeric");
  const realNums = allNums.filter((p) => !isIdLike(p.name));
  return {
    nums: (realNums.length ? realNums : allNums).map((p) => p.name),
    cats: ds.profiles
      .filter(
        (p) =>
          (p.type === "categorical" || p.type === "boolean") && p.unique > 1 && p.unique <= 200,
      )
      .map((p) => ({ name: p.name, unique: p.unique }))
      .sort((a, b) => a.unique - b.unique),
    dates: ds.profiles.filter((p) => p.type === "datetime").map((p) => p.name),
  };
}

/** Templates whose metrics adapt to the loaded schema. */
export function builtinTemplates(ds: Dataset): DashboardTemplate[] {
  const { nums, cats, dates } = profileCols(ds);
  const n0 = nums[0];
  const n1 = nums[1] ?? nums[0];
  const lowCat = cats[0]?.name;
  const highCat = (cats.find((c) => c.unique > 8) ?? cats[cats.length - 1])?.name;
  const d0 = dates[0];

  const out: DashboardTemplate[] = [];

  /* --- Executive overview --- */
  const exec: Widget[] = [
    { id: uid(), type: "kpi", xAxis: "Total Rows", yAxis: "", numberFormat: "compact" },
    ...(n0
      ? [
          {
            id: uid(),
            type: "kpi" as const,
            xAxis: "Sum",
            yAxis: n0,
            numberFormat: "compact" as const,
          },
        ]
      : []),
    ...(n1
      ? [
          {
            id: uid(),
            type: "kpi" as const,
            xAxis: "Average",
            yAxis: n1,
            numberFormat: "full" as const,
            decimalPlaces: 2,
          },
        ]
      : []),
    { id: uid(), type: "kpi", xAxis: "Missing Values", yAxis: "", numberFormat: "compact" },
  ];
  if (d0 && n0)
    exec.push({
      id: uid(),
      type: "area",
      xAxis: d0,
      yAxis: n0,
      timeGroup: "month",
      aggregation: "sum",
      size: "wide",
      numberFormat: "compact",
      legendPosition: "none",
    });
  if (lowCat && n0)
    exec.push({
      id: uid(),
      type: "donut",
      xAxis: lowCat,
      yAxis: n0,
      aggregation: "sum",
      size: "small",
      legendPosition: "bottom",
      numberFormat: "compact",
    });
  if (highCat && n0)
    exec.push({
      id: uid(),
      type: "h-bar",
      xAxis: highCat,
      yAxis: n0,
      aggregation: "sum",
      limit: 10,
      size: "standard",
      numberFormat: "compact",
      tall: true,
    });
  if (nums.length >= 2)
    exec.push({
      id: uid(),
      type: "scatter",
      xAxis: nums[0],
      yAxis: nums[1],
      size: "standard",
      numberFormat: "auto",
      tall: true,
    });
  exec.push({ id: uid(), type: "summary", xAxis: "", yAxis: "" });
  out.push({
    id: "builtin-exec",
    builtin: true,
    name: "Executive overview",
    description: "KPI band, trend, category mix and a ranked breakdown.",
    widgets: exec,
  });

  /* --- Trend analysis --- */
  if (d0 && n0) {
    const trend: Widget[] = [
      { id: uid(), type: "kpi", xAxis: "Sum", yAxis: n0, numberFormat: "compact" },
      {
        id: uid(),
        type: "kpi",
        xAxis: "Average",
        yAxis: n0,
        numberFormat: "full",
        decimalPlaces: 2,
      },
      { id: uid(), type: "kpi", xAxis: "Max", yAxis: n0, numberFormat: "compact" },
      { id: uid(), type: "kpi", xAxis: "Min", yAxis: n0, numberFormat: "compact" },
      {
        id: uid(),
        type: "line",
        xAxis: d0,
        yAxis: n0,
        timeGroup: "month",
        aggregation: "sum",
        size: "full",
        showAverageLine: true,
        numberFormat: "compact",
      },
      {
        id: uid(),
        type: "bar",
        xAxis: d0,
        yAxis: n0,
        timeGroup: "quarter",
        aggregation: "sum",
        size: "standard",
        showDataLabels: true,
        numberFormat: "compact",
      },
      {
        id: uid(),
        type: "area",
        xAxis: d0,
        yAxis: n1,
        timeGroup: "week",
        aggregation: "avg",
        size: "standard",
        numberFormat: "compact",
      },
    ];
    out.push({
      id: "builtin-trend",
      builtin: true,
      name: "Trend analysis",
      description: "Time-series first: monthly, quarterly and weekly views of your key measure.",
      widgets: trend,
    });
  }

  /* --- Category breakdown --- */
  if (lowCat && n0) {
    const cat: Widget[] = [
      { id: uid(), type: "kpi", xAxis: "Total Rows", yAxis: "", numberFormat: "compact" },
      { id: uid(), type: "kpi", xAxis: "Sum", yAxis: n0, numberFormat: "compact" },
      {
        id: uid(),
        type: "h-bar",
        xAxis: highCat ?? lowCat,
        yAxis: n0,
        aggregation: "sum",
        limit: 20,
        size: "wide",
        tall: true,
        numberFormat: "compact",
      },
      {
        id: uid(),
        type: "pie",
        xAxis: lowCat,
        yAxis: n0,
        aggregation: "sum",
        size: "small",
        legendPosition: "bottom",
        tall: true,
      },
      {
        id: uid(),
        type: "bar",
        xAxis: lowCat,
        yAxis: n1,
        aggregation: "avg",
        size: "standard",
        showDataLabels: true,
        numberFormat: "full",
        decimalPlaces: 1,
      },
      ...(cats[1]
        ? [
            {
              id: uid(),
              type: "h-bar" as const,
              xAxis: cats[1].name,
              yAxis: n0,
              aggregation: "count" as const,
              limit: 10,
              size: "standard" as const,
            },
          ]
        : []),
    ];
    out.push({
      id: "builtin-category",
      builtin: true,
      name: "Category breakdown",
      description: "Ranked and share-of-total views across your dimensions.",
      widgets: cat,
    });
  }

  /* --- Data quality --- */
  const quality: Widget[] = [
    { id: uid(), type: "kpi", xAxis: "Total Rows", yAxis: "", numberFormat: "compact" },
    { id: uid(), type: "kpi", xAxis: "Missing Values", yAxis: "", numberFormat: "compact" },
    ...(n0
      ? [
          {
            id: uid(),
            type: "kpi" as const,
            xAxis: "Min",
            yAxis: n0,
            numberFormat: "auto" as const,
          },
        ]
      : []),
    ...(n0
      ? [
          {
            id: uid(),
            type: "kpi" as const,
            xAxis: "Max",
            yAxis: n0,
            numberFormat: "auto" as const,
          },
        ]
      : []),
    ...(lowCat && n0
      ? [
          {
            id: uid(),
            type: "bar" as const,
            xAxis: lowCat,
            yAxis: n0,
            aggregation: "count" as const,
            size: "wide" as const,
            showDataLabels: true,
          },
        ]
      : []),
    ...(nums.length >= 2
      ? [
          {
            id: uid(),
            type: "scatter" as const,
            xAxis: nums[0],
            yAxis: nums[1],
            size: "small" as const,
          },
        ]
      : []),
    { id: uid(), type: "summary", xAxis: "", yAxis: "" },
  ];
  out.push({
    id: "builtin-quality",
    builtin: true,
    name: "Data quality review",
    description: "Completeness, ranges and record counts for auditing a fresh upload.",
    widgets: quality,
  });

  /* --- Performance Radar & Funnel Pipeline --- */
  if (lowCat && n0) {
    const radarFunnel: Widget[] = [
      { id: uid(), type: "kpi", xAxis: "Sum", yAxis: n0, numberFormat: "compact" },
      { id: uid(), type: "kpi", xAxis: "Average", yAxis: n1, numberFormat: "compact" },
      { id: uid(), type: "kpi", xAxis: "Median", yAxis: n0, numberFormat: "compact" },
      { id: uid(), type: "kpi", xAxis: "Std Dev", yAxis: n0, numberFormat: "compact" },
      {
        id: uid(),
        type: "radar",
        xAxis: lowCat,
        yAxis: n0,
        aggregation: "avg",
        size: "standard",
        tall: true,
      },
      {
        id: uid(),
        type: "funnel",
        xAxis: highCat ?? lowCat,
        yAxis: n0,
        aggregation: "sum",
        limit: 8,
        size: "standard",
        tall: true,
      },
      {
        id: uid(),
        type: "boxplot",
        xAxis: lowCat,
        yAxis: n0,
        size: "full",
      },
    ];
    out.push({
      id: "builtin-radar-funnel",
      builtin: true,
      name: "Performance Radar & Funnel",
      theme: "Violet Dusk",
      description:
        "Multi-axis spider profile analysis, conversion pipeline drop-offs & boxplot metrics.",
      widgets: radarFunnel,
    });
  }

  /* --- Combo & Goal Target Scorecard --- */
  if (n0) {
    const comboGoal: Widget[] = [
      { id: uid(), type: "kpi", xAxis: "Sum", yAxis: n0, numberFormat: "compact" },
      { id: uid(), type: "kpi", xAxis: "Average", yAxis: n0, numberFormat: "compact" },
      { id: uid(), type: "kpi", xAxis: "Max", yAxis: n0, numberFormat: "compact" },
      { id: uid(), type: "kpi", xAxis: "Min", yAxis: n0, numberFormat: "compact" },
      ...(d0
        ? [
            {
              id: uid(),
              type: "composed" as const,
              xAxis: d0,
              yAxis: n0,
              timeGroup: "month" as const,
              aggregation: "sum" as const,
              size: "wide" as const,
              showAverageLine: true,
            },
          ]
        : []),
      ...(lowCat
        ? [
            {
              id: uid(),
              type: "bar" as const,
              xAxis: lowCat,
              yAxis: n0,
              aggregation: "sum" as const,
              size: "small" as const,
              showDataLabels: true,
            },
          ]
        : []),
      { id: uid(), type: "summary", xAxis: "", yAxis: "" },
    ];
    out.push({
      id: "builtin-combo-goal",
      builtin: true,
      name: "Combo & Goal Target Scorecard",
      theme: "Sunset Glow",
      description:
        "Dual-axis combo visuals (Bar + Trend), goal threshold reference lines & scorecard KPIs.",
      widgets: comboGoal,
    });
  }

  /* --- Statistical Variance & Distribution --- */
  if (n0) {
    const statsVariance: Widget[] = [
      { id: uid(), type: "kpi", xAxis: "Average", yAxis: n0, numberFormat: "compact" },
      { id: uid(), type: "kpi", xAxis: "Median", yAxis: n0, numberFormat: "compact" },
      { id: uid(), type: "kpi", xAxis: "Std Dev", yAxis: n0, numberFormat: "compact" },
      { id: uid(), type: "kpi", xAxis: "Total Rows", yAxis: "", numberFormat: "compact" },
      ...(lowCat
        ? [
            {
              id: uid(),
              type: "boxplot" as const,
              xAxis: lowCat,
              yAxis: n0,
              size: "wide" as const,
              tall: true,
            },
          ]
        : []),
      ...(nums.length >= 2
        ? [
            {
              id: uid(),
              type: "scatter" as const,
              xAxis: nums[0],
              yAxis: nums[1],
              size: "small" as const,
              tall: true,
            },
          ]
        : []),
    ];
    out.push({
      id: "builtin-variance",
      builtin: true,
      name: "Statistical Variance & Distribution",
      theme: "Emerald Mint",
      description:
        "Boxplot quartiles, median vs mean comparison, standard deviation bounds & scatter correlation.",
      widgets: statsVariance,
    });
  }

  /* --- Interactive Zoom Time-Series --- */
  if (d0 && n0) {
    const zoomSeries: Widget[] = [
      { id: uid(), type: "kpi", xAxis: "Sum", yAxis: n0, numberFormat: "compact" },
      { id: uid(), type: "kpi", xAxis: "Average", yAxis: n0, numberFormat: "compact" },
      { id: uid(), type: "kpi", xAxis: "Max", yAxis: n0, numberFormat: "compact" },
      { id: uid(), type: "kpi", xAxis: "Min", yAxis: n0, numberFormat: "compact" },
      {
        id: uid(),
        type: "area",
        xAxis: d0,
        yAxis: n0,
        timeGroup: "day",
        aggregation: "sum",
        enableBrush: true,
        size: "full",
        showAverageLine: true,
      },
      {
        id: uid(),
        type: "line",
        xAxis: d0,
        yAxis: n1,
        timeGroup: "month",
        aggregation: "avg",
        enableBrush: true,
        size: "standard",
      },
      {
        id: uid(),
        type: "composed",
        xAxis: d0,
        yAxis: n0,
        timeGroup: "quarter",
        aggregation: "sum",
        size: "standard",
      },
    ];
    out.push({
      id: "builtin-interactive-zoom",
      builtin: true,
      name: "Interactive Zoom Time-Series",
      theme: "Ocean Breeze",
      description: "Dense time-series trends equipped with bottom interactive brush zoom sliders.",
      widgets: zoomSeries,
    });
  }

  /* --- Financial & Operations Scorecard --- */
  if (n0) {
    const financialScorecard: Widget[] = [
      { id: uid(), type: "kpi", xAxis: "Sum", yAxis: n0, prefix: "$", numberFormat: "compact" },
      { id: uid(), type: "kpi", xAxis: "Average", yAxis: n0, prefix: "$", numberFormat: "compact" },
      { id: uid(), type: "kpi", xAxis: "Max", yAxis: n0, prefix: "$", numberFormat: "compact" },
      { id: uid(), type: "kpi", xAxis: "Count", yAxis: n0, numberFormat: "compact" },
      ...(lowCat
        ? [
            {
              id: uid(),
              type: "donut" as const,
              xAxis: lowCat,
              yAxis: n0,
              aggregation: "sum" as const,
              size: "small" as const,
              showLegend: true,
            },
          ]
        : []),
      ...(highCat
        ? [
            {
              id: uid(),
              type: "h-bar" as const,
              xAxis: highCat,
              yAxis: n0,
              aggregation: "sum" as const,
              limit: 10,
              size: "standard" as const,
              showDataLabels: true,
            },
          ]
        : []),
      { id: uid(), type: "summary", xAxis: "", yAxis: "" },
    ];
    out.push({
      id: "builtin-financial",
      builtin: true,
      name: "Financial & Operations Scorecard",
      theme: "Cyan Prism",
      description:
        "Revenue & cost metrics, donut share of total, ranked margin breakdowns & executive summary.",
      widgets: financialScorecard,
    });
  }

  return out;
}

function readAll(): DashboardTemplate[] {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DashboardTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list: DashboardTemplate[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** Templates saved by the user, newest first (optionally scoped to a dataset). */
export function listUserTemplates(datasetName?: string): DashboardTemplate[] {
  const all = readAll();
  return (
    datasetName ? all.filter((t) => !t.datasetName || t.datasetName === datasetName) : all
  ).sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""));
}

export function saveUserTemplate(
  t: Omit<DashboardTemplate, "id" | "savedAt" | "builtin">,
): DashboardTemplate | null {
  const tpl: DashboardTemplate = { ...t, id: uid(), savedAt: new Date().toISOString() };
  const all = readAll().filter((x) => !(x.name === tpl.name && x.datasetName === tpl.datasetName));
  return writeAll([tpl, ...all].slice(0, 30)) ? tpl : null;
}

export function deleteUserTemplate(id: string): void {
  writeAll(readAll().filter((t) => t.id !== id));
}

/** Re-key widgets so an applied template never collides with live widget ids. */
export function instantiate(t: DashboardTemplate): Widget[] {
  return t.widgets.map((w) => ({ ...w, id: uid() }));
}
