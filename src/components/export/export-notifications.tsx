import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bell, CheckCircle2, AlertTriangle, Download, RefreshCw, Settings2, X, Search } from "lucide-react";
import {
  subscribeExportNotifications,
  getExportNotifications,
  markExportNotificationsRead,
  clearExportNotifications,
  onExportNotification,
  downloadJobFile,
  getJobDownload,
  retryExportJob,
  subscribeExportJobs,
  getExportJobs,
  hydrateExportJobs,
  dismissExportNotification,
  clearReadExportNotifications,
  removeExportNotificationsOlderThan,
} from "@/lib/export-jobs";
import {
  EXPORT_TYPES,
  popupPref,
  setPopupPref,
  subscribeNotificationPrefs,
  getNotificationPrefs,
  getServerNotificationPrefs,
} from "@/lib/export-notification-prefs";

function retryOrExplain(jobId: string) {
  if (!retryExportJob(jobId))
    toast.message("Open the Export page with your dataset loaded to retry this export.");
}

const EMPTY: never[] = [];
let toastOwner = false;

function timeAgo(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/** Bell with unread badge + dropdown list; also raises toasts for new events. */
export function ExportNotificationsBell() {
  const items = useSyncExternalStore(
    subscribeExportNotifications,
    getExportNotifications,
    () => EMPTY,
  );
  // Re-render when job downloads change so links stay accurate.
  useSyncExternalStore(subscribeExportJobs, getExportJobs, () => EMPTY);
  useSyncExternalStore(subscribeNotificationPrefs, getNotificationPrefs, getServerNotificationPrefs);
  const [open, setOpen] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [q, setQ] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "success" | "error">("all");
  const shown = items.filter(
    (n) =>
      (kindFilter === "all" || n.kind === kindFilter) &&
      (!q.trim() || `${n.label} ${n.message}`.toLowerCase().includes(q.trim().toLowerCase())),
  );
  useEffect(() => {
    void hydrateExportJobs();
  }, []);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read).length;

  useEffect(() => {
    // Both header variants mount a bell; only one should raise toasts.
    if (toastOwner) return;
    toastOwner = true;
    const off = onExportNotification((n) => {
        const pref = popupPref(n.label);
        if (n.kind === "success") {
          if (!pref.success) return;
          const canDl = Boolean(getJobDownload(n.jobId));
          toast.success(`${n.label} ready`, {
            description: n.message,
            action: canDl
              ? { label: "Download", onClick: () => downloadJobFile(n.jobId) }
              : undefined,
          });
        } else {
          if (!pref.failure) return;
          toast.error(`${n.label} failed`, {
            description: n.message,
            action: { label: "Retry", onClick: () => retryOrExplain(n.jobId) },
          });
        }
      });
    return () => {
      off();
      toastOwner = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    markExportNotificationsRead();
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, items.length]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="neo-btn p-1.5 rounded-full text-muted-foreground hover:text-foreground relative"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Export notifications"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Export notifications"
          className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))] z-50 rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <span className="text-sm font-bold">Notifications</span>
            <div className="flex items-center gap-3">
              {items.length > 0 && !showPrefs && (
                <button
                  onClick={clearExportNotifications}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={() => setShowPrefs((v) => !v)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Pop-up settings"
                aria-pressed={showPrefs}
                title="Pop-up settings"
              >
                <Settings2 className="size-4" />
              </button>
            </div>
          </div>
          {showPrefs ? (
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground mb-3">
                Choose which alerts pop up. All alerts still appear in this list.
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th scope="col" className="text-left font-medium pb-2">Export</th>
                    <th scope="col" className="font-medium pb-2 w-16">Ready</th>
                    <th scope="col" className="font-medium pb-2 w-16">Failed</th>
                  </tr>
                </thead>
                <tbody>
                  {EXPORT_TYPES.map((label) => {
                    const p = popupPref(label);
                    return (
                      <tr key={label} className="border-t border-border">
                        <th scope="row" className="text-left font-medium py-2">{label}</th>
                        {(["success", "failure"] as const).map((k) => (
                          <td key={k} className="text-center">
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={p[k]}
                              onChange={(e) => setPopupPref(label, k, e.target.checked)}
                              aria-label={`${label}: pop-up when ${k === "success" ? "ready" : "failed"}`}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
          <>
            {items.length > 0 && (
              <div className="px-4 pt-3 pb-2 space-y-2 border-b border-border">
                <div className="flex gap-2">
                  <label className="relative flex-1">
                    <span className="sr-only">Search notifications</span>
                    <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search"
                      className="w-full rounded-md border border-border bg-background pl-7 pr-2 py-1 text-xs"
                    />
                  </label>
                  <select
                    aria-label="Filter notifications"
                    value={kindFilter}
                    onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
                    className="rounded-md border border-border bg-background px-1.5 py-1 text-xs"
                  >
                    <option value="all">All</option>
                    <option value="success">Ready</option>
                    <option value="error">Failed</option>
                  </select>
                </div>
                <div className="flex gap-3 text-xs">
                  <button onClick={clearReadExportNotifications} className="text-muted-foreground hover:text-foreground hover:underline">
                    Clear read
                  </button>
                  <button onClick={() => removeExportNotificationsOlderThan(7 * 86_400_000)} className="text-muted-foreground hover:text-foreground hover:underline">
                    Clear older than 7 days
                  </button>
                </div>
              </div>
            )}
          {shown.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              {items.length ? "No notifications match." : "No export notifications yet."}
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-border">
              {shown.map((n) => {
                const dl = getJobDownload(n.jobId);
                return (
                  <li key={n.id} className="px-4 py-3 flex gap-3 group">
                    {n.kind === "success" ? (
                      <CheckCircle2 className="size-4 mt-0.5 shrink-0 text-primary" />
                    ) : (
                      <AlertTriangle className="size-4 mt-0.5 shrink-0 text-destructive" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {n.label} {n.kind === "success" ? "ready" : "failed"}
                      </p>
                      <p className="text-xs text-muted-foreground break-words">{n.message}</p>
                      <div className="mt-1.5 flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">{timeAgo(n.at)}</span>
                        {n.kind === "success" && dl && (
                          <button
                            onClick={() => downloadJobFile(n.jobId)}
                            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                          >
                            <Download className="size-3" /> Download
                          </button>
                        )}
                        {n.kind === "error" && (
                          <button
                            onClick={() => retryOrExplain(n.jobId)}
                            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                          >
                            <RefreshCw className="size-3" /> Retry
                          </button>
                        )}
                        <Link
                          to="/export"
                          onClick={() => setOpen(false)}
                          className="text-muted-foreground hover:text-foreground hover:underline"
                        >
                          View jobs
                        </Link>
                      </div>
                    </div>
                    <button
                      onClick={() => dismissExportNotification(n.id)}
                      className="self-start text-muted-foreground hover:text-foreground"
                      aria-label={`Remove notification: ${n.label}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          </>
          )}
        </div>
      )}
    </div>
  );
}
