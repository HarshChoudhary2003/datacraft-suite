// Multi-format file parser: CSV, JSON. (Excel removed due to security vulnerabilities)
import { parseCSV, coerceTypes } from "./csv";
import ExcelJS from "exceljs";

export type ParsedFile = { rows: Record<string, unknown>[]; sheetNames?: string[] };

const isXlsx = (name: string) => /\.(xlsx|xls)$/i.test(name);
const isJson = (name: string) => /\.json$/i.test(name);
const isJsonl = (name: string) => /\.jsonl$/i.test(name);
const isTsv = (name: string) => /\.tsv$/i.test(name);

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name;

  if (isXlsx(name)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheetNames = workbook.worksheets.map((ws) => ws.name);
    if (sheetNames.length === 0) throw new Error("Excel file is empty");

    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error("Could not read the first sheet");

    const rows: Record<string, unknown>[] = [];
    const headers: string[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell, colNumber) => {
          headers[colNumber] = cell.text || `col_${colNumber}`;
        });
      } else {
        const obj: Record<string, unknown> = {};
        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber];
          if (header) {
            let val: unknown = cell.value;
            if (val && typeof val === "object" && "result" in val)
              val = (val as { result: unknown }).result;
            else if (val && typeof val === "object" && val instanceof Date) val = val.toISOString();
            else if (val && typeof val === "object" && "text" in val)
              val = (val as { text: unknown }).text;
            obj[header] = val ?? null;
          }
        });
        rows.push(obj);
      }
    });

    return { rows: normalize(rows), sheetNames };
  }

  if (isJsonl(name)) {
    const text = await file.text();
    const arr: Record<string, unknown>[] = [];
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        arr.push(JSON.parse(line));
      } catch (e) {
        throw new Error("Invalid JSONL file: could not parse line");
      }
    }
    return { rows: normalize(arr) };
  }

  if (isJson(name)) {
    const text = await file.text();
    const data = JSON.parse(text);
    let arr: Record<string, unknown>[];
    if (Array.isArray(data)) arr = data;
    else if (data && typeof data === "object") {
      const k = Object.keys(data).find((k) => Array.isArray((data as Record<string, unknown>)[k]));
      arr = k
        ? ((data as Record<string, unknown>)[k] as Record<string, unknown>[])
        : [data as Record<string, unknown>];
    } else {
      throw new Error("Unsupported JSON shape");
    }
    return { rows: normalize(arr) };
  }

  // CSV / TSV
  const text = await file.text();
  const delimiter = isTsv(name) ? "\t" : ",";
  return { rows: coerceTypes(parseCSV(text, delimiter)) };
}

function normalize(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  // ensure consistent shape with auto-typing for strings that look like numbers
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (v === "" || v == null) {
        out[k] = null;
        continue;
      }
      if (typeof v === "string") {
        const t = v.trim();
        // Keep leading-zero strings (like ZIP codes "02138", account IDs "00123") as string
        if (/^0\d+$/.test(t)) {
          out[k] = v;
          continue;
        }
        const n = Number(t);
        if (t !== "" && !isNaN(n) && /^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/.test(t)) {
          out[k] = n;
          continue;
        }
      }
      out[k] = v;
    }
    return out;
  });
}
