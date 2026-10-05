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
  /** Object URL + filename for the finished file, so it can be re-downloaded. */
  download?: { url: string; filename: string };
}

export interface ExportNotification {
  id: string;
  jobId: string;
  kind: "success" | "error";
  label: string;
  message: string;
  at: number;
  read: boolean;
}

/** Handle passed to the job body so it can report progress. */
export interface ExportJobContext {
  progress: (pct: number, step?: string) => void;
  step: (step: string) => void;
  attempt: number;
  signal: AbortSignal;
  /** Keep the generated file so the user can download it from notifications. */
  attach: (blob: Blob, filename: string) => void;
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
const MAX_NOTIFICATIONS = 30;

let notifications: ExportNotification[] = [];
const notifListeners = new Set<Listener>();
function emitNotifs() {
  notifications = [...notifications];
  notifListeners.forEach((l) => l());
  persist();
}

// ---------- Persistence (localStorage metadata + IndexedDB files) ----------
const LS_KEY = "export-jobs-v1";
const DB_NAME = "export-files";
const STORE = "files";
let hydrated = false;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

function persist() {
  if (!hydrated || typeof localStorage === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      const slim = jobs.map((j) =>
        j.download ? { ...j, download: { url: "", filename: j.download.filename } } : j,
      );
      localStorage.setItem(LS_KEY, JSON.stringify({ jobs: slim, notifications }));
    } catch {
      /* quota or private mode — persistence is best-effort */
    }
  }, 150);
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise<T | undefined>((resolve) => {
    const tx = db.transaction(STORE, mode);
    const r = fn(tx.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(undefined);
  });
}
const saveFile = (id: string, blob: Blob) => void idb("readwrite", (s) => s.put(blob, id));
const deleteFile = (id: string) => void idb("readwrite", (s) => s.delete(id));

/** Restore jobs/notifications saved before a reload. Safe to call repeatedly. */
export async function hydrateExportJobs() {
  if (hydrated || typeof localStorage === "undefined") return;
  hydrated = true;
  let saved: { jobs?: ExportJob[]; notifications?: ExportNotification[] } = {};
  try {
    saved = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    saved = {};
  }
  const now = Date.now();
  const restored = (saved.jobs ?? []).map((j): ExportJob => {
    if (j.status === "queued" || j.status === "running" || j.status === "retrying") {
      return {
        ...j,
        status: "failed",
        step: "Interrupted",
        error: "Interrupted by page reload — retry to run it again.",
        finishedAt: now,
        download: undefined,
      };
    }
    return { ...j, download: undefined, ...(j.download ? { pendingFile: j.download.filename } : {}) } as ExportJob;
  });
  const ids = new Set(jobs.map((j) => j.id));
  jobs = [...jobs, ...restored.filter((j) => !ids.has(j.id))];
  notifications = [...notifications, ...(saved.notifications ?? [])].slice(0, MAX_NOTIFICATIONS);
  emit();
  emitNotifs();
  for (const j of restored) {
    const filename = (j as ExportJob & { pendingFile?: string }).pendingFile;
    if (!filename) continue;
    const blob = await idb<Blob>("readonly", (s) => s.get(j.id));
    if (blob) patch(j.id, { download: { url: URL.createObjectURL(blob), filename } });
  }
}

