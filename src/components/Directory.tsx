import { useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useOrgChartStore } from "../store/useOrgChartStore";
import { isHierarchyEdge } from "../types/orgchart";
import { computeLevels, computeNodeStyle } from "../lib/nodeStyle";
import { buildChildrenMap, computeDescendantCounts } from "../lib/hierarchy";
import { downloadPeopleCsv } from "../lib/csvExport";

/**
 * Vue annuaire : table triable et filtrable de tous les membres, synchronisée
 * avec le canvas — sélectionner une ligne ouvre la fiche dans l'inspecteur,
 * « voir dans l'organigramme » recentre le canvas sur la personne. L'export
 * CSV fait le round-trip avec l'import (édition de masse dans Excel).
 */

type SortKey = "name" | "role" | "department" | "email" | "manager" | "team";

interface DirectoryRow {
  id: string;
  name: string;
  role: string;
  department: string;
  email: string;
  manager: string;
  direct: number;
  total: number;
  accentColor: string;
}

interface DirectoryProps {
  themeMode: "light" | "dark";
  /** Retour à l'organigramme. */
  onClose: () => void;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const COLUMNS: Array<{ key: SortKey; label: string; className?: string }> = [
  { key: "name", label: "Nom" },
  { key: "role", label: "Poste" },
  { key: "department", label: "Pôle" },
  { key: "email", label: "E-mail", className: "hidden lg:table-cell" },
  { key: "manager", label: "Responsable" },
  { key: "team", label: "Équipe", className: "text-right" },
];

export function Directory({ themeMode, onClose }: DirectoryProps) {
  const nodes = useOrgChartStore((s) => s.nodes);
  const edges = useOrgChartStore((s) => s.edges);
  const theme = useOrgChartStore((s) => s.theme);
  const title = useOrgChartStore((s) => s.meta.title);
  const selectedNodeIds = useOrgChartStore((s) => s.selectedNodeIds);
  const selectNode = useOrgChartStore((s) => s.selectNode);
  const { getNode, setCenter } = useReactFlow();

  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const rows = useMemo<DirectoryRow[]>(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const parentOf = new Map(edges.filter(isHierarchyEdge).map((e) => [e.target, e.source]));
    const children = buildChildrenMap(edges);
    const totals = computeDescendantCounts(edges);
    const levels = computeLevels(nodes, edges);

    return nodes.map((n) => {
      const parent = parentOf.has(n.id) ? byId.get(parentOf.get(n.id)!) : undefined;
      return {
        id: n.id,
        name: n.data.name || "Sans nom",
        role: n.data.role ?? "",
        department: n.data.department ?? "",
        email: n.data.email ?? "",
        manager: parent ? parent.data.name || parent.data.email || "" : "",
        direct: children.get(n.id)?.length ?? 0,
        total: totals.get(n.id) ?? 0,
        accentColor: computeNodeStyle(theme, levels.get(n.id) ?? 0, n.styleOverride).accentColor,
      };
    });
  }, [nodes, edges, theme]);

  const visibleRows = useMemo(() => {
    const q = normalize(filter.trim());
    const filtered = q
      ? rows.filter((r) =>
          [r.name, r.role, r.department, r.email, r.manager].some((field) => normalize(field).includes(q))
        )
      : rows;

    return [...filtered].sort((a, b) => {
      if (sortKey === "team") return (a.total - b.total) * sortDir;
      return a[sortKey].localeCompare(b[sortKey], "fr", { sensitivity: "base" }) * sortDir;
    });
  }, [rows, filter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const handleLocate = (id: string) => {
    selectNode(id);
    onClose();
    requestAnimationFrame(() => {
      const node = getNode(id);
      if (!node) return;
      const width = node.measured?.width ?? node.width ?? 240;
      const height = node.measured?.height ?? node.height ?? 110;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: 1.2,
        duration: reduceMotion ? 0 : 400,
      });
    });
  };

