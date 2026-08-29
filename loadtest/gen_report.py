#!/usr/bin/env python3
"""gen_report.py — auto-generate a benchmark report (HTML + PDF).

Runs the UI render-pipeline benchmark and the backend latency benchmark, then
produces a single, shareable report containing:
  • Dataset specifications (rows, cols, types, missing, duplicates, file size)
  • p50 / p90 / p99 latency charts for backend endpoints
  • UI render-pipeline verdicts (per-stage timings + scaling)
  • Accuracy evidence (every /predict run vs. the 0.80 threshold)

Usage:
  python loadtest/gen_report.py --rows 50000 --sweep 50000,150000,300000 --requests 15
Outputs:
  loadtest/reports/benchmark_report.html
  loadtest/reports/benchmark_report.pdf
  /mnt/documents/benchmark_report.{html,pdf}   (for download)
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
LOADTEST = ROOT / "loadtest"
REPORTS = LOADTEST / "reports"
DATA = LOADTEST / "data"
DOCS = Path("/mnt/documents")

# ---- brand palette ----------------------------------------------------------
INK = "#0f172a"
MUTED = "#64748b"
PRIMARY = "#6366f1"
ACCENT = "#06b6d4"
GOOD = "#22c55e"
WARN = "#f59e0b"
BAD = "#ef4444"
GRID = "#e2e8f0"
VERDICT_COLOR = {"EXCELLENT": GOOD, "GOOD": ACCENT, "REVIEW": WARN}

plt.rcParams.update({
    "font.size": 11,
    "axes.edgecolor": GRID,
    "axes.labelcolor": INK,
    "text.color": INK,
    "xtick.color": MUTED,
    "ytick.color": MUTED,
    "axes.grid": True,
    "grid.color": GRID,
    "grid.linewidth": 0.8,
    "figure.dpi": 130,
})


def run(cmd: list[str]) -> None:
    print("·", " ".join(cmd))
    subprocess.run(cmd, check=True, cwd=ROOT)


def fig_to_b64(fig) -> tuple[str, bytes]:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    raw = buf.getvalue()
    return base64.b64encode(raw).decode(), raw


# ---- charts -----------------------------------------------------------------
def chart_latency_percentiles(endpoints):
    fig, ax = plt.subplots(figsize=(7.2, 3.6))
    labels = [e["endpoint"].split(" @")[0] for e in endpoints]
    metrics = ["p50", "p90", "p99"]
    colors = [PRIMARY, ACCENT, WARN]
    x = range(len(labels))
    w = 0.25
    for i, (m, c) in enumerate(zip(metrics, colors)):
        vals = [e[m] for e in endpoints]
        bars = ax.bar([p + (i - 1) * w for p in x], vals, w, label=m.upper(), color=c)
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v, f"{v:.0f}", ha="center", va="bottom", fontsize=8, color=INK)
    ax.set_xticks(list(x))
    ax.set_xticklabels(labels)
    ax.set_ylabel("Latency (ms)")
    ax.set_title("Backend latency — p50 / p90 / p99", fontweight="bold", loc="left")
    ax.legend(frameon=False, ncol=3, loc="upper left")
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    return fig_to_b64(fig)


def chart_latency_distribution(endpoints):
    fig, ax = plt.subplots(figsize=(7.2, 3.2))
    data = [e["samples"] for e in endpoints]
    labels = [e["endpoint"].split(" @")[0] for e in endpoints]
    bp = ax.boxplot(data, vert=False, patch_artist=True, labels=labels, widths=0.5)
    for patch, c in zip(bp["boxes"], [PRIMARY, ACCENT]):
        patch.set_facecolor(c)
        patch.set_alpha(0.35)
        patch.set_edgecolor(c)
    for med in bp["medians"]:
        med.set_color(INK)
    ax.set_xlabel("Latency (ms)")
    ax.set_title("Latency distribution per request", fontweight="bold", loc="left")
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    return fig_to_b64(fig)


def chart_ui_stages(run_obj):
    fig, ax = plt.subplots(figsize=(7.2, 3.6))
    names = [s["name"].split(" (")[0] for s in run_obj["stages"]]
    vals = [s["ms"] for s in run_obj["stages"]]
    bars = ax.barh(names, vals, color=PRIMARY)
    for b, v in zip(bars, vals):
        ax.text(v, b.get_y() + b.get_height() / 2, f" {v:.0f} ms", va="center", fontsize=9, color=INK)
    ax.invert_yaxis()
    ax.set_xlabel("Time (ms)")
    ax.set_title(f"UI render pipeline — {run_obj['rows']:,} rows  →  {run_obj['verdict']}",
                 fontweight="bold", loc="left", color=VERDICT_COLOR.get(run_obj["verdict"], INK))
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    return fig_to_b64(fig)


def chart_ui_scaling(runs):
    fig, ax = plt.subplots(figsize=(7.2, 3.4))
    runs = sorted(runs, key=lambda r: r["rows"])
    xs = [r["rows"] for r in runs]
    ys = [r["total"] for r in runs]
    ax.plot(xs, ys, "-o", color=ACCENT, linewidth=2.2, markersize=6)
    for x, y, r in zip(xs, ys, runs):
        ax.annotate(f"{y:.0f}ms\n{r['verdict']}", (x, y), textcoords="offset points",
                    xytext=(0, 8), ha="center", fontsize=8,
                    color=VERDICT_COLOR.get(r["verdict"], INK))
    ax.set_xlabel("Rows")
    ax.set_ylabel("Total pipeline (ms)")
    ax.set_title("UI pipeline scaling vs. dataset size", fontweight="bold", loc="left")
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    return fig_to_b64(fig)


def chart_accuracy(acc):
    fig, ax = plt.subplots(figsize=(7.2, 3.2))
    vals = acc["values"]
    idx = list(range(1, len(vals) + 1))
    ax.bar(idx, vals, color=[GOOD if v > acc["threshold"] else BAD for v in vals], alpha=0.85)
    ax.axhline(acc["threshold"], color=BAD, linestyle="--", linewidth=1.5,
               label=f"threshold {acc['threshold']:.2f}")
    ax.set_ylim(0, 1.05)
    ax.set_xlabel("Prediction run #")
    ax.set_ylabel("Accuracy")
    ax.set_title("Model accuracy evidence — every run above threshold", fontweight="bold", loc="left")
    ax.legend(frameon=False, loc="lower right")
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    return fig_to_b64(fig)


# ---- dataset specs ----------------------------------------------------------
def _looks_datetime(non_null) -> bool:
    if len(non_null) == 0 or pd.api.types.is_numeric_dtype(non_null):
        return False
    sample = non_null.astype(str).head(200)
    if not sample.str.contains(r"[-/:]").all():
        return False
    parsed = pd.to_datetime(sample, errors="coerce", format="mixed")
    return parsed.notna().mean() > 0.9


def dataset_specs(csv_path: Path):
    df = pd.read_csv(csv_path)
    size_mb = csv_path.stat().st_size / (1024 * 1024)
    cols = []
    for c in df.columns:
        s = df[c]
        non_null = s.dropna()
        is_boolish = (
            pd.api.types.is_bool_dtype(s)
            or (s.nunique(dropna=True) <= 2
                and len(non_null) > 0
                and non_null.astype(str).str.lower().isin(["true", "false", "0", "1", "yes", "no"]).all())
        )
        if is_boolish:
            t = "boolean"
        elif pd.api.types.is_numeric_dtype(s):
            t = "numeric"
        elif pd.api.types.is_datetime64_any_dtype(s) or _looks_datetime(non_null):
            t = "datetime"
        else:
            t = "categorical"
        cols.append({
            "name": c,
            "type": t,
            "missing": int(s.isna().sum()),
            "missingPct": round(s.isna().mean() * 100, 2),
            "unique": int(s.nunique(dropna=True)),
        })
    return {
        "file": str(csv_path.relative_to(ROOT)),
        "rows": int(len(df)),
        "cols": int(df.shape[1]),
        "sizeMB": round(size_mb, 2),
        "duplicates": int(df.duplicated().sum()),
        "totalMissing": int(df.isna().sum().sum()),
        "columns": cols,
    }


# ---- HTML -------------------------------------------------------------------
def build_html(ctx, charts_b64):
    specs = ctx["specs"]
    be = ctx["backend"]
    acc = be.get("accuracy")
    col_rows = "".join(
        f"<tr><td>{c['name']}</td><td><span class='tag {c['type']}'>{c['type']}</span></td>"
        f"<td>{c['unique']:,}</td><td>{c['missing']:,} ({c['missingPct']}%)</td></tr>"
        for c in specs["columns"]
    )
    ep_rows = "".join(
        f"<tr><td>{e['endpoint']}</td><td>{e['p50']}</td><td>{e['p90']}</td><td>{e['p99']}</td>"
        f"<td>{e['max']}</td><td>{e['reqPerSec']}</td>"
        f"<td><span class='verdict {e['verdict'].lower()}'>{e['verdict']}</span></td></tr>"
        for e in be["endpoints"]
    )
    ui_rows = "".join(
        f"<tr><td>{'Dataset file' if not r['label'].startswith('synthetic') else 'Synthetic'}</td>"
        f"<td>{r['rows']:,}</td><td>{r['cols']}</td><td>{r['total']:.0f} ms</td>"
        f"<td>{r['readiness']}/100</td>"
        f"<td><span class='verdict {r['verdict'].lower()}'>{r['verdict']}</span></td></tr>"
        for r in sorted(ctx['ui_runs'], key=lambda x: x['rows'])
    )
    acc_block = ""
    if acc:
        acc_block = f"""
        <h2>Accuracy evidence</h2>
        <div class="kpis">
          <div class="kpi"><div class="num">{acc['runs']}</div><div class="lbl">prediction runs</div></div>
          <div class="kpi"><div class="num">{acc['mean']:.3f}</div><div class="lbl">mean accuracy</div></div>
          <div class="kpi"><div class="num">{acc['min']:.3f}</div><div class="lbl">worst run</div></div>
          <div class="kpi"><div class="num">{'PASS' if acc['passed'] else 'FAIL'}</div><div class="lbl">&gt; {acc['threshold']:.2f} threshold</div></div>
        </div>
        <img src="data:image/png;base64,{charts_b64['accuracy']}" />
        """

    imgs = lambda k: f'<img src="data:image/png;base64,{charts_b64[k]}" />'
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DataIQ Pro — Benchmark Report</title>
<style>
  :root {{ --ink:{INK}; --muted:{MUTED}; --primary:{PRIMARY}; --grid:{GRID}; }}
  * {{ box-sizing:border-box; }}
  body {{ font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; color:var(--ink);
         margin:0; background:#f8fafc; line-height:1.5; }}
  .wrap {{ max-width:920px; margin:0 auto; padding:40px 24px 80px; }}
  header {{ background:linear-gradient(135deg,{PRIMARY},{ACCENT}); color:#fff; border-radius:18px;
           padding:34px 32px; margin-bottom:28px; }}
  header h1 {{ margin:0 0 6px; font-size:28px; }}
  header p {{ margin:0; opacity:.92; }}
  h2 {{ font-size:18px; margin:34px 0 12px; border-left:4px solid var(--primary); padding-left:10px; }}
  .kpis {{ display:flex; flex-wrap:wrap; gap:14px; margin:14px 0; }}
  .kpi {{ flex:1 1 150px; background:#fff; border:1px solid var(--grid); border-radius:14px; padding:16px; }}
  .kpi .num {{ font-size:24px; font-weight:700; }}
  .kpi .lbl {{ color:var(--muted); font-size:12px; }}
  table {{ width:100%; border-collapse:collapse; background:#fff; border:1px solid var(--grid);
          border-radius:12px; overflow:hidden; font-size:14px; margin:8px 0 4px; }}
  th,td {{ text-align:left; padding:10px 12px; border-bottom:1px solid var(--grid); }}
  th {{ background:#f1f5f9; color:var(--muted); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.03em; }}
  tr:last-child td {{ border-bottom:none; }}
  img {{ width:100%; border:1px solid var(--grid); border-radius:12px; background:#fff; margin:10px 0; }}
  .tag {{ font-size:11px; padding:2px 8px; border-radius:999px; background:#eef2ff; color:{PRIMARY}; }}
  .tag.categorical {{ background:#ecfeff; color:{ACCENT}; }}
  .tag.boolean {{ background:#fff7ed; color:{WARN}; }}
  .verdict {{ font-size:11px; font-weight:700; padding:3px 9px; border-radius:999px; color:#fff; }}
  .verdict.excellent {{ background:{GOOD}; }}
  .verdict.good {{ background:{ACCENT}; }}
  .verdict.review {{ background:{WARN}; }}
  footer {{ color:var(--muted); font-size:12px; margin-top:40px; text-align:center; }}
</style></head><body><div class="wrap">
<header>
  <h1>DataIQ Pro — Performance Benchmark Report</h1>
  <p>Generated {ctx['generated']} · UI render pipeline + backend latency + accuracy</p>
</header>

<h2>Dataset specifications</h2>
<div class="kpis">
  <div class="kpi"><div class="num">{specs['rows']:,}</div><div class="lbl">rows</div></div>
  <div class="kpi"><div class="num">{specs['cols']}</div><div class="lbl">columns</div></div>
  <div class="kpi"><div class="num">{specs['sizeMB']} MB</div><div class="lbl">file size</div></div>
  <div class="kpi"><div class="num">{specs['duplicates']:,}</div><div class="lbl">duplicate rows</div></div>
  <div class="kpi"><div class="num">{specs['totalMissing']:,}</div><div class="lbl">missing cells</div></div>
</div>
<table><thead><tr><th>Column</th><th>Type</th><th>Unique</th><th>Missing</th></tr></thead>
<tbody>{col_rows}</tbody></table>

<h2>Backend latency</h2>
<table><thead><tr><th>Endpoint</th><th>p50</th><th>p90</th><th>p99</th><th>max</th><th>req/s</th><th>Verdict</th></tr></thead>
<tbody>{ep_rows}</tbody></table>
{imgs('latency_pct')}
{imgs('latency_dist')}

<h2>UI render pipeline</h2>
<table><thead><tr><th>Source</th><th>Rows</th><th>Cols</th><th>Total</th><th>Readiness</th><th>Verdict</th></tr></thead>
<tbody>{ui_rows}</tbody></table>
{imgs('ui_stages')}
{imgs('ui_scaling')}

{acc_block}

<footer>DataIQ Pro · automated benchmark · {ctx['generated']}</footer>
</div></body></html>"""


