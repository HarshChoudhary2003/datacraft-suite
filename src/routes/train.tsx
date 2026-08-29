import { createFileRoute } from "@tanstack/react-router";
import { useDataset } from "@/store/dataset-context";
import { useState, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Play,
  Settings2,
  Target,
  BrainCircuit,
  Activity,
  BarChart3,
  AlertTriangle,
  Gauge,
  Lightbulb,
  Info,
  Brain,
  Layers,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { BenchmarksPage } from "@/components/train/benchmarks";
import { ExplainabilityDashboard } from "@/components/train/explainability";
import { ClusterInspector } from "@/components/train/cluster-inspector";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  CartesianGrid,
  ZAxis,
} from "recharts";
import type { MLTrainRequest, MLTrainResult, MLModelResult, MLProblemType } from "@/lib/ml.types";
import MLWorker from "@/lib/ml.worker?worker";

export const Route = createFileRoute("/train")({
  head: () => ({ meta: [{ title: "AutoML — DataIQ Pro" }] }),
  component: TrainPage,
});

export function TrainPage() {
  const [tab, setTab] = useState<"automl" | "explainability" | "clusters" | "benchmarks">("automl");
  const [activeResult, setActiveResult] = useState<MLModelResult | undefined>(undefined);

  return (
    <div className="flex flex-col gap-6 h-full min-h-[calc(100vh-6rem)]">
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold gradient-text">AutoML & Intelligence Suite</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Train machine learning models, inspect SHAP feature attributions, and analyze PCA clusters.
          </p>
        </div>

        <div className="neo p-1 flex gap-1 rounded-xl shrink-0 overflow-x-auto max-w-full">
          <button
            onClick={() => setTab("automl")}
            className={`relative px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
              tab === "automl" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "automl" && (
              <motion.div
                layoutId="train-tab-active"
                className="absolute inset-0 neo-inset rounded-lg -z-10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <BrainCircuit className="size-4" />
            <span>Model Builder</span>
          </button>

          <button
            onClick={() => setTab("explainability")}
            className={`relative px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
              tab === "explainability" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "explainability" && (
              <motion.div
                layoutId="train-tab-active"
                className="absolute inset-0 neo-inset rounded-lg -z-10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <Brain className="size-4" />
            <span>Explainability</span>
          </button>

          <button
            onClick={() => setTab("clusters")}
            className={`relative px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
              tab === "clusters" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "clusters" && (
              <motion.div
                layoutId="train-tab-active"
                className="absolute inset-0 neo-inset rounded-lg -z-10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <Layers className="size-4" />
            <span>PCA & Clusters</span>
          </button>

          <button
            onClick={() => setTab("benchmarks")}
            className={`relative px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
              tab === "benchmarks" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "benchmarks" && (
              <motion.div
                layoutId="train-tab-active"
                className="absolute inset-0 neo-inset rounded-lg -z-10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <Gauge className="size-4" />
            <span>Benchmarks</span>
          </button>
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
            {tab === "automl" && <AutoMLBuilder onModelTrained={(m) => setActiveResult(m)} />}
            {tab === "explainability" && <ExplainabilityDashboard modelResult={activeResult} />}
            {tab === "clusters" && <ClusterInspector modelResult={activeResult} />}
            {tab === "benchmarks" && <BenchmarksPage />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function AutoMLBuilder({ onModelTrained }: { onModelTrained?: (model: MLModelResult) => void }) {
  const { dataset } = useDataset();

  const [target, setTarget] = useState("");
  const [problemType, setProblemType] = useState<MLProblemType>("classification");
  const [testSize, setTestSize] = useState(0.2);
  const [nEstimators, setNEstimators] = useState(50);
  const [seed, setSeed] = useState(42);
  const [kClusters, setKClusters] = useState(3);

  const [isTraining, setIsTraining] = useState(false);
  const [result, setResult] = useState<MLTrainResult | null>(null);

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    return () => {
      if (workerRef.current) workerRef.current.terminate();
    };
  }, []);

  const candidates = useMemo(() => {
    if (!dataset) return [];
    return dataset.profiles.filter((p) => p.unique > 1 && p.missingPct < 100);
  }, [dataset]);

  // Auto-detect problem type when target changes
  useEffect(() => {
    if (!dataset || !target) return;
    const profile = dataset.profiles.find((p) => p.name === target);
    if (profile) {
      if (profile.type === "categorical" || profile.type === "boolean" || profile.unique <= 10) {
        setProblemType("classification");
      } else {
        setProblemType("regression");
      }
    }
  }, [target, dataset]);

  const features = useMemo(() => {
    if (!dataset) return [];
    return dataset.profiles
      .filter((p) =>
        problemType === "clustering"
          ? p.type === "numeric"
          : p.name !== target && p.type === "numeric",
      )
      .map((p) => p.name);
  }, [dataset, target, problemType]);

  const handleTrain = () => {
    if (!dataset) return;
    if (problemType !== "clustering" && !target)
      return toast.error("Please select a target variable.");
    if (features.length === 0)
      return toast.error(
        "No numeric features available for training. Use Feature Engineering to encode your categorical data.",
      );

    setIsTraining(true);
    setResult(null);
    toast.info(
      problemType === "clustering" ? "Running K-Means Clustering..." : "Training models...",
    );

    if (workerRef.current) workerRef.current.terminate();
    workerRef.current = new MLWorker();

    workerRef.current.onmessage = (e: MessageEvent<MLTrainResult>) => {
      setIsTraining(false);
      if (e.data.error) {
        toast.error(e.data.error);
      } else {
        setResult(e.data);
        if (e.data.leaderboard.length > 0 && onModelTrained) {
          onModelTrained(e.data.leaderboard[0]);
        }
        toast.success(`Trained ${e.data.leaderboard.length} models successfully!`);
      }
    };

    workerRef.current.onerror = (err) => {
      setIsTraining(false);
      toast.error("Web Worker crashed: " + err.message);
    };

    const req: MLTrainRequest = {
      datasetRows: dataset.rows,
      features,
      target: problemType === "clustering" ? undefined : target,
      problemType,
      options: { testSize, nEstimators, seed, kClusters },
    };

    workerRef.current.postMessage(req);
  };

  if (!dataset) {
    return (
      <div className="flex h-[80vh] items-center justify-center text-muted-foreground">
        Please upload a dataset first.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="neo p-6 bg-primary/5 border border-primary/20 rounded-2xl flex gap-4">
        <div className="shrink-0 mt-1">
          <Lightbulb className="size-6 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold mb-2 text-foreground">How to Use AutoML</h2>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
            <li>
              <strong>Select a Target Variable:</strong> Choose the column you want the AI to
              predict (e.g., "Survived", "Price"). Skip this step for Clustering.
            </li>
            <li>
              <strong>Select a Problem Type:</strong>
              <ul className="list-[circle] list-inside ml-6 mt-1 space-y-1">
                <li>
                  <em>Classification:</em> Predict a category (e.g., Yes/No, Red/Blue).
                </li>
                <li>
                  <em>Regression:</em> Predict a continuous number (e.g., House Price, Temperature).
                </li>
                <li>
                  <em>Clustering:</em> Discover hidden groups without a target variable (K-Means).
                </li>
              </ul>
            </li>
            <li>
              <strong>Configure Settings:</strong> Adjust parameters like Test Size (percentage of
              data held back to test accuracy) and Model Estimators.
            </li>
            <li>
              <strong>Train:</strong> Click "Train Models". The system will race multiple algorithms
              against each other and present you with a leaderboard of the most accurate ones!
            </li>
          </ul>
        </div>
      </div>

      <div className="hidden"></div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="neo p-6 bg-background space-y-6 md:col-span-1">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Target className="size-5 text-primary" /> Target Variable
            </h3>
            <select
              className="neo w-full p-2 bg-background disabled:opacity-50"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={problemType === "clustering"}
            >
              <option value="">
                {problemType === "clustering" ? "N/A for Clustering" : "-- Select Target --"}
              </option>
              {candidates.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Settings2 className="size-5 text-primary" /> Configuration
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Problem Type</label>
                <select
                  className="neo w-full p-2 bg-background"
                  value={problemType}
                  onChange={(e) => setProblemType(e.target.value as MLProblemType)}
                >
                  <option value="classification">Classification</option>
                  <option value="regression">Regression</option>
                  <option value="clustering">Clustering (Unsupervised)</option>
                </select>
              </div>

              {problemType === "clustering" ? (
                <div>
                  <label className="text-sm font-medium mb-1 flex justify-between">
                    <span>Number of Clusters (k)</span>
                    <span className="text-muted-foreground">{kClusters}</span>
                  </label>
                  <input
                    type="range"
                    min="2"
                    max="15"
                    step="1"
                    value={kClusters}
                    onChange={(e) => setKClusters(parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-sm font-medium mb-1 flex justify-between">
                      <span>Number of Trees</span>
                      <span className="text-muted-foreground">{nEstimators}</span>
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="200"
                      step="10"
                      value={nEstimators}
                      onChange={(e) => setNEstimators(parseInt(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 flex justify-between">
                      <span>Test Size</span>
                      <span className="text-muted-foreground">{Math.round(testSize * 100)}%</span>
                    </label>
                    <input
                      type="range"
                      min="0.05"
                      max="0.5"
                      step="0.05"
                      value={testSize}
                      onChange={(e) => setTestSize(parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="text-sm font-medium mb-1 block">Random Seed</label>
                <input
                  type="number"
                  className="neo w-full p-2 bg-background font-mono"
                  value={seed}
                  onChange={(e) => setSeed(parseInt(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleTrain}
              disabled={isTraining || (problemType !== "clustering" && !target)}
              className="neo-btn w-full flex items-center justify-center gap-2 py-3 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTraining ? (
                <div className="size-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <Play className="size-5" />
              )}
              {isTraining ? "Running..." : "Run"}
            </button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Using {features.length} numerical features
            </p>
          </div>
        </div>

        <div className="md:col-span-2 space-y-6">
          {features.length === 0 && target && (
            <div className="neo p-4 bg-orange-500/10 text-orange-500 flex gap-3 items-start">
              <AlertTriangle className="size-5 shrink-0" />
              <div>
                <p className="font-semibold">No Numeric Features Found</p>
                <p className="text-sm mt-1">
                  Random Forest requires numerical input features. Please go to the{" "}
                  <b>Feature Engineering</b> module and encode your categorical variables using
                  Label Encoding or One-Hot Encoding.
                </p>
              </div>
            </div>
          )}

          {isTraining && (
            <div className="neo p-12 bg-background flex flex-col items-center justify-center min-h-[400px]">
              <div className="size-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
              <h3 className="text-lg font-semibold">
                {problemType === "clustering" ? "Running K-Means..." : "Training Models..."}
              </h3>
              <p className="text-muted-foreground mt-2 text-center max-w-sm">
                {problemType === "clustering"
                  ? "Finding clusters and projecting via PCA..."
                  : `Training ${problemType === "classification" ? 4 : 3} different models...`}{" "}
                The Web Worker is running in the background to prevent freezing your browser.
              </p>
            </div>
          )}

          {!isTraining && result && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="neo p-6 bg-background">
                <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <Target className="size-5 text-primary" />{" "}
                  {problemType === "clustering" ? "Clustering Result" : "AutoML Leaderboard"}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        {problemType !== "clustering" && <th className="p-3 font-medium">Rank</th>}
                        <th className="p-3 font-medium">Model</th>
                        <th className="p-3 font-medium text-right">Time (ms)</th>
                        {problemType !== "clustering" && (
                          <>
                            <th className="p-3 font-medium text-right">
                              {result.problemType === "classification" ? "Accuracy" : "R² Score"}
                            </th>
                            {result.problemType === "regression" && (
                              <th className="p-3 font-medium text-right">RMSE</th>
                            )}
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {result.leaderboard.map((model, idx) => (
                        <tr
                          key={model.modelName}
                          className={`border-b border-border/50 ${idx === 0 ? "bg-primary/5" : "hover:bg-muted/10"}`}
                        >
                          {problemType !== "clustering" && (
                            <td className="p-3 font-mono">
                              {idx === 0 ? <span className="text-xl">🏆 1</span> : idx + 1}
                            </td>
                          )}
                          <td className="p-3 font-semibold">{model.modelName}</td>
                          <td className="p-3 text-right font-mono text-muted-foreground">
                            {model.trainingTimeMs} ms
                          </td>
                          {problemType !== "clustering" && (
                            <>
                              <td
                                className={`p-3 text-right font-mono font-bold ${idx === 0 ? "text-primary" : ""}`}
                              >
                                {result.problemType === "classification"
                                  ? (model.accuracy! * 100).toFixed(2) + "%"
                                  : model.r2!.toFixed(4)}
                              </td>
                              {result.problemType === "regression" && (
                                <td className="p-3 text-right font-mono text-muted-foreground">
                                  {model.rmse!.toFixed(2)}
                                </td>
                              )}
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center gap-2 px-2">
                <div className="flex-1 h-px bg-border/50"></div>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Diagnostics: {result.leaderboard[0].modelName}
                </span>
                <div className="flex-1 h-px bg-border/50"></div>
              </div>

              {result.problemType === "classification" &&
                result.leaderboard[0].confusionMatrix &&
                result.leaderboard[0].classes && (
                  <div className="neo p-6 bg-background">
                    <h3 className="text-lg font-semibold flex items-center gap-2 mb-6">
                      <BarChart3 className="size-5 text-primary" /> Confusion Matrix (Test Set)
                    </h3>

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <th className="p-2 border border-border text-muted-foreground bg-muted/20">
                              Actual \ Predicted
                            </th>
                            {result.leaderboard[0].classes.map((c) => (
                              <th key={c} className="p-2 border border-border">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.leaderboard[0].classes.map((actualClass, i) => (
                            <tr key={actualClass}>
                              <th className="p-2 border border-border text-left">{actualClass}</th>
                              {result.leaderboard[0].classes!.map((_, j) => {
                                const count = result.leaderboard[0].confusionMatrix![i][j];
                                const isCorrect = i === j;
                                const intensity = Math.min(
                                  1,
                                  count / (result.testSize / result.leaderboard[0].classes!.length),
                                );

                                return (
                                  <td
                                    key={j}
                                    className="p-3 border border-border text-center font-mono"
                                    style={{
                                      backgroundColor: isCorrect
                                        ? `rgba(16, 185, 129, ${intensity * 0.5})`
                                        : count > 0
                                          ? `rgba(239, 68, 68, ${intensity * 0.5})`
                                          : "transparent",
                                    }}
                                  >
                                    {count}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {result.problemType === "clustering" && result.leaderboard[0].clusters && (
                  <div className="neo p-6 bg-background md:col-span-2">
                    <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                      <Target className="size-5 text-primary" /> PCA Cluster Visualization (2D)
                    </h3>
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis type="number" dataKey="x" name="PC1" tick={{ fontSize: 12 }} />
                          <YAxis type="number" dataKey="y" name="PC2" tick={{ fontSize: 12 }} />
                          <ZAxis type="number" dataKey="cluster" name="Cluster" range={[60, 60]} />
                          <Tooltip
                            cursor={{ strokeDasharray: "3 3" }}
                            contentStyle={{
                              borderRadius: "8px",
                              border: "none",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                            }}
                          />
                          {/* Render each cluster as a separate series for distinct colors */}
                          {Array.from({
                            length:
                              Math.max(...result.leaderboard[0].clusters.map((c) => c.cluster)) + 1,
                          }).map((_, i) => (
                            <Scatter
                              key={i}
                              name={`Cluster ${i + 1}`}
                              data={result.leaderboard[0].clusters!.filter((c) => c.cluster === i)}
                              fill={`hsl(${(i * 137.5) % 360}, 70%, 50%)`}
                              fillOpacity={0.8}
                            />
                          ))}
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {result.leaderboard[0].featureImportances && (
                  <div className="neo p-6 bg-background">
                    <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                      <BarChart3 className="size-5 text-primary" /> Feature Importance (RF baseline)
                    </h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={result.leaderboard[0].featureImportances}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                          <XAxis type="number" hide />
                          <YAxis
                            dataKey="feature"
                            type="category"
                            axisLine={false}
                            tickLine={false}
                            fontSize={12}
                            width={100}
                          />
                          <Tooltip
                            cursor={{ fill: "transparent" }}
                            contentStyle={{
                              borderRadius: "8px",
                              border: "none",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                            }}
                          />
                          <Bar
                            dataKey="importance"
                            fill="#10b981"
                            radius={[0, 4, 4, 0]}
                            barSize={20}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {result.problemType === "regression" && result.leaderboard[0].predictionsSample && (
                  <div className="neo p-6 bg-background">
                    <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                      <Target className="size-5 text-primary" /> Actual vs Predicted
                    </h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                          <XAxis
                            type="number"
                            dataKey="actual"
                            name="Actual"
                            tick={{ fontSize: 12 }}
                          />
                          <YAxis
                            type="number"
                            dataKey="predicted"
                            name="Predicted"
                            tick={{ fontSize: 12 }}
                          />
                          <ZAxis range={[20, 20]} />
                          <Tooltip
                            cursor={{ strokeDasharray: "3 3" }}
                            contentStyle={{
                              borderRadius: "8px",
                              border: "none",
                              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                            }}
                          />
                          <Scatter
                            name="Sample"
                            data={result.leaderboard[0].predictionsSample}
                            fill="#3b82f6"
                            fillOpacity={0.6}
                          />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {!isTraining && !result && (
            <div className="neo p-12 bg-background flex flex-col items-center justify-center min-h-[400px] text-muted-foreground text-center">
              <BrainCircuit className="size-16 mb-4 opacity-20" />
              <p>Configure your model and hit Train.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
