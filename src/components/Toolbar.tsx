import { useEffect, useMemo, useRef, useState } from "react";
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
  ChevronDown,
  SlidersHorizontal,
  Eye,
} from "lucide-react";
import { useOrgChartStore } from "../store/useOrgChartStore";
import { openOrgChartFile, saveOrgChartFile, FileFormatError } from "../lib/fileIO";
import { importPeopleCsv, CsvFormatError, type CsvImportResult } from "../lib/csvImport";
import { availableAreaForSetup, DEFAULT_PAGE } from "../lib/readability";
import { demoCompany } from "../templates/demoCompany";
import { clearDraft } from "../lib/db";
import { CsvImportDialog } from "./CsvImportDialog";

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
  const loadImportedFile = useOrgChartStore((s) => s.loadImportedFile);
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
  const [pendingCsv, setPendingCsv] = useState<{ fileName: string; result: CsvImportResult } | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        toolbarRef.current?.querySelectorAll("details[open]").forEach((menu) => menu.removeAttribute("open"));
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        toolbarRef.current?.querySelectorAll("details[open]").forEach((menu) => menu.removeAttribute("open"));
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

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
      await clearDraft();
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
      await clearDraft();
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
        await clearDraft();
        return;
      }

      // PowerPoint : round-trip (json embarqué) ou extraction SmartArt
      const { importPptxFile } = await import("../lib/pptxImport");
      const imported = await importPptxFile(result.data);
      if (imported.kind === "orgchart") {
        loadFile(imported.file);
        await clearDraft();
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
      setPendingCsv({ fileName: f.name, result: importPeopleCsv(text) });
    } catch (err) {
      setError(err instanceof CsvFormatError ? err.message : "Impossible d'importer ce fichier CSV.");
      console.error(err);
    }
  };

  const confirmCsvImport = async (organize: boolean) => {
    if (!pendingCsv) return;
    setCsvBusy(true);
    setError(null);
    setNotice(null);
    try {
      const current = toFile();
      const now = new Date().toISOString();
      const importedTitle = pendingCsv.fileName.replace(/\.[^.]+$/, "") || current.meta.title;
      let importedNodes = pendingCsv.result.nodes;
      let importedLayout = current.layout;

      if (organize) {
        const page = current.layout.page ?? DEFAULT_PAGE;
        const area = availableAreaForSetup(page, {
          title: importedTitle,
          footer: current.meta.footer,
          logoUrl: current.theme.logoUrl,
          secondaryLogoUrl: current.theme.secondaryLogoUrl,
        });
        const { optimizeLayoutForPage } = await import("../lib/exportLayout");
        const [best] = await optimizeLayoutForPage(
          pendingCsv.result.nodes,
          pendingCsv.result.edges,
          current.layout,
          area
        );
        importedNodes = best.nodes;
        importedLayout = { ...current.layout, ...best.layout };
      }

      loadImportedFile({
        ...current,
        meta: { ...current.meta, title: importedTitle, createdAt: now, updatedAt: now },
        nodes: importedNodes,
        edges: pendingCsv.result.edges,
        layout: importedLayout,
        // Un import ouvre un nouveau document ; les anciennes pages ne doivent
        // jamais absorber les nouvelles cartes par leur géométrie.
        frames: undefined,
      });

      const warningCount = pendingCsv.result.warnings.length;
      setPendingCsv(null);
      requestAnimationFrame(() => fitView({ duration: motionDuration(300), padding: 0.2 }));
      setNotice(
        warningCount > 0
          ? `Import terminé · ${warningCount} point${warningCount > 1 ? "s" : ""} à vérifier dans le fichier source.`
          : `Import terminé · ${importedNodes.length} personne${importedNodes.length > 1 ? "s" : ""}.`
      );
    } catch (err) {
      console.error(err);
      setError("Impossible de préparer la mise en page du fichier CSV.");
    } finally {
      setCsvBusy(false);
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

  const closeMenus = () => {
    toolbarRef.current?.querySelectorAll("details[open]").forEach((menu) => menu.removeAttribute("open"));
  };

  const handleMenuToggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    const current = event.currentTarget;
    if (!current.open) return;
    toolbarRef.current?.querySelectorAll<HTMLDetailsElement>("details[open]").forEach((menu) => {
      if (menu !== current) menu.open = false;
    });
  };

  const iconButton = `flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
    themeMode === "dark"
      ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
  }`;
  const menuTrigger = `flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition-colors cursor-pointer list-none [&::-webkit-details-marker]:hidden ${
    themeMode === "dark"
      ? "text-zinc-300 hover:bg-zinc-800"
      : "text-zinc-600 hover:bg-zinc-100"
  }`;
  const menuPanel = `absolute top-[calc(100%+8px)] z-50 w-64 rounded-xl border p-1.5 shadow-2xl ${
    themeMode === "dark"
      ? "border-zinc-800 bg-zinc-950 shadow-black/40"
      : "border-zinc-200 bg-white shadow-zinc-300/40"
  }`;
  const menuItem = `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs transition-colors ${
    themeMode === "dark" ? "text-zinc-300 hover:bg-zinc-800" : "text-zinc-700 hover:bg-zinc-100"
  }`;

  return (
    <div ref={toolbarRef} className={`relative z-20 flex h-14 w-full shrink-0 items-center gap-3 border-b px-3 transition-colors ${
        themeMode === "dark"
          ? "border-zinc-800 bg-[#111113] text-text-dark"
          : "border-zinc-200/80 bg-white text-text-light"
      }`}
    >
      <div className="flex shrink-0 items-center gap-2 lg:gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-800 text-[11px] font-black tracking-tight text-white shadow-sm" aria-label="OrganiTool CAP">
          CAP
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Titre du document"
          className={`hidden h-9 w-36 rounded-lg border border-transparent bg-transparent px-2 text-sm font-semibold transition-colors focus:outline-none xl:block 2xl:w-44 ${
            themeMode === "dark"
              ? "text-zinc-100 hover:bg-zinc-900 focus:border-zinc-700 focus:bg-zinc-900"
              : "text-zinc-900 hover:bg-zinc-50 focus:border-zinc-200 focus:bg-white"
          }`}
        />
        <span className={`hidden items-center gap-1.5 whitespace-nowrap text-[10px] font-medium 2xl:flex ${isDirty ? "text-amber-600 dark:text-amber-400" : "text-zinc-400 dark:text-zinc-500"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${isDirty ? "bg-amber-500" : "bg-emerald-500"}`} />
          {isDirty ? "À enregistrer" : "Enregistré"}
        </span>
      </div>
      <div className="hidden h-6 w-px bg-zinc-200 dark:bg-zinc-800 sm:block" />

      <nav className="hidden items-center gap-1 2xl:flex" aria-label="Outils du document">
        <details className="relative" onToggle={handleMenuToggle}>
          <summary className={menuTrigger}><span>Fichier</span><ChevronDown className="h-3 w-3" /></summary>
          <div className={`${menuPanel} left-0`}>
            <button className={menuItem} onClick={() => { closeMenus(); onNewClick(); }}><FilePlus2 className="h-4 w-4 text-zinc-400" /><span><b className="block font-semibold">Nouveau</b><small className="text-zinc-400">Créer un autre organigramme</small></span></button>
            <button data-action="open" className={menuItem} onClick={() => { closeMenus(); void handleOpen(); }}><FolderOpen className="h-4 w-4 text-zinc-400" /><span><b className="block font-semibold">Ouvrir</b><small className="text-zinc-400">Fichier OrganiTool</small></span></button>
            <button data-action="import-csv" className={menuItem} onClick={() => { closeMenus(); csvInputRef.current?.click(); }}><FileSpreadsheet className="h-4 w-4 text-zinc-400" /><span><b className="block font-semibold">Importer Excel / CSV</b><small className="text-zinc-400">Créer depuis une liste</small></span></button>
            <button className={menuItem} onClick={() => { closeMenus(); loadFile(demoCompany); }}><Sparkles className="h-4 w-4 text-zinc-400" /><span><b className="block font-semibold">Voir l’exemple</b><small className="text-zinc-400">Société Horizon</small></span></button>
            <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
            <button className={menuItem} onClick={() => { closeMenus(); void handleSaveAs(); }}><SaveAll className="h-4 w-4 text-zinc-400" /><span><b className="block font-semibold">Enregistrer une copie</b><small className="text-zinc-400">Créer un fichier distinct</small></span></button>
          </div>
        </details>

        <details className="relative" onToggle={handleMenuToggle}>
          <summary className={menuTrigger}><SlidersHorizontal className="h-3.5 w-3.5" /><span>Mise en page</span><ChevronDown className="h-3 w-3" /></summary>
          <div className={`${menuPanel} left-0`}>
            <button disabled={busy} className={menuItem} onClick={() => { closeMenus(); void handleAutoLayout(); }}><Wand2 className={`h-4 w-4 text-primary-500 ${busy ? "animate-pulse" : ""}`} /><span><b className="block font-semibold">Réorganiser pour la page</b><small className="text-zinc-400">Choisir automatiquement la disposition la plus lisible</small></span></button>
            <button className={menuItem} onClick={() => { closeMenus(); applyCompactLayout(); requestAnimationFrame(() => fitView({ duration: motionDuration(300), padding: 0.2 })); }}><Shrink className="h-4 w-4 text-zinc-400" /><span><b className="block font-semibold">Disposition compacte</b><small className="text-zinc-400">Rapprocher les équipes</small></span></button>
            <button className={menuItem} onClick={() => { closeMenus(); setLayoutDirection(layout.direction === "TB" ? "LR" : "TB"); }}><Frame className="h-4 w-4 rotate-45 text-zinc-400" /><span><b className="block font-semibold">Sens de lecture</b><small className="text-zinc-400">Actuel : {layout.direction === "TB" ? "haut vers bas" : "gauche vers droite"}</small></span></button>
          </div>
        </details>

        <details className="relative" onToggle={handleMenuToggle}>
          <summary className={menuTrigger}><Eye className="h-3.5 w-3.5" /><span>Affichage</span><ChevronDown className="h-3 w-3" /></summary>
          <div className={`${menuPanel} left-0`}>
            <button className={menuItem} aria-pressed={pageGuide} onClick={togglePageGuide}><Frame className="h-4 w-4 text-zinc-400" /><span className="flex-1"><b className="block font-semibold">Cadre de page</b><small className="text-zinc-400">Visualiser la zone imprimable</small></span><span className={`h-2 w-2 rounded-full ${pageGuide ? "bg-primary-500" : "bg-zinc-300 dark:bg-zinc-700"}`} /></button>
            <button className={menuItem} aria-pressed={showGroups} onClick={onToggleGroups}><Boxes className="h-4 w-4 text-zinc-400" /><span className="flex-1"><b className="block font-semibold">Blocs de pôles</b><small className="text-zinc-400">Regrouper visuellement les équipes</small></span><span className={`h-2 w-2 rounded-full ${showGroups ? "bg-primary-500" : "bg-zinc-300 dark:bg-zinc-700"}`} /></button>
            <button className={menuItem} onClick={() => { closeMenus(); fitView({ duration: motionDuration(300), padding: 0.2 }); }}><Maximize className="h-4 w-4 text-zinc-400" /><span><b className="block font-semibold">Tout afficher</b><small className="text-zinc-400">Recentrer l’organigramme</small></span></button>
            <button className={menuItem} onClick={() => { closeMenus(); onTogglePresentation(); }}><Presentation className="h-4 w-4 text-zinc-400" /><span><b className="block font-semibold">Mode présentation</b><small className="text-zinc-400">Masquer l’interface</small></span></button>
          </div>
        </details>
      </nav>

      <details className="relative 2xl:hidden" onToggle={handleMenuToggle}>
        <summary className={`${menuTrigger} px-2.5`} aria-label="Ouvrir le menu principal">
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden lg:inline">Outils</span>
          <ChevronDown className="hidden h-3 w-3 lg:block" />
        </summary>
        <div className={`${menuPanel} left-0 grid w-72 grid-cols-2 gap-1`}>
          <button data-action="open" className={menuItem} onClick={() => { closeMenus(); void handleOpen(); }}><FolderOpen className="h-4 w-4 text-zinc-400" /><span className="font-semibold">Ouvrir</span></button>
          <button data-action="import-csv" className={menuItem} onClick={() => { closeMenus(); csvInputRef.current?.click(); }}><FileSpreadsheet className="h-4 w-4 text-zinc-400" /><span className="font-semibold">Importer</span></button>
          <button disabled={busy} className={menuItem} onClick={() => { closeMenus(); void handleAutoLayout(); }}><Wand2 className="h-4 w-4 text-primary-500" /><span className="font-semibold">Réorganiser</span></button>
          <button className={menuItem} onClick={() => { closeMenus(); fitView({ duration: motionDuration(300), padding: 0.2 }); }}><Maximize className="h-4 w-4 text-zinc-400" /><span className="font-semibold">Tout afficher</span></button>
          <button className={menuItem} onClick={() => { closeMenus(); onTogglePresentation(); }}><Presentation className="h-4 w-4 text-zinc-400" /><span className="font-semibold">Présenter</span></button>
          <button className={menuItem} onClick={() => { closeMenus(); onNewClick(); }}><FilePlus2 className="h-4 w-4 text-zinc-400" /><span className="font-semibold">Nouveau</span></button>
          <button disabled={!canUndo} className={menuItem} onClick={() => { closeMenus(); undo(); }}><Undo2 className="h-4 w-4 text-zinc-400" /><span className="font-semibold">Annuler</span></button>
          <button disabled={!canRedo} className={menuItem} onClick={() => { closeMenus(); redo(); }}><Redo2 className="h-4 w-4 text-zinc-400" /><span className="font-semibold">Rétablir</span></button>
        </div>
      </details>

      <input ref={csvInputRef} type="file" accept=".csv,text/csv,text/tab-separated-values" className="hidden" onChange={handleImportCsv} />

      <div className="mx-auto flex shrink-0 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900" role="group" aria-label="Changer de vue">
        <button title="Organigramme" onClick={() => directoryOpen && onToggleDirectory()} aria-pressed={!directoryOpen} className={`flex h-8 items-center gap-2 rounded-md px-2 text-xs font-semibold transition-colors lg:px-3 ${!directoryOpen ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}><Frame className="h-3.5 w-3.5" /><span className="hidden md:inline">Organigramme</span></button>
        <button title="Annuaire" onClick={() => !directoryOpen && onToggleDirectory()} aria-pressed={directoryOpen} className={`flex h-8 items-center gap-2 rounded-md px-2 text-xs font-semibold transition-colors lg:px-3 ${directoryOpen ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"}`}><Users className="h-3.5 w-3.5" /><span className="hidden md:inline">Annuaire</span></button>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <div className="relative hidden md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input type="search" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)} onBlur={() => setTimeout(() => setSearchOpen(false), 200)} placeholder="Rechercher…" className={`h-9 w-28 rounded-lg border pl-9 pr-3 text-xs focus:outline-none lg:w-36 xl:w-40 ${themeMode === "dark" ? "border-zinc-800 bg-zinc-900 text-zinc-200" : "border-zinc-200 bg-zinc-50 text-zinc-700"}`} />
          {searchOpen && searchQuery.trim() && <div className={`${menuPanel} right-0`}>
            {searchResults.length === 0 ? <div className="px-3 py-2 text-xs text-zinc-400">Aucun résultat</div> : searchResults.map((n) => <button key={n.id} onMouseDown={(e) => e.preventDefault()} onClick={() => handleGoToNode(n.id)} className={menuItem}><span><b className="block font-semibold">{n.data.name || "Sans nom"}</b><small className="text-zinc-400">{[n.data.role, n.data.department].filter(Boolean).join(" · ")}</small></span></button>)}
          </div>}
        </div>
        <button aria-label="Annuler" title="Annuler (Ctrl+Z)" onClick={undo} disabled={!canUndo} className={`${iconButton} hidden lg:flex`}><Undo2 className="h-4 w-4" /></button>
        <button aria-label="Rétablir" title="Rétablir (Ctrl+Maj+Z)" onClick={redo} disabled={!canRedo} className={`${iconButton} hidden lg:flex`}><Redo2 className="h-4 w-4" /></button>
        <button aria-label="Changer de thème" title="Mode clair / sombre" onClick={onToggleTheme} className={`${iconButton} hidden sm:flex`}>{themeMode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
        <div className="mx-1 h-6 w-px bg-zinc-200 dark:bg-zinc-800" />
        <button data-action="save" onClick={() => void handleSave()} className={`flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition-colors ${isDirty ? "bg-primary-700 text-white hover:bg-primary-600 dark:bg-primary-600 dark:hover:bg-primary-500" : themeMode === "dark" ? "bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}><Save className="h-3.5 w-3.5" /><span className="hidden sm:inline">Enregistrer</span></button>
        <button onClick={onExportClick} className="flex h-9 items-center gap-2 rounded-lg bg-primary-800 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"><Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">Exporter</span></button>
      </div>

      {(error || notice) && <div role="status" className={`absolute left-1/2 top-[calc(100%+8px)] z-50 -translate-x-1/2 rounded-lg border px-4 py-2 text-xs shadow-lg ${error ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"}`}>{error ?? notice}</div>}
      {pendingCsv && (
        <CsvImportDialog
          fileName={pendingCsv.fileName}
          result={pendingCsv.result}
          currentNodeCount={nodes.length}
          currentDocumentDirty={isDirty}
          busy={csvBusy}
          themeMode={themeMode}
          onCancel={() => setPendingCsv(null)}
          onConfirm={(organize) => void confirmCsvImport(organize)}
        />
      )}
    </div>
  );
}
