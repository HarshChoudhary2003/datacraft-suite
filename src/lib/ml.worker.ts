import type { MLTrainRequest, MLTrainResult, MLModelResult } from "./ml.types";
import { RandomForestClassifier, RandomForestRegression } from "ml-random-forest";
import { DecisionTreeClassifier, DecisionTreeRegression } from "ml-cart";
import KNN from "ml-knn";
import { GaussianNB } from "ml-naivebayes";
import MLR from "ml-regression-multivariate-linear";
import { kmeans } from "ml-kmeans";
import { PCA } from "ml-pca";

class StandardScaler {
  means: number[] = [];
  stds: number[] = [];

  fit(X: number[][]) {
    if (!X.length || !X[0].length) return;
    const n = X.length;
    const m = X[0].length;
    this.means = Array(m).fill(0);
    this.stds = Array(m).fill(0);

    for (let j = 0; j < m; j++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += X[i][j];
      this.means[j] = sum / n;

      let sqSum = 0;
      for (let i = 0; i < n; i++) sqSum += Math.pow(X[i][j] - this.means[j], 2);
      this.stds[j] = Math.sqrt(sqSum / n) || 1e-8;
    }
  }

  transform(X: number[][]): number[][] {
    if (!X.length || !X[0].length) return X;
    const n = X.length;
    const m = X[0].length;
    const res = Array(n)
      .fill(0)
      .map(() => Array(m).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        res[i][j] = (X[i][j] - this.means[j]) / this.stds[j];
      }
    }
    return res;
  }
}

class SimpleImputer {
  means: number[] = [];

  fit(X: number[][]) {
    if (!X.length || !X[0].length) return;
    const n = X.length;
    const m = X[0].length;
    this.means = Array(m).fill(0);

    for (let j = 0; j < m; j++) {
      let sum = 0;
      let count = 0;
      for (let i = 0; i < n; i++) {
        const val = X[i][j];
        if (!Number.isNaN(val) && val !== null && val !== undefined) {
          sum += val;
          count++;
        }
      }
      this.means[j] = count > 0 ? sum / count : 0;
    }
  }

  transform(X: number[][]): number[][] {
    if (!X.length || !X[0].length) return X;
    const n = X.length;
    const m = X[0].length;
    const res = Array(n)
      .fill(0)
      .map(() => Array(m).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m; j++) {
        const val = X[i][j];
        if (Number.isNaN(val) || val === null || val === undefined) {
          res[i][j] = this.means[j];
        } else {
          res[i][j] = val;
        }
      }
    }
    return res;
  }
}

