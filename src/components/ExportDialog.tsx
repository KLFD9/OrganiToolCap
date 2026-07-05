import { useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { CARD_HEIGHT, CARD_WIDTH } from "../lib/compactLayout";
import { useOrgChartStore } from "../store/useOrgChartStore";
import {
  computeChromeOffsets,
  copyFlowToClipboard,
  exportFlowToPdf,
  exportFlowToPng,
  exportFlowToSvg,
  exportFramesToPdfImage,
  type FrameImagePage,
  type PdfFormat,
  type PdfOrientation,
} from "../lib/pdfExport";
import { exportFlowToPptx } from "../lib/pptxExport";
import { availableAreaForSetup, estimateReadability, pageAvailableArea } from "../lib/readability";
import { computeHiddenNodeIds } from "../lib/hierarchy";
import { buildFramePages, type FramePageContent } from "../lib/frames";
import { optimizeLayoutForPage, rankCandidates } from "../lib/exportLayout";
import {
  Info,
  ChevronDown,
  Sparkles,
  Loader2,
  FileText,
  Presentation,
  Image,
  FileCode,
  Copy,
  Check,
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
  const layoutState = useOrgChartStore((s) => s.layout);
  const applyLayoutCandidate = useOrgChartStore((s) => s.applyLayoutCandidate);
  const storeNodes = useOrgChartStore((s) => s.nodes);
  const storeEdges = useOrgChartStore((s) => s.edges);
  const collapsedNodeIds = useOrgChartStore((s) => s.collapsedNodeIds);
  const toFile = useOrgChartStore((s) => s.toFile);
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
  const [pptxEditable, setPptxEditable] = useState(true);
  const [pdfVector, setPdfVector] = useState(true);
  const [transparentBg, setTransparentBg] = useState(false);
  
  // Onglet d'export sélectionné
  const [activeTab, setActiveTab] = useState<"pdf" | "pptx" | "image">("pdf");

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
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [optimizeNotice, setOptimizeNotice] = useState<string | null>(null);

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
    let worst: { name: string; fontPt: number; rating: "good" | "warn" | "bad"; cardWidthMm: number } | null = null;
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
      const est = estimateReadability(
        (Math.max(...xs) - Math.min(...xs) + CARD_WIDTH) * 1.12,
        (Math.max(...ys) - Math.min(...ys) + CARD_HEIGHT) * 1.12,
        avail.width,
        avail.height
      );
      if (!worst || est.fontPt < worst.fontPt) worst = { name: p.frame.name, ...est };
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

  if (!open) return null;

  /** Zone utile de la page (mm) pour l'orientation donnée, en-tête/pied déduits. */
  const availFor = (o: PdfOrientation) => {
    const chrome = computeChromeOffsets(
      {
        format,
        orientation: o,
        margin,
        title: includeTitle ? meta.title : undefined,
        footer: includeFooter ? meta.footer : undefined,
        logoUrl: includeLogos ? theme.logoUrl : undefined,
        secondaryLogoUrl: includeLogos ? theme.secondaryLogoUrl : undefined,
      },
      margin
    );
    return pageAvailableArea(format, o, margin, chrome.topOffset, chrome.bottomOffset);
  };

  /**
   * Essaie plusieurs dispositions (actuelle, arbre vertical/horizontal,
   * compacte), applique celle qui donne le plus grand texte imprimé sur ce
   * format, et suggère l'autre orientation si elle ferait nettement mieux.
   */
  const handleOptimize = async () => {
    setError(null);
    setOptimizeNotice(null);
    setBusy("optimize");
    try {
      const ranked = await optimizeLayoutForPage(visibleNodes, visibleEdges, layoutState, availFor(orientation));
      const best = ranked[0];
      const current = ranked.find((c) => c.id === "current") ?? best;

      const other: PdfOrientation = orientation === "landscape" ? "portrait" : "landscape";
      const otherArea = availFor(other);
      const bestOther = rankCandidates(ranked, otherArea.width, otherArea.height)[0];
      const orientationHint =
        bestOther.estimate.fontPt > best.estimate.fontPt + 1
          ? ` Astuce : en ${other === "portrait" ? "portrait" : "paysage"}, « ${bestOther.label} » atteindrait ${bestOther.estimate.fontPt} pt.`
          : "";
      const escalationHint =
        best.estimate.rating === "good"
          ? ""
          : " Pour aller plus loin : format A3, marges réduites ou multi-pages.";

      if (best.id === "current") {
        setOptimizeNotice(
          `La disposition actuelle est déjà la meilleure pour ce format (texte ≈ ${best.estimate.fontPt} pt).${escalationHint}${orientationHint}`
        );
      } else {
        applyLayoutCandidate(best.nodes, best.layout);
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        requestAnimationFrame(() => fitView({ duration: reduceMotion ? 0 : 300, padding: 0.2 }));
        setOptimizeNotice(
          `« ${best.label} » appliquée : texte ${current.estimate.fontPt} pt → ${best.estimate.fontPt} pt. Ctrl+Z pour revenir en arrière.${escalationHint}${orientationHint}`
        );
      }
    } catch (err) {
      console.error(err);
      setError("L'optimisation de la disposition a échoué.");
    } finally {
      setBusy(null);
    }
  };

  const run = async (kind: "pdf" | "pptx" | "png" | "svg" | "clipboard" | "pack") => {
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
    if (hasFrames && scope !== "all") {
      const inScope = new Set(framePages.flatMap((p) => p.nodes.map((n) => n.id)));
      nodes = nodes.filter((n) => inScope.has(n.id));
    }
    if (hasFrames && framePages.reduce((total, p) => total + p.nodes.length, 0) === 0) {
      setError(scope === "all" ? "Toutes les pages sont vides." : "Cette page est vide.");
      return;
    }
    if (!hasFrames && nodes.length === 0) {
      setError("Aucun membre à exporter.");
      return;
    }
    setError(null);
    setBusy(kind);

    // Désélectionne temporairement les nœuds pour ne pas capturer le surlignage de sélection,
    // et masque le cadre de page (feuille, bandes d'en-tête/pied, jauge de lisibilité) : un
    // repère d'édition, jamais destiné à apparaître dans les exports rasterisés (PNG/SVG/PDF image).
    // Les exports « natifs » (PDF vectoriel, PPTX éditable) ne capturent pas le DOM : inutile
    // de faire clignoter le canvas pour eux.
    const capturesDom =
      kind === "png" ||
      kind === "svg" ||
      kind === "clipboard" ||
      kind === "pack" || // les PNG par page du pack capturent le DOM
      (kind === "pdf" && !(pdfVector && (hasFrames || !multiPage))) ||
      (kind === "pptx" && !pptxEditable);
    const hadSelection = capturesDom && selectedNodeIds.length > 0;
    const hadPageGuide = capturesDom && pageGuideVisible;
    if (hadSelection || hadPageGuide) {
      if (hadSelection) selectNodes([]);
      if (hadPageGuide) togglePageGuide();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }

    try {
      if (kind === "pdf") {
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
            const { exportFramesToPdfVector } = await import("../lib/pdfVector");
            await exportFramesToPdfVector(framePages, theme, common);
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
              rfNodes: p.nodes
                .map((n) => rfById.get(n.id))
                .filter((n): n is NonNullable<typeof n> => Boolean(n)),
            }));
            await exportFramesToPdfImage(el, pages, common);
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
            const { exportFlowToPdfVector } = await import("../lib/pdfVector");
            await exportFlowToPdfVector(visibleNodes, visibleEdges, theme, pdfOptions);
          } else {
            await exportFlowToPdf(el, nodes, pdfOptions);
          }
        }
      } else if (kind === "pptx") {
        const pptxOptions = {
          title: includeTitle ? meta.title : undefined,
          subtitle: includeTitle ? meta.subtitle : undefined,
          footer: includeFooter ? meta.footer : undefined,
          logoUrl: includeLogos ? theme.logoUrl : undefined,
          secondaryLogoUrl: includeLogos ? theme.secondaryLogoUrl : undefined,
          accent: theme.accent,
        };
        // Le .orgchart.json est embarqué dans le .pptx (round-trip)
        const chartJson = JSON.stringify(toFile(), null, 2);
        if (pptxEditable && hasFrames) {
          // Une diapositive par page du périmètre
          const { exportFramesToPptxEditable } = await import("../lib/pptxEditable");
          await exportFramesToPptxEditable(framePages, theme, pptxOptions, chartJson);
        } else if (pptxEditable) {
          const { exportFlowToPptxEditable } = await import("../lib/pptxEditable");
          await exportFlowToPptxEditable(visibleNodes, visibleEdges, theme, pptxOptions, chartJson);
        } else {
          await exportFlowToPptx(el, nodes, pptxOptions, chartJson);
        }
      } else if (kind === "pack") {
        // Pack de diffusion : PDF multi-pages + un PNG par page + annuaire CSV
        const { exportDiffusionPack } = await import("../lib/diffusionPack");
        const rfById = new Map(nodes.map((n) => [n.id, n]));
        await exportDiffusionPack(el, {
          pages: framePages,
          rfNodesPerPage: framePages.map((p) =>
            p.nodes.map((n) => rfById.get(n.id)).filter((n): n is NonNullable<typeof n> => Boolean(n))
          ),
          theme,
          common: {
            docTitle: meta.title,
            docSubtitle: includeTitle ? meta.subtitle : undefined,
            footer: includeFooter ? meta.footer : undefined,
            logoUrl: includeLogos ? theme.logoUrl : undefined,
            secondaryLogoUrl: includeLogos ? theme.secondaryLogoUrl : undefined,
          },
          directory: { nodes: visibleNodes, edges: visibleEdges },
        });
      } else if (kind === "clipboard") {
        await copyFlowToClipboard(el, nodes);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } else if (kind === "png") {
        await exportFlowToPng(el, nodes, `${meta.title || "organigramme"}.png`, { transparent: transparentBg });
      } else {
        await exportFlowToSvg(el, nodes, `${meta.title || "organigramme"}.svg`, { transparent: transparentBg });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full max-w-3xl overflow-hidden rounded-3xl border shadow-2xl transition-all max-h-[92vh] flex flex-col ${
          themeMode === "dark"
            ? "border-border-dark bg-panel-bg-dark text-text-dark"
            : "border-border-light bg-panel-bg-light text-text-light"
        }`}
      >
        {/* En-tête fixe */}
        <div className="px-6 py-4 border-b border-zinc-200/60 dark:border-zinc-800 flex justify-between items-center">
          <div>
            <h2 className="text-base font-bold tracking-tight text-zinc-800 dark:text-zinc-100">
              Exporter l'organigramme
            </h2>
            <p className="mt-1 text-xs text-zinc-450 dark:text-zinc-500 leading-normal">
              Ajustez le format, configurez la page et téléchargez votre fichier.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-650 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition-all cursor-pointer"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Corps défilable : Double Colonne */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Colonne Gauche : Configuration de la page */}
            <div className="flex flex-col gap-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-900 pb-2">
                1. Mise en page & Contenu
              </h3>

              {/* Périmètre (mode multi-pages) */}
              {hasFrames && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-455 dark:text-zinc-500">
                    Pages à exporter
                  </span>
                  <div className="relative">
                    <select value={scope} onChange={(e) => setScope(e.target.value)} className={selectClass}>
                      <option value="all">Toutes les pages ({frames.length})</option>
                      {frames.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                  </div>
                  <span className="text-[10px] leading-normal text-zinc-400 dark:text-zinc-500">
                    Le format papier de chaque page (A4/A3, orientation, marges) est celui de sa feuille sur le
                    canevas.
                  </span>
                </label>
              )}

              {/* Format de page & Orientation */}
              {!hasFrames && (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-455 dark:text-zinc-500">
                    Format de page
                  </span>
                  <div className="relative">
                    <select
                      value={format}
                      onChange={(e) => {
                        const value = e.target.value as PdfFormat;
                        setFormat(value);
                        setPageSetup({ format: value, orientation, margin });
                      }}
                      className={selectClass}
                    >
                      <option value="a4">A4</option>
                      <option value="a3">A3</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
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
                        setPageSetup({ format, orientation: value, margin });
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
              {!hasFrames && (
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
                    setPageSetup({ format, orientation, margin: value });
                  }}
                  className="w-full accent-primary-600 dark:accent-primary-400 cursor-pointer bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none h-1"
                />
              </div>
              )}

              {/* Options de contenu */}
              <div className="flex flex-col gap-3 rounded-xl border border-zinc-150/80 dark:border-zinc-800/80 bg-zinc-50/30 dark:bg-zinc-900/10 p-3.5">
                <label className="flex items-center gap-3 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeTitle}
                    onChange={(e) => setIncludeTitle(e.target.checked)}
                    className={checkboxClass}
                  />
                  <span className="font-medium">Inclure le titre et en-tête</span>
                </label>
                <label className="flex items-center gap-3 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeLogos}
                    onChange={(e) => setIncludeLogos(e.target.checked)}
                    className={checkboxClass}
                  />
                  <span className="font-medium">Inclure les logos</span>
                </label>
                <label className="flex items-center gap-3 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeFooter}
                    onChange={(e) => setIncludeFooter(e.target.checked)}
                    className={checkboxClass}
                  />
                  <span className="font-medium">Inclure le pied de page</span>
                </label>
                {!hasFrames && (
                <label className="flex items-start gap-3 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer border-t border-zinc-150/50 dark:border-zinc-800 pt-2.5 mt-0.5">
                  <input
                    type="checkbox"
                    checked={multiPage}
                    onChange={(e) => setMultiPage(e.target.checked)}
                    className={`${checkboxClass} mt-0.5`}
                  />
                  <span className="font-medium">
                    Répartir sur plusieurs pages <span className="text-[10px] text-zinc-450 dark:text-zinc-500 font-normal">(Grand Format)</span>
                    <span className="mt-0.5 block text-[10px] font-normal text-zinc-400 dark:text-zinc-500 leading-normal">
                      Découpé pour impression sur plusieurs feuilles.
                    </span>
                  </span>
                </label>
                )}
              </div>

              {/* Jauge de lisibilité par page (mode multi-pages) */}
              {frameReadability && (
                <div
                  className={`rounded-xl border p-3.5 transition-all ${
                    frameReadability.rating === "good"
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : frameReadability.rating === "warn"
                      ? "border-amber-500/20 bg-amber-500/5"
                      : "border-red-500/20 bg-red-500/5"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        frameReadability.rating === "good"
                          ? "bg-emerald-500 animate-pulse"
                          : frameReadability.rating === "warn"
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                    />
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                      {frameReadability.rating === "good"
                        ? "Toutes les pages sont lisibles"
                        : `Page la moins lisible : ${frameReadability.name}`}
                    </span>
                    <span className="ml-auto font-mono text-[9px] text-zinc-450 dark:text-zinc-500">
                      texte ≈ {frameReadability.fontPt} pt
                    </span>
                  </div>
                  {frameReadability.rating !== "good" && (
                    <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                      Réduisez le contenu de cette page (glissez des cartes vers une autre page, ou créez une page
                      par branche), ou passez sa feuille en A3.
                    </p>
                  )}
                </div>
              )}

              {/* Jauge de lisibilité */}
              {readability && (
                <div
                  className={`rounded-xl border p-3.5 transition-all ${
                    readability.rating === "good"
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : readability.rating === "warn"
                      ? "border-amber-500/20 bg-amber-500/5"
                      : "border-red-500/20 bg-red-500/5"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        readability.rating === "good"
                          ? "bg-emerald-500 animate-pulse"
                          : readability.rating === "warn"
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                    />
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                      {readability.rating === "good"
                        ? "Document très lisible"
                        : readability.rating === "warn"
                        ? "Lisibilité limite"
                        : "Document illisible à cette échelle"}
                    </span>
                    <span className="ml-auto font-mono text-[9px] text-zinc-450 dark:text-zinc-500">
                      texte ≈ {readability.fontPt} pt · carte ≈ {readability.cardWidthMm} mm
                    </span>
                  </div>
                  {readability.rating !== "good" && (
                    <div className="mt-2.5 flex flex-col gap-2">
                      <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                        L'organigramme est grand. L'optimiseur recherche les dispositions pour maximiser la taille du texte.
                      </p>
                      <button
                        onClick={handleOptimize}
                        disabled={busy !== null}
                        className={`self-start rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all hover:scale-102 active:scale-98 cursor-pointer disabled:opacity-50 ${
                          themeMode === "dark"
                            ? "bg-primary-600 text-white hover:bg-primary-500"
                            : "bg-primary-700 text-white hover:bg-primary-600"
                        }`}
                      >
                        {busy === "optimize" ? (
                          <span className="flex items-center gap-1.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Optimisation…</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>Optimiser la disposition</span>
                          </span>
                        )}
                      </button>
                    </div>
                  )}
                  {optimizeNotice && (
                    <p className="mt-2.5 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300 border-t border-zinc-200/60 dark:border-zinc-800 pt-2.5">
                      {optimizeNotice}
                    </p>
                  )}
                </div>
              )}

              {/* Exclusion par repli */}
              {hiddenIds.size > 0 && (
                <div className="flex items-start gap-2.5 rounded-xl border border-primary-600/20 bg-primary-600/5 dark:border-primary-400/20 dark:bg-primary-400/5 p-3">
                  <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary-750 dark:text-primary-300" />
                  <p className="text-[11px] leading-relaxed text-primary-800 dark:text-primary-200">
                    L'export est partiel : {hiddenIds.size} membre{hiddenIds.size > 1 ? "s" : ""} de branches repliées ser{hiddenIds.size > 1 ? "ont" : "a"} exclu{hiddenIds.size > 1 ? "s" : ""}.
                  </p>
                </div>
              )}
            </div>

            {/* Colonne Droite : Formats d'exportation */}
            <div className="flex flex-col gap-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-900 pb-2">
                2. Format d'export & Téléchargement
              </h3>

              {/* Segmented control / Onglets */}
              <div className="flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900/60 border border-zinc-200/50 dark:border-zinc-800/85 shadow-inner">
                <button
                  type="button"
                  onClick={() => setActiveTab("pdf")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    activeTab === "pdf"
                      ? "bg-white text-zinc-850 shadow-sm dark:bg-zinc-800 dark:text-zinc-100 font-bold"
                      : "text-zinc-400 hover:text-zinc-650 dark:text-zinc-500 dark:hover:text-zinc-300"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("pptx")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    activeTab === "pptx"
                      ? "bg-white text-zinc-850 shadow-sm dark:bg-zinc-800 dark:text-zinc-100 font-bold"
                      : "text-zinc-400 hover:text-zinc-650 dark:text-zinc-500 dark:hover:text-zinc-300"
                  }`}
                >
                  <Presentation className="h-3.5 w-3.5" />
                  <span>PowerPoint</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("image")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    activeTab === "image"
                      ? "bg-white text-zinc-850 shadow-sm dark:bg-zinc-800 dark:text-zinc-100 font-bold"
                      : "text-zinc-400 hover:text-zinc-650 dark:text-zinc-500 dark:hover:text-zinc-300"
                  }`}
                >
                  <Image className="h-3.5 w-3.5" />
                  <span>Image</span>
                </button>
              </div>

              {/* Contenu de l'onglet actif */}
              <div className="flex-1 flex flex-col justify-between min-h-[220px]">
                {activeTab === "pdf" && (
                  <div className="flex flex-col gap-4">
                    <div className="rounded-xl border border-zinc-150 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/10 p-3.5 flex flex-col gap-3">
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">Options PDF</span>
                      <label className="flex items-start gap-3 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pdfVector && (hasFrames || !multiPage)}
                          disabled={!hasFrames && multiPage}
                          onChange={(e) => setPdfVector(e.target.checked)}
                          className={`${checkboxClass} mt-0.5`}
                        />
                        <span className={!hasFrames && multiPage ? "opacity-50" : ""}>
                          PDF vectoriel natif (texte net)
                          <span className="mt-0.5 block text-[10px] leading-normal font-normal text-zinc-400 dark:text-zinc-500">
                            Texte infiniment net et fichier très léger. Photos non incluses.
                          </span>
                        </span>
                      </label>
                    </div>

                    <button
                      onClick={() => run("pdf")}
                      disabled={busy !== null}
                      className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
                        themeMode === "dark"
                          ? "bg-primary-600 text-white hover:bg-primary-500"
                          : "bg-primary-700 text-white hover:bg-primary-600"
                      } disabled:opacity-50 mt-2`}
                    >
                      {busy === "pdf" ? (
                        <>
                          <Loader2 className="animate-spin h-4 w-4" />
                          <span>Génération PDF en cours...</span>
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4" />
                          <span>Télécharger le PDF</span>
                        </>
                      )}
                    </button>

                    {/* Pack de diffusion : un seul geste pour l'envoi mensuel */}
                    {hasFrames && (
                      <button
                        onClick={() => run("pack")}
                        disabled={busy !== null}
                        className={`flex w-full items-center justify-center gap-2 rounded-xl border py-2.5 text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer disabled:opacity-50 ${
                          themeMode === "dark"
                            ? "border-zinc-850 text-zinc-300 hover:bg-zinc-800"
                            : "border-zinc-200 text-zinc-650 hover:bg-zinc-50"
                        }`}
                        title="PDF multi-pages + un PNG par page + annuaire CSV, dans un zip"
                      >
                        {busy === "pack" ? (
                          <>
                            <Loader2 className="animate-spin h-3.5 w-3.5" />
                            <span>Assemblage du pack...</span>
                          </>
                        ) : (
                          <span>
                            Pack de diffusion (.zip)
                            <span className="mt-0.5 block text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                              PDF multi-pages + PNG par page + annuaire CSV
                            </span>
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {activeTab === "pptx" && (
                  <div className="flex flex-col gap-4">
                    <div className="rounded-xl border border-zinc-150 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/10 p-3.5 flex flex-col gap-3">
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">Options PowerPoint</span>
                      <label className="flex items-start gap-3 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pptxEditable}
                          onChange={(e) => setPptxEditable(e.target.checked)}
                          className={`${checkboxClass} mt-0.5`}
                        />
                        <span>
                          Éléments modifiables dans PowerPoint
                          <span className="mt-0.5 block text-[10px] leading-normal font-normal text-zinc-400 dark:text-zinc-500">
                            Les cartes et liens deviennent des formes éditables natives PowerPoint.
                          </span>
                        </span>
                      </label>
                    </div>

                    <button
                      onClick={() => run("pptx")}
                      disabled={busy !== null}
                      className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
                        themeMode === "dark"
                          ? "bg-orange-700/80 text-white hover:bg-orange-600/80"
                          : "bg-[#C43E1C] text-white hover:bg-[#a83419]"
                      } disabled:opacity-50 mt-2`}
                    >
                      {busy === "pptx" ? (
                        <>
                          <Loader2 className="animate-spin h-4 w-4" />
                          <span>Génération PPTX en cours...</span>
                        </>
                      ) : (
                        <>
                          <Presentation className="h-4 w-4" />
                          <span>Télécharger le diaporama (.pptx)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {activeTab === "image" && (
                  <div className="flex flex-col gap-4">
                    <div className="rounded-xl border border-zinc-150 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/10 p-3.5 flex flex-col gap-3">
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">Options Image</span>
                      <label className="flex items-start gap-3 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={transparentBg}
                          onChange={(e) => setTransparentBg(e.target.checked)}
                          className={`${checkboxClass} mt-0.5`}
                        />
                        <span>
                          Fond transparent
                          <span className="mt-0.5 block text-[10px] leading-normal font-normal text-zinc-400 dark:text-zinc-500">
                            Idéal pour insérer l'image sur une présentation ou un fond coloré externe.
                          </span>
                        </span>
                      </label>
                    </div>

                    <div className="flex flex-col gap-2.5 mt-2">
                      <div className="flex gap-2.5">
                        <button
                          onClick={() => run("png")}
                          disabled={busy !== null}
                          className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
                            themeMode === "dark"
                              ? "border-zinc-850 text-zinc-300 hover:bg-zinc-800"
                              : "border-zinc-200 text-zinc-650 hover:bg-zinc-50"
                          } disabled:opacity-50`}
                        >
                          <Image className="h-3.5 w-3.5" />
                          <span>{busy === "png" ? "Génération..." : "Télécharger PNG"}</span>
                        </button>
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
                          <span>{busy === "svg" ? "Génération..." : "Télécharger SVG"}</span>
                        </button>
                      </div>

                      <button
                        onClick={() => run("clipboard")}
                        disabled={busy !== null}
                        className={`flex w-full items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
                          copied
                            ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                            : themeMode === "dark"
                            ? "border-zinc-850 text-zinc-300 hover:bg-zinc-800"
                            : "border-zinc-200 text-zinc-650 hover:bg-zinc-50"
                        } disabled:opacity-50`}
                      >
                        {busy === "clipboard" ? (
                          <>
                            <Loader2 className="animate-spin h-3.5 w-3.5" />
                            <span>Copie...</span>
                          </>
                        ) : copied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                            <span>Copié dans le presse-papiers !</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copier l'image</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
            </div>
          </div>
        </div>

        {/* Pied de page fixe */}
        <div className="px-6 py-3.5 border-t border-zinc-200/60 dark:border-zinc-800 flex justify-end bg-zinc-50/50 dark:bg-zinc-950/20">
          <button
            onClick={onClose}
            className={`rounded-lg px-4 py-2 text-xs font-semibold shadow-sm transition-all border cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
              themeMode === "dark"
                ? "border-zinc-800 bg-zinc-900 text-zinc-300"
                : "border-zinc-200 bg-white text-zinc-650"
            }`}
          >
            Fermer la fenêtre
          </button>
        </div>
      </div>
    </div>
  );
}