  const dark = themeMode === "dark";

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col ${
        dark ? "bg-editor-bg-dark text-text-dark" : "bg-editor-bg-light text-text-light"
      }`}
    >
      {/* En-tête : titre, filtre, export CSV, retour */}
      <div className="flex flex-wrap items-center gap-3 px-6 pt-5 pb-4">
        <div>
          <h2 className="text-sm font-bold tracking-tight">Annuaire</h2>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            {visibleRows.length} membre{visibleRows.length > 1 ? "s" : ""}
            {filter.trim() ? ` (sur ${rows.length})` : ""} — cliquez une ligne pour ouvrir la fiche.
          </p>
        </div>

        <div className="relative ml-auto">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer (nom, poste, pôle...)"
            className={`w-56 rounded-lg border py-1.5 pl-9 pr-3 text-xs transition-all focus:outline-none ${
              dark
                ? "border-border-dark bg-zinc-900 text-zinc-200 placeholder-zinc-500 focus:border-zinc-700"
                : "border-border-light bg-white text-zinc-700 placeholder-zinc-400 focus:border-zinc-300"
            }`}
          />
        </div>

        <button
          onClick={() => downloadPeopleCsv(nodes, edges, title)}
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-all cursor-pointer ${
            dark
              ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800"
              : "border-border-light bg-white text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Exporter en CSV
        </button>

        <button
          onClick={onClose}
          title="Retour à l'organigramme (Échap)"
          className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white shadow-sm transition-all cursor-pointer ${
            dark ? "bg-primary-600 hover:bg-primary-500" : "bg-primary-700 hover:bg-primary-600"
          }`}
        >
          Organigramme
          <span className="font-mono text-[9px] opacity-70">(Échap)</span>
        </button>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto px-6 pb-6 custom-scrollbar">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-10">
            <tr className={dark ? "bg-editor-bg-dark" : "bg-editor-bg-light"}>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  aria-sort={sortKey === col.key ? (sortDir === 1 ? "ascending" : "descending") : "none"}
                  className={`border-b px-3 py-2 text-left ${col.className ?? ""} ${
                    dark ? "border-border-dark" : "border-border-light"
                  }`}
                >
                  <button
                    onClick={() => handleSort(col.key)}
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                      sortKey === col.key
                        ? "text-primary-700 dark:text-primary-300"
                        : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
                    }`}
                  >
                    {col.label}
                    {sortKey === col.key && <span aria-hidden>{sortDir === 1 ? "↑" : "↓"}</span>}
                  </button>
                </th>
              ))}
              <th className={`border-b px-3 py-2 ${dark ? "border-border-dark" : "border-border-light"}`} />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const selected = selectedNodeIds.includes(row.id);
              return (
                <tr
                  key={row.id}
                  onClick={() => selectNode(row.id)}
                  className={`cursor-pointer transition-colors ${
                    selected
                      ? "bg-primary-600/10 dark:bg-primary-400/10"
                      : dark
                      ? "hover:bg-zinc-900/60"
                      : "hover:bg-white"
                  }`}
                >
                  <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-900">
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                        style={{ background: row.accentColor }}
                      >
                        {initials(row.name) || "?"}
                      </span>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-100">{row.name}</span>
                    </span>
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-500 dark:border-zinc-900 dark:text-zinc-400">
                    {row.role}
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2 dark:border-zinc-900">
                    {row.department && (
                      <span
                        className="rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide"
                        style={{ background: `${row.accentColor}18`, color: row.accentColor }}
                      >
                        {row.department}
                      </span>
                    )}
                  </td>
                  <td className="hidden border-b border-zinc-100 px-3 py-2 font-mono text-[10px] text-zinc-500 lg:table-cell dark:border-zinc-900 dark:text-zinc-400">
                    {row.email}
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-500 dark:border-zinc-900 dark:text-zinc-400">
                    {row.manager}
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-right font-mono text-[10px] text-zinc-500 tabular-nums dark:border-zinc-900 dark:text-zinc-400">
                    {row.total > 0 ? `${row.direct} / ${row.total}` : "—"}
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-right dark:border-zinc-900">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLocate(row.id);
                      }}
                      title="Voir dans l'organigramme"
                      aria-label={`Voir ${row.name} dans l'organigramme`}
                      className={`rounded-md p-1 transition-colors cursor-pointer ${
                        dark ? "text-zinc-500 hover:text-primary-300 hover:bg-zinc-800" : "text-zinc-400 hover:text-primary-700 hover:bg-zinc-100"
                      }`}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-3 py-8 text-center text-zinc-400 dark:text-zinc-500">
                  Aucun membre ne correspond au filtre.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
