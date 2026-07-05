import { useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  FilePlus2,
  Sparkles,
  FolderOpen,
  FileSpreadsheet,
  Undo2,
  Redo2,
  Wand2,
  Shrink,
  Maximize,
  Boxes,
  Users,
  Presentation,
  Sun,
  Moon,
  Save,
  SaveAll,
  Download,
  Search,
  Frame,
} from "lucide-react";
import { useOrgChartStore } from "../store/useOrgChartStore";
import { openOrgChartFile, saveOrgChartFile, FileFormatError } from "../lib/fileIO";
import { importPeopleCsv, CsvFormatError } from "../lib/csvImport";
import { demoCompany } from "../templates/demoCompany";

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
  const applyAutoLayoutForPage = useOrgChartStore((s) => s.applyAutoLayoutForPage);
  const applyCompactLayout = useOrgChartStore((s) => s.applyCompactLayout);
  const pageGuide = useOrgChartStore((s) => s.pageGuide);
  const togglePageGuide = useOrgChartStore((s) => s.togglePageGuide);
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
      // Rangement optimisé pour le format de page du document : la meilleure
      // disposition (arbre, compacte, grille) pour le papier cible est choisie.
      await applyAutoLayoutForPage();
      requestAnimationFrame(() => fitView({ duration: motionDuration(300), padding: 0.2 }));
    } finally {
      setBusy(false);
    }
  };

  const groupClass = `flex items-center gap-1 rounded-xl border p-1 shadow-sm ${
    themeMode === "dark"
      ? "border-zinc-800/80 bg-zinc-900/40"
      : "border-zinc-200/85 bg-zinc-100/40"
  }`;

  const buttonBaseClass = `flex h-8 w-8 items-center justify-center rounded-lg transition-all focus:outline-none cursor-pointer`;

  const getButtonClass = (isActive?: boolean) => {
    if (isActive) {
      return `${buttonBaseClass} bg-primary-50 border border-primary-200/60 text-primary-700 dark:bg-primary-950/40 dark:border-primary-800/50 dark:text-primary-300 shadow-inner`;
    }
    return `${buttonBaseClass} border border-transparent ${
      themeMode === "dark"
        ? "text-zinc-300 hover:bg-zinc-800 hover:text-white"
        : "text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900"
    }`;
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
          className={`flex h-8 items-center w-48 rounded-lg border border-transparent bg-transparent px-2 text-sm font-semibold transition-all focus:outline-none ${
            themeMode === "dark"
              ? "text-zinc-100 hover:border-zinc-800 focus:border-zinc-700 focus:bg-zinc-900/50"
              : "text-zinc-800 hover:border-zinc-200 focus:border-zinc-300 focus:bg-zinc-50/50"
          }`}
        />
        <div className="relative group flex items-center h-8">
          <span
            className={`flex h-2.5 w-2.5 rounded-full ${
              isDirty ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
            }`}
          />
          <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            {isDirty ? (
              <span>Modifications non enregistrées <span className="text-zinc-400 font-normal">(Raccourci : Ctrl+S)</span></span>
            ) : (
              <span>Enregistré et à jour <span className="text-zinc-400 font-normal">(toutes les modifications sont sauvegardées)</span></span>
            )}
          </div>
        </div>
      </div>

      <div className="hidden h-5 w-px bg-zinc-200 dark:bg-zinc-800 sm:block" />

      {/* Barre de recherche animée */}
      <div className="relative flex items-center h-8">
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-zinc-400">
          <Search className="h-3.5 w-3.5" />
        </div>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
          placeholder="Rechercher un nom..."
          className={`w-40 h-8 rounded-lg border pl-9 pr-3 text-xs transition-all focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:focus:ring-primary-400/20 dark:focus:border-primary-400 ${
            themeMode === "dark"
              ? "border-border-dark bg-zinc-900 text-zinc-200 placeholder-zinc-500"
              : "border-border-light bg-white text-zinc-700 placeholder-zinc-400"
          }`}
        />

        {searchOpen && searchQuery.trim() && (
          <div
            className={`absolute left-0 top-full z-20 mt-1.5 w-64 overflow-hidden rounded-xl border shadow-lg ${
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

      <div className="hidden h-5 w-px bg-zinc-200 dark:bg-zinc-800 sm:block" />

      {/* Historique (Annuler / Rétablir) placé après la recherche */}
      <div className={groupClass}>
        {/* Annuler */}
        <div className="relative group">
          <button
            aria-label="Annuler"
            onClick={undo}
            disabled={!canUndo}
            className={getButtonClass(false)}
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            Annuler la dernière action <span className="text-zinc-400 font-normal">(revenir en arrière)</span> <span className="text-zinc-400 font-mono">(Ctrl+Z)</span>
          </div>
        </div>

        {/* Rétablir */}
        <div className="relative group">
          <button
            aria-label="Rétablir"
            onClick={redo}
            disabled={!canRedo}
            className={getButtonClass(false)}
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            Rétablir l'action annulée <span className="text-zinc-400 font-normal">(recommencer)</span> <span className="text-zinc-400 font-mono">(Ctrl+Maj+Z)</span>
          </div>
        </div>
      </div>

      {/* Actions et boutons */}
      <div className="ml-auto flex items-center gap-2.5 flex-wrap">
        {/* Groupe Fichier & Import */}
        <div className={groupClass}>
          {/* Nouveau */}
          <div className="relative group">
            <button
              aria-label="Nouveau projet"
              onClick={onNewClick}
              className={getButtonClass(false)}
            >
              <FilePlus2 className="h-4 w-4" />
            </button>
            <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
              Nouveau projet <span className="text-zinc-400 font-normal">(efface le dessin actuel pour repartir à zéro)</span>
            </div>
          </div>

          {/* Ouvrir */}
          <div className="relative group">
            <button
              data-action="open"
              aria-label="Ouvrir un fichier"
              onClick={handleOpen}
              className={getButtonClass(false)}
            >
              <FolderOpen className="h-4 w-4" />
            </button>
            <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
              Ouvrir un fichier <span className="text-zinc-400 font-normal">(charger un fichier .json ou un PowerPoint)</span> <span className="text-zinc-400 font-mono">(Ctrl+O)</span>
            </div>
          </div>

          {/* Importer une liste CSV (Excel / Google Sheets) */}
          <div className="relative group">
            <button
              aria-label="Importer un CSV"
              onClick={() => csvInputRef.current?.click()}
              className={getButtonClass(false)}
            >
              <FileSpreadsheet className="h-4 w-4" />
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv,text/tab-separated-values"
              className="hidden"
              onChange={handleImportCsv}
            />
            <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
              Importer depuis Excel / CSV <span className="text-zinc-400 font-normal">(créer l'organigramme à partir d'une liste)</span>
            </div>
          </div>

          {/* Organigramme d'exemple */}
          <div className="relative group">
            <button
              aria-label="Charger l'organigramme d'exemple"
              onClick={() => loadFile(demoCompany)}
              className={getButtonClass(false)}
            >
              <Sparkles className="h-4 w-4" />
            </button>
            <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
              Charger l'exemple <span className="text-zinc-400 font-normal">(organigramme de démonstration Société Horizon)</span>
            </div>
          </div>
        </div>

        {/* Groupe Disposition & Mise en page */}
        <div className={groupClass}>
          {/* Ranger automatiquement */}
          <div className="relative group">
            <button
              aria-label="Ranger automatiquement"
              onClick={handleAutoLayout}
              disabled={busy}
              className={getButtonClass(false)}
            >
              <Wand2 className={`h-4 w-4 ${busy ? "animate-pulse" : ""}`} />
            </button>
            <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
              Réorganiser pour la page <span className="text-zinc-400 font-normal">(meilleure disposition pour le format d'export — Ctrl+Z pour revenir)</span>
            </div>
          </div>

          {/* Cadre de page : feuille A4/A3 visible derrière l'organigramme */}
          <div className="relative group">
            <button
              aria-label="Afficher le cadre de page"
              onClick={togglePageGuide}
              aria-pressed={pageGuide}
              className={getButtonClass(pageGuide)}
            >
              <Frame className="h-4 w-4" />
            </button>
            <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
              Cadre de page <span className="text-zinc-400 font-normal">(voir la feuille A4/A3 et concevoir dans ses limites)</span>
            </div>
          </div>

          {/* Layout direction */}
          <div className="relative group">
            <button
              aria-label="Basculer la direction du layout"
              onClick={() => setLayoutDirection(layout.direction === "TB" ? "LR" : "TB")}
              className={getButtonClass(false)}
            >
              {layout.direction === "TB" ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <rect x="10" y="3" width="4" height="3" rx="0.5" strokeWidth={2} />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v5M6 11h12M6 11v4M12 11v4M18 11v4" />
                  <rect x="4" y="15" width="4" height="3" rx="0.5" strokeWidth={2} />
                  <rect x="10" y="15" width="4" height="3" rx="0.5" strokeWidth={2} />
                  <rect x="16" y="15" width="4" height="3" rx="0.5" strokeWidth={2} />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <rect x="3" y="10" width="3" height="4" rx="0.5" strokeWidth={2} />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h5M11 6v12M11 6h4M11 12h4M11 18h4" />
                  <rect x="15" y="4" width="3" height="4" rx="0.5" strokeWidth={2} />
                  <rect x="15" y="10" width="3" height="4" rx="0.5" strokeWidth={2} />
                  <rect x="15" y="16" width="3" height="4" rx="0.5" strokeWidth={2} />
                </svg>
              )}
            </button>
            <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
              Changer le sens de lecture <span className="text-zinc-400 font-normal">(haut en bas ou gauche à droite)</span>
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
              className={getButtonClass(layout.mode === "compact")}
            >
              <Shrink className="h-4 w-4" />
            </button>
            <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
              Mode compact <span className="text-zinc-400 font-normal">(empiler les équipes verticalement pour l'impression)</span>
            </div>
          </div>

          {/* Ajuster la vue */}
          <div className="relative group">
            <button
              aria-label="Recentrer l'organigramme"
              onClick={() => fitView({ duration: motionDuration(300), padding: 0.2 })}
              className={getButtonClass(false)}
            >
              <Maximize className="h-4 w-4" />
            </button>
            <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
              Recentrer la vue <span className="text-zinc-400 font-normal">(ajuster la vue pour afficher tout l'organigramme)</span>
            </div>
          </div>
        </div>

        {/* Groupe Vues & Affichage */}
        <div className={groupClass}>
          {/* Regroupement visuel par pôle / département */}
          <div className="relative group">
            <button
              aria-label="Afficher les pôles"
              onClick={onToggleGroups}
              aria-pressed={showGroups}
              className={getButtonClass(showGroups)}
            >
              <Boxes className="h-4 w-4" />
            </button>
            <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
              Afficher/Masquer les blocs de couleur <span className="text-zinc-400 font-normal">(délimiter visuellement les différents départements ou pôles)</span>
            </div>
          </div>

          {/* Vue annuaire (table triable des membres) */}
          <div className="relative group">
            <button
              aria-label="Vue annuaire"
              onClick={onToggleDirectory}
              aria-pressed={directoryOpen}
              className={getButtonClass(directoryOpen)}
            >
              <Users className="h-4 w-4" />
            </button>
            <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
              Afficher la liste complète des membres <span className="text-zinc-400 font-normal">(vue tableau éditable pour ajouter ou trier rapidement)</span>
            </div>
          </div>

          {/* Mode présentation plein écran */}
          <div className="relative group">
            <button
              aria-label="Mode présentation"
              onClick={onTogglePresentation}
              className={getButtonClass(false)}
            >
              <Presentation className="h-4 w-4" />
            </button>
            <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
              Plein écran / Présentation <span className="text-zinc-400 font-normal">(masquer les outils pour projeter ou présenter l'organigramme)</span> <span className="text-zinc-400 font-mono">(Échap pour quitter)</span>
            </div>
          </div>
        </div>

        {/* Groupe Thème */}
        <div className={groupClass}>
          {/* Switch Thème (Clair/Sombre) */}
          <div className="relative group">
            <button
              aria-label="Changer de thème"
              onClick={onToggleTheme}
              className={getButtonClass(false)}
            >
              {themeMode === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            <div className="absolute left-1/2 top-full mt-2.5 hidden -translate-x-1/2 rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
              Mode sombre / clair <span className="text-zinc-400 font-normal">(adapter la luminosité de l'interface)</span>
            </div>
          </div>
        </div>

        {/* Groupe Enregistrement */}
        <div className={groupClass}>
          {/* BOUTON ENREGISTRER (Visuellement mis en avant - Label + Icône + Raccourci) */}
          <div className="relative group">
            <button
              data-action="save"
              onClick={handleSave}
              className={`flex h-8 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold shadow-sm transition-all hover:scale-102 active:scale-98 cursor-pointer ${
                themeMode === "dark"
                  ? "bg-primary-600 text-white hover:bg-primary-500 shadow-primary-950/30"
                  : "bg-primary-700 text-white hover:bg-primary-600 shadow-primary-900/10"
              }`}
            >
              <Save className="h-3.5 w-3.5" />
              <span>Enregistrer</span>
            </button>
            <div className="absolute right-0 top-full mt-2.5 hidden rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
              Enregistrer les modifications <span className="text-zinc-400 font-normal">(enregistrer directement dans votre fichier actuel)</span> <span className="text-zinc-400 font-mono">(Ctrl+S)</span>
            </div>
          </div>

          {/* Enregistrer sous... (Secondaire) */}
          <div className="relative group">
            <button
              aria-label="Enregistrer sous"
              onClick={handleSaveAs}
              className={getButtonClass(false)}
            >
              <SaveAll className="h-4 w-4" />
            </button>
            <div className="absolute right-0 top-full mt-2.5 hidden rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
              Enregistrer une copie <span className="text-zinc-400 font-normal">(créer un nouveau fichier d'organigramme distinct)</span>
            </div>
          </div>
        </div>

        {/* BOUTON EXPORTER (Visuellement mis en avant - Label + Icône) */}
        <div className="relative group">
          <button
            onClick={onExportClick}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold shadow-sm transition-all hover:scale-102 active:scale-98 cursor-pointer ${
              themeMode === "dark"
                ? "border border-zinc-700 bg-zinc-800/60 text-zinc-200 hover:bg-zinc-800 hover:text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
            }`}
          >
            <Download className="h-3.5 w-3.5" />
            <span>Exporter</span>
          </button>
          <div className="absolute right-0 top-full mt-2.5 hidden rounded bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-md group-hover:block z-30 whitespace-nowrap">
            Télécharger ou imprimer <span className="text-zinc-400 font-normal">(exporter en PDF, PowerPoint, Image, ou Excel)</span>
          </div>
        </div>
      </div>

      {error && <div className="w-full text-xs text-red-500 mt-1">{error}</div>}
      {notice && <div className="w-full text-xs text-amber-600 dark:text-amber-400 mt-1">{notice}</div>}
    </div>
  );
}