// Labels whose job body lives on a page; that page registers a re-run handler
// so jobs restored after a reload can still be retried.
const retryHandlers = new Map<string, () => void>();
export function registerExportRetry(label: string, fn: () => void): () => void {
  retryHandlers.set(label, fn);
  return () => {
    if (retryHandlers.get(label) === fn) retryHandlers.delete(label);
  };
}
export function canRetryExportJob(id: string) {
  const job = jobs.find((j) => j.id === id);
  return Boolean(job && (runners.has(id) || retryHandlers.has(job.label)));
}
export function subscribeExportNotifications(l: Listener): () => void {
  notifListeners.add(l);
  return () => notifListeners.delete(l);
}
export function getExportNotifications(): ExportNotification[] {
  return notifications;
}
export function markExportNotificationsRead() {
  if (!notifications.some((n) => !n.read)) return;
  notifications = notifications.map((n) => ({ ...n, read: true }));
  emitNotifs();
}
export function clearExportNotifications() {
  notifications = [];
  emitNotifs();
}
export function getJobDownload(jobId: string) {
  return jobs.find((j) => j.id === jobId)?.download;
}
/** Trigger a browser download for a finished job's file. */
export function downloadJobFile(jobId: string): boolean {
  const d = getJobDownload(jobId);
  if (!d || typeof document === "undefined") return false;
  const a = document.createElement("a");
  a.href = d.url;
  a.download = d.filename;
  a.click();
  return true;
}
function notify(jobId: string, kind: ExportNotification["kind"], message: string) {
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return;
  notifications = [
    { id: newId(), jobId, kind, label: job.label, message, at: Date.now(), read: false },
    ...notifications,
  ].slice(0, MAX_NOTIFICATIONS);
  emitNotifs();
  for (const fn of notifyHooks) fn(notifications[0], job);
}
type NotifyHook = (n: ExportNotification, job: ExportJob) => void;
const notifyHooks = new Set<NotifyHook>();
/** Register a side-channel (e.g. toasts) for new notifications. */
export function onExportNotification(fn: NotifyHook): () => void {
  notifyHooks.add(fn);
  return () => notifyHooks.delete(fn);
}
function revoke(id: string) {
  const d = jobs.find((j) => j.id === id)?.download;
  if (d?.url) URL.revokeObjectURL(d.url);
  deleteFile(id);
}
const BASE_BACKOFF_MS = 800;

function emit() {
  jobs = [...jobs];
  listeners.forEach((l) => {
    l();
  });
  persist();
}

function patch(id: string, next: Partial<ExportJob>) {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...next, updatedAt: Date.now() } : j));
  listeners.forEach((l) => {
    l();
  });
  persist();
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
    drop.forEach(revoke);
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
    attach: (blob, filename) => {
      revoke(id);
      saveFile(id, blob);
      patch(id, { download: { url: URL.createObjectURL(blob), filename } });
    },
  };

  try {
    await run(ctx);
    if (controller.signal.aborted) {
      patch(id, { status: "canceled", step: "Canceled", finishedAt: Date.now() });
    } else {
      patch(id, { status: "done", progress: 100, step: "Complete", finishedAt: Date.now() });
      const d = jobs.find((j) => j.id === id)?.download;
      notify(id, "success", d ? `${d.filename} is ready to download` : "Export complete");
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
      notify(id, "error", message);
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
export function retryExportJob(id: string): boolean {
  const job = jobs.find((j) => j.id === id);
  if (!job) return false;
  if (!runners.has(id)) {
    const handler = retryHandlers.get(job.label);
    if (!handler) return false;
    dismissExportJob(id);
    handler();
    return true;
  }
  if (job.status !== "failed" && job.status !== "canceled") return false;
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
  return true;
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
  revoke(id);
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
    revoke(j.id);
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

// ---------- Bulk cleanup ----------
const isTerminal = (j: ExportJob) =>
  j.status === "done" || j.status === "failed" || j.status === "canceled";

/** Remove many finished jobs (and their saved files) at once. Active jobs are skipped. */
export function dismissExportJobs(ids: string[], alsoNotifications = true) {
  const drop = new Set(jobs.filter((j) => ids.includes(j.id) && isTerminal(j)).map((j) => j.id));
  if (!drop.size) return 0;
  drop.forEach((id) => {
    revoke(id);
    runners.delete(id);
    cleanup(id);
  });
  jobs = jobs.filter((j) => !drop.has(j.id));
  emit();
  if (alsoNotifications) {
    notifications = notifications.filter((n) => !drop.has(n.jobId));
    emitNotifs();
  }
  return drop.size;
}

/** Remove finished jobs older than the given age. Returns how many were removed. */
export function removeExportJobsOlderThan(ms: number) {
  const cutoff = Date.now() - ms;
  return dismissExportJobs(
    jobs.filter((j) => isTerminal(j) && (j.finishedAt ?? j.createdAt) < cutoff).map((j) => j.id),
  );
}

export function dismissExportNotification(id: string) {
  notifications = notifications.filter((n) => n.id !== id);
  emitNotifs();
}

export function clearReadExportNotifications() {
  notifications = notifications.filter((n) => !n.read);
  emitNotifs();
}

export function removeExportNotificationsOlderThan(ms: number) {
  const cutoff = Date.now() - ms;
  notifications = notifications.filter((n) => n.at >= cutoff);
  emitNotifs();
}
