import { useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useOrgChartStore } from "../store/useOrgChartStore";
import { openOrgChartFile, saveOrgChartFile, FileFormatError } from "../lib/fileIO";
import { importPeopleCsv, CsvFormatError } from "../lib/csvImport";
import { athanorDemo } from "../templates/athanorDemo";

interface ToolbarProps {
  onExportClick: () => void;
  onNewClick: () => void;
  themeMode: "light" | "dark";
  onToggleTheme: () => void;
  showGroups: boolean;
  onToggleGroups: () => void;
  onTogglePresentation: () => void;
  directoryOpen: boolean;
  onToggleDirectory: () => void;
}

function motionDuration(ms: number): number {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return 0;
  }
  return ms;
}

export function Toolbar({
  onExportClick,
  onNewClick,
  themeMode,
  onToggleTheme,
  showGroups,
  onToggleGroups,
  onTogglePresentation,
  directoryOpen,
  onToggleDirectory,
}: ToolbarProps) {
  const title = useOrgChartStore((s) => s.meta.title);
  const isDirty = useOrgChartStore((s) => s.isDirty);
  const fileHandle = useOrgChartStore((s) => s.fileHandle);
  const layout = useOrgChartStore((s) => s.layout);
  const setTitle = useOrgChartStore((s) => s.setTitle);
  const loadFile = useOrgChartStore((s) => s.loadFile);
  const toFile = useOrgChartStore((s) => s.toFile);
  const markSaved = useOrgChartStore((s) => s.markSaved);
  const setLayoutDirection = useOrgChartStore((s) => s.setLayoutDirection);
  const applyAutoLayout = useOrgChartStore((s) => s.applyAutoLayout);
  const applyCompactLayout = useOrgChartStore((s) => s.applyCompactLayout);
  const undo = useOrgChartStore((s) => s.undo);
  const redo = useOrgChartStore((s) => s.redo);
  const canUndo = useOrgChartStore((s) => s.past.length > 0);
  const canRedo = useOrgChartStore((s) => s.future.length > 0);
  const nodes = useOrgChartStore((s) => s.nodes);
  const selectNode = useOrgChartStore((s) => s.selectNode);

  const { fitView, getNode, setCenter } = useReactFlow();

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return nodes
      .filter((n) =>
        [n.data.name, n.data.role, n.data.department].some((field) => field?.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [nodes, searchQuery]);

  const handleSave = async () => {
    setError(null);
    try {
      const handle = await saveOrgChartFile(toFile(), fileHandle);
      markSaved(handle);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Échec de l'enregistrement.");
      console.error(err);
    }
  };

  const handleSaveAs = async () => {
    setError(null);
    try {
      const handle = await saveOrgChartFile(toFile());
      markSaved(handle);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Échec de l'enregistrement.");
      console.error(err);
    }
  };

  const handleGoToNode = (id: string) => {
    selectNode(id);
    setSearchOpen(false);
    setSearchQuery("");
    requestAnimationFrame(() => {
      const node = getNode(id);
      if (!node) return;
      const width = node.measured?.width ?? node.width ?? 240;
      const height = node.measured?.height ?? node.height ?? 110;
      setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        zoom: 1.2,
        duration: motionDuration(400),
      });
    });
  };

  const handleOpen = async () => {
    setError(null);
    setNotice(null);
    try {
      const result = await openOrgChartFile();
      if (result.kind === "orgchart") {
        loadFile(result.file, result.handle);
        return;
      }

      // PowerPoint : round-trip (json embarqué) ou extraction SmartArt
      const { importPptxFile } = await import("../lib/pptxImport");
      const imported = await importPptxFile(result.data);
      if (imported.kind === "orgchart") {
        loadFile(imported.file);
        requestAnimationFrame(() => fitView({ duration: motionDuration(300), padding: 0.2 }));
        return;
      }

      // Personnes extraites d'un SmartArt : thème courant + rangement automatique
      const current = toFile();
      loadFile({
        ...current,
        meta: {
          ...current.meta,
          title: result.fileName.replace(/\.[^.]+$/, "") || current.meta.title,
          updatedAt: new Date().toISOString(),
        },
        nodes: imported.nodes,
        edges: imported.edges,
      });
      await applyAutoLayout();
      requestAnimationFrame(() => fitView({ duration: motionDuration(300), padding: 0.2 }));
      if (imported.warnings.length > 0) setNotice(imported.warnings.join(" · "));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const { PptxImportError } = await import("../lib/pptxImport");
      if (err instanceof FileFormatError || err instanceof PptxImportError) {
        setError(err.message);
      } else {
        setError("Impossible d'ouvrir ce fichier.");
      }
      console.error(err);
    }
  };


  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError(null);
    setNotice(null);
    try {
      const text = await f.text();
      const { nodes: importedNodes, edges, warnings } = importPeopleCsv(text);
      const current = toFile();
      loadFile({
        ...current,
        meta: {
          ...current.meta,
          title: f.name.replace(/\.[^.]+$/, "") || current.meta.title,
          updatedAt: new Date().toISOString(),
        },
        nodes: importedNodes,
        edges,
      });
      await applyAutoLayout();
      requestAnimationFrame(() => fitView({ duration: motionDuration(300), padding: 0.2 }));
      if (warnings.length > 0) {
        const shown = warnings.slice(0, 3).join(" · ");
        setNotice(
          warnings.length > 3 ? `${shown} (+${warnings.length - 3} autres avertissements)` : shown
        );
      }
    } catch (err) {
      setError(err instanceof CsvFormatError ? err.message : "Impossible d'importer ce fichier CSV.");
      console.error(err);
    }
  };

  const handleAutoLayout = async () => {
    setBusy(true);
    try {
      await applyAutoLayout();
      requestAnimationFrame(() => fitView({ duration: motionDuration(300), padding: 0.2 }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`mx-4 mt-4 mb-2 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-2.5 shadow-md backdrop-blur-md transition-all duration-300 z-10 ${
        themeMode === "dark"
          ? "border-border-dark bg-panel-bg-dark/95 text-text-dark"
          : "border-border-light bg-panel-bg-light/95 text-text-light"
      }`}
    >
      {/* Titre et indicateur d'enregistrement */}
      <div className="flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`w-48 rounded-lg border border-transparent bg-transparent px-2.5 py-1 text-sm font-semibold transition-all focus:outline-none ${
            themeMode === "dark"
              ? "text-zinc-100 hover:border-zinc-800 focus:border-zinc-700 focus:bg-zinc-900/50"
              : "text-zinc-800 hover:border-zinc-200 focus:border-zinc-300 focus:bg-zinc-50/50"
          }`}
        />
        <div className="relative group">
          <span
            className={`flex h-2.5 w-2.5 rounded-full ${
              isDirty ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
            }`}
          />
          <div className="absolute left-1/2 top-full mt-2 hidden -translate-x-1/2 rounded bg-zinc-900 px-2 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30">
            {isDirty ? "Modifications non enregistrées" : "Enregistré et à jour"}
          </div>
        </div>
      </div>

      <div className="hidden h-5 w-px bg-zinc-200 dark:bg-zinc-800 sm:block" />

      {/* Barre de recherche animée */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setTimeout(() => setSearchOpen(false), 180)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && searchResults.length > 0) {
              handleGoToNode(searchResults[0].id);
            } else if (e.key === "Escape") {
              setSearchOpen(false);
            }
          }}
          placeholder="Rechercher un membre..."
          className={`w-40 rounded-lg border pl-9 pr-3 py-1.5 text-xs transition-all duration-300 focus:w-56 focus:outline-none ${
            themeMode === "dark"
              ? "border-border-dark bg-zinc-900 text-zinc-200 placeholder-zinc-500 focus:border-zinc-700"
              : "border-border-light bg-zinc-50 text-zinc-700 placeholder-zinc-400 focus:border-zinc-300"
          }`}
        />

        {searchOpen && searchQuery.trim() && (
          <div
            className={`absolute left-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-xl border shadow-lg ${
              themeMode === "dark"
                ? "border-border-dark bg-panel-bg-dark"
                : "border-border-light bg-panel-bg-light"
            }`}
          >
            {searchResults.length === 0 ? (
              <div className="px-3 py-2 text-xs text-zinc-400">Aucun résultat</div>
            ) : (
              searchResults.map((n) => (
                <button
                  key={n.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleGoToNode(n.id)}
                  className={`flex w-full flex-col items-start px-3.5 py-2 text-left text-xs transition-colors ${
                    themeMode === "dark" ? "hover:bg-zinc-800/80" : "hover:bg-zinc-50"
                  }`}
                >
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    {n.data.name || "Sans nom"}
                  </span>
                  {(n.data.role || n.data.department) && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                      {[n.data.role, n.data.department].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Actions et boutons */}
      <div className="ml-auto flex items-center gap-1.5 flex-wrap">
        {/* Nouveau */}
        <div className="relative group">
          <button
            aria-label="Nouveau projet"
            onClick={onNewClick}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
              themeMode === "dark"
                ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                : "border-border-light bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30">
            Nouveau projet
          </div>
        </div>

        {/* Démo ATHANOR */}
        <div className="relative group">
          <button
            aria-label="Charger la démo ATHANOR"
            onClick={() => loadFile(athanorDemo)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
              themeMode === "dark"
                ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                : "border-border-light bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          </button>
          <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            Charger la démo ATHANOR
          </div>
        </div>

        {/* Ouvrir */}
        <div className="relative group">
          <button
            data-action="open"
            aria-label="Ouvrir un fichier"
            onClick={handleOpen}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
              themeMode === "dark"
                ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                : "border-border-light bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9l-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>
          <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            Ouvrir (.orgchart.json ou .pptx) <span className="text-zinc-400 font-mono">(Ctrl+O)</span>
          </div>
        </div>

        {/* Importer une liste CSV (Excel / Google Sheets) */}
        <div className="relative group">
          <button
            aria-label="Importer un CSV"
            onClick={() => csvInputRef.current?.click()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
              themeMode === "dark"
                ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                : "border-border-light bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M3 10h18M3 14h18M9 4v16M3 6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6z"
              />
            </svg>
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv,text/tab-separated-values"
            className="hidden"
            onChange={handleImportCsv}
          />
          <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            Importer un CSV <span className="text-zinc-400 font-mono">(Nom;Poste;Pôle;Email;Responsable)</span>
          </div>
        </div>

        {/* Séparateur */}
        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-1" />

        {/* Annuler */}
        <div className="relative group">
          <button
            aria-label="Annuler"
            onClick={undo}
            disabled={!canUndo}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
              themeMode === "dark"
                ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                : "border-border-light bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </button>
          <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            Annuler <span className="text-zinc-400 font-mono">(Ctrl+Z)</span>
          </div>
        </div>

        {/* Rétablir */}
        <div className="relative group">
          <button
            aria-label="Rétablir"
            onClick={redo}
            disabled={!canRedo}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
              themeMode === "dark"
                ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                : "border-border-light bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
            </svg>
          </button>
          <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            Rétablir <span className="text-zinc-400 font-mono">(Ctrl+Shift+Z)</span>
          </div>
        </div>

        {/* Séparateur */}
        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-1" />

        {/* Layout direction */}
        <div className="relative group">
          <button
            aria-label="Basculer la direction du layout"
            onClick={() => setLayoutDirection(layout.direction === "TB" ? "LR" : "TB")}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
              themeMode === "dark"
                ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                : "border-border-light bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            {layout.direction === "TB" ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <rect x="10" y="3" width="4" height="3" rx="0.5" strokeWidth={1.8} />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v5M6 11h12M6 11v4M12 11v4M18 11v4" />
                <rect x="4" y="15" width="4" height="3" rx="0.5" strokeWidth={1.8} />
                <rect x="10" y="15" width="4" height="3" rx="0.5" strokeWidth={1.8} />
                <rect x="16" y="15" width="4" height="3" rx="0.5" strokeWidth={1.8} />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <rect x="3" y="10" width="3" height="4" rx="0.5" strokeWidth={1.8} />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 12h5M11 6v12M11 6h4M11 12h4M11 18h4" />
                <rect x="15" y="4" width="3" height="4" rx="0.5" strokeWidth={1.8} />
                <rect x="15" y="10" width="3" height="4" rx="0.5" strokeWidth={1.8} />
                <rect x="15" y="16" width="3" height="4" rx="0.5" strokeWidth={1.8} />
              </svg>
            )}
          </button>
          <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            Layout : {layout.direction === "TB" ? "Vertical" : "Horizontal"}
          </div>
        </div>

        {/* Rangement Auto */}
        <div className="relative group">
          <button
            aria-label="Ranger automatiquement"
            onClick={handleAutoLayout}
            disabled={busy}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all disabled:opacity-40 ${
              themeMode === "dark"
                ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                : "border-border-light bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <svg
              className={`h-4 w-4 ${busy ? "animate-pulse" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.286L13 21l-2.286-6.857L5 12l5.714-2.286L13 3z" />
            </svg>
          </button>
          <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            Ranger automatiquement
          </div>
        </div>

        {/* Disposition compacte : équipes empilées, optimisée pour l'impression */}
        <div className="relative group">
          <button
            onClick={() => {
              applyCompactLayout();
              requestAnimationFrame(() => fitView({ duration: motionDuration(300), padding: 0.2 }));
            }}
            aria-label="Disposition compacte"
            aria-pressed={layout.mode === "compact"}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
              layout.mode === "compact"
                ? themeMode === "dark"
                  ? "border-primary-400/40 bg-primary-500/15 text-primary-300"
                  : "border-primary-600/40 bg-primary-600/10 text-primary-700"
                : themeMode === "dark"
                ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                : "border-border-light bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <rect x="8" y="3" width="8" height="4" rx="1" strokeWidth={1.8} />
              <path strokeLinecap="round" strokeWidth={1.5} d="M6 9v9M6 11h3M6 15h3M6 19h3" />
              <rect x="9" y="9.5" width="7" height="3.5" rx="1" strokeWidth={1.8} />
              <rect x="9" y="13.5" width="7" height="3.5" rx="1" strokeWidth={1.8} />
              <rect x="9" y="17.5" width="7" height="3.5" rx="1" strokeWidth={1.8} />
            </svg>
          </button>
          <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            Disposition compacte (optimisée impression)
          </div>
        </div>

        {/* Ajuster la vue */}
        <div className="relative group">
          <button
            aria-label="Recadrer l'organigramme"
            onClick={() => fitView({ duration: motionDuration(300), padding: 0.2 })}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
              themeMode === "dark"
                ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                : "border-border-light bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M4 8V4h4M16 4h4v4M4 16v4h4M16 20h4v-4M9 12h6m-3-3v6"
              />
            </svg>
          </button>
          <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            Recadrer l'organigramme
          </div>
        </div>

        {/* Regroupement visuel par pôle / département */}
        <div className="relative group">
          <button
            aria-label="Afficher les pôles"
            onClick={onToggleGroups}
            aria-pressed={showGroups}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
              showGroups
                ? themeMode === "dark"
                  ? "border-primary-400/40 bg-primary-500/15 text-primary-300"
                  : "border-primary-600/40 bg-primary-600/10 text-primary-700"
                : themeMode === "dark"
                ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                : "border-border-light bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M4 4h7v7H4V4zm9 0h7v4h-7V4zm0 7h7v9h-7v-9zM4 14h7v6H4v-6z"
              />
            </svg>
          </button>
          <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            {showGroups ? "Masquer les pôles" : "Afficher les pôles"}
          </div>
        </div>

        {/* Vue annuaire (table triable des membres) */}
        <div className="relative group">
          <button
            aria-label="Vue annuaire"
            onClick={onToggleDirectory}
            aria-pressed={directoryOpen}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
              directoryOpen
                ? themeMode === "dark"
                  ? "border-primary-400/40 bg-primary-500/15 text-primary-300"
                  : "border-primary-600/40 bg-primary-600/10 text-primary-700"
                : themeMode === "dark"
                ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                : "border-border-light bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 10h16M4 14h16M4 18h10" />
            </svg>
          </button>
          <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            {directoryOpen ? "Retour à l'organigramme" : "Vue annuaire (liste des membres)"}
          </div>
        </div>

        {/* Mode présentation plein écran */}
        <div className="relative group">
          <button
            aria-label="Mode présentation"
            onClick={onTogglePresentation}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
              themeMode === "dark"
                ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                : "border-border-light bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M4 8V4h4M16 4h4v4M4 16v4h4M16 20h4v-4"
              />
            </svg>
          </button>
          <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            Mode présentation <span className="text-zinc-400 font-mono">(Échap pour quitter)</span>
          </div>
        </div>

        {/* Séparateur */}
        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-1" />

        {/* Switch Thème (Clair/Sombre) - SANS EMOJI (Soleil / Lune) */}
        <div className="relative group">
          <button
            aria-label="Changer de thème"
            onClick={onToggleTheme}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
              themeMode === "dark"
                ? "border-border-dark bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                : "border-border-light bg-zinc-50/60 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            }`}
          >
            {themeMode === "dark" ? (
              // Icône Soleil
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.2}
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"
                />
              </svg>
            ) : (
              // Icône Lune
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.2}
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                />
              </svg>
            )}
          </button>
          <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            Thème {themeMode === "dark" ? "Clair" : "Sombre"}
          </div>
        </div>

        {/* Séparateur */}
        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-1" />

        {/* BOUTON ENREGISTRER (Visuellement mis en avant - Label + Icône + Raccourci) */}
        <div className="relative group">
          <button
            data-action="save"
            onClick={handleSave}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold shadow-sm transition-all hover:scale-102 active:scale-98 ${
              themeMode === "dark"
                ? "bg-primary-600 text-white hover:bg-primary-500 shadow-primary-950/30"
                : "bg-primary-700 text-white hover:bg-primary-600 shadow-primary-900/10"
            }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
              />
            </svg>
            <span>Enregistrer</span>
          </button>
          <div className="absolute right-0 top-full mt-2.5 hidden rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            Sauvegarder le fichier <span className="text-zinc-400 font-mono">(Ctrl+S)</span>
          </div>
        </div>

        {/* Enregistrer sous... (Secondaire) */}
        <div className="relative group">
          <button
            aria-label="Enregistrer sous"
            onClick={handleSaveAs}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all ${
              themeMode === "dark"
                ? "border-border-dark bg-zinc-900/40 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                : "border-border-light bg-zinc-50/60 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
              />
            </svg>
          </button>
          <div className="absolute right-0 top-full mt-2.5 hidden rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            Enregistrer sous...
          </div>
        </div>

        {/* BOUTON EXPORTER (Visuellement mis en avant - Label + Icône) */}
        <button
          onClick={onExportClick}
          className={`flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold shadow-sm transition-all hover:scale-102 active:scale-98 ${
            themeMode === "dark"
              ? "border border-zinc-700 bg-zinc-800/60 text-zinc-200 hover:bg-zinc-800 hover:text-white"
              : "border border-zinc-200 bg-zinc-100/60 text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
          }`}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          <span>Exporter</span>
        </button>
      </div>

      {error && <div className="w-full text-xs text-red-500 mt-1">{error}</div>}
      {notice && <div className="w-full text-xs text-amber-600 dark:text-amber-400 mt-1">{notice}</div>}
    </div>
  );
}
