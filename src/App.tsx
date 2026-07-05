import { useEffect, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Toolbar } from "./components/Toolbar";
import { Canvas } from "./components/Canvas";
import { Inspector } from "./components/Inspector";
import { ExportDialog } from "./components/ExportDialog";
import { useOrgChartStore } from "./store/useOrgChartStore";
import { saveDraft, loadDraft, clearDraft } from "./lib/db";
import { computeHiddenNodeIds } from "./lib/hierarchy";
import { TemplatePicker } from "./components/TemplatePicker";
import { Directory } from "./components/Directory";
import { PageRail } from "./components/PageRail";
import { createBlankChart } from "./templates/blank";

const AUTOSAVE_DEBOUNCE_MS = 1500;

function App() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [draftBanner, setDraftBanner] = useState<{ savedAt: string } | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [showGroups, setShowGroups] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);

  // Gestion du thème de l'éditeur (clair / sombre)
  const [themeMode, setThemeMode] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("editor-theme");
      if (saved === "light" || saved === "dark") return saved;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  });

  const isDirty = useOrgChartStore((s) => s.isDirty);
  const toFile = useOrgChartStore((s) => s.toFile);
  const loadFile = useOrgChartStore((s) => s.loadFile);
  const undo = useOrgChartStore((s) => s.undo);
  const redo = useOrgChartStore((s) => s.redo);
  const selectedNodeIds = useOrgChartStore((s) => s.selectedNodeIds);
  const deleteNodes = useOrgChartStore((s) => s.deleteNodes);
  const nodes = useOrgChartStore((s) => s.nodes);
  const setNodePosition = useOrgChartStore((s) => s.setNodePosition);
  const addNode = useOrgChartStore((s) => s.addNode);
  const edges = useOrgChartStore((s) => s.edges);
  const collapsedNodeIds = useOrgChartStore((s) => s.collapsedNodeIds);
  const expandAll = useOrgChartStore((s) => s.expandAll);

  const hiddenCount = collapsedNodeIds.length > 0 ? computeHiddenNodeIds(collapsedNodeIds, edges).size : 0;

  // Appliquer la classe dark sur le document root
  useEffect(() => {
    localStorage.setItem("editor-theme", themeMode);
    const root = document.documentElement;
    if (themeMode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [themeMode]);

  // Vérifie au démarrage si un brouillon local existe
  useEffect(() => {
    loadDraft().then((draft) => {
      if (draft) setDraftBanner({ savedAt: draft.savedAt });
    });
  }, []);

  // Autosave de confort dans IndexedDB (debounce) — uniquement si des
  // modifications non enregistrées existent, pour ne pas réécrire le
  // brouillon en boucle quand l'état est propre.
  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => {
      saveDraft(toFile());
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  });

  // Avertissement avant fermeture si modifications non enregistrées
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // Raccourcis clavier
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (e.key === "Escape" && presentationMode) {
        e.preventDefault();
        setPresentationMode(false);
        return;
      }

      // Échap ferme l'annuaire — sauf pendant l'édition d'une cellule,
      // où il annule l'édition (géré par la cellule elle-même).
      if (e.key === "Escape" && directoryOpen && !isEditable) {
        e.preventDefault();
        setDirectoryOpen(false);
        return;
      }

      if (mod && (e.key === "s" || e.key === "o")) {
        e.preventDefault();
        document
          .querySelector<HTMLButtonElement>(e.key === "s" ? "[data-action='save']" : "[data-action='open']")
          ?.click();
        return;
      }

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }

      if (!isEditable && (e.key === "Delete" || e.key === "Backspace") && selectedNodeIds.length > 0) {
        e.preventDefault();
        deleteNodes(selectedNodeIds);
        return;
      }

      // Ajout rapide façon Miro/FigJam : Tab = subordonné, Entrée = collègue.
      // Uniquement quand le focus est sur le canvas (jamais sur la toolbar ou
      // un champ), pour préserver la navigation clavier standard.
      if (!isEditable && !mod && selectedNodeIds.length === 1 && (e.key === "Tab" || e.key === "Enter")) {
        const active = document.activeElement;
        const focusInCanvas =
          !active || active === document.body || Boolean(active.closest(".react-flow"));
        if (focusInCanvas) {
          e.preventDefault();
          const id = selectedNodeIds[0];
          if (e.key === "Tab") {
            addNode(id);
          } else {
            // Collègue : même responsable hiérarchique que le membre sélectionné (racine si aucun)
            addNode(edges.find((ed) => ed.kind !== "dotted" && ed.target === id)?.source);
          }
          return;
        }
      }

      // Déplacement clavier précis
      if (!isEditable && selectedNodeIds.length > 0) {
        const step = e.shiftKey ? 20 : 4;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowUp") dy = -step;
        else if (e.key === "ArrowDown") dy = step;
        else if (e.key === "ArrowLeft") dx = -step;
        else if (e.key === "ArrowRight") dx = step;
        else return;

        e.preventDefault();
        for (const id of selectedNodeIds) {
          const node = nodes.find((n) => n.id === id);
          if (!node) continue;
          setNodePosition(id, { x: node.position.x + dx, y: node.position.y + dy });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, selectedNodeIds, deleteNodes, nodes, setNodePosition, presentationMode, directoryOpen, addNode, edges]);

  const handleRestoreDraft = async () => {
    const draft = await loadDraft();
    if (draft) loadFile(draft.data);
    setDraftBanner(null);
  };

  const handleDismissDraft = async () => {
    await clearDraft();
    setDraftBanner(null);
  };

  const handleNew = (choice: string) => {
    setTemplatePickerOpen(false);
    if (choice === "blank") {
      loadFile(createBlankChart("glass-cap"));
    } else {
      loadFile(createBlankChart(choice));
    }
  };

  const getViewportElement = () =>
    canvasRef.current?.querySelector<HTMLElement>(".react-flow__viewport") ?? null;

  return (
    <ReactFlowProvider>
      <div
        className={`flex h-screen w-screen flex-col overflow-hidden transition-colors duration-300 ${
          themeMode === "dark" ? "bg-editor-bg-dark text-text-dark" : "bg-editor-bg-light text-text-light"
        }`}
      >
        {/* Toolbar */}
        {!presentationMode && (
          <Toolbar
            onExportClick={() => setExportOpen(true)}
            onNewClick={() => setTemplatePickerOpen(true)}
            themeMode={themeMode}
            onToggleTheme={() => setThemeMode((m) => (m === "light" ? "dark" : "light"))}
            showGroups={showGroups}
            onToggleGroups={() => setShowGroups((v) => !v)}
            onTogglePresentation={() => {
              setDirectoryOpen(false);
              setPresentationMode(true);
            }}
            directoryOpen={directoryOpen}
            onToggleDirectory={() => setDirectoryOpen((v) => !v)}
          />
        )}

        {/* Toast Notification pour brouillon */}
        {!presentationMode && draftBanner && (
          <div
            className={`fixed bottom-6 left-6 z-50 max-w-sm border p-5 shadow-2xl backdrop-blur-md rounded-2xl transition-all duration-300 animate-slide-in ${
              themeMode === "dark"
                ? "border-zinc-800 bg-zinc-950/95 text-zinc-100 shadow-black/40"
                : "border-zinc-200 bg-white/95 text-zinc-800 shadow-zinc-200/50"
            }`}
          >
            <div className="flex items-start gap-3.5">
              <div
                className={`mt-0.5 shrink-0 p-1.5 rounded-xl ${
                  themeMode === "dark" ? "bg-amber-500/10 text-amber-400" : "bg-amber-500/10 text-amber-600"
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold tracking-tight">Restauration de brouillon</div>
                <p className="mt-1 text-[11px] leading-relaxed opacity-75">
                  Une sauvegarde automatique locale du {new Date(draftBanner.savedAt).toLocaleDateString("fr-FR")} à {new Date(draftBanner.savedAt).toLocaleTimeString("fr-FR")} est disponible sur ce navigateur.
                </p>
                <div className="mt-4 flex justify-end gap-2.5 text-[10px]">
                  <button
                    onClick={handleDismissDraft}
                    className={`rounded-lg px-2.5 py-1.5 font-semibold transition-colors cursor-pointer ${
                      themeMode === "dark"
                        ? "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                        : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    Ignorer
                  </button>
                  <button
                    onClick={handleRestoreDraft}
                    className={`rounded-lg px-3.5 py-2 font-bold transition-all shadow-sm cursor-pointer hover:scale-102 active:scale-98 ${
                      themeMode === "dark"
                        ? "bg-primary-600 text-white hover:bg-primary-500"
                        : "bg-primary-700 text-white hover:bg-primary-600"
                    }`}
                  >
                    Restaurer le travail
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Editor Zone */}
        <div className="flex min-h-0 flex-1 relative">
          <div className="relative min-w-0 flex-1 h-full">
            <Canvas ref={canvasRef} themeMode={themeMode} showGroups={showGroups} />

            {/* Vue annuaire : surcouche du canvas (le canvas reste monté) */}
            {directoryOpen && !presentationMode && (
              <Directory themeMode={themeMode} onClose={() => setDirectoryOpen(false)} />
            )}

            {/* Navigateur de pages (mode multi-pages) */}
            {!presentationMode && !directoryOpen && <PageRail themeMode={themeMode} />}

            {/* Chip « branches repliées » : rappel + tout déplier en un clic */}
            {hiddenCount > 0 && (
              <button
                onClick={expandAll}
                title="Afficher à nouveau toutes les branches"
                className={`absolute left-4 top-4 z-10 flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-medium shadow-sm transition-all duration-200 hover:scale-102 active:scale-98 ${
                  themeMode === "dark"
                    ? "border-primary-400/40 bg-panel-bg-dark/95 text-primary-300 hover:bg-zinc-800"
                    : "border-primary-600/40 bg-panel-bg-light/95 text-primary-700 hover:bg-primary-50"
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 9l4 4 4-4m-8 6l4 4 4-4"
                  />
                </svg>
                <span>
                  {hiddenCount} membre{hiddenCount > 1 ? "s" : ""} masqué{hiddenCount > 1 ? "s" : ""} — Tout déplier
                </span>
              </button>
            )}

            {/* Toggle Sidebar Button */}
            {!presentationMode && (
              <button
                onClick={() => setInspectorOpen((open) => !open)}
                title={inspectorOpen ? "Masquer le panneau d'inspection" : "Afficher le panneau d'inspection"}
                className={`absolute right-4 top-4 z-10 flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium shadow-sm transition-all duration-200 hover:scale-102 active:scale-98 ${
                  themeMode === "dark"
                    ? "border-border-dark bg-panel-bg-dark/95 text-text-dark hover:bg-zinc-800"
                    : "border-border-light bg-panel-bg-light/95 text-text-light hover:bg-zinc-50"
                }`}
              >
                <span>{inspectorOpen ? "Propriétés" : "Propriétés"}</span>
                <svg
                  className={`h-3 w-3 transition-transform duration-300 ${inspectorOpen ? "" : "rotate-180"}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}

            {/* Bouton de sortie du mode présentation */}
            {presentationMode && (
              <button
                onClick={() => setPresentationMode(false)}
                title="Quitter le mode présentation (Échap)"
                className={`absolute right-4 top-4 z-10 flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium shadow-sm transition-all duration-200 hover:scale-102 active:scale-98 ${
                  themeMode === "dark"
                    ? "border-border-dark bg-panel-bg-dark/95 text-text-dark hover:bg-zinc-800"
                    : "border-border-light bg-panel-bg-light/95 text-text-light hover:bg-zinc-50"
                }`}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Quitter (Échap)</span>
              </button>
            )}
          </div>

          {/* Inspector Panel */}
          {!presentationMode && (
            <aside
              className={`shrink-0 border-l transition-all duration-300 ease-in-out h-full overflow-hidden ${
                inspectorOpen ? "w-80 opacity-100" : "w-0 opacity-0 border-l-transparent"
              } ${
                themeMode === "dark"
                  ? "border-border-dark bg-panel-bg-dark"
                  : "border-border-light bg-panel-bg-light"
              }`}
            >
              <div className="w-80 h-full">
                <Inspector themeMode={themeMode} />
              </div>
            </aside>
          )}
        </div>

        {/* Export Dialog */}
        <ExportDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          getViewportElement={getViewportElement}
          themeMode={themeMode}
        />

        <TemplatePicker
          open={templatePickerOpen}
          onClose={() => setTemplatePickerOpen(false)}
          onSelect={handleNew}
          themeMode={themeMode}
        />
      </div>
    </ReactFlowProvider>
  );
}

export default App;
