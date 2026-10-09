import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  BrainCircuit,
  Briefcase,
  ChartColumn,
  Cpu,
  Database,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";
import { type Dataset } from "@/lib/stats";
import { clearCurrentDataset, loadCurrentDataset } from "@/lib/current-dataset";
import { runPipeline, type PipelineProgress, type PipelineResult } from "@/lib/processing-pipeline";
import { clearJob, jobToFile, loadJob } from "@/lib/processing-job";
import { getSessionId } from "@/lib/session";
import { recordTelemetryRun } from "@/lib/telemetry.functions";
import { recordAudit } from "@/lib/audit.functions";

export type Role =
  | "data_analyst"
  | "data_scientist"
  | "ml_engineer"
  | "ai_engineer"
  | "business_analyst"
  | "data_engineer";

// eslint-disable-next-line react-refresh/only-export-components
export const ROLES: { id: Role; label: string; short: string; tone: RoleTone; icon: LucideIcon }[] = [
  { id: "data_analyst", label: "Data Analyst", short: "Analyst", tone: "analyst", icon: ChartColumn },
  { id: "business_analyst", label: "Business Analyst", short: "BA", tone: "business", icon: Briefcase },
  { id: "data_scientist", label: "Data Scientist", short: "Scientist", tone: "scientist", icon: FlaskConical },
  { id: "ml_engineer", label: "ML Engineer", short: "ML", tone: "ml", icon: Cpu },
  { id: "ai_engineer", label: "AI Engineer", short: "AI", tone: "ai", icon: BrainCircuit },
  { id: "data_engineer", label: "Data Engineer", short: "DE", tone: "engineer", icon: Database },
];

export type RoleTone = "analyst" | "business" | "scientist" | "ml" | "ai" | "engineer";

const ROLE_ICON_SIZES = {
  xs: { tile: "size-5 rounded-md", icon: "size-3" },
  sm: { tile: "size-7 rounded-lg", icon: "size-4" },
  md: { tile: "size-8 rounded-lg", icon: "size-4.5" },
  lg: { tile: "size-10 rounded-xl", icon: "size-5" },
} as const;

/** Colorful gradient badge for a role's icon, themed by role color tokens. */
// eslint-disable-next-line react-refresh/only-export-components
export function RoleIcon({
  role,
  size = "sm",
  className = "",
  label,
}: {
  role: Role;
  size?: keyof typeof ROLE_ICON_SIZES;
  className?: string;
  /** When set, the tile is announced as an image with this label; otherwise it is decorative. */
  label?: string;
}) {
  const meta = ROLES.find((r) => r.id === role);
  if (!meta) return null;
  const Icon = meta.icon;
  const s = ROLE_ICON_SIZES[size];
  return (
    <span
      className={`grid shrink-0 place-items-center ${s.tile} ${className}`}
      style={{
        // White icon on a saturated gradient keeps ≥4.5:1 contrast in both themes.
        color: "#fff",
        background: `linear-gradient(135deg, var(--role-${meta.tone}), var(--role-${meta.tone}-soft))`,
        boxShadow: `0 2px 10px -2px color-mix(in oklab, var(--role-${meta.tone}) 45%, transparent), inset 0 0 0 1px color-mix(in oklab, var(--role-${meta.tone}) 70%, black)`,
      }}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <Icon className={s.icon} strokeWidth={2.25} aria-hidden="true" />
    </span>
  );
}

interface Ctx {
  dataset: Dataset | null;
  hydrated: boolean;
  /** True while a dataset is being parsed and persisted — navigation is blocked. */
  processing: boolean;
  setProcessing: (b: boolean) => void;
  /** Detailed per-step progress (parse/profile/correlate/store) with ETA. */
  progress: PipelineProgress | null;
  /** True when processing was auto-restored after a browser reload. */
  resuming: boolean;
  role: Role;
  setRole: (r: Role) => void;
  /** Parse + profile + correlate + store a file. Resolves once durably stored. */
  processFile: (file: File) => Promise<PipelineResult>;
  /** Same pipeline for already-parsed rows (sample datasets). */
  processRows: (name: string, rows: Record<string, unknown>[]) => Promise<PipelineResult>;
  clear: () => void;
  // Undo/Redo logic
  history: Dataset[];
  historyIndex: number;
  updateDataset: (ds: Dataset, pushToHistory?: boolean) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const DatasetCtx = createContext<Ctx | null>(null);

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [resuming, setResuming] = useState(false);
  const [role, setRole] = useState<Role>("data_analyst");
  const runningRef = useRef(false);
  // Latest role, read by fire-and-forget telemetry/audit reporters.
  const roleRef = useRef<Role>("data_analyst");
  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  // Persist a completed processing run to the server (telemetry + audit).
  // Best-effort: failures never disrupt the upload experience.
  const reportRun = useCallback((result: PipelineResult, resumed: boolean) => {
    const sessionId = getSessionId();
    const r = roleRef.current;
    const t = result.telemetry;
    void recordTelemetryRun({
      data: {
        sessionId,
        role: r,
        datasetName: t.fileName,
        rowCount: t.rowCount,
        colCount: t.colCount,
        totalMs: t.totalMs,
        rowsPerSec: t.rowsPerSec,
        stages: t.stages.map((s) => ({ id: s.id, label: s.label, ms: Math.round(s.ms) })),
        resumed,
      },
    }).catch(() => {});
    void recordAudit({
      data: {
        sessionId,
        role: r,
        action: resumed ? "upload_resumed" : "upload",
        target: t.fileName,
        status: "ok",
        meta: { rows: t.rowCount, cols: t.colCount, totalMs: t.totalMs, rowsPerSec: t.rowsPerSec },
      },
    }).catch(() => {});
  }, []);

