// In-app telemetry panel: shows the timing breakdown of the last dataset
// processing run (parse → profile → correlate → store), total time, and
// throughput, so users can confirm the app stayed responsive under load and
// that ETAs were accurate.
import { useEffect, useState } from "react";
import { Gauge, Clock, Zap } from "lucide-react";
import {
  readLatestTelemetry,
  formatMs,
  type ProcessingTelemetry,
} from "@/lib/processing-telemetry";

export function ProcessingTelemetryCard() {
  const [telemetry, setTelemetry] = useState<ProcessingTelemetry | null>(null);

  useEffect(() => {
    setTelemetry(readLatestTelemetry());
  }, []);

  if (!telemetry || telemetry.totalMs <= 0) return null;

  const maxStage = Math.max(1, ...telemetry.stages.map((s) => s.ms));

  return (
    <div className="neo p-4 sm:p-5 space-y-4" aria-label="Processing telemetry">
      <div className="flex flex-wrap items-center gap-3">
        <div className="font-semibold flex items-center gap-2 text-sm">
          <Gauge className="size-4 text-primary" />
          Processing telemetry
        </div>
        {telemetry.resumed && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-primary neo-sm px-2 py-0.5">
            resumed run
          </span>
        )}
        <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="size-3.5" /> {formatMs(telemetry.totalMs)} total
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="size-3.5 text-primary" /> {telemetry.rowsPerSec.toLocaleString()} rows/s
          </span>
        </div>
      </div>

      <ul className="space-y-2">
        {telemetry.stages.map((s) => {
          const pct = Math.round((s.ms / telemetry.totalMs) * 100);
          return (
            <li key={s.id} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-xs">
              <span className="font-medium truncate">{s.label}</span>
              <span className="h-2 rounded-full neo-inset overflow-hidden">
                <span
                  className="block h-full gradient-bg"
                  style={{ width: `${Math.max(2, (s.ms / maxStage) * 100)}%` }}
                />
              </span>
              <span className="font-mono text-muted-foreground tabular-nums">
                {formatMs(s.ms)} · {pct}%
              </span>
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] text-muted-foreground">
        Measured on the last run of{" "}
        <span className="font-medium text-foreground">{telemetry.fileName}</span> (
        {telemetry.rowCount.toLocaleString()} rows × {telemetry.colCount} cols).
      </p>
    </div>
  );
}
