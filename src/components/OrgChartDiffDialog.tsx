import { GitCompareArrows, ShieldCheck, TriangleAlert, UserMinus, UserPlus, X } from "lucide-react";
import type { OrgChartDiff } from "../lib/orgChartDiff";

interface OrgChartDiffDialogProps {
  referenceName: string;
  diff: OrgChartDiff;
  themeMode: "light" | "dark";
  onClose: () => void;
}

export function OrgChartDiffDialog({ referenceName, diff, themeMode, onClose }: OrgChartDiffDialogProps) {
  const panel = themeMode === "dark"
    ? "border-zinc-800 bg-zinc-950 text-zinc-100"
    : "border-zinc-200 bg-white text-zinc-900";
  return (
    <div className="fixed inset-0 z-[72] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="diff-title" className={`flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border shadow-2xl ${panel}`}>
        <header className="flex items-start justify-between border-b border-zinc-200/70 px-6 py-5 dark:border-zinc-800">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300"><GitCompareArrows className="h-5 w-5" /></span>
            <div><h2 id="diff-title" className="text-base font-bold">Évolutions de l’organigramme</h2><p className="mt-1 text-xs text-zinc-500">Référence : {referenceName} · comparaison avec le document actuel</p></div>
          </div>
          <button type="button" aria-label="Fermer la comparaison" onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button>
        </header>
        <div className="overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-4 gap-2 text-center">
            <Summary value={diff.arrivals.length} label="arrivées" tone="emerald" />
            <Summary value={diff.departures.length} label="départs" tone="red" />
            <Summary value={diff.changes.length} label="modifiés" tone="amber" />
            <Summary value={diff.unchanged} label="inchangés" tone="zinc" />
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p><b>Comparaison locale et non destructive.</b> Aucun fichier n’est modifié.</p>
          </div>
          {diff.ambiguities.length > 0 && <Section title="Correspondances à vérifier" icon={<TriangleAlert className="h-4 w-4" />}>{diff.ambiguities.map((item) => <p key={item} className="text-xs">{item}</p>)}</Section>}
          {diff.arrivals.length > 0 && <Section title="Arrivées" icon={<UserPlus className="h-4 w-4" />}>{diff.arrivals.map((node) => <Person key={node.id} name={node.data.name} detail={[node.data.role, node.data.department].filter(Boolean).join(" · ")} />)}</Section>}
          {diff.departures.length > 0 && <Section title="Départs" icon={<UserMinus className="h-4 w-4" />}>{diff.departures.map((node) => <Person key={node.id} name={node.data.name} detail={[node.data.role, node.data.department].filter(Boolean).join(" · ")} />)}</Section>}
          {diff.changes.length > 0 && <Section title="Changements" icon={<GitCompareArrows className="h-4 w-4" />}>{diff.changes.map((change) => (
            <div key={`${change.referenceId}-${change.currentId}`} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <p className="text-xs font-bold">{change.name}</p>
              <ul className="mt-2 space-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">{change.fields.map((field) => <li key={field.label}><b>{field.label} :</b> {field.before || "—"} → {field.after || "—"}</li>)}</ul>
            </div>
          ))}</Section>}
          {diff.arrivals.length === 0 && diff.departures.length === 0 && diff.changes.length === 0 && <p className="mt-6 text-center text-sm font-semibold text-emerald-700 dark:text-emerald-300">Aucune évolution détectée.</p>}
        </div>
        <footer className="flex justify-end border-t border-zinc-200/70 px-6 py-4 dark:border-zinc-800"><button type="button" onClick={onClose} className="h-9 rounded-lg bg-primary-700 px-4 text-xs font-semibold text-white">Fermer</button></footer>
      </div>
    </div>
  );
}

function Summary({ value, label, tone }: { value: number; label: string; tone: "emerald" | "red" | "amber" | "zinc" }) {
  const colors = { emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300", red: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300", amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300", zinc: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300" };
  return <div className={`rounded-xl px-2 py-3 ${colors[tone]}`}><p className="text-xl font-black">{value}</p><p className="text-[10px] font-semibold">{label}</p></div>;
}
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="mt-5"><h3 className="flex items-center gap-2 text-xs font-bold">{icon}{title}</h3><div className="mt-2 space-y-2">{children}</div></section>;
}
function Person({ name, detail }: { name: string; detail: string }) {
  return <div className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-900"><p className="text-xs font-bold">{name || "Sans nom"}</p>{detail && <p className="mt-0.5 text-[10px] text-zinc-500">{detail}</p>}</div>;
}
