import { describe, it, expect } from "vitest";
import { buildInteractiveHTML } from "../notebook";
import type { Dataset } from "../stats";

const XSS_SCRIPT = "<script>alert('xss')</script>";
const XSS_IMG = '"><img src=x onerror=alert(1)>';
const XSS_BREAKOUT = "</script><script>alert(2)</script>";

function maliciousDataset(): Dataset {
  return {
    name: XSS_SCRIPT,
    columns: ["amount", XSS_IMG],
    rows: [
      { amount: 10, [XSS_IMG]: XSS_BREAKOUT },
      { amount: 20, [XSS_IMG]: XSS_SCRIPT },
      { amount: 30, [XSS_IMG]: "safe value" },
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
        name: XSS_IMG,
        type: "categorical",
        count: 3,
        missing: 0,
        missingPct: 0,
        unique: 3,
        topValues: [
          { value: XSS_SCRIPT, count: 1 },
          { value: XSS_BREAKOUT, count: 1 },
        ],
      },
    ],
    rowCount: 3,
    colCount: 2,
    missingTotal: 0,
    duplicateRows: 0,
    duplicateIndices: [],
    readinessScore: 90,
    readinessBreakdown: [],
    correlation: { columns: [], matrix: [] },
  };
}

async function sha256Base64(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = new Uint8Array(digest);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

describe("interactive notebook export — XSS hardening", () => {
  it("escapes malicious dataset/column/value strings so they never render as active HTML", async () => {
    const html = await buildInteractiveHTML(maliciousDataset(), "data_analyst");

    // The raw HTML-injection payloads must never appear with literal angle brackets.
    // HTML contexts are esc()'d (< -> &lt;) and data contexts are JSON-escaped (< -> \u003c).
    // (Inert text like "onerror=" may survive inside an escaped &lt;img&gt; — that is harmless.)
    expect(html).not.toContain("<img src=x onerror=");
    // A user-supplied "</script>" must not be able to close our script/element early.
    expect(html).not.toContain("</script><script>alert(2)</script>");

    // Escaped evidence proves the dataset name was neutralised, not stripped silently.
    expect(html).toContain("&lt;script&gt;");
  });

  it("emits a strict Content-Security-Policy with no inline-script allowance", async () => {
    const html = await buildInteractiveHTML(maliciousDataset(), "data_engineer");

    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'sha256-");
    // Strict: inline script must NOT be blanket-allowed.
    expect(html).not.toContain("'unsafe-inline'; script");
    expect(html).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(html).not.toContain("'unsafe-eval'");
  });

  it("contains no inline event-handler attributes", async () => {
    const html = await buildInteractiveHTML(maliciousDataset(), "business_analyst");
    // Only real (unescaped) element tags matter; user "<" is escaped so it can't form a tag.
    expect(html).not.toMatch(/<[a-zA-Z][^>]*\son(click|error|load|mouseover|submit|change)\s*=/i);
  });

  it("authorizes exactly the one vetted inline script via its CSP hash", async () => {
    const html = await buildInteractiveHTML(maliciousDataset(), "data_scientist");

    // The single inline <script> block (no src attribute) holds all interactivity.
    const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(matches.length).toBe(1);

    const inlineScript = matches[0][1];
    const expectedHash = await sha256Base64(inlineScript);

    // The CSP must authorize this exact byte sequence — any tampering/injection
    // would change the hash and be refused by the browser.
    expect(html).toContain(`'sha256-${expectedHash}'`);
  });
});
