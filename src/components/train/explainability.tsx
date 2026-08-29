import { motion } from "framer-motion";
import { Brain, HelpCircle, Info, Sparkles, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { MLModelResult } from "@/lib/ml.types";

interface ExplainabilityProps {
  modelResult?: MLModelResult;
}

const COLORS = [
  "hsl(var(--primary))",
  "#06b6d4",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
];

export function ExplainabilityDashboard({ modelResult }: ExplainabilityProps) {
  if (!modelResult || !modelResult.featureImportances || modelResult.featureImportances.length === 0) {
    return (
      <div className="neo p-8 text-center space-y-3">
        <HelpCircle className="size-10 mx-auto text-muted-foreground opacity-50" />
        <h3 className="font-bold text-lg">No Feature Attribution Data</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Train a model using the AutoML tab to view feature importance and model explainability metrics.
        </p>
      </div>
    );
  }

  const importances = modelResult.featureImportances;
  const topFeature = importances[0];
  const chartData = importances.slice(0, 10).map((f) => ({
    name: f.feature,
    importance: +(f.importance * 100).toFixed(2),
  }));

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="neo p-6 bg-gradient-to-r from-primary/10 via-accent/5 to-transparent flex flex-col md:flex-row gap-4 items-start md:items-center justify-between border-primary/30">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="size-6 text-primary" />
            <h2 className="text-xl font-bold">Model Explainability & Feature Importance</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Quantifying Permutation Feature Attribution & SHAP Impact for{" "}
            <strong className="text-foreground">{modelResult.modelName}</strong>.
          </p>
        </div>
        <div className="neo-sm px-4 py-2 bg-background/80 text-xs font-semibold flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span>Top Driver: <strong className="text-primary">{topFeature.feature}</strong> ({+(topFeature.importance * 100).toFixed(1)}%)</span>
        </div>
      </div>

      {/* Grid: Bar Chart + Feature Attribution Breakdown */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Feature Importance Bar Chart */}
        <div className="neo p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" />
              Global Feature Attribution (%)
            </h3>
            <span className="text-xs font-mono text-muted-foreground">Normalized Imp.</span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
              >
                <XAxis type="number" unit="%" tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={90} />
                <Tooltip
                  formatter={(val: number) => [`${val}%`, "Attribution"]}
                  contentStyle={{
                    background: "hsl(var(--background))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Feature Attribution List */}
        <div className="neo p-5 space-y-4">
          <h3 className="font-bold text-base flex items-center gap-2">
            <Info className="size-4 text-primary" />
            Feature Impact Ranking
          </h3>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {importances.map((item, idx) => (
              <div
                key={item.feature}
                className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="size-6 rounded-full bg-primary/10 text-primary font-mono font-bold text-xs grid place-items-center">
                    {idx + 1}
                  </span>
                  <span className="font-semibold text-foreground">{item.feature}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 bg-secondary h-2 rounded-full overflow-hidden hidden sm:block">
                    <div
                      className="bg-primary h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, item.importance * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs font-bold text-primary">
                    {(item.importance * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
