import { useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, X, Search, Trash2, CheckCircle2, AlertTriangle, Loader2, Ban, Download } from "lucide-react";
import {
  subscribeExportJobs,
  getExportJobs,
  retryExportJob,
  cancelExportJob,
  dismissExportJob,
  clearFinishedExportJobs,
  downloadJobFile,
  dismissExportJobs,
  removeExportJobsOlderThan,
  type ExportJob,
} from "@/lib/export-jobs";

export function useExportJobs(): ExportJob[] {
  return useSyncExternalStore(subscribeExportJobs, getExportJobs, getExportJobs);
}

function statusIcon(job: ExportJob) {
  if (job.status === "done") return <CheckCircle2 className="size-4 text-emerald-500" />;
  if (job.status === "failed") return <AlertTriangle className="size-4 text-destructive" />;
  if (job.status === "canceled") return <Ban className="size-4 text-muted-foreground" />;
  return <Loader2 className="size-4 text-primary animate-spin" />;
}

export function ExportJobsPanel() {
  const jobs = useExportJobs();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "done" | "failed" | "canceled" | "active">("all");
  const [type, setType] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const types = useMemo(() => [...new Set(jobs.map((j) => j.label))].sort(), [jobs]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      const active = j.status === "queued" || j.status === "running" || j.status === "retrying";
      if (status === "active" ? !active : status !== "all" && j.status !== status) return false;
      if (type !== "all" && j.label !== type) return false;
      if (!q) return true;
      return [j.label, j.download?.filename, j.error, j.step]
        .filter(Boolean)
        .some((t) => String(t).toLowerCase().includes(q));
    });
  }, [jobs, query, status, type]);

  if (jobs.length === 0) return null;

  const isFinished = (j: ExportJob) =>
    j.status === "done" || j.status === "failed" || j.status === "canceled";
  const selectable = visible.filter(isFinished);
  const chosen = selectable.filter((j) => selected.has(j.id));
  const allChosen = selectable.length > 0 && chosen.length === selectable.length;
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const removeSelected = () => {
    const n = dismissExportJobs(chosen.map((j) => j.id));
    setSelected(new Set());
    toast.success(`Removed ${n} export${n === 1 ? "" : "s"}`);
  };
  const removeOld = (days: number) => {
    const n = removeExportJobsOlderThan(days * 86_400_000);
    toast.message(n ? `Removed ${n} export${n === 1 ? "" : "s"} older than ${days} days` : `Nothing older than ${days} days`);
  };

  const busy = jobs.some(
    (j) => j.status === "queued" || j.status === "running" || j.status === "retrying",
  );
  const finished = jobs.filter(
    (j) => j.status === "done" || j.status === "failed" || j.status === "canceled",
  ).length;

  return (
    <section
      aria-label="Export jobs"
      className="neo p-4 sm:p-5 space-y-3 border-primary/20"
      aria-busy={busy}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Export jobs
        </h2>
        {finished > 0 && (
          <button
            onClick={clearFinishedExportJobs}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
          >
            Clear finished
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[10rem]">
          <span className="sr-only">Search exports</span>
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, file or error"
            className="w-full neo-inset rounded-lg pl-8 pr-3 py-1.5 text-xs bg-transparent outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="neo-inset rounded-lg px-2 py-1.5 text-xs bg-background"
        >
          <option value="all">All statuses</option>
          <option value="done">Completed</option>
          <option value="failed">Failed</option>
          <option value="canceled">Canceled</option>
          <option value="active">In progress</option>
        </select>
        <select
          aria-label="Filter by export type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="neo-inset rounded-lg px-2 py-1.5 text-xs bg-background"
        >
          <option value="all">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <label className="flex items-center gap-2 text-muted-foreground">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={allChosen}
            disabled={selectable.length === 0}
            onChange={() =>
              setSelected(allChosen ? new Set() : new Set(selectable.map((j) => j.id)))
            }
          />
          Select all finished ({selectable.length})
        </label>
        <button
          onClick={removeSelected}
          disabled={chosen.length === 0}
          className="inline-flex items-center gap-1 font-semibold text-destructive disabled:opacity-40 hover:underline"
        >
          <Trash2 className="size-3.5" /> Remove selected ({chosen.length})
        </button>
        <button
          onClick={() => removeOld(7)}
          className="font-semibold text-muted-foreground hover:text-foreground hover:underline"
        >
          Remove older than 7 days
        </button>
        <span className="text-muted-foreground ml-auto" aria-live="polite">
          Showing {visible.length} of {jobs.length}
        </span>
      </div>

      {visible.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">No exports match your search.</p>
      )}

      <ul className="space-y-2" role="list">
        <AnimatePresence initial={false}>
          {visible.map((job) => (
            <motion.li
              key={job.id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="neo-inset p-3 rounded-xl"
            >
              <div className="flex items-start gap-3">
                {isFinished(job) && (
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary shrink-0"
                    checked={selected.has(job.id)}
                    onChange={() => toggle(job.id)}
                    aria-label={`Select ${job.label}`}
                  />
                )}
                <div className="mt-0.5 shrink-0">{statusIcon(job)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold truncate">{job.label}</span>
                    {job.download && (
                      <span className="text-[11px] text-muted-foreground truncate">
                        {job.download.filename}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(job.finishedAt ?? job.createdAt).toLocaleString()}
                    </span>
                    {job.attempt > 1 && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        attempt {job.attempt}/{job.maxAttempts}
                      </span>
                    )}
                  </div>
                  {job.settings && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate" title={JSON.stringify(job.settings, null, 2)}>
                      {String(job.settings.dataset ?? "")}
                      {job.settings.rows != null && ` · ${job.settings.rows} rows`}
                      {job.settings.role != null && ` · ${String(job.settings.role)}`}
                      {Array.isArray(job.settings.sections) && ` · ${job.settings.sections.length} sections`}
                      {job.hasSnapshot ? " · inputs saved" : ""}
                    </p>
                  )}
                  <p
                    className={`text-xs mt-0.5 ${job.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
                    aria-live="polite"
                  >
                    {job.status === "failed" && job.error ? job.error : job.step}
                  </p>
                  <div
                    className="mt-2 h-1.5 w-full rounded-full bg-muted/60 overflow-hidden"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={job.progress}
                    aria-label={`${job.label} progress`}
                  >
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        job.status === "failed"
                          ? "bg-destructive"
                          : job.status === "done"
                            ? "bg-emerald-500"
                            : "bg-primary"
                      }`}
                      style={{ width: `${job.status === "done" ? 100 : job.progress}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {job.status === "done" && job.download && (
                    <button
                      onClick={() => downloadJobFile(job.id)}
                      className="neo-btn p-1.5 rounded-lg text-primary"
                      aria-label={`Download ${job.download.filename}`}
                      title="Download"
                    >
                      <Download className="size-3.5" />
                    </button>
                  )}
                  {(job.status === "failed" || job.status === "canceled") && (
                    <button
                      onClick={() => {
                        if (!retryExportJob(job.id))
                          toast.message("Load your dataset on this page to retry this export.");
                      }}
                      className="neo-btn p-1.5 rounded-lg text-primary"
                      aria-label={`Retry ${job.label}`}
                      title="Retry"
                    >
                      <RefreshCw className="size-3.5" />
                    </button>
                  )}
                  {(job.status === "running" ||
                    job.status === "queued" ||
                    job.status === "retrying") && (
                    <button
                      onClick={() => cancelExportJob(job.id)}
                      className="neo-btn p-1.5 rounded-lg text-muted-foreground"
                      aria-label={`Cancel ${job.label}`}
                      title="Cancel"
                    >
                      <Ban className="size-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => dismissExportJob(job.id)}
                    className="neo-btn p-1.5 rounded-lg text-muted-foreground"
                    aria-label={`Dismiss ${job.label}`}
                    title="Dismiss"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
