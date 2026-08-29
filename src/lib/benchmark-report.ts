// Self-contained HTML benchmark report generator (no external assets).
// The same HTML is used for one-click download, PDF (print), and share links.
import type { BenchRun } from "./benchmark";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function barRow(label: string, value: number, max: number, unit: string): string {
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 2;
  return `<div class="bar"><span class="bl">${esc(label)}</span><span class="bt"><span class="bf" style="width:${pct}%"></span></span><span class="bv">${value}${unit}</span></div>`;
}

export function buildReportHTML(run: BenchRun): string {
  const date = new Date(run.timestamp).toLocaleString();
  const maxLat = Math.max(run.latency.p50, run.latency.p90, run.latency.p99, run.latency.max, 1);
  const maxStage = Math.max(...run.stages.map((s) => s.ms), 1);
  const accPct = (run.accuracy.score * 100).toFixed(1);
  const verdictColor =
    run.verdict === "EXCELLENT" ? "#16a34a" : run.verdict === "GOOD" ? "#2563eb" : "#d97706";
  const checksRows = run.checks
    .map(
      (c) =>
        `<tr><td>${c.passed ? "✅" : "❌"}</td><td>${esc(c.name)}</td><td class="muted">${esc(c.detail)}</td></tr>`,
    )
    .join("");
  const stageRows = run.stages.map((s) => barRow(s.name, s.ms, maxStage, "ms")).join("");
  const latRows =
    barRow("p50", run.latency.p50, maxLat, "ms") +
    barRow("p90", run.latency.p90, maxLat, "ms") +
    barRow("p99", run.latency.p99, maxLat, "ms") +
    barRow("max", run.latency.max, maxLat, "ms");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>DataIQ Pro — Benchmark Report · ${esc(run.datasetName)}</title>
<style>
*{box-sizing:border-box}
body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:#0b1020;color:#e8ecf5;padding:32px}
.wrap{max-width:880px;margin:0 auto}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;border-bottom:1px solid #243049;padding-bottom:20px;margin-bottom:24px}
h1{font-size:24px;margin:0 0 4px;background:linear-gradient(90deg,#6366f1,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:#94a3b8;font-size:13px}
.badge{font-weight:700;font-size:13px;padding:6px 14px;border-radius:999px;color:#fff}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:18px 0}
.card{background:#131a2e;border:1px solid #243049;border-radius:14px;padding:14px}
.k{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8}
.v{font-size:22px;font-weight:700;margin-top:4px}
h2{font-size:15px;margin:26px 0 10px;color:#cbd5e1}
.bar{display:grid;grid-template-columns:200px 1fr 70px;align-items:center;gap:10px;margin:7px 0;font-size:12px}
.bl{color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bt{height:10px;background:#1e2740;border-radius:999px;overflow:hidden}
.bf{display:block;height:100%;background:linear-gradient(90deg,#6366f1,#22d3ee)}
.bv{text-align:right;font-variant-numeric:tabular-nums;color:#e8ecf5}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:7px 8px;border-bottom:1px solid #1e2740}
.muted{color:#94a3b8}
.foot{margin-top:28px;color:#64748b;font-size:11px;text-align:center}
@media print{body{background:#fff;color:#0b1020;padding:0}.card,.bt{background:#f1f5f9;border-color:#e2e8f0}.bf{background:#6366f1}.muted{color:#475569}.sub{color:#475569}td{border-color:#e2e8f0}h1{color:#4f46e5;-webkit-text-fill-color:#4f46e5}}
</style></head><body><div class="wrap">
<div class="head">
  <div><h1>DataIQ Pro — Benchmark Report</h1>
  <div class="sub">Dataset: <b>${esc(run.datasetName)}</b> · ${date} · fingerprint <code>${esc(run.fingerprint)}</code></div></div>
  <div class="badge" style="background:${verdictColor}">${run.verdict}</div>
</div>

<h2>Dataset specifications</h2>
<div class="grid">
  <div class="card"><div class="k">Rows</div><div class="v">${run.rows.toLocaleString()}</div></div>
  <div class="card"><div class="k">Columns</div><div class="v">${run.cols}</div></div>
  <div class="card"><div class="k">Missing cells</div><div class="v">${run.missingPct}%</div></div>
  <div class="card"><div class="k">Duplicate rows</div><div class="v">${run.duplicatePct}%</div></div>
  <div class="card"><div class="k">Readiness</div><div class="v">${run.readiness}/100</div></div>
</div>

<h2>Latency (pipeline, ${run.latency.samples} samples)</h2>
${latRows}

<h2>Per-stage render pipeline</h2>
${stageRows}

<h2>Accuracy evidence</h2>
<div class="grid">
  <div class="card"><div class="k">Validation accuracy</div><div class="v">${accPct}%</div></div>
  <div class="card"><div class="k">Baseline</div><div class="v">${(run.accuracy.baseline * 100).toFixed(1)}%</div></div>
  <div class="card"><div class="k">Target</div><div class="v" style="font-size:15px">${esc(run.accuracy.target ?? "—")}</div></div>
  <div class="card"><div class="k">Train / Val</div><div class="v" style="font-size:15px">${run.accuracy.trainRows} / ${run.accuracy.valRows}</div></div>
</div>
<div class="sub" style="margin:-6px 0 8px">Method: ${esc(run.accuracy.method)}</div>

<h2>Correctness checks</h2>
<table><tbody>${checksRows}</tbody></table>

<div class="foot">Generated by DataIQ Pro · ${new Date().toISOString()}</div>
</div></body></html>`;
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadReportHTML(run: BenchRun) {
  const safe = run.datasetName.replace(/[^a-z0-9_-]+/gi, "_");
  download(
    `benchmark_${safe}_${run.fingerprint}.html`,
    buildReportHTML(run),
    "text/html;charset=utf-8",
  );
}

/** Open the report in a new window and trigger the browser print dialog (Save as PDF). */
export function downloadReportPDF(run: BenchRun) {
  const html = buildReportHTML(run);
  const w = window.open("", "_blank");
  if (!w) {
    // Popup blocked → fall back to HTML download.
    downloadReportHTML(run);
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}

/** Build a self-contained shareable link (data URL) that renders the report anywhere. */
export function buildShareLink(run: BenchRun): string {
  const html = buildReportHTML(run);
  // Use encodeURIComponent for broad unicode safety.
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}