  // Time-travel state
  const [history, setHistory] = useState<Dataset[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const updateDataset = useCallback(
    (ds: Dataset, pushToHistory = true) => {
      if (pushToHistory) {
        setHistory((prev) => {
          const h = prev.slice(0, historyIndex + 1);
          h.push(ds);
          if (h.length > 5) h.shift();
          return h;
        });
        setHistoryIndex((prev) => Math.min(4, prev + 1));
      }
      setDataset(ds);
    },
    [historyIndex],
  );

  const undo = useCallback(() => {
    if (canUndo) {
      const idx = historyIndex - 1;
      setHistoryIndex(idx);
      setDataset(history[idx]);
    }
  }, [canUndo, historyIndex, history]);

  const redo = useCallback(() => {
    if (canRedo) {
      const idx = historyIndex + 1;
      setHistoryIndex(idx);
      setDataset(history[idx]);
    }
  }, [canRedo, historyIndex, history]);

  const processFile = useCallback(
    async (file: File): Promise<PipelineResult> => {
      setProcessing(true);
      runningRef.current = true;
      try {
        const result = await runPipeline({ file, onProgress: setProgress });
        setDataset(result.dataset);
        setHistory([result.dataset]);
        setHistoryIndex(0);
        reportRun(result, false);
        return result;
      } finally {
        runningRef.current = false;
        setProcessing(false);
        setProgress(null);
        setResuming(false);
      }
    },
    [updateDataset, reportRun],
  );

  const processRows = useCallback(
    async (name: string, rows: Record<string, unknown>[]): Promise<PipelineResult> => {
      setProcessing(true);
      runningRef.current = true;
      try {
        const result = await runPipeline({
          name,
          rows,
          persistJob: false,
          onProgress: setProgress,
        });
        updateDataset(result.dataset);
        reportRun(result, false);
        return result;
      } finally {
        runningRef.current = false;
        setProcessing(false);
        setProgress(null);
      }
    },
    [updateDataset, reportRun],
  );

  const clear = useCallback(() => {
    setDataset(null);
    setHistory([]);
    setHistoryIndex(-1);
    void clearCurrentDataset();
    void clearJob();
  }, [updateDataset, reportRun]);

  // Hydrate stored dataset + auto-resume any interrupted processing job.
  useEffect(() => {
    let active = true;
    (async () => {
      const saved = await loadCurrentDataset().catch(() => null);
      if (active && saved) {
        setDataset(saved);
        setHistory([saved]);
        setHistoryIndex(0);
      }
      if (active) setHydrated(true);

      // Resume an interrupted upload if one was persisted before a reload.
      const job = await loadJob().catch(() => null);
      if (!active || !job || job.status !== "running" || runningRef.current) return;
      try {
        const file = jobToFile(job);
        setResuming(true);
        setProcessing(true);
        runningRef.current = true;
        const result = await runPipeline({ file, resuming: true, onProgress: setProgress });
        if (active) {
          setDataset(result.dataset);
          setHistory([result.dataset]);
          setHistoryIndex(0);
          reportRun(result, true);
        }
      } catch {
        await clearJob();
      } finally {
        runningRef.current = false;
        if (active) {
          setProcessing(false);
          setProgress(null);
          setResuming(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [updateDataset, reportRun]);

  return (
    <DatasetCtx.Provider
      value={{
        dataset,
        hydrated,
        processing,
        setProcessing,
        progress,
        resuming,
        role,
        setRole,
        processFile,
        processRows,
        clear,
        history,
        historyIndex,
        updateDataset,
        undo,
        redo,
        canUndo,
        canRedo,
      }}
    >
      {children}
    </DatasetCtx.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDataset() {
  const ctx = useContext(DatasetCtx);
  if (!ctx) throw new Error("useDataset must be used within DatasetProvider");
  return ctx;
}
