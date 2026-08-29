import { Link } from "@tanstack/react-router";
import { useDataset } from "@/store/dataset-context";
import { useState, useMemo } from "react";
import {
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig,
  validate,
  type ValidationConfig,
  type ValidationIssue,
} from "@/lib/validation";
import {
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Info,
  RotateCcw,
  Save,
  Wand2,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import {
  autoClean,
  ACTION_LABELS,
  type AutoCleanAction,
  type AutoCleanResult,
} from "@/lib/autoclean";
import { downloadCSV } from "@/lib/csv";
import { Switch } from "@/components/ui/switch";

export function ValidationPage() {
  const { dataset, processRows } = useDataset();
  const [cfg, setCfg] = useState<ValidationConfig>(loadConfig());
  const [actions, setActions] = useState<Set<AutoCleanAction>>(
    new Set([
      "trimWhitespace",
      "fillMissingNumeric",
      "fillMissingCategorical",
      "dropDuplicateRows",
    ]),
  );
  const [preview, setPreview] = useState<AutoCleanResult | null>(null);

  const report = useMemo(() => (dataset ? validate(dataset, cfg) : null), [dataset, cfg]);

  if (!dataset)
    return (
      <div className="neo p-10 text-center">
        No dataset.{" "}
        <Link to="/" className="text-primary underline">
          Upload
        </Link>
      </div>
    );

  const persist = () => {
    saveConfig(cfg);
    toast.success("Rules saved");
  };
  const reset = () => {
    setCfg(DEFAULT_CONFIG);
    saveConfig(DEFAULT_CONFIG);
    toast.info("Reset to defaults");
  };

  const toggle = (a: AutoCleanAction) => {
    const n = new Set(actions);
    if (n.has(a)) n.delete(a);
    else n.add(a);
    setActions(n);
  };
  const runPreview = () => {
    if (actions.size === 0) {
      toast.error("Pick at least one action");
      return;
    }
    setPreview(autoClean(dataset, { actions: [...actions] }));
  };
  const apply = () => {
    if (!preview) return;
    void processRows(dataset.name, preview.rows);
    setPreview(null);
    toast.success("Applied — dataset updated");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold gradient-text flex items-center gap-3">
            <ShieldCheck className="size-8" />
            Validation Rules
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configurable schema, outlier and missing-value checks. Results update live.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={reset} className="neo-btn px-3 py-2 text-sm flex items-center gap-1.5">
            <RotateCcw className="size-3.5" />
            Defaults
          </button>
          <button
            onClick={persist}
            className="neo-btn px-3 py-2 text-sm font-semibold flex items-center gap-1.5"
          >
            <Save className="size-3.5" />
            Save
          </button>
        </div>
      </div>

      {report && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <ScoreCard
            label="Quality score"
            value={`${report.score}/100`}
            tone={report.score > 80 ? "good" : report.score > 50 ? "warn" : "bad"}
          />
          <ScoreCard
            label="Errors"
            value={report.errors}
            tone={report.errors > 0 ? "bad" : "good"}
            icon={<AlertCircle className="size-4" />}
          />
          <ScoreCard
            label="Warnings"
            value={report.warnings}
            tone={report.warnings > 0 ? "warn" : "good"}
            icon={<AlertTriangle className="size-4" />}
          />
          <ScoreCard
            label="Total issues"
            value={report.total}
            tone="neutral"
            icon={<Info className="size-4" />}
          />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Config */}
        <div className="neo p-5 space-y-4">
          <div className="font-semibold">Rule configuration</div>

          <NumberRule
            label="Max missing % per column"
            value={cfg.maxMissingPct}
            onChange={(v) => setCfg({ ...cfg, maxMissingPct: v })}
            suffix="%"
            max={100}
          />
          <NumberRule
            label="Max IQR outlier % per column"
            value={cfg.maxOutlierPct}
            onChange={(v) => setCfg({ ...cfg, maxOutlierPct: v })}
            suffix="%"
            max={100}
          />
          <NumberRule
            label="Max overall duplicate %"
            value={cfg.maxDuplicatePct}
            onChange={(v) => setCfg({ ...cfg, maxDuplicatePct: v })}
            suffix="%"
            max={100}
            step={0.1}
          />
          <NumberRule
            label="Max |skewness| before flag"
            value={cfg.maxAbsSkew}
            onChange={(v) => setCfg({ ...cfg, maxAbsSkew: v })}
            step={0.1}
            max={10}
          />
          <NumberRule
            label="Min unique values"
            value={cfg.minUnique}
            onChange={(v) => setCfg({ ...cfg, minUnique: v })}
            step={1}
            max={100}
          />
          <NumberRule
            label="Max unique/total ratio (high cardinality)"
            value={cfg.maxCardinalityRatio}
            onChange={(v) => setCfg({ ...cfg, maxCardinalityRatio: v })}
            step={0.05}
            max={1}
          />

          <BoolRule
            label="Forbid leading/trailing whitespace"
            value={cfg.forbidLeadingTrailingSpaces}
            onChange={(v) => setCfg({ ...cfg, forbidLeadingTrailingSpaces: v })}
          />
          <BoolRule
            label="Flag mixed-case duplicates (e.g. USA / usa)"
            value={cfg.flagMixedCase}
            onChange={(v) => setCfg({ ...cfg, flagMixedCase: v })}
          />
          <BoolRule
            label="Flag constant / zero-variance columns"
            value={cfg.flagConstantColumns}
            onChange={(v) => setCfg({ ...cfg, flagConstantColumns: v })}
          />

          <div>
            <div className="text-sm font-medium mb-1">
              Required columns (schema, comma-separated)
            </div>
            <input
              value={cfg.requireColumns.join(", ")}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  requireColumns: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="id, created_at, amount"
              className="neo-inset px-3 py-2 text-sm bg-transparent w-full"
            />
          </div>
        </div>

        {/* Issues */}
        <div className="neo p-5">
          <div className="font-semibold mb-3">Issues found ({report?.total ?? 0})</div>
          {report && report.issues.length === 0 ? (
            <div className="neo-inset p-6 text-center text-sm">
              <ShieldCheck className="size-10 mx-auto text-emerald-500 mb-2" />
              No issues — dataset passes all configured rules.
            </div>
          ) : (
            <div className="space-y-2 max-h-[700px] overflow-y-auto pr-1">
              {report?.issues.map((iss, i) => (
                <IssueRow key={i} issue={iss} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Auto-clean */}
      <div className="neo p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="font-semibold flex items-center gap-2">
              <Wand2 className="size-4 text-primary" />
              One-click auto-clean
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Pick actions, preview the diff, then apply to your dataset (in-memory).
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={runPreview} className="neo-btn px-3 py-2 text-sm font-semibold">
              Preview
            </button>
            <button
              onClick={apply}
              disabled={!preview}
              className="neo-btn px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50"
            >
              Apply
            </button>
            <button
              onClick={() => {
                const rows = preview?.rows ?? dataset.rows;
                downloadCSV(`${dataset.name.replace(/\.[^.]+$/, "")}_cleaned.csv`, rows);
                toast.success(`Downloaded ${rows.length.toLocaleString()} rows`);
              }}
              className="neo-btn px-3 py-2 text-sm font-semibold flex items-center gap-1.5"
              aria-label="Download cleaned dataset as CSV"
            >
              <Download className="size-3.5" />
              Download CSV
            </button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {(Object.keys(ACTION_LABELS) as AutoCleanAction[]).map((a) => (
            <label key={a} className="neo-sm p-3 flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={actions.has(a)}
                onChange={() => toggle(a)}
                className="accent-primary size-4"
              />
              <span>{ACTION_LABELS[a]}</span>
            </label>
          ))}
        </div>
        {preview && (
          <div className="neo-inset p-4 space-y-3">
            <div className="font-semibold text-sm">Before / After preview</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <BAStat label="Rows" before={preview.before.rows} after={preview.after.rows} />
              <BAStat
                label="Columns"
                before={preview.before.columns}
                after={preview.after.columns}
              />
              <BAStat
                label="Missing"
                before={preview.before.missing}
                after={preview.after.missing}
                good="down"
              />
              <BAStat
                label="Duplicates"
                before={preview.before.duplicates}
                after={preview.after.duplicates}
                good="down"
              />
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">Changes</div>
              <ul className="text-xs space-y-1">
                {preview.changes
                  .filter((c) => c.count > 0)
                  .map((c) => (
                    <li key={c.action} className="flex justify-between gap-3">
                      <span>{ACTION_LABELS[c.action]}</span>
                      <span className="font-mono text-primary">
                        {c.count.toLocaleString()}
                        {c.detail ? ` · ${c.detail}` : ""}
                      </span>
                    </li>
                  ))}
                {preview.changes.every((c) => c.count === 0) && (
                  <li className="text-muted-foreground">
                    No changes — dataset already clean for selected actions.
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BAStat({
  label,
  before,
  after,
  good,
}: {
  label: string;
  before: number;
  after: number;
  good?: "up" | "down";
}) {
  const diff = after - before;
  const positive = good === "down" ? diff < 0 : diff > 0;
  const color =
    diff === 0
      ? "text-muted-foreground"
      : positive
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-destructive";
  return (
    <div className="neo-sm p-2.5">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="font-mono">
        {before.toLocaleString()} → <span className="font-bold">{after.toLocaleString()}</span>
      </div>
      <div className={`text-[10px] font-mono ${color}`}>
        {diff === 0 ? "no change" : (diff > 0 ? "+" : "") + diff.toLocaleString()}
      </div>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  tone: "good" | "warn" | "bad" | "neutral";
  icon?: React.ReactNode;
}) {
  const colorMap = {
    good: "text-emerald-600 dark:text-emerald-400",
    warn: "text-amber-600 dark:text-amber-400",
    bad: "text-destructive",
    neutral: "text-foreground",
  };
  return (
    <div className="neo p-4">
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-bold mt-1 ${colorMap[tone]}`}>{value}</div>
    </div>
  );
}

function NumberRule({
  label,
  value,
  onChange,
  suffix,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  max?: number;
  step?: number;
}) {
  return (
    <div>
      <div className="text-sm flex justify-between mb-1">
        <span>{label}</span>
        <span className="font-mono text-primary">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max ?? 100}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}

function BoolRule({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between text-xs sm:text-sm cursor-pointer py-1.5 gap-3 hover:bg-muted/30 px-2 rounded-lg transition-colors">
      <span className="min-w-0 flex-1 font-medium">{label}</span>
      <Switch checked={value} onCheckedChange={onChange} className="shrink-0" />
    </label>
  );
}

function IssueRow({ issue }: { issue: ValidationIssue }) {
  const tone =
    issue.severity === "error"
      ? "border-l-destructive bg-destructive/5"
      : issue.severity === "warning"
        ? "border-l-amber-500 bg-amber-500/5"
        : "border-l-blue-400 bg-blue-400/5";
  const Icon =
    issue.severity === "error" ? AlertCircle : issue.severity === "warning" ? AlertTriangle : Info;
  return (
    <div className={`border-l-4 rounded-md p-3 text-sm ${tone}`}>
      <div className="flex items-start gap-2">
        <Icon className="size-4 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-medium">
            {issue.column && (
              <span className="font-mono text-xs neo-sm px-1.5 py-0.5 mr-2">{issue.column}</span>
            )}
            {issue.message}
          </div>
          {issue.detail && (
            <div className="text-xs text-muted-foreground mt-0.5">{issue.detail}</div>
          )}
          <div className="text-[10px] text-muted-foreground mt-1 font-mono">{issue.ruleId}</div>
        </div>
      </div>
    </div>
  );
}
