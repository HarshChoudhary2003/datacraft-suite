import { motion } from "framer-motion";

/**
 * Skeleton placeholder shown while a visual re-aggregates after a slicer change,
 * so the canvas never flashes empty or blocks on a large recomputation.
 */
export function ChartSkeleton({ variant = "chart" }: { variant?: "chart" | "kpi" }) {
  if (variant === "kpi") {
    return (
      <div className="flex h-full flex-col justify-between gap-3 p-4" aria-hidden="true">
        <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-muted" />
        <div className="h-8 w-3/4 animate-pulse rounded-lg bg-muted" />
        <div className="h-6 w-full animate-pulse rounded-lg bg-muted/60" />
      </div>
    );
  }
  return (
    <div className="flex h-full items-end gap-2 p-4" aria-hidden="true">
      {[62, 88, 44, 74, 96, 52, 80, 36].map((h, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0.35 }}
          animate={{ opacity: [0.35, 0.75, 0.35] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.07 }}
          className="flex-1 rounded-t-md bg-muted"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}
