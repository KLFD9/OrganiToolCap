import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FileSpreadsheet, GitBranch, ShieldCheck, TriangleAlert, Users, Wand2, X } from "lucide-react";
import type { CsvImportResult } from "../lib/csvImport";

interface CsvImportDialogProps {
  fileName: string;
  result: CsvImportResult;
  currentNodeCount: number;
  currentDocumentDirty: boolean;
  busy: boolean;
  themeMode: "light" | "dark";
  onCancel: () => void;
  onConfirm: (organize: boolean) => void;
}

export function CsvImportDialog({
  fileName,
  result,
  currentNodeCount,
  currentDocumentDirty,
  busy,
  themeMode,
  onCancel,
  onConfirm,
}: CsvImportDialogProps) {
  const [organize, setOrganize] = useState(true);
  const summary = useMemo(() => {
    const childIds = new Set(result.edges.map((edge) => edge.target));
    return {
      roots: result.nodes.filter((node) => !childIds.has(node.id)).length,
      managers: new Set(result.edges.map((edge) => edge.source)).size,
    };
  }, [result]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [busy, onCancel]);

  const panelClass = themeMode === "dark"
    ? "border-zinc-800 bg-zinc-950 text-zinc-100"
    : "border-zinc-200 bg-white text-zinc-900";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="csv-import-title"
        className={`flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border shadow-2xl ${panelClass}`}
      >
        <header className="flex items-start justify-between border-b border-zinc-200/70 px-6 py-5 dark:border-zinc-800">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 id="csv-import-title" className="text-base font-bold">Préparer l’import CSV</h2>
              <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{fileName}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Annuler l’import CSV"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-3 gap-2">
            <Summary icon={<Users className="h-4 w-4" />} value={result.nodes.length} label="personnes" />
            <Summary icon={<GitBranch className="h-4 w-4" />} value={summary.managers} label="responsables" />
            <Summary icon={<GitBranch className="h-4 w-4" />} value={summary.roots} label="racines" />
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p><b>Analyse locale.</b> Les noms, e-mails et numéros ne quittent pas cet appareil.</p>
          </div>

          {currentNodeCount > 0 && (
            <div className={`mt-3 flex items-start gap-2 rounded-xl px-3.5 py-3 text-xs ${currentDocumentDirty ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "bg-zinc-100 text-zinc-650 dark:bg-zinc-900 dark:text-zinc-300"}`}>
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Cet import ouvrira un <b>nouvel organigramme</b> à la place de l’affichage actuel.
                {currentDocumentDirty
                  ? " Le travail actuel n’est pas enregistré : enregistrez-le d’abord si vous souhaitez le conserver dans un fichier."
                  : " Vous pourrez revenir au document actuel avec Annuler."}
              </p>
            </div>
          )}

          {result.warnings.length > 0 && (
            <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 dark:border-amber-900 dark:bg-amber-950/20">
              <h3 className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-200">
                <TriangleAlert className="h-4 w-4" />
                {result.warnings.length} point{result.warnings.length > 1 ? "s" : ""} à vérifier
              </h3>
              <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                {result.warnings.map((warning, index) => <li key={`${warning}-${index}`}>• {warning}</li>)}
              </ul>
            </section>
          )}

          <fieldset className="mt-5">
            <legend className="text-xs font-bold text-zinc-700 dark:text-zinc-200">Mise en page initiale</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Choice
                checked={organize}
                title="Organiser pour la page"
                description="Disposition lisible calculée pour la surface actuelle."
                badge="Recommandé"
                onChange={() => setOrganize(true)}
              />
              <Choice
                checked={!organize}
                title="Garder l’ordre du fichier"
                description="Import vertical brut, à placer ensuite manuellement."
                onChange={() => setOrganize(false)}
              />
            </div>
          </fieldset>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-zinc-200/70 px-6 py-4 dark:border-zinc-800">
          <button type="button" disabled={busy} onClick={onCancel} className="h-9 rounded-lg px-4 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800">
            Annuler
          </button>
          <button type="button" disabled={busy} onClick={() => onConfirm(organize)} className="flex h-9 items-center gap-2 rounded-lg bg-primary-700 px-4 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 disabled:cursor-wait disabled:opacity-60">
            <Wand2 className={`h-4 w-4 ${busy ? "animate-pulse" : ""}`} />
            {busy ? "Préparation…" : "Créer l’organigramme"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Summary({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-xl bg-zinc-100 px-3 py-3 dark:bg-zinc-900">
      <div className="flex items-center gap-1.5 text-zinc-400">{icon}<span className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{value}</span></div>
      <p className="mt-0.5 text-[10px] font-medium text-zinc-500">{label}</p>
    </div>
  );
}

function Choice({ checked, title, description, badge, onChange }: { checked: boolean; title: string; description: string; badge?: string; onChange: () => void }) {
  return (
    <label className={`cursor-pointer rounded-xl border p-3.5 transition-colors ${checked ? "border-primary-400 bg-primary-50/70 dark:border-primary-600 dark:bg-primary-950/30" : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"}`}>
      <span className="flex items-start gap-2.5">
        <input type="radio" name="csv-layout" checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 accent-primary-700" />
        <span>
          <span className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
            {title}
            {badge && <span className="rounded-full bg-primary-100 px-1.5 py-0.5 text-[8px] uppercase tracking-wide text-primary-700 dark:bg-primary-900 dark:text-primary-200">{badge}</span>}
          </span>
          <span className="mt-1 block text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">{description}</span>
        </span>
      </span>
    </label>
  );
}
