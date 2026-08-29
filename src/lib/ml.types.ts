export type MLProblemType = "classification" | "regression" | "clustering";

export interface MLTrainRequest {
  datasetRows: Record<string, unknown>[];
  features: string[];
  target?: string;
  problemType: MLProblemType;
  options: {
    testSize: number; // 0.0 to 1.0
    seed: number;
    nEstimators: number;
    maxDepth?: number;
    kClusters?: number; // For K-Means
  };
}

export interface ClusterPoint {
  x: number; // PCA component 1
  y: number; // PCA component 2
  cluster: number;
  originalIndex?: number;
}

export interface MLModelResult {
  modelName: string;
  problemType: MLProblemType;

  // Classification metrics
  accuracy?: number;
  confusionMatrix?: number[][];
  classes?: string[];

  // Regression metrics
  mse?: number;
  rmse?: number;
  r2?: number;

  // Clustering metrics
  clusters?: ClusterPoint[];
  centroids?: number[][];
  pc1Variance?: number;
  pc2Variance?: number;

  // Shared
  predictionsSample?: { actual: number; predicted: number }[];
  featureImportances?: { feature: string; importance: number }[];

  trainingTimeMs: number;
  error?: string;
}

export interface MLTrainResult {
  problemType: MLProblemType;
  leaderboard: MLModelResult[];
  trainSize: number;
  testSize: number;
  error?: string;
}
