// Role presets — chart, metric, code, workflow, and capability recommendations per role.
import type { Role } from "@/store/dataset-context";

export type CodeTab =
  | "eda"
  | "cleaning"
  | "ml"
  | "dl"
  | "etl"
  | "sql"
  | "api"
  | "streamlit"
  | "docker"
  | "requirements";

/** A recommended, ordered step in a role's ideal workflow — links to an in-app route. */
export interface WorkflowStep {
  label: string;
  detail: string;
  to: string;
}

/** Capability / access emphasis for a role. Drives the role dashboard "permissions" panel. */
export type AccessLevel = "primary" | "secondary" | "optional";
export interface Capability {
  label: string;
  to: string;
  access: AccessLevel;
}

/** A dashboard KPI computed from the dataset for a given role. */
export type MetricKey =
  | "rows"
  | "cols"
  | "numericCols"
  | "categoricalCols"
  | "missingPct"
  | "duplicates"
  | "readiness"
  | "topCorrelation"
  | "skewedCols"
  | "highCardinality"
  | "textCols"
  | "outlierCols";

export interface DashboardMetric {
  key: MetricKey;
  label: string;
}

export interface RolePreset {
  charts: string[];
  metrics: string[];
  codeTabs: CodeTab[];
  defaultCodeTab: CodeTab;
  focus: string;
  kpis: string[];
  insightAngle: string;
  /** Human summary of what this role optimises for. */
  mission: string;
  /** Ordered, role-tailored recommended workflow. */
  workflow: WorkflowStep[];
  /** Role capabilities / access emphasis (client-side experience gating). */
  capabilities: Capability[];
  /** Dashboard KPI tiles specific to this role. */
  dashboard: DashboardMetric[];
}

const CAP = (label: string, to: string, access: AccessLevel): Capability => ({ label, to, access });

