// Background export job queue.
//
// Report generation (PDF/HTML/notebook/Excel) can be slow and can fail for
// reasons the user never sees (popup blocked, out of memory on a huge sheet,
// a transient authorization hiccup). This queue makes every export an
// observable job: it reports progress, retries transient failures with
// backoff, and keeps a terminal error visible instead of failing silently.

export type ExportJobStatus = "queued" | "running" | "retrying" | "done" | "failed" | "canceled";

export interface ExportJob {
  id: string;
  label: string;
  /** 0..100 */
  progress: number;
  /** Short human-readable step, e.g. "Rendering charts". */
  step: string;
  status: ExportJobStatus;
  attempt: number;
  maxAttempts: number;
  error?: string;
  /** Set when a failure is not worth retrying (e.g. popup blocked). */
  fatal?: boolean;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
  nextRetryAt?: number;
}

/** Handle passed to the job body so it can report progress. */
export interface ExportJobContext {
  progress: (pct: number, step?: string) => void;
  step: (step: string) => void;
  attempt: number;
  signal: AbortSignal;
}

/** Throw this from a job body to skip retries (user-actionable failure). */
export class FatalExportError extends Error {
  fatal = true as const;
  constructor(message: string) {
    super(message);
    this.name = "FatalExportError";
  }
}

type Listener = () => void;

const listeners = new Set<Listener>();
let jobs: ExportJob[] = [];
const controllers = new Map<string, AbortController>();
const runners = new Map<string, (ctx: ExportJobContext) => Promise<void>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

const MAX_HISTORY = 12;
const BASE_BACKOFF_MS = 800;

function emit() {
  jobs = [...jobs];
  listeners.forEach((l) => {
    l();
  });
}

function patch(id: string, next: Partial<ExportJob>) {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...next, updatedAt: Date.now() } : j));
  listeners.forEach((l) => {
    l();
  });
}

export function subscribeExportJobs(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getExportJobs(): ExportJob[] {
  return jobs;
}

export function activeExportJobCount(): number {
  return jobs.filter((j) => j.status === "queued" || j.status === "running" || j.status === "retrying")
    .length;
}

function trim() {
  const terminal = (j: ExportJob) =>
    j.status === "done" || j.status === "failed" || j.status === "canceled";
  const done = jobs.filter(terminal);
  if (done.length > MAX_HISTORY) {
    const drop = new Set(
      done
        .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0))
        .slice(0, done.length - MAX_HISTORY)
        .map((j) => j.id),
    );
    jobs = jobs.filter((j) => !drop.has(j.id));
  }
}

function newId() {
  return `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export interface EnqueueOptions {
  label: string;
  run: (ctx: ExportJobContext) => Promise<void>;
  maxAttempts?: number;
}

/** Queue an export. Returns the job id; resolution is observed via the queue. */
export function enqueueExportJob({ label, run, maxAttempts = 3 }: EnqueueOptions): string {
  const id = newId();
  const now = Date.now();
  jobs = [
    {
      id,
      label,
      progress: 0,
      step: "Queued",
      status: "queued",
      attempt: 0,
      maxAttempts: Math.max(1, maxAttempts),
      createdAt: now,
      updatedAt: now,
    },
    ...jobs,
  ];
  runners.set(id, run);
  trim();
  emit();
  // Let the click handler finish (and the UI paint) before heavy work starts.
  const t = setTimeout(() => {
    timers.delete(id);
    void execute(id);
  }, 0);
  timers.set(id, t);
  return id;
}

function isFatal(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { fatal?: boolean }).fatal);
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === "string") return err;
  return "Unknown export error";
}

async function execute(id: string) {
  const job = jobs.find((j) => j.id === id);
  const run = runners.get(id);
  if (!job || !run || job.status === "canceled") return;

  const controller = new AbortController();
  controllers.set(id, controller);
  const attempt = job.attempt + 1;
  patch(id, {
    status: "running",
    attempt,
    step: attempt > 1 ? `Retrying (attempt ${attempt})` : "Starting",
    progress: 0,
    error: undefined,
    nextRetryAt: undefined,
  });

  const ctx: ExportJobContext = {
    attempt,
    signal: controller.signal,
    progress: (pct, step) => {
      const clamped = Math.max(0, Math.min(100, Math.round(pct)));
      patch(id, step ? { progress: clamped, step } : { progress: clamped });
    },
    step: (step) => patch(id, { step }),
  };

  try {
    await run(ctx);
    if (controller.signal.aborted) {
      patch(id, { status: "canceled", step: "Canceled", finishedAt: Date.now() });
    } else {
      patch(id, { status: "done", progress: 100, step: "Complete", finishedAt: Date.now() });
    }
    cleanup(id);
  } catch (err) {
    if (controller.signal.aborted) {
      patch(id, { status: "canceled", step: "Canceled", finishedAt: Date.now() });
      cleanup(id);
      return;
    }
    const fatal = isFatal(err);
    const message = messageOf(err);
    const current = jobs.find((j) => j.id === id);
    const canRetry = !fatal && current ? attempt < current.maxAttempts : false;
    if (!canRetry) {
      patch(id, {
        status: "failed",
        step: fatal ? "Action needed" : "Failed",
        error: message,
        fatal,
        finishedAt: Date.now(),
      });
      return; // keep the runner so the user can retry manually
    }
    const delay = BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * 250;
    patch(id, {
      status: "retrying",
      step: `Retrying in ${Math.round(delay / 1000) || 1}s — ${message}`,
      error: message,
      nextRetryAt: Date.now() + delay,
    });
    const t = setTimeout(() => {
      timers.delete(id);
      void execute(id);
    }, delay);
    timers.set(id, t);
  }
}

function cleanup(id: string) {
  controllers.delete(id);
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
}

/** Manually retry a failed job (resets the attempt counter). */
export function retryExportJob(id: string) {
  const job = jobs.find((j) => j.id === id);
  if (!job || !runners.has(id)) return;
  if (job.status !== "failed" && job.status !== "canceled") return;
  patch(id, {
    status: "queued",
    attempt: 0,
    progress: 0,
    step: "Queued",
    error: undefined,
    fatal: undefined,
    finishedAt: undefined,
  });
  void execute(id);
}

export function cancelExportJob(id: string) {
  const job = jobs.find((j) => j.id === id);
  if (!job) return;
  controllers.get(id)?.abort();
  const t = timers.get(id);
  if (t) {
    clearTimeout(t);
    timers.delete(id);
  }
  if (job.status !== "done") {
    patch(id, { status: "canceled", step: "Canceled", finishedAt: Date.now() });
  }
  controllers.delete(id);
}

export function dismissExportJob(id: string) {
  jobs = jobs.filter((j) => j.id !== id);
  runners.delete(id);
  cleanup(id);
  emit();
}

export function clearFinishedExportJobs() {
  const keep = jobs.filter(
    (j) => j.status === "queued" || j.status === "running" || j.status === "retrying",
  );
  const removed = jobs.filter((j) => !keep.includes(j));
  removed.forEach((j) => {
    runners.delete(j.id);
    cleanup(j.id);
  });
  jobs = keep;
  emit();
}

/** Yield to the browser so progress updates paint during long generation. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
