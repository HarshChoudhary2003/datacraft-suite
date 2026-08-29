import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, GitCompare, AlertTriangle, TrendingUp } from "lucide-react";
import { StatsPage } from "@/components/analysis/stats";
import { CorrelationPage } from "@/components/analysis/correlation";
import { OutliersPage } from "@/components/analysis/outliers";
import { TimeSeriesPage } from "@/components/analysis/timeseries";

export const Route = createFileRoute("/analysis")({
  head: () => ({ meta: [{ title: "Deep Analysis — DataIQ Pro" }] }),
  component: AnalysisPage,
});

function AnalysisPage() {
  const [tab, setTab] = useState<"stats" | "correlation" | "outliers" | "timeseries">("stats");

  const tabs = [
    { id: "stats", label: "Descriptive Stats", icon: BarChart3 },
    { id: "correlation", label: "Correlation", icon: GitCompare },
    { id: "outliers", label: "Outliers", icon: AlertTriangle },
    { id: "timeseries", label: "Time Series", icon: TrendingUp },
  ] as const;

  return (
    <div className="flex flex-col gap-6 h-full min-h-[calc(100vh-6rem)]">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">Deep Analysis</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Profile and understand the underlying distributions, trends, and anomalies.
          </p>
        </div>

        <div className="neo p-1 flex gap-1 rounded-xl shrink-0 overflow-x-auto max-w-full">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as "stats" | "correlation" | "outliers" | "timeseries")}
                className={`relative px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="analysis-tab-active"
                    className="absolute inset-0 neo-inset rounded-lg -z-10"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <t.icon className="size-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {tab === "stats" && <StatsPage />}
            {tab === "correlation" && <CorrelationPage />}
            {tab === "outliers" && <OutliersPage />}
            {tab === "timeseries" && <TimeSeriesPage />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
