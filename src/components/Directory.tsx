import { useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useOrgChartStore } from "../store/useOrgChartStore";
import { isHierarchyEdge } from "../types/orgchart";
import { computeLevels, computeNodeStyle } from "../lib/nodeStyle";
import { buildChildrenMap, computeDescendantCounts, computeDescendants } from "../lib/hierarchy";
import { downloadPeopleCsv } from "../lib/csvExport";
import {
  Search,
  Plus,
  FileSpreadsheet,
  LayoutGrid,
  UserPlus,
  Eye,
  Trash2,
  ArrowUp,
  ArrowDown
} from "lucide-react";

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
        } ${value ? "" : "text-zinc-300 dark:text-zinc-650"}`}
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
      className={`w-full rounded border px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 ${
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
            <Search className="h-3.5 w-3.5" />
          </div>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer (nom, poste, pôle...)"
            className={`w-56 rounded-lg border py-1.5 pl-9 pr-3 text-xs transition-all focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:focus:ring-primary-400/20 dark:focus:border-primary-400 ${
              dark
                ? "border-border-dark bg-zinc-900 text-zinc-200 placeholder-zinc-550 focus:border-zinc-700"
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
          <Plus className="h-3.5 w-3.5" />
          <span>Ajouter un membre</span>
        </button>

        <button
          onClick={() => downloadPeopleCsv(nodes, edges, title)}
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-all cursor-pointer ${
            dark
              ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800"
              : "border-border-light bg-white text-zinc-600 hover:bg-zinc-55"
          }`}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          <span>Exporter en CSV</span>
        </button>

        <button
          onClick={onClose}
          title="Retour à l'organigramme (Échap)"
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-all cursor-pointer ${
            dark
              ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800"
              : "border-border-light bg-white text-zinc-600 hover:bg-zinc-55"
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          <span>Organigramme</span>
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
                    className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                      sortKey === col.key
                        ? "text-primary-700 dark:text-primary-300"
                        : "text-zinc-400 dark:text-zinc-500 hover:text-zinc-650 dark:hover:text-zinc-300"
                    }`}
                  >
                    <span>{col.label}</span>
                    {sortKey === col.key && (
                      sortDir === 1 ? (
                        <ArrowUp className="h-3 w-3 text-primary-500" />
                      ) : (
                        <ArrowDown className="h-3 w-3 text-primary-500" />
                      )
                    )}
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
                  <td className="hidden border-b border-zinc-100 px-3 py-1.5 text-zinc-550 lg:table-cell dark:border-zinc-900 dark:text-zinc-400">
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
                        className={`w-full rounded border px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 ${
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
                          row.manager ? "" : "text-zinc-300 dark:text-zinc-650"
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
                    <span className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
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
                        <UserPlus className="h-3.5 w-3.5" />
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
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNode(row.id);
                        }}
                        title={`Supprimer ${row.name || "ce membre"}`}
                        aria-label={`Supprimer ${row.name || "ce membre"}`}
                        className="rounded-md p-1 text-zinc-450 transition-colors hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-3 py-8 text-center text-zinc-400 dark:text-zinc-550">
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
