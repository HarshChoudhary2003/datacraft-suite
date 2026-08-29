import { useState } from "react";
import { motion } from "framer-motion";
import { History, X, Save, Trash2, Link2, Check, Eye } from "lucide-react";
import { toast } from "sonner";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { buildShareLink, type DashboardVersion, type SharePayload } from "@/lib/dashboard-versions";

/**
 * Save points, version history and shareable-link generation for a dashboard.
 * Read-only links strip every editing affordance for the recipient.
 */
export function VersionsPanel({
  datasetName,
  versions,
  onSave,
  onRestore,
  onDelete,
  sharePayload,
  onClose,
}: {
  datasetName: string;
  versions: DashboardVersion[];
  onSave: (label: string) => void;
  onRestore: (v: DashboardVersion) => void;
  onDelete: (id: string) => void;
  sharePayload: Omit<SharePayload, "ro">;
  onClose: () => void;
}) {
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  const [label, setLabel] = useState("");
  const [readOnly, setReadOnly] = useState(true);
  const [copied, setCopied] = useState(false);

  const link = buildShareLink({ ...sharePayload, ro: readOnly });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success(readOnly ? "Read-only share link copied." : "Editable share link copied.");
    } catch {
      toast.error("Clipboard unavailable — select and copy the link manually.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-background/70 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <motion.div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="versions-title"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="bento-card flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden outline-none"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
              <History className="size-3.5" /> Save &amp; share
            </div>
            <h2
              id="versions-title"
              className="mt-1 truncate text-base font-bold tracking-tight sm:text-lg"
            >
              {datasetName} dashboard
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {versions.length} saved version(s)
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close save and share panel"
            className="rounded-xl border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
          {/* Save a version */}
          <section>
            <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Create a save point
            </h3>
            <div className="flex gap-2">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onSave(label.trim() || `Version ${versions.length + 1}`);
                    setLabel("");
                  }
                }}
                placeholder={`Version ${versions.length + 1}`}
                aria-label="Version label"
                className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={() => {
                  onSave(label.trim() || `Version ${versions.length + 1}`);
                  setLabel("");
                }}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"
              >
                <Save className="size-3.5" /> Save
              </button>
            </div>
          </section>

          {/* History */}
          <section>
            <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Version history
            </h3>
            {versions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No versions yet — save one to snapshot the current layout, theme and filters.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {versions.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{v.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(v.createdAt).toLocaleString()} · {v.widgets.length} visuals ·{" "}
                        {v.theme}
                      </div>
                    </div>
                    <button
                      onClick={() => onRestore(v)}
                      className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-muted"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => onDelete(v.id)}
                      aria-label={`Delete ${v.label}`}
                      className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Share link */}
          <section>
            <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Shareable link
            </h3>
            <label className="mb-2 flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-background/50 p-3">
              <input
                type="checkbox"
                checked={readOnly}
                onChange={(e) => setReadOnly(e.target.checked)}
                className="mt-0.5 size-4 rounded border-border"
              />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  <Eye className="size-3.5" /> Read-only permissions
                </span>
                <span className="block text-[11px] leading-snug text-muted-foreground">
                  Recipients can explore slicers and drill through, but cannot add, edit, reorder or
                  delete visuals.
                </span>
              </span>
            </label>
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                aria-label="Share link"
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2 font-mono text-[11px] outline-none"
              />
              <button
                onClick={copy}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"
              >
                {copied ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}{" "}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              The layout travels inside the link; the recipient loads their own copy of the dataset
              — no data leaves this browser.
            </p>
          </section>
        </div>
      </motion.div>
    </motion.div>
  );
}