# ---- PDF --------------------------------------------------------------------
def build_pdf(pdf_path: Path, ctx, charts_raw):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                    Image, PageBreak)

    specs = ctx["specs"]
    be = ctx["backend"]
    acc = be.get("accuracy")
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=styles["Title"], textColor=colors.HexColor(INK), fontSize=22, spaceAfter=4)
    sub = ParagraphStyle("sub", parent=styles["Normal"], textColor=colors.HexColor(MUTED), fontSize=10, spaceAfter=14)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=colors.HexColor(PRIMARY), fontSize=14, spaceBefore=14, spaceAfter=6)

    def img(raw, w=170 * mm):
        bio = io.BytesIO(raw)
        ir = Image(bio)
        ratio = ir.imageHeight / ir.imageWidth
        ir.drawWidth = w
        ir.drawHeight = w * ratio
        return ir

    def styled(tbl, header=True):
        ts = [
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor(INK)),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor(GRID)),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ]
        if header:
            ts += [("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                   ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor(MUTED)),
                   ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold")]
        tbl.setStyle(TableStyle(ts))
        return tbl

    story = []
    story.append(Paragraph("DataIQ Pro — Performance Benchmark Report", h1))
    story.append(Paragraph(f"Generated {ctx['generated']} · UI render pipeline + backend latency + accuracy", sub))

    story.append(Paragraph("Dataset specifications", h2))
    kpi = [["Rows", "Columns", "File size", "Duplicate rows", "Missing cells"],
           [f"{specs['rows']:,}", str(specs['cols']), f"{specs['sizeMB']} MB",
            f"{specs['duplicates']:,}", f"{specs['totalMissing']:,}"]]
    story.append(styled(Table(kpi, colWidths=[34 * mm] * 5)))
    story.append(Spacer(1, 8))
    col_data = [["Column", "Type", "Unique", "Missing"]] + [
        [c["name"], c["type"], f"{c['unique']:,}", f"{c['missing']:,} ({c['missingPct']}%)"]
        for c in specs["columns"]]
    story.append(styled(Table(col_data, colWidths=[50 * mm, 35 * mm, 35 * mm, 50 * mm])))

    story.append(Paragraph("Backend latency (p50 / p90 / p99)", h2))
    ep_data = [["Endpoint", "p50", "p90", "p99", "max", "req/s", "Verdict"]] + [
        [e["endpoint"], str(e["p50"]), str(e["p90"]), str(e["p99"]), str(e["max"]),
         str(e["reqPerSec"]), e["verdict"]] for e in be["endpoints"]]
    story.append(styled(Table(ep_data, colWidths=[46 * mm, 18 * mm, 18 * mm, 18 * mm, 18 * mm, 18 * mm, 24 * mm])))
    story.append(Spacer(1, 6))
    story.append(img(charts_raw["latency_pct"]))
    story.append(img(charts_raw["latency_dist"]))

    story.append(PageBreak())
    story.append(Paragraph("UI render pipeline", h2))
    ui_data = [["Source", "Rows", "Cols", "Total", "Readiness", "Verdict"]] + [
        ["Dataset file" if not r["label"].startswith("synthetic") else "Synthetic",
         f"{r['rows']:,}", str(r["cols"]), f"{r['total']:.0f} ms", f"{r['readiness']}/100", r["verdict"]]
        for r in sorted(ctx["ui_runs"], key=lambda x: x["rows"])]
    story.append(styled(Table(ui_data, colWidths=[32 * mm, 24 * mm, 18 * mm, 28 * mm, 30 * mm, 30 * mm])))
    story.append(Spacer(1, 6))
    story.append(img(charts_raw["ui_stages"]))
    story.append(img(charts_raw["ui_scaling"]))

    if acc:
        story.append(PageBreak())
        story.append(Paragraph("Accuracy evidence", h2))
        a = [["Prediction runs", "Mean accuracy", "Worst run", "Threshold", "Result"],
             [str(acc["runs"]), f"{acc['mean']:.3f}", f"{acc['min']:.3f}",
              f"{acc['threshold']:.2f}", "PASS" if acc["passed"] else "FAIL"]]
        story.append(styled(Table(a, colWidths=[34 * mm] * 5)))
        story.append(Spacer(1, 6))
        story.append(img(charts_raw["accuracy"]))

    SimpleDocTemplate(str(pdf_path), pagesize=A4,
                      leftMargin=20 * mm, rightMargin=20 * mm,
                      topMargin=18 * mm, bottomMargin=16 * mm).build(story)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rows", type=int, default=50000, help="rows for the detailed dataset")
    ap.add_argument("--sweep", default="50000,150000,300000", help="UI scaling sizes")
    ap.add_argument("--requests", type=int, default=15)
    args = ap.parse_args()

    REPORTS.mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)
    csv_path = DATA / "report.csv"
    ui_file_json = Path("/tmp/ui_file.json")
    ui_sweep_json = Path("/tmp/ui_sweep.json")
    be_json = Path("/tmp/backend.json")

    node = shutil.which("node") or "node"
    print("\n[1/5] generating dataset…")
    run([node, "loadtest/gen_csv.mjs", "--rows", str(args.rows), "--out", str(csv_path)])

    print("\n[2/5] benchmarking UI pipeline (detailed + scaling)…")
    run([node, "loadtest/ui_bench.mjs", "--file", str(csv_path), "--json", str(ui_file_json)])
    run([node, "loadtest/ui_bench.mjs", "--rows", args.sweep, "--json", str(ui_sweep_json)])

    print("\n[3/5] benchmarking backend latency…")
    run([sys.executable, "loadtest/backend_bench.py", "--rows", str(args.rows),
         "--requests", str(args.requests), "--json", str(be_json)])

    print("\n[4/5] building charts…")
    specs = dataset_specs(csv_path)
    ui_detail = json.loads(ui_file_json.read_text())["runs"][0]
    ui_sweep = json.loads(ui_sweep_json.read_text())["runs"]
    backend = json.loads(be_json.read_text())

    charts_b64, charts_raw = {}, {}
    for key, (b64, raw) in {
        "latency_pct": chart_latency_percentiles(backend["endpoints"]),
        "latency_dist": chart_latency_distribution(backend["endpoints"]),
        "ui_stages": chart_ui_stages(ui_detail),
        "ui_scaling": chart_ui_scaling(ui_sweep),
        **({"accuracy": chart_accuracy(backend["accuracy"])} if backend.get("accuracy") else {}),
    }.items():
        charts_b64[key] = b64
        charts_raw[key] = raw

    ctx = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "specs": specs,
        "backend": backend,
        "ui_runs": [ui_detail, *ui_sweep],
    }

    print("\n[5/5] writing HTML + PDF…")
    html = build_html(ctx, charts_b64)
    (REPORTS / "benchmark_report.html").write_text(html)
    build_pdf(REPORTS / "benchmark_report.pdf", ctx, charts_raw)

    DOCS.mkdir(parents=True, exist_ok=True)
    shutil.copy(REPORTS / "benchmark_report.html", DOCS / "benchmark_report.html")
    shutil.copy(REPORTS / "benchmark_report.pdf", DOCS / "benchmark_report.pdf")

    print(f"\n✓ Report ready:")
    print(f"   {REPORTS / 'benchmark_report.html'}")
    print(f"   {REPORTS / 'benchmark_report.pdf'}")
    print(f"   /mnt/documents/benchmark_report.{{html,pdf}}")


if __name__ == "__main__":
    main()
