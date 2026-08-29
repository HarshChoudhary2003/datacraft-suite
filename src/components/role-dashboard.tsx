import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, ShieldCheck, Star, Circle, Route as RouteIcon } from "lucide-react";
import { useDataset, ROLES } from "@/store/dataset-context";
import { presetFor, computeMetric, type AccessLevel } from "@/lib/role-presets";

const accessMeta: Record<AccessLevel, { label: string; icon: typeof Star; cls: string }> = {
  primary: { label: "Primary", icon: Star, cls: "text-primary" },
  secondary: { label: "Secondary", icon: ShieldCheck, cls: "text-accent-foreground/70" },
  optional: { label: "Optional", icon: Circle, cls: "text-muted-foreground" },
};

/** Role-specific dashboard: mission, KPIs, capabilities/permissions, and recommended workflow. */
export function RoleDashboard() {
  const { dataset, role } = useDataset();
  if (!dataset) return null;
  const preset = presetFor(role);
  const roleMeta = ROLES.find((r) => r.id === role);

  return (
    <div className="space-y-4">
      {/* Header + mission */}
      <div className="neo p-5 bg-gradient-to-br from-primary/10 to-transparent border-l-4 border-primary">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl" aria-hidden="true">
            {roleMeta?.emoji}
          </span>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" /> {roleMeta?.label} workspace
            </div>
            <h2 className="text-lg font-bold gradient-text leading-tight">{preset.mission}</h2>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-2">{preset.insightAngle}</p>
      </div>

      {/* Role KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {preset.dashboard.map((m, i) => {
          const { value, hint } = computeMetric(m.key, dataset);
          return (
            <motion.div
              key={m.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="neo p-4"
            >
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                {m.label}
              </div>
              <div className="text-2xl font-bold gradient-text mt-1 truncate">{value}</div>
              {hint && (
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate" title={hint}>
                  {hint}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* Recommended workflow */}
        <div className="neo p-5 lg:col-span-3">
          <div className="font-semibold mb-3 flex items-center gap-2">
            <RouteIcon className="size-4 text-primary" /> Recommended workflow
          </div>
          <ol className="space-y-2">
            {preset.workflow.map((step, i) => (
              <li key={i}>
                <Link
                  to={step.to}
                  className="group neo-sm p-3 flex items-start gap-3 hover:bg-primary/5 transition-colors"
                >
                  <span className="shrink-0 size-6 rounded-full grid place-items-center text-xs font-bold gradient-bg text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold flex items-center gap-1.5">
                      {step.label}
                      <ArrowRight className="size-3.5 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all text-primary" />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{step.detail}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </div>

        {/* Capabilities / permissions */}
        <div className="neo p-5 lg:col-span-2">
          <div className="font-semibold mb-1 flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" /> Workspace access
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Tools prioritised for the {roleMeta?.label} role.
          </p>
          <div className="space-y-1.5">
            {preset.capabilities.map((c) => {
              const meta = accessMeta[c.access];
              const Icon = meta.icon;
              return (
                <Link
                  key={c.to + c.label}
                  to={c.to}
                  className="flex items-center justify-between gap-2 neo-sm px-3 py-2 hover:bg-primary/5 transition-colors"
                >
                  <span className="text-sm font-medium truncate flex items-center gap-2">
                    <Icon className={`size-3.5 shrink-0 ${meta.cls}`} /> {c.label}
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
