import { useEffect, useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { CARD_HEIGHT, CARD_WIDTH } from "../lib/compactLayout";
import { useOrgChartStore } from "../store/useOrgChartStore";
import {
  computeChromeOffsets,
  buildFlowPdfImage,
  buildFramesPdfImage,
  captureFlow,
  copyFlowToClipboard,
  exportFlowToPng,
  exportFlowToSvg,
  safeFileName,
  type FrameImagePage,
  type PdfFormat,
  type PdfOrientation,
} from "../lib/pdfExport";
import { availableAreaForSetup, COMFORT_MM_PER_PX, estimateReadability, pageAvailableArea, READABLE_PT_GOOD } from "../lib/readability";
import { computeHiddenNodeIds } from "../lib/hierarchy";
import { buildFramePages, frameNodeId, frameRectPx, type FramePageContent } from "../lib/frames";
import { analyzeExportPreflight, type ExportPreflightIssue } from "../lib/exportPreflight";
import { PageFormatSelect } from "./PageFormatSelect";
import {
  Info,
  ChevronDown,
  Loader2,
  FileText,
  Globe2,
  Image,
  FileCode,
  Copy,
  Check,
  Archive,
  Download,
  Eye,
  X
} from "lucide-react";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  getViewportElement: () => HTMLElement | null;
  themeMode?: "light" | "dark";
}

