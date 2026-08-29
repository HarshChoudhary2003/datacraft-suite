import type { Dataset } from "@/lib/stats";

export function summarizeDatasetForAI(ds: Dataset): string {
  const lines: string[] = [];
  lines.push(`Dataset: ${ds.name}`);
  lines.push(
    `Rows: ${ds.rowCount}, Columns: ${ds.colCount}, Duplicates: ${ds.duplicateRows}, Missing cells: ${ds.missingTotal}`,
  );
  lines.push(`ML Readiness Score: ${ds.readinessScore}/100`);
  if (ds.readinessBreakdown.length) {
    lines.push(
      `Penalties: ${ds.readinessBreakdown.map((b) => `${b.reason} (-${b.penalty})`).join("; ")}`,
    );
  }
  lines.push("");
  lines.push("Column profiles:");
  for (const p of ds.profiles) {
    if (p.type === "numeric") {
      lines.push(
        `- ${p.name} [numeric] count=${p.count} miss=${p.missingPct.toFixed(1)}% mean=${p.mean?.toFixed(3)} std=${p.std?.toFixed(3)} median=${p.median?.toFixed(3)} min=${p.min} max=${p.max} skew=${p.skewness?.toFixed(2)} kurt=${p.kurtosis?.toFixed(2)} outliersIQR=${p.outliersIQR}`,
      );
    } else {
      const top =
        p.topValues
          ?.slice(0, 3)
          .map((t) => `${t.value}:${t.count}`)
          .join(", ") ?? "";
      lines.push(
        `- ${p.name} [${p.type}] count=${p.count} miss=${p.missingPct.toFixed(1)}% unique=${p.unique} top=[${top}]`,
      );
    }
  }
  return lines.join("\n");
}