export const ROLE_PRESETS: Record<Role, RolePreset> = {
  data_analyst: {
    charts: ["bar", "line", "histogram", "boxplot"],
    metrics: ["mean", "median", "missingPct", "topValues"],
    codeTabs: [
      "eda",
      "streamlit",
      "sql",
      "cleaning",
      "ml",
      "dl",
      "etl",
      "api",
      "docker",
      "requirements",
    ],
    defaultCodeTab: "eda",
    focus: "Trends, distributions, and segment breakdowns",
    kpis: ["Rows", "Numeric cols", "Missing %", "Top category"],
    insightAngle:
      "Surface trends, segment differences, and data quality flags relevant for reporting.",
    mission: "Turn raw data into clear, decision-ready reports and dashboards.",
    workflow: [
      {
        label: "Review the profile",
        detail: "Scan column types, missingness, and cardinality on the Overview.",
        to: "/overview",
      },
      {
        label: "Clean & validate",
        detail: "Impute gaps, dedupe rows, and trim noise in Data Prep.",
        to: "/prep",
      },
      {
        label: "Explore distributions",
        detail: "Study summary stats, outliers, and correlations in Deep Analysis.",
        to: "/analysis",
      },
      {
        label: "Build visuals",
        detail: "Compose bar/line charts for the story you want to tell.",
        to: "/charts",
      },
      {
        label: "Export the report",
        detail: "Ship a boardroom-ready PDF/HTML with methodology notes.",
        to: "/export",
      },
    ],
    capabilities: [
      CAP("Deep Analysis", "/analysis", "primary"),
      CAP("Visualization", "/charts", "primary"),
      CAP("Export Reports", "/export", "primary"),
      CAP("Data Prep", "/prep", "secondary"),
      CAP("AutoML", "/train", "optional"),
      CAP("Code Gen", "/codegen", "optional"),
    ],
    dashboard: [
      { key: "rows", label: "Rows" },
      { key: "numericCols", label: "Numeric cols" },
      { key: "missingPct", label: "Missing %" },
      { key: "topCorrelation", label: "Top correlation" },
    ],
  },
  business_analyst: {
    charts: ["bar", "pie", "line", "kpi"],
    metrics: ["sum", "mean", "growthRate", "topValues"],
    codeTabs: [
      "streamlit",
      "sql",
      "eda",
      "api",
      "cleaning",
      "etl",
      "ml",
      "dl",
      "docker",
      "requirements",
    ],
    defaultCodeTab: "streamlit",
    focus: "Business KPIs, segmentation, and revenue/customer drivers",
    kpis: ["Rows", "Top driver", "Avg value", "Quality score"],
    insightAngle:
      "Translate dataset into business KPIs, drivers, opportunities, and risks. Cite numbers.",
    mission: "Connect the data to revenue, cost, and customer outcomes leadership cares about.",
    workflow: [
      {
        label: "Frame the KPIs",
        detail: "Confirm rows, segments, and the quality score on your dashboard.",
        to: "/overview",
      },
      {
        label: "Segment & compare",
        detail: "Break metrics down by category with bar/pie charts.",
        to: "/charts",
      },
      {
        label: "Find drivers",
        detail: "Use correlation analysis to spot what moves the metric.",
        to: "/analysis",
      },
      {
        label: "Draft the summary",
        detail: "Use the AI Copilot (top bar) to generate a plain-English executive summary.",
        to: "/analysis",
      },
      {
        label: "Export an exec report",
        detail: "Deliver a PDF with methodology notes and recommendations.",
        to: "/export",
      },
    ],
    capabilities: [
      CAP("Visualization", "/charts", "primary"),
      CAP("Export Reports", "/export", "primary"),
      CAP("Deep Analysis", "/analysis", "secondary"),
      CAP("Data Prep", "/prep", "secondary"),
      CAP("Code Gen", "/codegen", "optional"),
      CAP("AutoML", "/train", "optional"),
    ],
    dashboard: [
      { key: "rows", label: "Records" },
      { key: "categoricalCols", label: "Segments" },
      { key: "readiness", label: "Quality score" },
      { key: "topCorrelation", label: "Strongest driver" },
    ],
  },
  data_scientist: {
    charts: ["scatter", "heatmap", "histogram", "boxplot", "qq"],
    metrics: ["mean", "std", "skewness", "kurtosis", "correlation"],
    codeTabs: [
      "eda",
      "ml",
      "dl",
      "cleaning",
      "streamlit",
      "api",
      "etl",
      "sql",
      "docker",
      "requirements",
    ],
    defaultCodeTab: "eda",
    focus: "Distributions, relationships, hypothesis-ready features",
    kpis: ["Rows", "Numeric cols", "Top correlation", "Skewed cols"],
    insightAngle:
      "Identify modeling-relevant patterns, distribution issues, multicollinearity, and feature ideas.",
    mission: "Uncover statistically sound patterns and hypothesis-ready features.",
    workflow: [
      {
        label: "Profile distributions",
        detail: "Check skew, kurtosis, and outliers per column.",
        to: "/analysis",
      },
      {
        label: "Study correlations",
        detail: "Inspect the heatmap for multicollinearity and signal.",
        to: "/analysis",
      },
      {
        label: "Engineer features",
        detail: "Encode, scale, and derive features for modeling.",
        to: "/transform",
      },
      { label: "Prototype models", detail: "Benchmark algorithms in AutoML.", to: "/train" },
      {
        label: "Export the notebook",
        detail: "Download a reproducible EDA + ML Jupyter notebook.",
        to: "/export",
      },
    ],
    capabilities: [
      CAP("Deep Analysis", "/analysis", "primary"),
      CAP("Feature Eng", "/transform", "primary"),
      CAP("AutoML", "/train", "primary"),
      CAP("Code Gen", "/codegen", "secondary"),
      CAP("Export Reports", "/export", "secondary"),
      CAP("Data Prep", "/prep", "secondary"),
    ],
    dashboard: [
      { key: "rows", label: "Rows" },
      { key: "numericCols", label: "Numeric cols" },
      { key: "topCorrelation", label: "Top correlation" },
      { key: "skewedCols", label: "Skewed cols" },
    ],
  },
  ml_engineer: {
    charts: ["heatmap", "scatter", "feature-importance", "histogram"],
    metrics: ["correlation", "outliersIQR", "missingPct", "cardinality"],
    codeTabs: [
      "ml",
      "dl",
      "api",
      "docker",
      "cleaning",
      "eda",
      "etl",
      "sql",
      "streamlit",
      "requirements",
    ],
    defaultCodeTab: "ml",
    focus: "Pipeline-ready features, leakage risks, target distribution",
    kpis: ["Rows", "Features", "Target candidates", "ML Readiness"],
    insightAngle:
      "Recommend target column, leakage risks, feature engineering, scaling/encoding strategy, and model families.",
    mission: "Ship robust, leakage-free training pipelines and deployable models.",
    workflow: [
      {
        label: "Check readiness",
        detail: "Confirm the ML readiness score and penalties.",
        to: "/overview",
      },
      {
        label: "Engineer features",
        detail: "Encode/scale and flag leakage-prone columns.",
        to: "/transform",
      },
      {
        label: "Train & benchmark",
        detail: "Compare model families on your target.",
        to: "/train",
      },
      {
        label: "Generate pipeline code",
        detail: "Export production sklearn/PyTorch + FastAPI service.",
        to: "/codegen",
      },
      {
        label: "Package & serve",
        detail: "Grab Docker + requirements for deployment.",
        to: "/codegen",
      },
    ],
    capabilities: [
      CAP("AutoML", "/train", "primary"),
      CAP("Code Gen", "/codegen", "primary"),
      CAP("Feature Eng", "/transform", "primary"),
      CAP("Deep Analysis", "/analysis", "secondary"),
      CAP("Data Prep", "/prep", "secondary"),
      CAP("Export Reports", "/export", "optional"),
    ],
    dashboard: [
      { key: "rows", label: "Rows" },
      { key: "cols", label: "Features" },
      { key: "readiness", label: "ML readiness" },
      { key: "outlierCols", label: "Outlier cols" },
    ],
  },
  ai_engineer: {
    charts: ["embedding", "histogram", "bar", "heatmap"],
    metrics: ["entropy", "cardinality", "tokenLength", "missingPct"],
    codeTabs: [
      "api",
      "docker",
      "dl",
      "eda",
      "cleaning",
      "ml",
      "etl",
      "sql",
      "streamlit",
      "requirements",
    ],
    defaultCodeTab: "api",
    focus: "Text features, embeddings, prompt/eval design",
    kpis: ["Rows", "Text cols", "Avg entropy", "Quality score"],
    insightAngle:
      "Spot text-rich columns, suggest embedding/RAG strategy, evaluation pairs, and prompt patterns.",
    mission: "Prepare text/features for embeddings, RAG, and LLM evaluation.",
    workflow: [
      {
        label: "Find text columns",
        detail: "Identify high-entropy, text-rich fields on Overview.",
        to: "/overview",
      },
      {
        label: "Inspect content",
        detail: "Review distributions and cardinality in Deep Analysis.",
        to: "/analysis",
      },
      {
        label: "Engineer text features",
        detail: "Chunk, encode, and derive features for embeddings/RAG.",
        to: "/transform",
      },
      {
        label: "Generate a service",
        detail: "Export a FastAPI + Docker inference scaffold.",
        to: "/codegen",
      },
    ],
    capabilities: [
      CAP("Code Gen", "/codegen", "primary"),
      CAP("Feature Eng", "/transform", "primary"),
      CAP("Deep Analysis", "/analysis", "secondary"),
      CAP("Export Reports", "/export", "optional"),
      CAP("AutoML", "/train", "optional"),
    ],
    dashboard: [
      { key: "rows", label: "Rows" },
      { key: "textCols", label: "Text cols" },
      { key: "highCardinality", label: "High-cardinality" },
      { key: "readiness", label: "Quality score" },
    ],
  },
  data_engineer: {
    charts: ["schema", "bar", "histogram", "timeline"],
    metrics: ["missingPct", "duplicates", "cardinality", "type"],
    codeTabs: [
      "etl",
      "sql",
      "cleaning",
      "docker",
      "eda",
      "ml",
      "dl",
      "api",
      "streamlit",
      "requirements",
    ],
    defaultCodeTab: "etl",
    focus: "Schema integrity, pipeline reliability, and contracts",
    kpis: ["Rows", "Duplicates", "Missing cells", "Schema issues"],
    insightAngle:
      "Highlight schema drift risks, type inconsistencies, key candidates, ingestion contracts, and dq rules.",
    mission: "Guarantee reliable schemas, contracts, and reproducible pipelines.",
    workflow: [
      {
        label: "Audit the schema",
        detail: "Verify types, keys, and cardinality on Overview.",
        to: "/overview",
      },
      {
        label: "Enforce data quality",
        detail: "Run validation rules and dedupe in Data Prep.",
        to: "/prep",
      },
      {
        label: "Check integrity",
        detail: "Review duplicates, missingness, and drift risks.",
        to: "/analysis",
      },
      {
        label: "Generate ETL + SQL",
        detail: "Export idempotent pipeline, DDL, and contracts.",
        to: "/codegen",
      },
      {
        label: "Containerize",
        detail: "Grab Docker + requirements for scheduling.",
        to: "/codegen",
      },
    ],
    capabilities: [
      CAP("Data Prep", "/prep", "primary"),
      CAP("Code Gen", "/codegen", "primary"),
      CAP("Deep Analysis", "/analysis", "secondary"),
      CAP("Export Reports", "/export", "secondary"),
      CAP("Feature Eng", "/transform", "optional"),
      CAP("AutoML", "/train", "optional"),
    ],
    dashboard: [
      { key: "rows", label: "Rows" },
      { key: "duplicates", label: "Duplicates" },
      { key: "missingPct", label: "Missing %" },
      { key: "highCardinality", label: "Key candidates" },
    ],
  },
};

