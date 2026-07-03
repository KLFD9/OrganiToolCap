import { useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useOrgChartStore } from "../store/useOrgChartStore";
import { isHierarchyEdge } from "../types/orgchart";
import { computeLevels, computeNodeStyle } from "../lib/nodeStyle";
import { buildChildrenMap, computeDescendantCounts, computeDescendants } from "../lib/hierarchy";
import { downloadPeopleCsv } from "../lib/csvExport";

/**
 * Vue annuaire : table triable, filtrable et **éditable** de tous les membres.
 * C'est un vrai poste de travail : double-clic sur une cellule pour la
 * modifier (y compris le responsable, via un sélecteur avec garde anti-cycle),
 * ajout de membres et de subordonnés, suppression — le tout synchronisé avec
 * le canvas et l'inspecteur. L'export CSV fait le round-trip avec l'import.
 */

type SortKey = "name" | "role" | "department" | "email" | "manager" | "team";

interface DirectoryRow {
  id: string;
  name: string;
  role: string;
  department: string;
  email: string;
  managerId?: string;
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

/** Cellule éditable au double-clic : Entrée valide, Échap annule, blur valide. */
function EditableCell({
  value,
  placeholder,
  mono = false,
  dark,
  onCommit,
}: {
  value: string;
  placeholder: string;
  mono?: boolean;
  dark: boolean;
  onCommit: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        onDoubleClick={(e) => {
          e.stopPropagation();
          setDraft(value);
          setEditing(true);
        }}
        title="Double-clic pour modifier"
        className={`w-full cursor-text truncate rounded px-1 py-0.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${
          mono ? "font-mono text-[10px]" : ""
        } ${value ? "" : "text-zinc-300 dark:text-zinc-600"}`}
      >
        {value || placeholder}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  };

  return (
    <input
      autoFocus
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") setEditing(false);
      }}
      className={`w-full rounded border px-1 py-0.5 text-xs focus:outline-none ${
        mono ? "font-mono text-[10px]" : ""
      } ${
        dark
          ? "border-primary-400/50 bg-zinc-900 text-zinc-100"
          : "border-primary-600/50 bg-white text-zinc-800"
      }`}
    />
  );
}

