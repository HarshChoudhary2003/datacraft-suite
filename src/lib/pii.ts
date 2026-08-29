import type { Dataset } from "@/lib/stats";

export type PiiType = "email" | "phone" | "ssn" | "credit_card";

export interface PiiDetection {
  column: string;
  type: PiiType;
  confidence: number;
  count: number;
}

const REGEX_EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
const REGEX_PHONE = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;
const REGEX_SSN =
  /\b(?:(?!000)(?!666)(?:[0-6]\d{2}|7[0-2][0-9]|73[0-3]|7[6-9]\d|8\d{2}|90[0-2])[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4})\b/;
const REGEX_CREDIT_CARD =
  /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/;

export function detectPII(dataset: Dataset): PiiDetection[] {
  const detections: PiiDetection[] = [];

  for (const profile of dataset.profiles) {
    if (profile.type === "numeric" || profile.type === "boolean" || profile.type === "datetime") {
      continue;
    }

    let emailCount = 0;
    let phoneCount = 0;
    let ssnCount = 0;
    let ccCount = 0;

    let sampleSize = 0;

    // Sample up to 1000 rows
    for (let i = 0; i < Math.min(dataset.rows.length, 1000); i++) {
      const val = dataset.rows[i][profile.name];
      if (!val || typeof val !== "string") continue;
      sampleSize++;

      if (REGEX_EMAIL.test(val)) emailCount++;
      else if (REGEX_SSN.test(val)) ssnCount++;
      else if (REGEX_CREDIT_CARD.test(val)) ccCount++;
      else if (REGEX_PHONE.test(val)) phoneCount++;
    }

    if (sampleSize === 0) continue;

    const addIfHigh = (count: number, type: PiiType) => {
      const confidence = count / sampleSize;
      if (confidence > 0.1) {
        // If more than 10% of the sample matches the regex, we assume it's a PII column
        detections.push({ column: profile.name, type, confidence, count });
      }
    };

    addIfHigh(emailCount, "email");
    addIfHigh(ssnCount, "ssn");
    addIfHigh(ccCount, "credit_card");
    addIfHigh(phoneCount, "phone");
  }

  return detections;
}

export function anonymizePII(
  rows: Record<string, unknown>[],
  targetColumns: string[],
  method: "redact" | "hash",
): Record<string, unknown>[] {
  return rows.map((row) => {
    const newRow = { ...row };
    for (const col of targetColumns) {
      const val = newRow[col];
      if (typeof val === "string" && val.trim() !== "") {
        if (method === "redact") {
          newRow[col] = "[REDACTED]";
        } else {
          // Simple hash implementation for browser
          let hash = 0;
          for (let i = 0; i < val.length; i++) {
            const char = val.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash; // Convert to 32bit integer
          }
          newRow[col] = `HASH_${Math.abs(hash).toString(16)}`;
        }
      }
    }
    return newRow;
  });
}
