import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, X, CheckCircle2, AlertTriangle, Loader2, Ban, Download } from "lucide-react";
import {
  subscribeExportJobs,
  getExportJobs,
  retryExportJob,
  cancelExportJob,
  dismissExportJob,
  clearFinishedExportJobs,
  downloadJobFile,
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
  if (jobs.length === 0) return null;

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

      <ul className="space-y-2" role="list">
        <AnimatePresence initial={false}>
          {jobs.map((job) => (
            <motion.li
              key={job.id}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="neo-inset p-3 rounded-xl"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">{statusIcon(job)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold truncate">{job.label}</span>
                    {job.attempt > 1 && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        attempt {job.attempt}/{job.maxAttempts}
                      </span>
                    )}
                  </div>
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