// Pseudo-random number generator for shuffling
function sfc32(a: number, b: number, c: number, d: number) {
  return function () {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

function calculatePermutationImportance(
  model: unknown,
  predictFn: (model: unknown, X: number[][]) => number[],
  X_test: number[][],
  y_test: number[],
  baseScore: number,
  isClassification: boolean,
  features: string[],
  rand: () => number,
) {
  const importances: { feature: string; importance: number }[] = [];
  const numSamples = X_test.length;
  if (numSamples === 0) return [];

  for (let j = 0; j < features.length; j++) {
    const X_shuffled = X_test.map((row) => [...row]);

    const colValues = X_shuffled.map((row) => row[j]);
    for (let i = colValues.length - 1; i > 0; i--) {
      const k = Math.floor(rand() * (i + 1));
      [colValues[i], colValues[k]] = [colValues[k], colValues[i]];
    }

    for (let i = 0; i < numSamples; i++) {
      X_shuffled[i][j] = colValues[i];
    }

    const y_pred = predictFn(model, X_shuffled);

    let shuffledScore = 0;
    if (isClassification) {
      let correct = 0;
      for (let i = 0; i < numSamples; i++) if (y_pred[i] === y_test[i]) correct++;
      shuffledScore = correct / numSamples;
    } else {
      let sumSqErr = 0;
      let sumSqTot = 0;
      const meanY = y_test.reduce((a, b) => a + b, 0) / numSamples;
      for (let i = 0; i < numSamples; i++) {
        sumSqErr += Math.pow(y_test[i] - y_pred[i], 2);
        sumSqTot += Math.pow(y_test[i] - meanY, 2);
      }
      shuffledScore = sumSqTot === 0 ? 0 : 1 - sumSqErr / sumSqTot;
    }

    let drop = baseScore - shuffledScore;
    if (drop < 0) drop = 0;
    importances.push({ feature: features[j], importance: drop });
  }

  const sumDrop = importances.reduce((acc, curr) => acc + curr.importance, 0);
  if (sumDrop > 0) {
    importances.forEach((imp) => (imp.importance = imp.importance / sumDrop));
  }

  importances.sort((a, b) => b.importance - a.importance);
  return importances;
}

function calculateAccuracyMatrix(y_test: number[], y_pred: number[], numClasses: number) {
  let correct = 0;
  const matrix = Array.from({ length: numClasses }, () => Array(numClasses).fill(0));
  for (let i = 0; i < y_test.length; i++) {
    const act = y_test[i];
    const pred = y_pred[i];
    if (act === pred) correct++;
    if (act >= 0 && act < numClasses && pred >= 0 && pred < numClasses) {
      matrix[act][pred]++;
    }
  }
  return { accuracy: correct / Math.max(1, y_test.length), confusionMatrix: matrix };
}

function calculateR2MSE(y_test: number[], y_pred: number[]) {
  let sumSqErr = 0;
  let sumSqTot = 0;
  const meanY = y_test.reduce((a, b) => a + b, 0) / Math.max(1, y_test.length);

  for (let i = 0; i < y_test.length; i++) {
    const actual = y_test[i];
    const predicted = y_pred[i];
    sumSqErr += Math.pow(actual - predicted, 2);
    sumSqTot += Math.pow(actual - meanY, 2);
  }

  const mse = sumSqErr / Math.max(1, y_test.length);
  const r2 = sumSqTot === 0 ? 0 : 1 - sumSqErr / sumSqTot;
  return { mse, r2 };
}

self.onmessage = async (e: MessageEvent<MLTrainRequest>) => {
  try {
    const req = e.data;

    // 1. Data Preparation
    const validRows = req.datasetRows.filter((r) => {
      if (
        req.problemType !== "clustering" &&
        (req.target == null || r[req.target] == null || r[req.target] === "")
      )
        return false;
      for (const f of req.features) {
        const val = r[f];
        if (val == null || val === "" || Number.isNaN(Number(val))) return false;
      }
      return true;
    });

    if (validRows.length < 10) {
      throw new Error(
        `Only ${validRows.length} valid rows remain after dropping missing values. Not enough data to train.`,
      );
    }

    // 2. Shuffle — deterministic, unbiased Fisher–Yates (seeded).
    const rand = sfc32(req.options.seed, 0x9e3779b9, 0x243f6a88, 0xb7e15162);
    const shuffled = [...validRows];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // 3. Train/Test Split
    const testCount = Math.floor(shuffled.length * req.options.testSize);
    const trainCount = shuffled.length - testCount;
    const trainRows = shuffled.slice(0, trainCount);
    const testRows = shuffled.slice(trainCount);

    const getX = (rows: Record<string, unknown>[]) =>
      rows.map((r) => req.features.map((f) => Number(r[f])));

    const X_train_raw = getX(trainRows);
    const X_test_raw = getX(testRows);

    // 1. Accurately impute missing values (Mean Imputation)
    const imputer = new SimpleImputer();
    imputer.fit(X_train_raw);
    const X_train = imputer.transform(X_train_raw);
    const X_test = imputer.transform(X_test_raw);

    // 2. Scale features! (Crucial for KNN, Linear Reg, K-Means)
    const scaler = new StandardScaler();
    scaler.fit(X_train);
    const X_train_scaled = scaler.transform(X_train);
    const X_test_scaled = scaler.transform(X_test);

    const leaderboard: MLModelResult[] = [];

    if (req.problemType === "classification") {
      const targetStr = req.target!;
      const rawClasses = Array.from(new Set(validRows.map((r) => String(r[targetStr])))).sort();
      const getY = (rows: Record<string, unknown>[]) =>
        rows.map((r) => rawClasses.indexOf(String(r[targetStr])));

      const y_train = getY(trainRows);
      const y_test = getY(testRows);

      const evaluateClass = (
        name: string,
        trainFn: () => unknown,
        predictFn: (model: any, X: number[][]) => number[],
      ) => {
        const start = performance.now();
        let model: unknown;
        try {
          model = trainFn();
        } catch (err: unknown) {
          leaderboard.push({
            modelName: name,
            problemType: "classification",
            trainingTimeMs: 0,
            error: err instanceof Error ? err.message : String(err),
          });
          return;
        }
        const y_pred = predictFn(model, X_test_scaled);
        const end = performance.now();

        const { accuracy, confusionMatrix } = calculateAccuracyMatrix(
          y_test,
          y_pred,
          rawClasses.length,
        );

        let featureImportances: { feature: string; importance: number }[] | undefined = undefined;
        // Compute permutation feature importance if we have features
        if (req.features.length > 0) {
          featureImportances = calculatePermutationImportance(
            model,
            predictFn,
            X_test_scaled,
            y_test,
            accuracy,
            true,
            req.features,
            rand,
          );
        }

        leaderboard.push({
          modelName: name,
          problemType: "classification",
          accuracy,
          confusionMatrix,
          classes: rawClasses,
          trainingTimeMs: Math.round(end - start),
          featureImportances,
        });
      };

      evaluateClass(
        "Random Forest",
        () => {
          const rf = new RandomForestClassifier({
            seed: req.options.seed,
            nEstimators: req.options.nEstimators,
            maxFeatures: Math.max(1, Math.floor(Math.sqrt(req.features.length))),
            replacement: true,
          });
          rf.train(X_train_scaled, y_train);
          return rf;
        },
        (m, X) => m.predict(X),
      );

      evaluateClass(
        "Decision Tree",
        () => {
          const dt = new DecisionTreeClassifier({ maxDepth: req.options.maxDepth || 10 });
          dt.train(X_train_scaled, y_train);
          return dt;
        },
        (m, X) => m.predict(X),
      );

      evaluateClass(
        "K-Nearest Neighbors",
        () =>
          new KNN(X_train_scaled, y_train, {
            k: Math.max(1, Math.min(5, X_train_scaled.length - 1)),
          }),
        (m, X) => m.predict(X),
      );

      evaluateClass(
        "Naive Bayes",
        () => {
          const nb = new GaussianNB();
          nb.train(X_train_scaled, y_train);
          return nb;
        },
        (m, X) => m.predict(X),
      );

      leaderboard.sort((a, b) => (b.accuracy || 0) - (a.accuracy || 0));
    } else if (req.problemType === "regression") {
      const getY = (rows: Record<string, unknown>[]) => rows.map((r) => Number(r[req.target!]));
      const y_train = getY(trainRows);
      const y_test = getY(testRows);
      const y_train_2d = y_train.map((y) => [y]);

      const evaluateReg = (
        name: string,
        trainFn: () => unknown,
        predictFn: (model: any, X: number[][]) => number[],
      ) => {
        const start = performance.now();
        let model: unknown;
        try {
          model = trainFn();
        } catch (err: unknown) {
          leaderboard.push({
            modelName: name,
            problemType: "regression",
            trainingTimeMs: 0,
            error: err instanceof Error ? err.message : String(err),
          });
          return;
        }
        const y_pred = predictFn(model, X_test_scaled);
        const end = performance.now();

        const { r2, mse } = calculateR2MSE(y_test, y_pred);
        const predictionsSample = y_test
          .map((actual, i) => ({ actual, predicted: y_pred[i] }))
          .slice(0, 100);

        let featureImportances: { feature: string; importance: number }[] | undefined = undefined;
        if (req.features.length > 0) {
          featureImportances = calculatePermutationImportance(
            model,
            predictFn,
            X_test_scaled,
            y_test,
            r2,
            false,
            req.features,
            rand,
          );
        }

        leaderboard.push({
          modelName: name,
          problemType: "regression",
          mse,
          rmse: Math.sqrt(mse),
          r2,
          predictionsSample,
          trainingTimeMs: Math.round(end - start),
          featureImportances,
        });
      };

      evaluateReg(
        "Random Forest",
        () => {
          const rf = new RandomForestRegression({
            seed: req.options.seed,
            nEstimators: req.options.nEstimators,
            maxFeatures: Math.max(1, Math.floor(req.features.length / 3)),
            replacement: true,
          });
          rf.train(X_train_scaled, y_train);
          return rf;
        },
        (m, X) => m.predict(X),
      );

      evaluateReg(
        "Decision Tree",
        () => {
          const dt = new DecisionTreeRegression({ maxDepth: req.options.maxDepth || 10 });
          dt.train(X_train_scaled, y_train);
          return dt;
        },
        (m, X) => m.predict(X),
      );

      evaluateReg(
        "Linear Regression",
        () => new MLR(X_train_scaled, y_train_2d),
        (m, X) => m.predict(X).map((row: number[]) => row[0]),
      );

      leaderboard.sort((a, b) => (b.r2 || 0) - (a.r2 || 0));
    } else if (req.problemType === "clustering") {
      const X_full_raw = getX(validRows);

      const imputer = new SimpleImputer();
      imputer.fit(X_full_raw);
      const X_full = imputer.transform(X_full_raw);

      const scaler = new StandardScaler();
      scaler.fit(X_full);
      const X_full_scaled = scaler.transform(X_full);

      const start = performance.now();
      const k = Math.max(2, Math.min(req.options.kClusters || 3, X_full_scaled.length - 1));

      let kResult;
      try {
        kResult = kmeans(X_full_scaled, k, { initialization: "kmeans++" });
      } catch (err: unknown) {
        leaderboard.push({
          modelName: "K-Means Clustering",
          problemType: "clustering",
          trainingTimeMs: 0,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      if (kResult) {
        let clusters;
        let pc1Variance = 0;
        let pc2Variance = 0;
        if (X_full_scaled[0].length >= 2) {
          try {
            const pca = new PCA(X_full_scaled);
            const reduced = pca.predict(X_full_scaled, { nComponents: 2 }).to2DArray();
            const expVar = pca.getExplainedVariance();
            if (expVar && expVar.length >= 2) {
              pc1Variance = +(expVar[0] * 100).toFixed(1);
              pc2Variance = +(expVar[1] * 100).toFixed(1);
            }
            clusters = reduced.map((coords, i) => ({
              x: coords[0],
              y: coords[1],
              cluster: kResult.clusters[i],
              originalIndex: i,
            }));
          } catch (pcaErr) {
            // PCA can fail if data has zero variance or perfectly correlated features.
            // Fallback to plotting the first two features directly.
            clusters = X_full_scaled.map((row, i) => ({
              x: row[0],
              y: row[1],
              cluster: kResult.clusters[i],
              originalIndex: i,
            }));
          }
        } else {
          // Fallback if only 1 feature
          clusters = X_full_scaled.map((row, i) => ({
            x: row[0],
            y: 0,
            cluster: kResult.clusters[i],
            originalIndex: i,
          }));
        }

        const end = performance.now();

        leaderboard.push({
          modelName: "K-Means Clustering",
          problemType: "clustering",
          clusters,
          centroids: (kResult.centroids as unknown as Array<number[] | { centroid: number[] }>).map(
            (c) => (Array.isArray(c) ? c : c.centroid),
          ), // ml-kmeans returns {centroid: number[], error: number}
          pc1Variance,
          pc2Variance,
          trainingTimeMs: Math.round(end - start),
        });
      }
    }

    const result: MLTrainResult = {
      problemType: req.problemType,
      leaderboard,
      trainSize: req.problemType === "clustering" ? validRows.length : trainCount,
      testSize: req.problemType === "clustering" ? 0 : testCount,
    };

    self.postMessage(result);
  } catch (err: unknown) {
    self.postMessage({
      error: err instanceof Error ? err.message : String(err),
      problemType: e.data.problemType,
      leaderboard: [],
      trainSize: 0,
      testSize: 0,
    } as MLTrainResult);
  }
};
