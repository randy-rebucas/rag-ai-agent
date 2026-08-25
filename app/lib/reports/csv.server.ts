import type { StructuredFact } from "../context/types";

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** Flattens the structured facts a chat turn was grounded in into a CSV export. */
export function factsToCsv(facts: StructuredFact[]): { csv: string; rowCount: number } {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const fact of facts) {
    for (const key of Object.keys(fact.data)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  const headers = ["sourceType", "sourceId", "summary", ...columns];
  const rows = facts.map((fact) => [
    fact.sourceType,
    fact.sourceId,
    fact.summary,
    ...columns.map((col) => fact.data[col]),
  ]);

  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(","));
  return { csv: lines.join("\r\n"), rowCount: rows.length };
}