export function ExportDialog({ open, onClose, getViewportElement, themeMode = "light" }: ExportDialogProps) {
  const meta = useOrgChartStore((s) => s.meta);
  const theme = useOrgChartStore((s) => s.theme);
  const selectedNodeIds = useOrgChartStore((s) => s.selectedNodeIds);
  const selectNodes = useOrgChartStore((s) => s.selectNodes);
  const pageGuideVisible = useOrgChartStore((s) => s.pageGuide);
  const togglePageGuide = useOrgChartStore((s) => s.togglePageGuide);
  const storeNodes = useOrgChartStore((s) => s.nodes);
  const storeEdges = useOrgChartStore((s) => s.edges);
  const collapsedNodeIds = useOrgChartStore((s) => s.collapsedNodeIds);
  const expandAll = useOrgChartStore((s) => s.expandAll);
  const pageSetup = useOrgChartStore((s) => s.layout.page);
  const setPageSetup = useOrgChartStore((s) => s.setPageSetup);
  const frames = useOrgChartStore((s) => s.frames);
  const { getNodes, fitView } = useReactFlow();
  const [format, setFormat] = useState<PdfFormat>(pageSetup?.format ?? "a4");
  const [orientation, setOrientation] = useState<PdfOrientation>(pageSetup?.orientation ?? "landscape");
  const [margin, setMargin] = useState(pageSetup?.margin ?? 10);

  // Le format choisi est celui du document : le dialogue se réaligne sur le
  // fichier à chaque ouverture (ajustement d'état pendant le rendu, pattern
  // React officiel), et chaque changement met à jour le cadre de page.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && pageSetup) {
      setFormat(pageSetup.format);
      setOrientation(pageSetup.orientation);
      setMargin(pageSetup.margin);
    }
  }
  const [includeTitle, setIncludeTitle] = useState(true);
  const [includeFooter, setIncludeFooter] = useState(true);
  const [includeLogos, setIncludeLogos] = useState(true);
  const [multiPage, setMultiPage] = useState(false);
  /** Périmètre en mode multi-pages : toutes les pages, ou une seule (id de frame). */
  const [scope, setScope] = useState<"all" | string>("all");
  const hasFrames = frames.length > 0;
  // Un frame supprimé pendant que le dialogue est fermé : repli sur « toutes »
  if (scope !== "all" && !frames.some((f) => f.id === scope)) setScope("all");
  const [pdfVector, setPdfVector] = useState(true);
  const [transparentBg, setTransparentBg] = useState(false);
  const [webResolution, setWebResolution] = useState<"standard" | "high">("high");
  
  // Onglet d'export sélectionné
  const [activeTab, setActiveTab] = useState<"pdf" | "web">("pdf");

  // L'export est WYSIWYG : les branches repliées n'y figurent pas.
  const hiddenIds = useMemo(
    () => computeHiddenNodeIds(collapsedNodeIds, storeEdges),
    [collapsedNodeIds, storeEdges]
  );
  const visibleNodes = useMemo(
    () => (hiddenIds.size === 0 ? storeNodes : storeNodes.filter((n) => !hiddenIds.has(n.id))),
    [storeNodes, hiddenIds]
  );
  const visibleEdges = useMemo(
    () =>
      hiddenIds.size === 0
        ? storeEdges
        : storeEdges.filter((e) => !hiddenIds.has(e.source) && !hiddenIds.has(e.target)),
    [storeEdges, hiddenIds]
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);
  const [webPreviewUrl, setWebPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (pdfPreview) URL.revokeObjectURL(pdfPreview.url);
    };
  }, [pdfPreview]);

  const handleClose = () => {
    setPdfPreview(null);
    setWebPreviewUrl(null);
    onClose();
  };

  // Pages exportables (mode multi-pages) : contenu + chrome par frame, dans
  // l'ordre du document, restreintes au périmètre choisi.
  const framePages = useMemo<FramePageContent[]>(() => {
    if (!hasFrames || !open) return [];
    const pages = buildFramePages(frames, visibleNodes, visibleEdges, {
      title: includeTitle ? meta.title : undefined,
      subtitle: includeTitle ? meta.subtitle : undefined,
      chromeLayout: meta.chromeLayout,
    });
    // « Inclure le titre » décoché : aucune bande d'en-tête, y compris les titres par page
    const withTitleRule = includeTitle
      ? pages
      : pages.map((p) => ({ ...p, title: undefined, subtitle: undefined }));
    return scope === "all" ? withTitleRule : withTitleRule.filter((p) => p.frame.id === scope);
  }, [hasFrames, open, frames, visibleNodes, visibleEdges, includeTitle, meta, scope]);

  // Jauge multi-pages : la page la moins lisible du périmètre
  const frameReadability = useMemo(() => {
    if (!open || framePages.length === 0) return null;
    let worst: { id: string; name: string; fontPt: number; rating: "good" | "warn" | "bad"; cardWidthMm: number } | null = null;
    for (const p of framePages) {
      if (p.nodes.length === 0) continue;
      const xs = p.nodes.map((n) => n.position.x);
      const ys = p.nodes.map((n) => n.position.y);
      const avail = availableAreaForSetup(p.frame.page, {
        title: p.title,
        footer: includeFooter ? meta.footer : undefined,
        logoUrl: includeLogos ? theme.logoUrl : undefined,
        secondaryLogoUrl: includeLogos ? theme.secondaryLogoUrl : undefined,
      });
      const est = p.frame.page.placement === "exact"
        ? {
            fontPt: READABLE_PT_GOOD,
            rating: "good" as const,
            cardWidthMm: Math.round(CARD_WIDTH * COMFORT_MM_PER_PX),
          }
        : estimateReadability(
            (Math.max(...xs) - Math.min(...xs) + CARD_WIDTH) * 1.12,
            (Math.max(...ys) - Math.min(...ys) + CARD_HEIGHT) * 1.12,
            avail.width,
            avail.height
          );
      if (!worst || est.fontPt < worst.fontPt) worst = { id: p.frame.id, name: p.frame.name, ...est };
    }
    return worst;
  }, [open, framePages, includeFooter, includeLogos, meta.footer, theme.logoUrl, theme.secondaryLogoUrl]);

  // Lisibilité estimée du document : taille réelle du texte une fois
  // l'organigramme ajusté à la page (sans objet en multi-pages).
  const readability = useMemo(() => {
    if (!open || multiPage || hasFrames || visibleNodes.length === 0) return null;
    // Bornes calculées depuis les nœuds visibles (réactif), cartes de 240×110 px
    const xs = visibleNodes.map((n) => n.position.x);
    const ys = visibleNodes.map((n) => n.position.y);
    const bounds = {
      width: Math.max(...xs) - Math.min(...xs) + CARD_WIDTH,
      height: Math.max(...ys) - Math.min(...ys) + CARD_HEIGHT,
    };
    const chrome = computeChromeOffsets(
      {
        format,
        orientation,
        margin,
        title: includeTitle ? meta.title : undefined,
        footer: includeFooter ? meta.footer : undefined,
        logoUrl: includeLogos ? theme.logoUrl : undefined,
        secondaryLogoUrl: includeLogos ? theme.secondaryLogoUrl : undefined,
      },
      margin
    );
    const area = pageAvailableArea(format, orientation, margin, chrome.topOffset, chrome.bottomOffset);
    // 12 % de marge intérieure autour du contenu, comme la capture (captureFlow)
    return estimateReadability(bounds.width * 1.12, bounds.height * 1.12, area.width, area.height);
  }, [
    open,
    multiPage,
    hasFrames,
    visibleNodes,
    format,
    orientation,
    margin,
    includeTitle,
    includeFooter,
    includeLogos,
    meta.title,
    meta.footer,
    theme.logoUrl,
    theme.secondaryLogoUrl,
  ]);

  const preflight = useMemo(() => {
    const scopedFrameIds = hasFrames && scope !== "all" ? new Set([scope]) : undefined;
    const readabilityCheck = frameReadability
      ? {
          rating: frameReadability.rating,
          fontPt: frameReadability.fontPt,
          pageId: frameReadability.id,
          pageName: frameReadability.name,
        }
      : readability
      ? { rating: readability.rating, fontPt: readability.fontPt }
      : null;
    return analyzeExportPreflight({
      nodes: visibleNodes,
      edges: visibleEdges,
      frames,
      theme,
      scopeFrameIds: scopedFrameIds,
      includeTitle,
      title: meta.title,
      hiddenNodeCount: hiddenIds.size,
      readability: readabilityCheck,
      destination: activeTab,
    });
  }, [
    hasFrames,
    scope,
    frameReadability,
    readability,
    visibleNodes,
    visibleEdges,
    frames,
    theme,
    includeTitle,
    meta.title,
    hiddenIds.size,
    activeTab,
  ]);

  if (!open) return null;

  const focusPreflightIssue = (issue: ExportPreflightIssue) => {
    const allFlowNodes = getNodes();
    const issueNodeIds = new Set(issue.nodeIds ?? []);
    const pageId = issue.pageId;
    const targets = issueNodeIds.size > 0
      ? allFlowNodes.filter((node) => issueNodeIds.has(node.id))
      : pageId
      ? allFlowNodes.filter((node) => node.id === frameNodeId(pageId))
      : [];
    if (targets.length === 0) return;

    if (issueNodeIds.size > 0) selectNodes([...issueNodeIds]);
    handleClose();
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() =>
      fitView({ nodes: targets, duration: reduceMotion ? 0 : 300, padding: pageId ? 0.12 : 0.3 })
    );
  };

  const run = async (kind: "pdf" | "preview" | "png" | "svg" | "clipboard" | "web-preview" | "web-zip") => {
    const el = getViewportElement();
    if (!el) {
      setError("Le canevas n'est pas prêt.");
      return;
    }
    // Le cadre de page et ses éléments d'en-tête/pied sont des nœuds React
    // Flow eux aussi (repères d'édition, masqués pendant la capture ci-dessous) :
    // exclus du cadrage pour ne pas élargir inutilement le recadrage. Les fonds
    // de groupe restent inclus : contrairement au cadre de page, ce sont un
    // élément visuel voulu dans l'export.
    let nodes = getNodes().filter((n) => n.type !== "pageGuide" && n.type !== "chromeElement");
    // Périmètre « cette page » : seuls les membres de la page sont capturés
    // (exports image ; les moteurs par page utilisent framePages directement).
    if (hasFrames && scope !== "all" && kind !== "web-zip") {
      const inScope = new Set(framePages.flatMap((p) => p.nodes.map((n) => n.id)));
      nodes = nodes.filter((n) => inScope.has(n.id));
    }
    const allWebFramePages = kind === "web-zip"
      ? buildFramePages(frames, visibleNodes, visibleEdges, {
          title: meta.title,
          subtitle: meta.subtitle,
          chromeLayout: meta.chromeLayout,
        })
      : null;
    const frameNodeCount = allWebFramePages
      ? allWebFramePages.reduce((total, page) => total + page.nodes.length, 0)
      : framePages.reduce((total, page) => total + page.nodes.length, 0);
    if (hasFrames && frameNodeCount === 0) {
      setError(kind === "web-zip" || scope === "all" ? "Toutes les pages sont vides." : "Cette page est vide.");
      return;
    }
    if (!hasFrames && nodes.length === 0) {
      setError("Aucun membre à exporter.");
      return;
    }
    setError(null);
    setBusy(kind);
    setExportProgress(null);

    // Désélectionne temporairement les nœuds pour ne pas capturer le surlignage de sélection,
    // et masque le cadre de page (feuille, bandes d'en-tête/pied, jauge de lisibilité) : un
    // repère d'édition, jamais destiné à apparaître dans les exports rasterisés (PNG/SVG/PDF image).
    // Le PDF vectoriel ne capture pas le DOM : inutile
    // de faire clignoter le canvas pour eux.
    const capturesDom =
      kind === "png" ||
      kind === "svg" ||
      kind === "clipboard" ||
      kind === "web-preview" ||
      kind === "web-zip" ||
      ((kind === "pdf" || kind === "preview") && !(pdfVector && (hasFrames || !multiPage)));
    const hadSelection = capturesDom && selectedNodeIds.length > 0;
    const hadPageGuide = capturesDom && pageGuideVisible;
    if (hadSelection || hadPageGuide) {
      if (hadSelection) selectNodes([]);
      if (hadPageGuide) togglePageGuide();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }

    try {
      if (kind === "pdf" || kind === "preview") {
        let pdfDocument: { output: (type: "blob") => Blob; save: (filename: string) => void } | null = null;
        let filename = safeFileName(meta.title);
        if (hasFrames) {
          // Mode multi-pages : une page PDF par frame du périmètre, chrome et
          // format papier propres à chaque page.
          const common = {
            docTitle: meta.title,
            docSubtitle: includeTitle ? meta.subtitle : undefined,
            footer: includeFooter ? meta.footer : undefined,
            logoUrl: includeLogos ? theme.logoUrl : undefined,
            secondaryLogoUrl: includeLogos ? theme.secondaryLogoUrl : undefined,
          };
          if (pdfVector) {
            const { buildFramesPdfVector } = await import("../lib/pdfVector");
            pdfDocument = await buildFramesPdfVector(framePages, theme, common, (current, total) =>
              setExportProgress({ current, total })
            );
            filename = safeFileName(meta.title, framePages.length > 1 ? "-pages" : "-vectoriel");
          } else {
            const rfById = new Map(nodes.map((n) => [n.id, n]));
            const pages: FrameImagePage[] = framePages.map((p) => ({
              format: p.frame.page.format,
              orientation: p.frame.page.orientation,
              margin: p.frame.page.margin,
              name: p.frame.name,
              title: p.title,
              subtitle: p.subtitle,
              chromeLayout: p.chromeLayout,
              placement: p.frame.page.placement,
              frameRect: frameRectPx(p.frame),
              rfNodes: p.nodes
                .map((n) => rfById.get(n.id))
                .filter((n): n is NonNullable<typeof n> => Boolean(n)),
            }));
            pdfDocument = await buildFramesPdfImage(el, pages, common, (current, total) =>
              setExportProgress({ current, total })
            );
            filename = safeFileName(meta.title, pages.length > 1 ? "-pages" : "");
          }
        } else {
          const pdfOptions = {
            format,
            orientation,
            margin,
            title: includeTitle ? meta.title : undefined,
            subtitle: includeTitle ? meta.subtitle : undefined,
            footer: includeFooter ? meta.footer : undefined,
            logoUrl: includeLogos ? theme.logoUrl : undefined,
            secondaryLogoUrl: includeLogos ? theme.secondaryLogoUrl : undefined,
            multiPage,
            chromeLayout: meta.chromeLayout,
          };
          // Vectoriel natif : cartes dessinées dans le PDF (texte net, fichier
          // léger). Le multi-pages reste en capture image haute résolution.
          if (pdfVector && !multiPage) {
            const { buildFlowPdfVector } = await import("../lib/pdfVector");
            pdfDocument = await buildFlowPdfVector(visibleNodes, visibleEdges, theme, pdfOptions);
            filename = safeFileName(meta.title, "-vectoriel");
          } else {
            pdfDocument = await buildFlowPdfImage(el, nodes, pdfOptions);
            filename = safeFileName(meta.title, multiPage ? "-multipages" : "");
          }
        }
        if (!pdfDocument) throw new Error("Le PDF n'a pas pu être construit.");
        if (kind === "preview") {
          const url = URL.createObjectURL(pdfDocument.output("blob"));
          setPdfPreview({ url, filename });
        } else {
          pdfDocument.save(filename);
        }
      } else if (kind === "clipboard") {
        await copyFlowToClipboard(el, nodes);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } else if (kind === "web-zip") {
        const rfById = new Map(nodes.map((node) => [node.id, node]));
        const pages = (allWebFramePages ?? []).map((page) => ({
          name: page.frame.name,
          nodes: page.nodes
            .map((node) => rfById.get(node.id))
            .filter((node): node is NonNullable<typeof node> => Boolean(node)),
        }));
        const { exportWebPagesZip } = await import("../lib/webPagesExport");
        await exportWebPagesZip(el, pages, {
          title: meta.title,
          transparent: transparentBg,
          scale: webResolution === "high" ? 2.5 : 1.5,
          onProgress: (current, total) => setExportProgress({ current, total }),
        });
      } else if (kind === "png") {
        await exportFlowToPng(el, nodes, `${meta.title || "organigramme"}.png`, {
          transparent: transparentBg,
          scale: webResolution === "high" ? 2.5 : 1.5,
        });
      } else if (kind === "svg") {
        await exportFlowToSvg(el, nodes, `${meta.title || "organigramme"}.svg`, { transparent: transparentBg });
      } else {
        const capture = await captureFlow(el, nodes, "png", 1, { transparent: transparentBg });
        setWebPreviewUrl(capture.dataUrl);
      }
    } catch (err) {
      console.error(err);
      setError(
        kind === "clipboard"
          ? "Copie impossible : le presse-papiers nécessite un contexte sécurisé (https ou localhost)."
          : "Une erreur est survenue pendant l'export."
      );
    } finally {
      if (hadSelection) selectNodes(selectedNodeIds);
      if (hadPageGuide) togglePageGuide();
      setBusy(null);
      setExportProgress(null);
    }
  };

  const selectClass = `w-full rounded-xl border px-3 py-2 text-xs transition-all focus:outline-none appearance-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:focus:ring-primary-400/20 dark:focus:border-primary-400 ${
    themeMode === "dark"
      ? "border-zinc-800 bg-zinc-900/60 text-zinc-100 focus:border-zinc-700"
      : "border-zinc-200 bg-zinc-50/50 text-zinc-800 focus:border-zinc-300"
  }`;

  const checkboxClass = `h-4 w-4 rounded border transition-colors focus:ring-1 cursor-pointer focus:ring-primary-500 focus:border-primary-500 ${
    themeMode === "dark"
      ? "border-zinc-800 bg-zinc-900 text-zinc-350 focus:ring-zinc-700 checked:bg-primary-600 checked:border-primary-600"
      : "border-zinc-300 bg-zinc-50 text-zinc-700 focus:ring-zinc-400 checked:bg-primary-700 checked:border-primary-700"
  }`;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className={`flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border shadow-2xl transition-all ${
          themeMode === "dark"
            ? "border-border-dark bg-panel-bg-dark text-text-dark"
            : "border-border-light bg-panel-bg-light text-text-light"
        }`}
      >
        {/* En-tête fixe */}
        <div className="flex items-center justify-between border-b border-zinc-200/60 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-base font-bold tracking-tight text-zinc-800 dark:text-zinc-100">
              Exporter
            </h2>
            <p className="mt-0.5 text-[11px] text-zinc-450 dark:text-zinc-500">
              {preflight.exportedPageCount} page{preflight.exportedPageCount > 1 ? "s" : ""} · {preflight.exportedNodeCount} membre{preflight.exportedNodeCount > 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Fermer la fenêtre d’export"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-650 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-all cursor-pointer"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          <div className="mb-5 flex rounded-xl border border-zinc-200/60 bg-zinc-100 p-1 shadow-inner dark:border-zinc-800 dark:bg-zinc-900/60" role="tablist" aria-label="Destination de l’export">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "pdf"}
              onClick={() => setActiveTab("pdf")}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${activeTab === "pdf" ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white" : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"}`}
            >
              <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> PDF</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "web"}
              onClick={() => {
                setActiveTab("web");
                if (hasFrames && scope === "all" && frames[0]) setScope(frames[0].id);
              }}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${activeTab === "web" ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white" : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"}`}
            >
              <span className="inline-flex items-center gap-1.5"><Globe2 className="h-3.5 w-3.5" /> Web & écran</span>
            </button>
          </div>

          <div className="flex flex-col gap-5">
            {/* Colonne Gauche : Configuration de la page */}
            <div className="flex flex-col gap-4">

              {/* Périmètre (mode multi-pages) */}
              {hasFrames && frames.length > 1 && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-455 dark:text-zinc-500">
                    {activeTab === "pdf" ? "Pages à exporter" : "Page à publier"}
                  </span>
                  <div className="relative">
                    <select
                      value={scope}
                      onChange={(e) => {
                        setScope(e.target.value);
                        setWebPreviewUrl(null);
                      }}
                      className={selectClass}
                    >
                      {activeTab === "pdf" && <option value="all">Toutes les pages ({frames.length})</option>}
                      {frames.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                  </div>
                </label>
              )}

              {/* Format de page & Orientation */}
              {!hasFrames && activeTab === "pdf" && (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-455 dark:text-zinc-500">
                    Surface de sortie
                  </span>
                  <div className="relative">
                    <PageFormatSelect
                      value={format}
                      onChange={(value) => {
                        setFormat(value);
                        setPageSetup({ format: value, orientation, margin, placement: pageSetup?.placement });
                      }}
                      themeMode={themeMode}
                      ariaLabel="Surface de sortie PDF"
                    />
                  </div>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-455 dark:text-zinc-500">
                    Orientation
                  </span>
                  <div className="relative">
                    <select
                      value={orientation}
                      onChange={(e) => {
                        const value = e.target.value as PdfOrientation;
                        setOrientation(value);
                        setPageSetup({ format, orientation: value, margin, placement: pageSetup?.placement });
                      }}
                      className={selectClass}
                    >
                      <option value="landscape">Paysage</option>
                      <option value="portrait">Portrait</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                  </div>
                </label>
              </div>
              )}

              {/* Marge */}
              {!hasFrames && activeTab === "pdf" && (
              <div className="flex flex-col gap-1.5">
                <span className="flex justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-455 dark:text-zinc-500">
                  <span>Marges du document</span>
                  <span className="font-mono text-zinc-500 dark:text-zinc-400">{margin} mm</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={margin}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setMargin(value);
                    setPageSetup({ format, orientation, margin: value, placement: pageSetup?.placement });
                  }}
                  className="w-full accent-primary-600 dark:accent-primary-400 cursor-pointer bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none h-1"
                />
              </div>
              )}

              {/* Options de contenu */}
              {activeTab === "pdf" && (
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-455 dark:text-zinc-500">Contenu</span>
                <div className="flex flex-wrap gap-2">
                <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${includeTitle ? "border-primary-300 bg-primary-50 text-primary-800 dark:border-primary-700 dark:bg-primary-950/30 dark:text-primary-200" : "border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"}`}>
                  <input
                    type="checkbox"
                    checked={includeTitle}
                    onChange={(e) => setIncludeTitle(e.target.checked)}
                    className={checkboxClass}
                  />
                  <span>Titre</span>
                </label>
                {(theme.logoUrl || theme.secondaryLogoUrl) && <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${includeLogos ? "border-primary-300 bg-primary-50 text-primary-800 dark:border-primary-700 dark:bg-primary-950/30 dark:text-primary-200" : "border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"}`}>
                  <input
                    type="checkbox"
                    checked={includeLogos}
                    onChange={(e) => setIncludeLogos(e.target.checked)}
                    className={checkboxClass}
                  />
                  <span>Logos</span>
                </label>}
                {meta.footer && <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${includeFooter ? "border-primary-300 bg-primary-50 text-primary-800 dark:border-primary-700 dark:bg-primary-950/30 dark:text-primary-200" : "border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"}`}>
                  <input
                    type="checkbox"
                    checked={includeFooter}
                    onChange={(e) => setIncludeFooter(e.target.checked)}
                    className={checkboxClass}
                  />
                  <span>Pied de page</span>
                </label>}
                </div>
                {!hasFrames && (
                <label className="mt-1 flex cursor-pointer items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={multiPage}
                    onChange={(e) => setMultiPage(e.target.checked)}
                    className={checkboxClass}
                  />
                  <span>Répartir sur plusieurs feuilles</span>
                </label>
                )}
              </div>
              )}

              {/* Contrôle consolidé avant publication */}
              <div
                className={`rounded-xl border p-3 transition-colors ${
                  preflight.errorCount > 0
                    ? "border-red-500/25 bg-red-500/5"
                    : preflight.warningCount > 0
                    ? "border-amber-500/25 bg-amber-500/5"
                    : "border-emerald-500/20 bg-emerald-500/5"
                }`}
                aria-live="polite"
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      preflight.errorCount > 0
                        ? "bg-red-500 text-white"
                        : preflight.warningCount > 0
                        ? "bg-amber-500 text-white"
                        : "bg-emerald-500 text-white"
                    }`}
                  >
                    {preflight.errorCount + preflight.warningCount === 0 ? (
                      <Check className="h-3 w-3" strokeWidth={3} />
                    ) : (
                      <Info className="h-3 w-3" strokeWidth={2.5} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div>
                      <p className="text-xs font-bold text-zinc-750 dark:text-zinc-150">
                          {preflight.errorCount > 0
                            ? `${preflight.errorCount} problème${preflight.errorCount > 1 ? "s" : ""} à corriger`
                            : preflight.warningCount > 0
                            ? `${preflight.warningCount} point${preflight.warningCount > 1 ? "s" : ""} à vérifier`
                            : "Prêt à exporter"}
                      </p>
                    </div>

                    {preflight.issues.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-2">
                        {preflight.issues.map((issue, index) => {
                          const canFocus = Boolean(issue.nodeIds?.length || issue.pageId);
                          const focusLabel = issue.nodeIds?.length
                            ? issue.nodeIds.length === 1
                              ? "Voir la carte"
                              : "Voir les cartes"
                            : "Voir la page";
                          const action = issue.code === "hidden-branches"
                            ? { label: "Tout déplier", onClick: expandAll }
                            : canFocus
                            ? { label: focusLabel, onClick: () => focusPreflightIssue(issue) }
                            : null;

                          return (
                            <li key={`${issue.code}-${issue.pageId ?? "document"}-${index}`} className="flex items-start gap-2">
                              <span
                                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                                  issue.severity === "error"
                                    ? "bg-red-500"
                                    : issue.severity === "warning"
                                    ? "bg-amber-500"
                                    : "bg-primary-500"
                                }`}
                              />
                              <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold text-zinc-650 dark:text-zinc-250">{issue.title}</p>
                                  <p className="mt-0.5 text-[10px] leading-snug text-zinc-450 dark:text-zinc-500">{issue.detail}</p>
                                </div>
                                {action && (
                                  <button
                                    type="button"
                                    onClick={action.onClick}
                                    disabled={busy !== null}
                                    className="shrink-0 rounded-md border border-zinc-200 bg-white/70 px-2 py-1 text-[10px] font-semibold text-zinc-600 transition-colors hover:border-primary-300 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:border-primary-700 dark:hover:text-primary-300"
                                  >
                                    {action.label}
                                  </button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">

              {/* Contenu de l'onglet actif */}
              <div className="flex flex-col">
                {activeTab === "pdf" && (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-455 dark:text-zinc-500">Rendu</span>
                      <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        aria-pressed={pdfVector && (hasFrames || !multiPage)}
                        disabled={!hasFrames && multiPage}
                        onClick={() => setPdfVector(true)}
                        className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer ${
                          pdfVector && (hasFrames || !multiPage)
                            ? "border-primary-500 bg-primary-50 text-primary-900 dark:border-primary-500 dark:bg-primary-950/35 dark:text-primary-100"
                            : themeMode === "dark"
                            ? "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700"
                            : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                        }`}
                      >
                        <span className="block text-xs font-bold">Texte net</span>
                        <span className="mt-1 block text-[10px] opacity-70">Léger · recommandé</span>
                      </button>
                      <button
                        type="button"
                        aria-pressed={!pdfVector || (!hasFrames && multiPage)}
                        onClick={() => setPdfVector(false)}
                        className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 cursor-pointer ${
                          !pdfVector || (!hasFrames && multiPage)
                            ? "border-primary-500 bg-primary-50 text-primary-900 dark:border-primary-500 dark:bg-primary-950/35 dark:text-primary-100"
                            : themeMode === "dark"
                            ? "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700"
                            : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                        }`}
                      >
                        <span className="block text-xs font-bold">Avec portraits</span>
                        <span className="mt-1 block text-[10px] opacity-70">Photos · fichier plus lourd</span>
                      </button>
                      </div>
                      {!hasFrames && multiPage && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">
                          Le mode plusieurs feuilles conserve les portraits.
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => run("preview")}
                      disabled={busy !== null}
                      className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold shadow-sm transition-colors cursor-pointer ${
                        themeMode === "dark"
                          ? "bg-primary-600 text-white hover:bg-primary-500"
                          : "bg-primary-700 text-white hover:bg-primary-600"
                      } disabled:opacity-50`}
                    >
                      {busy === "preview" ? (
                        <>
                          <Loader2 className="animate-spin h-4 w-4" />
                          <span>
                            {exportProgress
                              ? `Génération de la page ${exportProgress.current} sur ${exportProgress.total}…`
                              : "Préparation de l’aperçu…"}
                          </span>
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4" />
                          <span>Prévisualiser le PDF</span>
                        </>
                      )}
                    </button>

                    {busy === "preview" && exportProgress && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="progressbar" aria-valuemin={0} aria-valuemax={exportProgress.total} aria-valuenow={exportProgress.current}>
                        <div className="h-full rounded-full bg-primary-600 transition-[width] duration-200" style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }} />
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "web" && (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                          Définition
                        </span>
                        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Netteté du PNG">
                          <button
                            type="button"
                            aria-pressed={webResolution === "standard"}
                            onClick={() => setWebResolution("standard")}
                            className={`rounded-lg border px-2.5 py-2 text-left text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                              webResolution === "standard"
                                ? "border-primary-500 bg-primary-50 text-primary-800 dark:bg-primary-950/30 dark:text-primary-200"
                                : "border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
                            }`}
                          >
                            <strong className="block text-[11px]">Standard</strong>
                            E-mail et messagerie
                          </button>
                          <button
                            type="button"
                            aria-pressed={webResolution === "high"}
                            onClick={() => setWebResolution("high")}
                            className={`rounded-lg border px-2.5 py-2 text-left text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                              webResolution === "high"
                                ? "border-primary-500 bg-primary-50 text-primary-800 dark:bg-primary-950/30 dark:text-primary-200"
                                : "border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400"
                            }`}
                          >
                            <strong className="block text-[11px]">Haute définition</strong>
                            Site et grand écran
                          </button>
                        </div>
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                        <input
                          type="checkbox"
                          checked={transparentBg}
                          onChange={(e) => {
                            setTransparentBg(e.target.checked);
                            setWebPreviewUrl(null);
                          }}
                          className={checkboxClass}
                        />
                        <span>Fond transparent</span>
                      </label>
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => run("web-preview")}
                            disabled={busy !== null}
                            className="text-[10px] font-semibold text-primary-700 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 dark:text-primary-300"
                          >
                            {busy === "web-preview" ? "Génération…" : webPreviewUrl ? "Actualiser l’aperçu" : "Voir l’aperçu"}
                          </button>
                        </div>
                        {webPreviewUrl && <div
                          className="flex h-28 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"
                          style={{
                            backgroundColor: transparentBg ? "#f4f4f5" : "#ffffff",
                            backgroundImage: transparentBg
                              ? "linear-gradient(45deg, #d4d4d8 25%, transparent 25%), linear-gradient(-45deg, #d4d4d8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d4d4d8 75%), linear-gradient(-45deg, transparent 75%, #d4d4d8 75%)"
                              : undefined,
                            backgroundPosition: transparentBg ? "0 0, 0 8px, 8px -8px, -8px 0" : undefined,
                            backgroundSize: transparentBg ? "16px 16px" : undefined,
                          }}
                        >
                          <img src={webPreviewUrl} alt="Aperçu de la publication Web" className="max-h-full max-w-full object-contain" />
                        </div>}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2.5 mt-2">
                      <button
                        onClick={() => run("png")}
                        disabled={busy !== null}
                        className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer disabled:opacity-50 ${
                          themeMode === "dark"
                            ? "bg-primary-600 text-white hover:bg-primary-500"
                            : "bg-primary-700 text-white hover:bg-primary-600"
                        }`}
                      >
                        {busy === "png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
                        <span>{busy === "png" ? "Génération du PNG…" : "Télécharger le PNG · Recommandé"}</span>
                      </button>

                      {hasFrames && frames.length > 1 && (
                        <button
                          onClick={() => run("web-zip")}
                          disabled={busy !== null}
                          className={`flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 cursor-pointer ${
                            themeMode === "dark"
                              ? "border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                              : "border-zinc-200 text-zinc-650 hover:bg-zinc-50"
                          }`}
                        >
                          {busy === "web-zip" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                          <span>
                            {busy === "web-zip" && exportProgress
                              ? `Préparation de la page ${exportProgress.current}/${exportProgress.total}…`
                              : `Télécharger les ${frames.length} pages en PNG`}
                          </span>
                        </button>
                      )}

                      <div className="flex gap-2.5">
                        <button
                          onClick={() => run("svg")}
                          disabled={busy !== null}
                          className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
                            themeMode === "dark"
                              ? "border-zinc-850 text-zinc-300 hover:bg-zinc-800"
                              : "border-zinc-200 text-zinc-650 hover:bg-zinc-50"
                          } disabled:opacity-50`}
                        >
                          <FileCode className="h-3.5 w-3.5" />
                          <span>{busy === "svg" ? "Génération…" : "SVG redimensionnable"}</span>
                        </button>
                        <button
                          onClick={() => run("clipboard")}
                          disabled={busy !== null}
                          className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
                            copied
                              ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                              : themeMode === "dark"
                              ? "border-zinc-850 text-zinc-300 hover:bg-zinc-800"
                              : "border-zinc-200 text-zinc-650 hover:bg-zinc-50"
                          } disabled:opacity-50`}
                        >
                          {busy === "clipboard" ? (
                            <Loader2 className="animate-spin h-3.5 w-3.5" />
                          ) : copied ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <span>{busy === "clipboard" ? "Copie…" : copied ? "Image copiée" : "Copier l’image"}</span>
                        </button>
                        </div>
                      </div>
                  </div>
                )}
              </div>

              {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
            </div>
          </div>
        </div>

      </div>
    </div>
    {pdfPreview && (
      <div className="fixed inset-0 z-[60] flex flex-col bg-zinc-950/95 p-4 sm:p-6" role="dialog" aria-modal="true" aria-label="Aperçu du PDF">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 pb-4 text-white">
          <div>
            <h3 className="text-sm font-bold">Aperçu exact du PDF</h3>
            <p className="mt-0.5 text-[11px] text-zinc-400">Ce document est celui qui sera téléchargé.</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={pdfPreview.url}
              download={pdfPreview.filename}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              <Download className="h-4 w-4" />
              Télécharger ce PDF
            </a>
            <button
              type="button"
              onClick={() => setPdfPreview(null)}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3.5 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              <X className="h-4 w-4" />
              Revenir aux réglages
            </button>
          </div>
        </div>
        <iframe
          src={pdfPreview.url}
          title="Aperçu du PDF généré"
          className="mx-auto min-h-0 w-full max-w-6xl flex-1 rounded-xl bg-white shadow-2xl"
        />
      </div>
    )}
    </>
  );
}
