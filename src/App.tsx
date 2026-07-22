import { useEffect, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Layers } from "lucide-react";
import { Toolbar } from "./components/Toolbar";
import { Canvas } from "./components/Canvas";
import { Inspector } from "./components/Inspector";
import { ExportDialog } from "./components/ExportDialog";
import { useOrgChartStore } from "./store/useOrgChartStore";
import { saveDraft, loadDraft } from "./lib/db";
import { computeHiddenNodeIds } from "./lib/hierarchy";
import { TemplatePicker } from "./components/TemplatePicker";
import { Directory } from "./components/Directory";
import { PageRail } from "./components/PageRail";
import { createBlankChart, createEmptyChart, prepareDraftForResume } from "./templates/blank";

const AUTOSAVE_DEBOUNCE_MS = 1500;

function App() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 1280);
  const [pageRailOpen, setPageRailOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 1180);
  const [compactWorkspace, setCompactWorkspace] = useState(() => typeof window !== "undefined" && window.innerWidth < 1280);
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
  const loadFile = useOrgChartStore((s) => s.loadFile);
  const undo = useOrgChartStore((s) => s.undo);
  const redo = useOrgChartStore((s) => s.redo);
  const selectedNodeIds = useOrgChartStore((s) => s.selectedNodeIds);
  const deleteNodes = useOrgChartStore((s) => s.deleteNodes);
  const nodes = useOrgChartStore((s) => s.nodes);
  const frames = useOrgChartStore((s) => s.frames);
  const setNodePositions = useOrgChartStore((s) => s.setNodePositions);
  const addNode = useOrgChartStore((s) => s.addNode);
  const duplicateNode = useOrgChartStore((s) => s.duplicateNode);
  const edges = useOrgChartStore((s) => s.edges);
  const collapsedNodeIds = useOrgChartStore((s) => s.collapsedNodeIds);
  const expandAll = useOrgChartStore((s) => s.expandAll);

  const hiddenCount = collapsedNodeIds.length > 0 ? computeHiddenNodeIds(collapsedNodeIds, edges).size : 0;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1279px)");
    const update = () => setCompactWorkspace(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

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

  // Reprend automatiquement le dernier travail local. IndexedDB reste un
  // brouillon de confort : le fichier .orgchart.json demeure la source de vérité.
  useEffect(() => {
    let active = true;
    loadDraft()
      .then((draft) => {
        if (!active || !draft) return;
        loadFile(prepareDraftForResume(draft.data));
        useOrgChartStore.setState({ isDirty: true });
        setResumeNotice(`Dernier travail repris · ${new Date(draft.savedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`);
      })
      .catch(() => {
        // Un brouillon IndexedDB illisible ne doit jamais bloquer l'éditeur.
      })
      .finally(() => {
        if (active) setDraftHydrated(true);
      });
    return () => {
      active = false;
    };
  }, [loadFile]);

  useEffect(() => {
    if (!resumeNotice) return;
    const timer = window.setTimeout(() => setResumeNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [resumeNotice]);

  // Autosave de confort dans IndexedDB (debounce) — uniquement si des
  // modifications non enregistrées existent, pour ne pas réécrire le
  // brouillon en boucle quand l'état est propre.
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = useOrgChartStore.subscribe((state, previous) => {
      const documentChanged =
        state.meta !== previous.meta ||
        state.theme !== previous.theme ||
        state.nodes !== previous.nodes ||
        state.edges !== previous.edges ||
        state.layout !== previous.layout ||
        state.frames !== previous.frames;
      if (!state.isDirty || !documentChanged) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void saveDraft(state.toFile()), AUTOSAVE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

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
      const active = document.activeElement as HTMLElement | null;
      const focusInCanvas =
        !active || active === document.body || Boolean(active.closest(".react-flow"));

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

      // Standard des éditeurs graphiques : dupliquer la carte active. Le
      // raccourci reste limité au canvas pour ne jamais détourner Ctrl/Cmd+D
      // depuis un champ, la toolbar ou une autre vue.
      if (
        !isEditable &&
        focusInCanvas &&
        mod &&
        e.key.toLowerCase() === "d" &&
        selectedNodeIds.length === 1
      ) {
        e.preventDefault();
        duplicateNode(selectedNodeIds[0]);
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
      if (!isEditable && focusInCanvas && selectedNodeIds.length > 0) {
        const step = e.shiftKey ? 20 : 4;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowUp") dy = -step;
        else if (e.key === "ArrowDown") dy = step;
        else if (e.key === "ArrowLeft") dx = -step;
        else if (e.key === "ArrowRight") dx = step;
        else return;

        e.preventDefault();
        const selected = new Set(selectedNodeIds);
        setNodePositions(
          nodes
            .filter((node) => selected.has(node.id))
            .map((node) => ({
              id: node.id,
              position: { x: node.position.x + dx, y: node.position.y + dy },
            }))
        );
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, selectedNodeIds, deleteNodes, nodes, setNodePositions, presentationMode, directoryOpen, addNode, duplicateNode, edges]);

  const handleNew = (choice: string) => {
    setTemplatePickerOpen(false);
    if (choice === "blank") {
      loadFile(createEmptyChart("glass-cap"));
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

        {/* Confirmation discrète : la reprise est automatique et réversible via Nouveau/Ouvrir. */}
        {!presentationMode && resumeNotice && (
          <div
            className={`fixed bottom-6 ${
              !presentationMode && !directoryOpen && pageRailOpen ? "left-[280px]" : "left-6"
            } z-50 max-w-sm border px-4 py-3 shadow-xl backdrop-blur-md rounded-xl transition-all duration-300 animate-slide-in ${
              themeMode === "dark"
                ? "border-zinc-800 bg-zinc-950/95 text-zinc-100 shadow-black/40"
                : "border-zinc-200 bg-white/95 text-zinc-800 shadow-zinc-200/50"
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              <span>{resumeNotice}</span>
              <button onClick={() => setResumeNotice(null)} aria-label="Fermer la notification" className="ml-2 opacity-50 hover:opacity-100">×</button>
            </div>
          </div>
        )}

        {/* Main Editor Zone */}
        <div className="flex min-h-0 flex-1 relative">
          {/* Left Sidebar (PageRail) */}
          {!presentationMode && !directoryOpen && (
            <aside
              className={`${compactWorkspace ? "absolute inset-y-0 left-0 z-30 shadow-2xl" : "shrink-0"} border-r transition-all duration-300 ease-in-out h-full overflow-hidden ${
                pageRailOpen ? "w-64 opacity-100" : "w-0 opacity-0 border-r-transparent"
              } ${
                themeMode === "dark"
                  ? "border-border-dark bg-panel-bg-dark"
                  : "border-border-light bg-panel-bg-light"
              }`}
            >
              <div className="w-64 h-full">
                <PageRail themeMode={themeMode} onClose={() => setPageRailOpen(false)} />
              </div>
            </aside>
          )}

          <div className="relative min-w-0 flex-1 h-full">
            <Canvas ref={canvasRef} themeMode={themeMode} showGroups={showGroups} />

            {!draftHydrated && !directoryOpen && !presentationMode && (
              <div className="pointer-events-none absolute inset-0 z-[6] flex items-center justify-center">
                <span className="rounded-full border border-zinc-200 bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-zinc-500 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90 dark:text-zinc-400">Reprise du travail local…</span>
              </div>
            )}

            {draftHydrated && nodes.length === 0 && !directoryOpen && !presentationMode && (
              <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center p-6">
                <div className={`pointer-events-auto w-full max-w-sm rounded-2xl border p-6 text-center shadow-xl backdrop-blur-md ${themeMode === "dark" ? "border-zinc-800 bg-zinc-950/90" : "border-zinc-200 bg-white/95"}`}>
                  <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-xl text-primary-700 dark:bg-primary-950/60 dark:text-primary-300">+</div>
                  <h2 className="text-sm font-bold">Commencez votre organigramme</h2>
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Ajoutez la première personne. Vous pourrez ensuite créer son équipe avec Tab ou par glisser-déposer.</p>
                  <button onClick={() => addNode()} className="mt-5 w-full rounded-xl bg-primary-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">Ajouter la première personne</button>
                  <div className="mt-3 flex justify-center gap-4 text-[11px] font-semibold">
                    <button onClick={() => document.querySelector<HTMLButtonElement>("[data-action='import-csv']")?.click()} className="text-zinc-500 hover:text-primary-700 dark:hover:text-primary-300">Importer Excel / CSV</button>
                    <button onClick={() => document.querySelector<HTMLButtonElement>("[data-action='open']")?.click()} className="text-zinc-500 hover:text-primary-700 dark:hover:text-primary-300">Ouvrir un fichier</button>
                    <button onClick={() => setTemplatePickerOpen(true)} className="text-zinc-500 hover:text-primary-700 dark:hover:text-primary-300">Choisir un modèle</button>
                  </div>
                </div>
              </div>
            )}

            {/* Vue annuaire : surcouche du canvas (le canvas reste monté) */}
            {directoryOpen && !presentationMode && (
              <Directory themeMode={themeMode} onClose={() => setDirectoryOpen(false)} />
            )}

            {/* Pages Toggle Button (when PageRail is closed) */}
            {!presentationMode && !directoryOpen && !pageRailOpen && (
              <button
                onClick={() => setPageRailOpen(true)}
                title="Afficher le navigateur de pages"
                className={`absolute left-4 top-4 z-10 flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium shadow-sm transition-all duration-200 hover:scale-102 active:scale-98 cursor-pointer ${
                  themeMode === "dark"
                    ? "border-border-dark bg-panel-bg-dark/95 text-text-dark hover:bg-zinc-800"
                    : "border-border-light bg-panel-bg-light/95 text-text-light hover:bg-zinc-50"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Pages{frames.length > 0 ? ` · ${frames.length}` : ""}</span>
              </button>
            )}

            {/* Chip « branches repliées » : rappel + tout déplier en un clic */}
            {hiddenCount > 0 && (
              <button
                onClick={expandAll}
                title="Afficher à nouveau toutes les branches"
                className={`absolute ${pageRailOpen ? "left-4" : "left-28"} top-4 z-10 flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-medium shadow-sm transition-all duration-200 hover:scale-102 active:scale-98 ${
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
              className={`${compactWorkspace ? "absolute inset-y-0 right-0 z-30 shadow-2xl" : "shrink-0"} border-l transition-all duration-300 ease-in-out h-full overflow-hidden ${
                inspectorOpen ? "w-80 opacity-100" : "w-0 opacity-0 border-l-transparent"
              } ${
                themeMode === "dark"
                  ? "border-border-dark bg-panel-bg-dark"
                  : "border-border-light bg-panel-bg-light"
              }`}
            >
              {compactWorkspace && inspectorOpen && (
                <button
                  onClick={() => setInspectorOpen(false)}
                  aria-label="Fermer le panneau de propriétés"
                  className="absolute right-2 top-2 z-40 flex h-8 w-8 items-center justify-center rounded-lg text-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                >
                  ×
                </button>
              )}
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
