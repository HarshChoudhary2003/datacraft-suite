import { describe, it, expect } from "vitest";
import { buildInteractiveHTML } from "../notebook";
import type { SnapshotBundle } from "../dashboard-store";
import type { Dataset } from "../stats";

/**
 * End-to-end security regression: export a notebook *with dashboard snapshots*
 * where every user-controlled string (dataset name, column names, cell values,
 * widget titles, captions, series labels) carries an injection payload, then
 * assert none of it can execute in the exported HTML.
 */

const PAYLOADS = {
  script: "<script>alert('xss')</script>",
  img: '"><img src=x onerror=alert(1)>',
  breakout: "</script><script>alert(2)</script>",
  svg: "<svg/onload=alert(3)>",
  attr: '" onmouseover="alert(4)',
  proto: "javascript:alert(5)",
};

function evilDataset(): Dataset {
  const col = PAYLOADS.img;
  return {
    name: PAYLOADS.script,
    columns: ["amount", col],
    rows: [
      { amount: 10, [col]: PAYLOADS.breakout },
      { amount: 20, [col]: PAYLOADS.svg },
      { amount: 30, [col]: PAYLOADS.attr },
    ],
    profiles: [
      {
        name: "amount",
        type: "numeric",
        count: 3,
        missing: 0,
        missingPct: 0,
        unique: 3,
        mean: 20,
        median: 20,
        std: 8.16,
        min: 10,
        max: 30,
        skewness: 0,
        kurtosis: 0,
        outliersIQR: 0,
        outliersZ: 0,
        iqrLower: 0,
        iqrUpper: 40,
      },
      {
        name: col,
        type: "categorical",
        count: 3,
        missing: 0,
        missingPct: 0,
        unique: 3,
        topValues: [
          { value: PAYLOADS.svg, count: 2 },
          { value: PAYLOADS.breakout, count: 1 },
        ],
      },
    ],
    rowCount: 3,
    colCount: 2,
    missingTotal: 0,
    duplicateRows: 0,
    duplicateIndices: [],
    readinessScore: 88,
    readinessBreakdown: [],
    correlation: { columns: [], matrix: [] },
  };
}

function evilSnapshots(): SnapshotBundle {
  return {
    datasetName: PAYLOADS.script,
    role: PAYLOADS.svg,
    capturedAt: new Date().toISOString(),
    charts: [
      {
        id: "w1",
        title: PAYLOADS.img,
        // A hostile "image" that is not a data URL at all.
        image: PAYLOADS.proto,
        caption: PAYLOADS.breakout,
        series: [
          { x: PAYLOADS.svg, y: 12 },
          { x: PAYLOADS.attr, y: 7 },
        ],
      },
      {
        id: "w2",
        title: "Revenue " + PAYLOADS.breakout,
        image: "data:image/png;base64,iVBORw0KGgo=",
        caption: PAYLOADS.script,
        series: [{ x: PAYLOADS.script, y: 1 }],
      },
    ],
  };
}

async function sha256Base64(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const arr = new Uint8Array(digest);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

/** Everything outside the single vetted inline <script> block. */
function markupOnly(html: string): string {
  return html.replace(/<script>[\s\S]*?<\/script>/g, "");
}

describe("security regression — notebook + dashboard export", () => {
  it("escapes every payload so no injected tag survives in the markup", async () => {
    const html = await buildInteractiveHTML(evilDataset(), "data_analyst", evilSnapshots());
    const markup = markupOnly(html);

    expect(markup).not.toContain("<img src=x onerror=");
    expect(markup).not.toContain("<svg/onload=");
    expect(markup).not.toContain("<script>alert('xss')</script>");
    expect(html).not.toContain("</script><script>alert(2)</script>");
    // Proof the payloads are present but neutralised, not silently dropped.
    expect(html).toContain("&lt;script&gt;");
  });

  it("never emits an inline event-handler attribute on a real element", async () => {
    const html = await buildInteractiveHTML(evilDataset(), "data_engineer", evilSnapshots());
    expect(markupOnly(html)).not.toMatch(
      /<[a-zA-Z][^>]*\son(click|error|load|mouseover|mouseenter|submit|change|focus)\s*=/i,
    );
  });

  it("only embeds dashboard images from data: URLs — no javascript:/remote src", async () => {
    const html = await buildInteractiveHTML(evilDataset(), "business_analyst", evilSnapshots());
    const srcs = [...markupOnly(html).matchAll(/<img[^>]*\ssrc="([^"]*)"/gi)].map((m) => m[1]);
    for (const src of srcs) {
      expect(src.startsWith("data:image/")).toBe(true);
    }
    expect(html).not.toContain('src="javascript:');
  });

  it("keeps a strict CSP with exactly one hash-authorized inline script", async () => {
    const html = await buildInteractiveHTML(evilDataset(), "data_scientist", evilSnapshots());

    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(html).not.toContain("'unsafe-eval'");

    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(inline.length).toBe(1);
    expect(html).toContain(`'sha256-${await sha256Base64(inline[0][1])}'`);
  });

  it("produces identical hardening for every role (no role-specific bypass)", async () => {
    for (const role of [
      "data_analyst",
      "data_engineer",
      "business_analyst",
      "data_scientist",
    ] as const) {
      const html = await buildInteractiveHTML(evilDataset(), role, evilSnapshots());
      expect(html).toContain("default-src 'none'");
      // Only live element tags matter — escaped payload text is inert.
      expect(markupOnly(html)).not.toMatch(/<img[^>]*\sonerror\s*=/i);
    }
  });
});
