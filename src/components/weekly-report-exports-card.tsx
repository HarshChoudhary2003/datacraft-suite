import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { tooltipStyle } from "@/lib/chart-theme";
import {
  getWeeklyReportExportTrend,
  subscribeWeeklyReportExports,
  type WeeklyReportExportPoint,
} from "@/lib/weekly-report-exports";

export function WeeklyReportExportsCard() {
  const [weeks, setWeeks] = useState<WeeklyReportExportPoint[] | null>(null);

  useEffect(() => {
    const refresh = () => setWeeks(getWeeklyReportExportTrend());
    refresh();
    return subscribeWeeklyReportExports(refresh);
  }, []);

  if (!weeks) return null;

  const current = weeks.at(-1)?.count ?? 0;
  const previous = weeks.at(-2)?.count ?? 0;
  const change = current - previous;
  const ChangeIcon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  const changeLabel = change > 0 ? `+${change}` : String(change);
  const hasReports = weeks.some((week) => week.count > 0);

  return (
    <section className="neo p-4 sm:p-5 space-y-4" aria-labelledby="weekly-report-exports-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center border border-primary/25 bg-primary/10 text-primary">
            <TrendingUp className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 id="weekly-report-exports-title" className="font-semibold text-sm">
              Weekly report exports
            </h2>
            <p className="text-xs text-muted-foreground">Analysis reports exported each week</p>
          </div>
        </div>
        <Link
          to="/export"
          className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Export report <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(8rem,0.8fr)_minmax(0,2fr)] sm:items-end">
        <div>
          <div className="text-xs font-medium text-muted-foreground">This week</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-4xl font-black tabular-nums text-foreground" aria-live="polite">
              {current}
            </span>
            <span className="text-xs text-muted-foreground">completed</span>
          </div>
          <div
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground"
            aria-label={`${Math.abs(change)} ${change === 1 || change === -1 ? "report" : "reports"} ${change > 0 ? "more" : change < 0 ? "fewer" : "change"} than last week`}
          >
            <ChangeIcon className={`size-3.5 ${change > 0 ? "text-emerald-600 dark:text-emerald-400" : change < 0 ? "text-amber-600 dark:text-amber-400" : ""}`} aria-hidden="true" />
            {changeLabel} vs last week
          </div>
        </div>

        <div className="h-36 min-w-0" role="img" aria-label="Completed analysis reports per week over the last eight weeks">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={18}
              />
              <YAxis
                allowDecimals={false}
                width={30}
                tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value) => [`${value} completed`, "Reports"]}
                labelFormatter={(label) => `Week of ${label}`}
              />
              <Line
                type="monotone"
                dataKey="count"
                name="Completed reports"
                stroke="var(--chart-2)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "var(--chart-2)", strokeWidth: 0 }}
                activeDot={{ r: 5, stroke: "var(--background)", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
        {hasReports
          ? "History is saved in this browser. Only completed HTML and PDF reports count."
          : "Tracking starts with your next completed HTML or PDF report; earlier exports aren't included."}
      </p>
    </section>
  );
}