#!/usr/bin/env python3
"""backend_bench.py — benchmark FastAPI pipeline latency with large datasets.

Measures latency (p50/p90/p99) for the /schema and /predict endpoints which
represent the ETL/inference pipeline. Works in two modes:

  1. In-process (default, zero setup): drives the app via Starlette TestClient.
       python loadtest/backend_bench.py --rows 20000 --requests 20
  2. Against a running server (load test over HTTP):
       python loadtest/backend_bench.py --url http://localhost:8000 --rows 20000

Requires the same deps as the backend (fastapi, pandas, numpy, scikit-learn).
"""
from __future__ import annotations

import argparse
import statistics
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))


def make_dataset(n: int):
    rng = np.random.default_rng(42)
    x1 = rng.normal(0, 1, n)
    x2 = rng.normal(5, 2, n)
    x3 = rng.normal(-3, 4, n)
    y = (x1 + 0.5 * x2 - 0.2 * x3 > 2.0).astype(int)
    cols = ["x1", "x2", "x3", "label"]
    rows = [
        {"x1": float(a), "x2": float(b), "x3": float(c), "label": int(d)}
        for a, b, c, d in zip(x1, x2, x3, y)
    ]
    return {"columns": cols, "rows": rows}


def pct(values, p):
    return statistics.quantiles(values, n=100)[p - 1] if len(values) > 1 else values[0]


def stats_for(name, rows, samples_ms):
    s = sorted(samples_ms)
    return {
        "endpoint": name,
        "rows": rows,
        "n": len(s),
        "min": round(min(s), 1),
        "p50": round(statistics.median(s), 1),
        "p90": round(pct(s, 90), 1),
        "p99": round(pct(s, 99), 1),
        "max": round(max(s), 1),
        "mean": round(statistics.mean(s), 1),
        "reqPerSec": round(1000.0 / statistics.mean(s), 1),
        "verdict": "EXCELLENT" if statistics.median(s) < 500 else "GOOD" if statistics.median(s) < 2000 else "REVIEW",
        "samples": [round(x, 2) for x in s],
    }


def summarize(d):
    print(f"\n▶ {d['endpoint']}  (n={d['n']} requests)")
    for k in ("min", "p50", "p90", "p99", "max", "mean"):
        print(f"  {k:<5} {d[k]:8.1f} ms")
    print(f"  ~{d['reqPerSec']:.1f} req/s/worker  →  {d['verdict']}")


def run_in_process(rows: int, requests: int):
    from fastapi.testclient import TestClient
    from main import app  # noqa

    client = TestClient(app)
    ds = make_dataset(rows)

    schema_ms, predict_ms = [], []
    accuracies = []
    # warmup
    client.post("/schema", json=ds)
    client.post("/predict", json={"dataset": ds, "target": "label", "test_size": 0.25})

    for _ in range(requests):
        t0 = time.perf_counter()
        r = client.post("/schema", json=ds)
        schema_ms.append((time.perf_counter() - t0) * 1000)
        assert r.status_code == 200

    for _ in range(requests):
        t0 = time.perf_counter()
        r = client.post("/predict", json={"dataset": ds, "target": "label", "test_size": 0.25})
        predict_ms.append((time.perf_counter() - t0) * 1000)
        assert r.status_code == 200
        body = r.json()
        accuracies.append(body.get("score", 0))
        assert body.get("score", 0) > 0.8, f"low accuracy: {body}"

    schema = stats_for("/schema", rows, schema_ms)
    predict = stats_for("/predict", rows, predict_ms)
    summarize(schema)
    summarize(predict)
    print("\n✓ correctness: every /predict achieved >0.80 accuracy on separable data")

    return {
        "mode": "in-process",
        "endpoints": [schema, predict],
        "accuracy": {
            "metric": "accuracy",
            "task": "classification",
            "runs": len(accuracies),
            "min": round(min(accuracies), 4),
            "mean": round(sum(accuracies) / len(accuracies), 4),
            "max": round(max(accuracies), 4),
            "threshold": 0.8,
            "passed": all(a > 0.8 for a in accuracies),
            "values": [round(a, 4) for a in accuracies],
        },
    }


def run_http(url: str, rows: int, requests: int):
    import urllib.request
    import json as _json

    ds = make_dataset(rows)

    def post(path, payload):
        data = _json.dumps(payload).encode()
        req = urllib.request.Request(url.rstrip("/") + path, data=data,
                                     headers={"Content-Type": "application/json"})
        t0 = time.perf_counter()
        with urllib.request.urlopen(req) as resp:
            resp.read()
        return (time.perf_counter() - t0) * 1000

    post("/schema", ds)  # warmup
    schema_ms = [post("/schema", ds) for _ in range(requests)]
    predict_ms = [post("/predict", {"dataset": ds, "target": "label", "test_size": 0.25}) for _ in range(requests)]
    schema = stats_for(f"/schema @ {url}", rows, schema_ms)
    predict = stats_for(f"/predict @ {url}", rows, predict_ms)
    summarize(schema)
    summarize(predict)
    return {"mode": f"http:{url}", "endpoints": [schema, predict], "accuracy": None}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=20000)
    ap.add_argument("--requests", type=int, default=15)
    ap.add_argument("--url", default="", help="target a running server instead of in-process")
    ap.add_argument("--json", default="", help="write structured results to this path")
    args = ap.parse_args()

    print(f"DataIQ Pro backend load test — {args.rows:,} rows, {args.requests} requests/endpoint")
    if args.url:
        result = run_http(args.url, args.rows, args.requests)
    else:
        result = run_in_process(args.rows, args.requests)

    if args.json:
        import json as _json
        from datetime import datetime, timezone
        out = Path(args.json)
        out.parent.mkdir(parents=True, exist_ok=True)
        payload = {"generatedAt": datetime.now(timezone.utc).isoformat(), "rows": args.rows,
                   "requests": args.requests, **result}
        out.write_text(_json.dumps(payload, indent=2))
        print(f"\n✓ Wrote backend benchmark JSON → {out}")


if __name__ == "__main__":
    main()

