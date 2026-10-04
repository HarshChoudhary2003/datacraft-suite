import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Bell, CheckCircle2, AlertTriangle, Download, RefreshCw } from "lucide-react";
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
} from "@/lib/export-jobs";

const EMPTY: never[] = [];

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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read).length;

  useEffect(
    () =>
      onExportNotification((n) => {
        if (n.kind === "success") {
          const canDl = Boolean(getJobDownload(n.jobId));
          toast.success(`${n.label} ready`, {
            description: n.message,
            action: canDl
              ? { label: "Download", onClick: () => downloadJobFile(n.jobId) }
              : undefined,
          });
        } else {
          toast.error(`${n.label} failed`, {
            description: n.message,
            action: { label: "Retry", onClick: () => retryExportJob(n.jobId) },
          });
        }
      }),
    [],
  );

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
            {items.length > 0 && (
              <button
                onClick={clearExportNotifications}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">
              No export notifications yet.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-border">
              {items.map((n) => {
                const dl = getJobDownload(n.jobId);
                return (
                  <li key={n.id} className="px-4 py-3 flex gap-3">
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
                            onClick={() => retryExportJob(n.jobId)}
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
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
