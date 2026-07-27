import type { PeopleColumnMapping } from "./csvImport";
import { detectPeopleColumns } from "./csvImport";

export interface WorkbookSheet {
  name: string;
  rows: string[][];
  suggestedHeaderRow: number;
  suggestedMapping: PeopleColumnMapping;
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toLocaleDateString("fr-FR");
  return String(value).trim();
}

function detectHeader(rows: string[][]): { row: number; mapping: PeopleColumnMapping } {
  let best = { row: 0, mapping: detectPeopleColumns(rows[0] ?? []) };
  let bestScore = Object.keys(best.mapping).length + (best.mapping.name !== undefined ? 10 : 0);
  for (let row = 1; row < Math.min(rows.length, 12); row++) {
    const mapping = detectPeopleColumns(rows[row]);
    const score = Object.keys(mapping).length + (mapping.name !== undefined ? 10 : 0);
    if (score > bestScore) {
      best = { row, mapping };
      bestScore = score;
    }
  }
  return best;
}

/** Lit toutes les feuilles d'un classeur XLSX, exclusivement en mémoire locale. */
export async function readPeopleWorkbook(file: File): Promise<WorkbookSheet[]> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  return sheets.map((sheet) => {
    const rows = sheet.data.map((row) => row.map(cellToText));
    const header = detectHeader(rows);
    return {
      name: sheet.sheet,
      rows,
      suggestedHeaderRow: header.row,
      suggestedMapping: header.mapping,
    };
  });
}
