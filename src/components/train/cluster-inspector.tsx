import { useMemo } from "react";
import { Layers, HelpCircle, Sparkles, ScatterChart as ScatterIcon } from "lucide-react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { MLModelResult } from "@/lib/ml.types";

interface ClusterInspectorProps {
  modelResult?: MLModelResult;
}

const CLUSTER_COLORS = [
  "hsl(var(--primary))",
  "#06b6d4",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#ef4444",
];

export function ClusterInspector({ modelResult }: ClusterInspectorProps) {
  const clusters = modelResult?.clusters || [];
  const pc1 = modelResult?.pc1Variance ?? 0;
  const pc2 = modelResult?.pc2Variance ?? 0;

  // Single-pass memoized grouping and downsampling for high-performance SVG rendering
  const { groupedClusters, totalPoints, renderedPoints } = useMemo(() => {
    if (!clusters.length) return { groupedClusters: [], totalPoints: 0, renderedPoints: 0 };

    const maxPoints = 800;
    const step = Math.max(1, Math.floor(clusters.length / maxPoints));

    const groupsMap = new Map<number, typeof clusters>();
    let count = 0;

    for (let i = 0; i < clusters.length; i += step) {
      const item = clusters[i];
      let list = groupsMap.get(item.cluster);
      if (!list) {
        list = [];
        groupsMap.set(item.cluster, list);
      }
      list.push(item);
      count++;
    }

    const grouped = Array.from(groupsMap.entries())
      .map(([clusterId, data]) => ({ clusterId, data }))
      .sort((a, b) => a.clusterId - b.clusterId);

    return { groupedClusters: grouped, totalPoints: clusters.length, renderedPoints: count };
  }, [clusters]);

  if (!modelResult || !clusters.length) {
    return (
      <div className="neo p-8 text-center space-y-3">
        <HelpCircle className="size-10 mx-auto text-muted-foreground opacity-50" />
        <h3 className="font-bold text-lg">No Clustering Data Available</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Train a K-Means Clustering model in the AutoML tab to visualize PCA 2D/3D component projections and cluster centroids.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="neo p-6 bg-gradient-to-r from-accent/10 via-primary/5 to-transparent flex flex-col md:flex-row gap-4 items-start md:items-center justify-between border-accent/30">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="size-6 text-accent" />
            <h2 className="text-xl font-bold">PCA Dimensionality Reduction & Cluster Inspection</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Visualizing multi-dimensional feature space projected onto principal components (PC1 vs PC2).
          </p>
        </div>
        <div className="flex items-center gap-2 neo-sm px-4 py-2 bg-background/80 text-xs font-semibold">
          <Sparkles className="size-4 text-accent" />
          <span>
            Explained Variance: <strong className="text-accent">{(pc1 + pc2).toFixed(1)}%</strong> (PC1: {pc1}%, PC2: {pc2}%)
          </span>
        </div>
      </div>

      {/* Scatter Chart */}
      <div className="neo p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base flex items-center gap-2">
            <ScatterIcon className="size-4 text-accent" />
            PCA 2D Component Scatter Plot (K-Means Clusters: {groupedClusters.length})
          </h3>
          <span className="text-xs font-mono text-muted-foreground">
            {totalPoints.toLocaleString()} Total Points
            {renderedPoints < totalPoints && ` (Downsampled: ${renderedPoints})`}
          </span>
        </div>

        <div className="h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                type="number"
                dataKey="x"
                name="PC1"
                unit=""
                label={{ value: `PC1 (${pc1}% Var)`, position: "insideBottom", offset: -10 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="PC2"
                unit=""
                label={{ value: `PC2 (${pc2}% Var)`, angle: -90, position: "insideLeft" }}
              />
              <ZAxis range={[60, 60]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ payload }) => {
                  if (!payload || !payload.length) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="neo-sm p-3 bg-background border border-border text-xs space-y-1">
                      <div className="font-bold text-foreground">Cluster #{data.cluster}</div>
                      <div>PC1: {Number(data.x).toFixed(3)}</div>
                      <div>PC2: {Number(data.y).toFixed(3)}</div>
                    </div>
                  );
                }}
              />
              {groupedClusters.map(({ clusterId, data }) => (
                <Scatter
                  key={`cluster-${clusterId}`}
                  name={`Cluster ${clusterId}`}
                  data={data}
                  fill={CLUSTER_COLORS[clusterId % CLUSTER_COLORS.length]}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