export function Directory({ themeMode, onClose }: DirectoryProps) {
  const nodes = useOrgChartStore((s) => s.nodes);
  const edges = useOrgChartStore((s) => s.edges);
  const theme = useOrgChartStore((s) => s.theme);
  const title = useOrgChartStore((s) => s.meta.title);
  const selectedNodeIds = useOrgChartStore((s) => s.selectedNodeIds);
  const selectNode = useOrgChartStore((s) => s.selectNode);
  const updateNodeData = useOrgChartStore((s) => s.updateNodeData);
  const setManager = useOrgChartStore((s) => s.setManager);
  const addNode = useOrgChartStore((s) => s.addNode);
  const deleteNode = useOrgChartStore((s) => s.deleteNode);
  const { getNode, setCenter } = useReactFlow();

  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  /** Ligne dont le sélecteur de responsable est ouvert. */
  const [managerEditId, setManagerEditId] = useState<string | null>(null);

  const rows = useMemo<DirectoryRow[]>(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const parentOf = new Map(edges.filter(isHierarchyEdge).map((e) => [e.target, e.source]));
    const children = buildChildrenMap(edges);
    const totals = computeDescendantCounts(edges);
    const levels = computeLevels(nodes, edges);

    return nodes.map((n) => {
      const managerId = parentOf.get(n.id);
      const parent = managerId ? byId.get(managerId) : undefined;
      return {
        id: n.id,
        name: n.data.name || "",
        role: n.data.role ?? "",
        department: n.data.department ?? "",
        email: n.data.email ?? "",
        managerId,
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
  const commitData = (id: string) => (field: "name" | "role" | "department" | "email") => (value: string) =>
    updateNodeData(id, { [field]: value.trim() || undefined });

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col ${
        dark ? "bg-editor-bg-dark text-text-dark" : "bg-editor-bg-light text-text-light"
      }`}
    >
      {/* En-tête : titre, filtre, ajout, export CSV, retour */}
      <div className="flex flex-wrap items-center gap-3 px-6 pt-5 pb-4">
        <div>
          <h2 className="text-sm font-bold tracking-tight">Annuaire</h2>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            {visibleRows.length} membre{visibleRows.length > 1 ? "s" : ""}
            {filter.trim() ? ` (sur ${rows.length})` : ""} — double-clic sur une cellule pour la modifier.
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
          onClick={() => addNode()}
          className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-white shadow-sm transition-all cursor-pointer ${
            dark ? "bg-primary-600 hover:bg-primary-500" : "bg-primary-700 hover:bg-primary-600"
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Ajouter un membre
        </button>

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
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-all cursor-pointer ${
            dark
              ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800"
              : "border-border-light bg-white text-zinc-600 hover:bg-zinc-50"
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
              const commit = commitData(row.id);
              return (
                <tr
                  key={row.id}
                  onClick={() => selectNode(row.id)}
                  className={`group cursor-pointer transition-colors ${
                    selected
                      ? "bg-primary-600/10 dark:bg-primary-400/10"
                      : dark
                      ? "hover:bg-zinc-900/60"
                      : "hover:bg-white"
                  }`}
                >
                  <td className="border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-900">
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                        style={{ background: row.accentColor }}
                      >
                        {initials(row.name) || "?"}
                      </span>
                      <span className="min-w-0 flex-1 font-semibold text-zinc-800 dark:text-zinc-100">
                        <EditableCell value={row.name} placeholder="Sans nom" dark={dark} onCommit={commit("name")} />
                      </span>
                    </span>
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-1.5 text-zinc-500 dark:border-zinc-900 dark:text-zinc-400">
                    <EditableCell value={row.role} placeholder="—" dark={dark} onCommit={commit("role")} />
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-900">
                    <EditableCell value={row.department} placeholder="—" dark={dark} onCommit={commit("department")} />
                  </td>
                  <td className="hidden border-b border-zinc-100 px-3 py-1.5 text-zinc-500 lg:table-cell dark:border-zinc-900 dark:text-zinc-400">
                    <EditableCell value={row.email} placeholder="—" mono dark={dark} onCommit={commit("email")} />
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-1.5 text-zinc-500 dark:border-zinc-900 dark:text-zinc-400">
                    {managerEditId === row.id ? (
                      <select
                        autoFocus
                        value={row.managerId ?? ""}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => setManagerEditId(null)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Escape") setManagerEditId(null);
                        }}
                        onChange={(e) => {
                          setManager(row.id, e.target.value || undefined);
                          setManagerEditId(null);
                        }}
                        className={`w-full rounded border px-1 py-0.5 text-xs focus:outline-none ${
                          dark
                            ? "border-primary-400/50 bg-zinc-900 text-zinc-100"
                            : "border-primary-600/50 bg-white text-zinc-800"
                        }`}
                      >
                        <option value="">Aucun responsable</option>
                        {(() => {
                          // Exclut le membre lui-même et ses subordonnés (anti-cycle)
                          const forbidden = computeDescendants(edges, row.id);
                          forbidden.add(row.id);
                          return nodes
                            .filter((n) => !forbidden.has(n.id))
                            .map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.data.name || "Sans nom"}
                              </option>
                            ));
                        })()}
                      </select>
                    ) : (
                      <button
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setManagerEditId(row.id);
                        }}
                        title="Double-clic pour changer de responsable"
                        className={`w-full cursor-text truncate rounded px-1 py-0.5 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${
                          row.manager ? "" : "text-zinc-300 dark:text-zinc-600"
                        }`}
                      >
                        {row.manager || "—"}
                      </button>
                    )}
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-1.5 text-right font-mono text-[10px] text-zinc-500 tabular-nums dark:border-zinc-900 dark:text-zinc-400">
                    {row.total > 0 ? `${row.direct} / ${row.total}` : "—"}
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-900">
                    <span className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addNode(row.id);
                        }}
                        title={`Ajouter un subordonné à ${row.name || "ce membre"}`}
                        aria-label={`Ajouter un subordonné à ${row.name || "ce membre"}`}
                        className={`rounded-md p-1 transition-colors cursor-pointer ${
                          dark ? "text-zinc-500 hover:text-primary-300 hover:bg-zinc-800" : "text-zinc-400 hover:text-primary-700 hover:bg-zinc-100"
                        }`}
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLocate(row.id);
                        }}
                        title="Voir dans l'organigramme"
                        aria-label={`Voir ${row.name || "ce membre"} dans l'organigramme`}
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNode(row.id);
                        }}
                        title={`Supprimer ${row.name || "ce membre"}`}
                        aria-label={`Supprimer ${row.name || "ce membre"}`}
                        className="rounded-md p-1 text-zinc-400 transition-colors hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </span>
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
