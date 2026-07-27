import { useMemo, useState } from "react";
import { FileSpreadsheet, ShieldCheck, X } from "lucide-react";
import {
  CsvFormatError,
  detectPeopleColumns,
  importPeopleRows,
  type CsvImportResult,
  type PeopleColumnKey,
  type PeopleColumnMapping,
} from "../lib/csvImport";
import type { WorkbookSheet } from "../lib/xlsxImport";

const FIELDS: Array<{ key: PeopleColumnKey; label: string; required?: boolean }> = [
  { key: "name", label: "Nom", required: true },
  { key: "role", label: "Poste" },
  { key: "department", label: "Pôle / service" },
  { key: "email", label: "E-mail" },
  { key: "phone", label: "Téléphone" },
  { key: "manager", label: "Responsable" },
];

interface SpreadsheetImportDialogProps {
  fileName: string;
  sheets: WorkbookSheet[];
  themeMode: "light" | "dark";
  onCancel: () => void;
  onConfirm: (result: CsvImportResult) => void;
}

export function SpreadsheetImportDialog({
  fileName,
  sheets,
  themeMode,
  onCancel,
  onConfirm,
}: SpreadsheetImportDialogProps) {
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(sheets[0]?.suggestedHeaderRow ?? 0);
  const [mapping, setMapping] = useState<PeopleColumnMapping>(sheets[0]?.suggestedMapping ?? {});
  const [error, setError] = useState<string | null>(null);
  const sheet = sheets[sheetIndex];
  const header = sheet?.rows[headerRow] ?? [];
  const preview = useMemo(() => sheet?.rows.slice(headerRow + 1, headerRow + 5) ?? [], [sheet, headerRow]);

  const selectSheet = (index: number) => {
    const next = sheets[index];
    setSheetIndex(index);
    setHeaderRow(next.suggestedHeaderRow);
    setMapping(next.suggestedMapping);
    setError(null);
  };

  const selectHeader = (index: number) => {
    setHeaderRow(index);
    setMapping(detectPeopleColumns(sheet.rows[index] ?? []));
    setError(null);
  };

  const mapField = (key: PeopleColumnKey, raw: string) => {
    const index = raw === "" ? undefined : Number(raw);
    setMapping((current) => {
      const next = { ...current };
      for (const field of FIELDS) {
        if (field.key !== key && next[field.key] === index) delete next[field.key];
      }
      if (index === undefined) delete next[key];
      else next[key] = index;
      return next;
    });
    setError(null);
  };

  const confirm = () => {
    try {
      onConfirm(importPeopleRows(sheet.rows, mapping, headerRow));
    } catch (err) {
      setError(err instanceof CsvFormatError ? err.message : "Impossible de lire cette feuille.");
    }
  };

  const panel = themeMode === "dark"
    ? "border-zinc-800 bg-zinc-950 text-zinc-100"
    : "border-zinc-200 bg-white text-zinc-900";
  const input = themeMode === "dark"
    ? "border-zinc-800 bg-zinc-900 text-zinc-100"
    : "border-zinc-200 bg-white text-zinc-800";

  return (
    <div className="fixed inset-0 z-[72] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="xlsx-title" className={`flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border shadow-2xl ${panel}`}>
        <header className="flex items-start justify-between border-b border-zinc-200/70 px-6 py-5 dark:border-zinc-800">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <h2 id="xlsx-title" className="text-base font-bold">Préparer l’import Excel</h2>
              <p className="mt-1 text-xs text-zinc-500">{fileName}</p>
            </div>
          </div>
          <button type="button" aria-label="Annuler l’import Excel" onClick={onCancel} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="overflow-y-auto px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">
              Feuille
              <select value={sheetIndex} onChange={(event) => selectSheet(Number(event.target.value))} className={`mt-1.5 w-full rounded-xl border px-3 py-2 ${input}`}>
                {sheets.map((item, index) => <option key={`${item.name}-${index}`} value={index}>{item.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold">
              Ligne d’en-tête
              <select value={headerRow} onChange={(event) => selectHeader(Number(event.target.value))} className={`mt-1.5 w-full rounded-xl border px-3 py-2 ${input}`}>
                {sheet.rows.slice(0, 12).map((row, index) => (
                  <option key={index} value={index}>Ligne {index + 1} · {row.filter(Boolean).slice(0, 3).join(" · ") || "vide"}</option>
                ))}
              </select>
            </label>
          </div>

          <section className="mt-5">
            <h3 className="text-xs font-bold">Correspondance des colonnes</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {FIELDS.map((field) => (
                <label key={field.key} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2.5 text-xs dark:border-zinc-800">
                  <span>{field.label}{field.required ? " *" : ""}</span>
                  <select aria-label={`Colonne ${field.label}`} value={mapping[field.key] ?? ""} onChange={(event) => mapField(field.key, event.target.value)} className={`min-w-36 rounded-lg border px-2 py-1.5 ${input}`}>
                    <option value="">Non utilisée</option>
                    {header.map((cell, index) => <option key={index} value={index}>{cell || `Colonne ${index + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="mt-5 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[11px]">
                <thead className="bg-zinc-100 dark:bg-zinc-900"><tr>{header.map((cell, index) => <th key={index} className="whitespace-nowrap px-3 py-2 font-bold">{cell || `Colonne ${index + 1}`}</th>)}</tr></thead>
                <tbody>{preview.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-zinc-100 dark:border-zinc-900">{header.map((_, index) => <td key={index} className="max-w-48 truncate px-3 py-2">{row[index]}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </section>

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p><b>Lecture locale.</b> Le classeur ne quitte jamais cet appareil.</p>
          </div>
          {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-zinc-200/70 px-6 py-4 dark:border-zinc-800">
          <button type="button" onClick={onCancel} className="h-9 rounded-lg px-4 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">Annuler</button>
          <button type="button" onClick={confirm} disabled={mapping.name === undefined} className="h-9 rounded-lg bg-primary-700 px-4 text-xs font-semibold text-white disabled:opacity-40">Analyser la liste</button>
        </footer>
      </div>
    </div>
  );
}
