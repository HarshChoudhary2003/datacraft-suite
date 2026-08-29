import { Settings2, X } from "lucide-react";
import { motion } from "framer-motion";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import {
  type ExportSettings,
  PAGE_SIZE_OPTIONS,
  ORIENTATION_OPTIONS,
  CHART_ORDER_OPTIONS,
  SCALE_OPTIONS,
} from "@/lib/export-settings";
import { Switch } from "@/components/ui/switch";

function Field({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const id = `export-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-[10px] font-black uppercase tracking-widest text-muted-foreground"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium outline-none focus:border-primary"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-border bg-background/50 p-3 hover:bg-muted/30 transition-colors">
      <span className="min-w-0 flex-1">
        <span className="block text-xs sm:text-sm font-bold">{label}</span>
        <span className="block text-[11px] leading-snug text-muted-foreground mt-0.5">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5 shrink-0" />
    </label>
  );
}

/** Export settings dialog shared by the PDF and PNG exporters. */
export function ExportSettingsDialog({
  settings,
  onChange,
  onClose,
}: {
  settings: ExportSettings;
  onChange: (s: ExportSettings) => void;
  onClose: () => void;
}) {
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  const set = <K extends keyof ExportSettings>(k: K, v: ExportSettings[K]) =>
    onChange({ ...settings, [k]: v });

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
        aria-labelledby="export-settings-title"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="bento-card flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden outline-none"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
              <Settings2 className="size-3.5" /> Export settings
            </div>
            <h2
              id="export-settings-title"
              className="mt-1 text-base font-bold tracking-tight sm:text-lg"
            >
              PDF &amp; PNG output
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Applies to every dashboard download.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close export settings"
            className="rounded-xl border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Page size"
              value={settings.pageSize}
              options={PAGE_SIZE_OPTIONS}
              onChange={(v) => set("pageSize", v as ExportSettings["pageSize"])}
            />
            <Field
              label="Orientation"
              value={settings.orientation}
              options={ORIENTATION_OPTIONS}
              onChange={(v) => set("orientation", v as ExportSettings["orientation"])}
            />
            <Field
              label="Chart order"
              value={settings.chartOrder}
              options={CHART_ORDER_OPTIONS}
              onChange={(v) => set("chartOrder", v as ExportSettings["chartOrder"])}
            />
            <Field
              label="Resolution"
              value={String(settings.scale)}
              options={SCALE_OPTIONS}
              onChange={(v) => set("scale", Number(v) as ExportSettings["scale"])}
            />
            <Field
              label="Background"
              value={settings.background}
              options={[
                { value: "white", label: "White (print friendly)" },
                { value: "theme", label: "Match canvas theme" },
              ]}
              onChange={(v) => set("background", v as ExportSettings["background"])}
            />
          </div>

          <div className="space-y-2">
            <Toggle
              label="Include header"
              hint="Dataset name, row scope and export timestamp."
              checked={settings.includeHeader}
              onChange={(v) => set("includeHeader", v)}
            />
            <Toggle
              label="Include active filters"
              hint="Prints every slicer selection and cross-filter applied to the canvas."
              checked={settings.includeFilters}
              onChange={(v) => set("includeFilters", v)}
            />
            <Toggle
              label="Include visual captions"
              hint="Adds a page describing each visual's aggregation and row scope."
              checked={settings.includeCaptions}
              onChange={(v) => set("includeCaptions", v)}
            />
          </div>
        </div>

        <footer className="border-t border-border bg-muted/20 px-4 py-3 sm:px-5">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            Done
          </button>
        </footer>
      </motion.div>
    </motion.div>
  );
}
