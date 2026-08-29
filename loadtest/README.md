# DataIQ Pro — Load & Performance Test Suite

Lightweight, dependency-light benchmarks that measure the two things that matter
for scale: **UI table-rendering throughput** and **backend pipeline latency**.

## 1. Generate a large CSV

```bash
node loadtest/gen_csv.mjs --rows 200000 --out loadtest/data/large.csv
```

Produces a mixed-type dataset (numeric / categorical / datetime / boolean) with
~3% missing values, ~1% duplicates and rare outliers — so it exercises every
profiling and cleaning code path.

## 2. Benchmark the UI render pipeline

Times the exact pure functions behind every on-screen table and chart
(`buildDataset`, `correlationMatrix`, `histogram`, `autoClean`).

```bash
# against a generated file
node loadtest/ui_bench.mjs --file loadtest/data/large.csv

# or sweep multiple in-memory sizes
node loadtest/ui_bench.mjs --rows 50000,200000,500000
```

Reports per-stage time, µs/row, and an EXCELLENT / GOOD / REVIEW verdict.

## 3. Benchmark backend pipeline latency

```bash
# zero-setup, in-process (uses Starlette TestClient)
python loadtest/backend_bench.py --rows 20000 --requests 20

# or against a running server (e.g. docker compose up)
python loadtest/backend_bench.py --url http://localhost:8000 --rows 20000
```

Reports p50 / p90 / p99 / max latency and req/s per worker for `/schema` and
`/predict`, and asserts every `/predict` run hits **>0.80 accuracy** — so the
benchmark doubles as a correctness check.

## NPM shortcuts

```bash
npm run loadtest:gen     # generate 200k-row CSV
npm run loadtest:ui      # UI pipeline sweep
npm run loadtest         # gen + UI bench
```

## 4. Auto-generated benchmark report (HTML + PDF)

Runs every benchmark and produces a single shareable report with dataset specs,
p50/p90/p99 latency charts, UI verdicts and accuracy evidence.

```bash
python loadtest/gen_report.py --rows 40000 --sweep 60000,150000,300000 --requests 12
# or
npm run loadtest:report
```

Outputs:

- `loadtest/reports/benchmark_report.html`
- `loadtest/reports/benchmark_report.pdf`
- `/mnt/documents/benchmark_report.{html,pdf}` (for download)
