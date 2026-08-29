import { CheckCircle2, Loader2, Circle, Clock, RotateCcw } from "lucide-react";
import { STAGE_DEFS, type PipelineProgress } from "@/lib/processing-pipeline";

function formatEta(ms: number | null): string {
  if (ms == null) return "estimating…";
  if (ms <= 0) return "almost done";
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `~${s}s remaining`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `~${m}m ${rem}s remaining`;
}

/** Detailed parse → profile → correlate → store breakdown with ETA. */
export function ProcessingBreakdown({
  progress,
  resuming,
}: {
  progress: PipelineProgress | null;
  resuming?: boolean;
}) {
  const pct = progress ? Math.round(progress.overallPct) : 0;
  const stages =
    progress?.stages ??
    STAGE_DEFS.map((s) => ({ id: s.id, label: s.label, status: "pending" as const }));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="Processing dataset"
      className="space-y-3"
    >
      {resuming && (
        <div className="flex items-center gap-2 text-xs font-semibold text-primary">
          <RotateCcw className="size-3.5" />
          Resuming after reload — continuing where it left off
        </div>
      )}

      <div className="h-2 rounded-full neo-inset overflow-hidden">
        <div
          className="h-full gradient-bg transition-all duration-300"
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
        <span>{pct}% complete</span>
        <span className="flex items-center gap-1">
          <Clock className="size-3" />
          {formatEta(progress?.etaMs ?? null)}
        </span>
      </div>

      <ul className="space-y-1.5">
        {stages.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-xs">
            {s.status === "done" ? (
              <CheckCircle2 className="size-4 text-primary shrink-0" />
            ) : s.status === "running" ? (
              <Loader2 className="size-4 text-primary shrink-0 animate-spin" />
            ) : (
              <Circle className="size-4 text-muted-foreground/40 shrink-0" />
            )}
            <span
              className={
                s.status === "running"
                  ? "font-semibold text-foreground"
                  : s.status === "done"
                    ? "text-muted-foreground line-through"
                    : "text-muted-foreground/70"
              }
            >
              {s.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