export function presetFor(role: Role): RolePreset {
  return ROLE_PRESETS[role];
}

/** Compute a role dashboard metric value from a dataset (returns display string). */
export function computeMetric(
  key: MetricKey,
  ds: import("@/lib/stats").Dataset,
): { value: string; hint?: string } {
  const num = ds.profiles.filter((p) => p.type === "numeric");
  const cat = ds.profiles.filter((p) => p.type === "categorical");
  const totalCells = ds.rowCount * ds.colCount || 1;
  switch (key) {
    case "rows":
      return { value: ds.rowCount.toLocaleString() };
    case "cols":
      return { value: String(ds.colCount) };
    case "numericCols":
      return { value: String(num.length) };
    case "categoricalCols":
      return { value: String(cat.length) };
    case "missingPct":
      return { value: `${((ds.missingTotal / totalCells) * 100).toFixed(1)}%` };
    case "duplicates":
      return { value: ds.duplicateRows.toLocaleString() };
    case "readiness":
      return { value: `${ds.readinessScore}`, hint: "/ 100" };
    case "topCorrelation": {
      const corr = ds.correlation;
      if (!corr || corr.columns.length < 2) return { value: "—" };
      let best = 0;
      let pair = "";
      for (let i = 0; i < corr.matrix.length; i++)
        for (let j = i + 1; j < corr.matrix.length; j++) {
          const v = Math.abs(corr.matrix[i][j]);
          if (v > best) {
            best = v;
            pair = `${corr.columns[i]} ↔ ${corr.columns[j]}`;
          }
        }
      return { value: best ? best.toFixed(2) : "—", hint: pair };
    }
    case "skewedCols":
      return { value: String(num.filter((p) => Math.abs(p.skewness ?? 0) > 1).length) };
    case "highCardinality":
      return { value: String(ds.profiles.filter((p) => p.unique > ds.rowCount * 0.5).length) };
    case "textCols":
      return { value: String(cat.filter((p) => (p.entropy ?? 0) > 2.5).length) };
    case "outlierCols":
      return { value: String(num.filter((p) => (p.outliersIQR ?? 0) > 0).length) };
    default:
      return { value: "—" };
  }
}
