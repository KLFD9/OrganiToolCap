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
  type PdfFormat,
  type PdfOrientation,
} from "../lib/pdfExport";
import { exportFlowToPptx } from "../lib/pptxExport";
import { estimateReadability, pageAvailableArea } from "../lib/readability";
import { computeHiddenNodeIds } from "../lib/hierarchy";
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
  Check
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
  const layoutState = useOrgChartStore((s) => s.layout);
  const applyLayoutCandidate = useOrgChartStore((s) => s.applyLayoutCandidate);
  const storeNodes = useOrgChartStore((s) => s.nodes);
  const storeEdges = useOrgChartStore((s) => s.edges);
  const collapsedNodeIds = useOrgChartStore((s) => s.collapsedNodeIds);
  const toFile = useOrgChartStore((s) => s.toFile);
  const { getNodes, fitView } = useReactFlow();
  const [format, setFormat] = useState<PdfFormat>("a4");
  const [orientation, setOrientation] = useState<PdfOrientation>("landscape");
  const [margin, setMargin] = useState(10);
  const [includeTitle, setIncludeTitle] = useState(true);
  const [includeFooter, setIncludeFooter] = useState(true);
  const [includeLogos, setIncludeLogos] = useState(true);
  const [multiPage, setMultiPage] = useState(false);
  const [pptxEditable, setPptxEditable] = useState(true);
  const [pdfVector, setPdfVector] = useState(true);
  const [transparentBg, setTransparentBg] = useState(false);

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

  // Lisibilité estimée du document : taille réelle du texte une fois
  // l'organigramme ajusté à la page (sans objet en multi-pages).
  const readability = useMemo(() => {
    if (!open || multiPage || visibleNodes.length === 0) return null;
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

  const run = async (kind: "pdf" | "pptx" | "png" | "svg" | "clipboard") => {
    const el = getViewportElement();
    if (!el) {
      setError("Le canevas n'est pas prêt.");
      return;
    }
    const nodes = getNodes();
    if (nodes.length === 0) {
      setError("Aucun membre à exporter.");
      return;
    }
    setError(null);
    setBusy(kind);

    // Désélectionne temporairement les nœuds pour ne pas capturer le surlignage de sélection
    const hadSelection = selectedNodeIds.length > 0;
    if (hadSelection) {
      selectNodes([]);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }

    try {
      if (kind === "pdf") {
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
        };
        // Vectoriel natif : cartes dessinées dans le PDF (texte net, fichier
        // léger). Le multi-pages reste en capture image haute résolution.
        if (pdfVector && !multiPage) {
          const { exportFlowToPdfVector } = await import("../lib/pdfVector");
          await exportFlowToPdfVector(visibleNodes, visibleEdges, theme, pdfOptions);
        } else {
          await exportFlowToPdf(el, nodes, pdfOptions);
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
        // Le .orgchart.json is embedded in the .pptx
        const chartJson = JSON.stringify(toFile(), null, 2);
        if (pptxEditable) {
          const { exportFlowToPptxEditable } = await import("../lib/pptxEditable");
          await exportFlowToPptxEditable(visibleNodes, visibleEdges, theme, pptxOptions, chartJson);
        } else {
          await exportFlowToPptx(el, nodes, pptxOptions, chartJson);
        }
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
        className={`w-full max-w-md overflow-y-auto rounded-3xl border p-6 shadow-2xl transition-all max-h-[85vh] custom-scrollbar ${
          themeMode === "dark"
            ? "border-border-dark bg-panel-bg-dark text-text-dark"
            : "border-border-light bg-panel-bg-light text-text-light"
        }`}
      >
        <h2 className="text-base font-bold tracking-tight text-zinc-800 dark:text-zinc-100">
          Exporter l'organigramme
        </h2>
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500 leading-normal">
          Exportez votre organigramme sous forme de document vectoriel ou d'image haute définition.
        </p>

        {/* Export WYSIWYG : signale les membres exclus par le repli de branches */}
        {hiddenIds.size > 0 && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-primary-600/25 bg-primary-600/5 dark:border-primary-400/25 dark:bg-primary-400/5 p-3">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary-700 dark:text-primary-300" />
            <p className="text-[11px] leading-relaxed text-primary-800 dark:text-primary-200">
              L'export reflète l'affichage actuel : {hiddenIds.size} membre{hiddenIds.size > 1 ? "s" : ""} de
              branches repliées n'y figurer{hiddenIds.size > 1 ? "ont" : "a"} pas. Dépliez les branches avant
              d'exporter pour un organigramme complet — ou repliez-en pour exporter une vue partielle.
            </p>
          </div>
        )}

        {/* Configuration PDF */}
        <div className="grid grid-cols-2 gap-3 mt-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Format de page
            </span>
            <div className="relative">
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as PdfFormat)}
                className={selectClass}
              >
                <option value="a4">A4</option>
                <option value="a3">A3</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
            </div>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Orientation
            </span>
            <div className="relative">
              <select
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as PdfOrientation)}
                className={selectClass}
              >
                <option value="landscape">Paysage</option>
                <option value="portrait">Portrait</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
            </div>
          </label>
        </div>

        {/* Marge */}
        <div className="flex flex-col gap-1.5 mt-4">
          <span className="flex justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            <span>Marges du document</span>
            <span className="font-mono text-zinc-550">{margin} mm</span>
          </span>
          <input
            type="range"
            min={0}
            max={30}
            value={margin}
            onChange={(e) => setMargin(Number(e.target.value))}
            className="w-full accent-primary-600 dark:accent-primary-400 cursor-pointer bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none h-1"
          />
        </div>

        {/* Options de contenu */}
        <div className="mt-5 flex flex-col gap-3">
          <label className="flex items-center gap-3 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeTitle}
              onChange={(e) => setIncludeTitle(e.target.checked)}
              className={checkboxClass}
            />
            <span>Inclure le titre et sous-titre en en-tête</span>
          </label>
          <label className="flex items-center gap-3 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeLogos}
              onChange={(e) => setIncludeLogos(e.target.checked)}
              className={checkboxClass}
            />
            <span>Inclure les logos de l'entreprise</span>
          </label>
          <label className="flex items-center gap-3 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeFooter}
              onChange={(e) => setIncludeFooter(e.target.checked)}
              className={checkboxClass}
            />
            <span>Inclure le pied de page</span>
          </label>
          <label className="flex items-start gap-3 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={multiPage}
              onChange={(e) => setMultiPage(e.target.checked)}
              className={`${checkboxClass} mt-0.5`}
            />
            <span>
              Répartir sur plusieurs pages (impression grand format)
              <span className="mt-0.5 block text-[10px] text-zinc-400 dark:text-zinc-500">
                Désactivé : l'organigramme est ajusté dynamiquement pour tenir sur une seule page.
              </span>
            </span>
          </label>
        </div>

        {/* Jauge de lisibilité du document */}
        {readability && (
          <div
            className={`mt-5 rounded-xl border p-3.5 ${
              readability.rating === "good"
                ? "border-emerald-500/25 bg-emerald-500/5"
                : readability.rating === "warn"
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-red-500/30 bg-red-500/5"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  readability.rating === "good"
                    ? "bg-emerald-500"
                    : readability.rating === "warn"
                    ? "bg-amber-500"
                    : "bg-red-500"
                }`}
              />
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                {readability.rating === "good"
                  ? "Document lisible"
                  : readability.rating === "warn"
                  ? "Lisibilité limite"
                  : "Document illisible à cette échelle"}
              </span>
              <span className="ml-auto font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                texte ≈ {readability.fontPt} pt · carte ≈ {readability.cardWidthMm} mm
              </span>
            </div>
            {readability.rating !== "good" && (
              <div className="mt-2.5 flex flex-col gap-2">
                <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  L'organigramme est trop étendu pour cette page : une fois ajusté, le nom des
                  cartes fera {readability.fontPt} pt à l'impression. L'optimiseur compare
                  plusieurs dispositions (arbre vertical, horizontal, compacte) et applique
                  celle qui donne le plus grand texte sur ce format.
                </p>
                <button
                  onClick={handleOptimize}
                  disabled={busy !== null}
                  className={`self-start rounded-lg px-3.5 py-1.5 text-[11px] font-semibold transition-all hover:scale-102 active:scale-98 cursor-pointer disabled:opacity-50 ${
                    themeMode === "dark"
                      ? "bg-primary-600 text-white hover:bg-primary-500"
                      : "bg-primary-700 text-white hover:bg-primary-600"
                  }`}
                >
                  {busy === "optimize" ? (
                    <span className="flex items-center gap-1.5 justify-center">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Analyse des dispositions…</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 justify-center">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Optimiser la disposition pour cette page</span>
                    </span>
                  )}
                </button>
              </div>
            )}
            {optimizeNotice && (
              <p
                role="status"
                className="mt-2.5 text-[11px] leading-relaxed text-zinc-655 dark:text-zinc-300 border-t border-zinc-200/60 dark:border-zinc-800 pt-2.5"
              >
                {optimizeNotice}
              </p>
            )}
          </div>
        )}

        {error && <p className="mt-4 text-xs text-red-500">{error}</p>}

        {/* Boutons d'export */}
        <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-900 flex flex-col gap-2.5">
          <button
            onClick={() => run("pdf")}
            disabled={busy !== null}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold shadow-sm transition-all hover:scale-101 active:scale-99 cursor-pointer ${
              themeMode === "dark"
                ? "bg-primary-600 text-white hover:bg-primary-500"
                : "bg-primary-700 text-white hover:bg-primary-600"
            } disabled:opacity-50`}
          >
            {busy === "pdf" ? (
              <>
                <Loader2 className="animate-spin h-4 w-4" />
                <span>Exportation PDF en cours...</span>
              </>
            ) : (
              <>
                <FileText className="h-4 w-4" />
                <span>Télécharger le PDF</span>
              </>
            )}
          </button>

          <label className="flex items-start gap-3 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer px-1">
            <input
              type="checkbox"
              checked={pdfVector && !multiPage}
              disabled={multiPage}
              onChange={(e) => setPdfVector(e.target.checked)}
              className={`${checkboxClass} mt-0.5`}
            />
            <span className={multiPage ? "opacity-50" : ""}>
              PDF vectoriel natif (texte net)
              <span className="mt-0.5 block text-[10px] text-zinc-400 dark:text-zinc-500">
                Coché : cartes dessinées en vectoriel — texte parfaitement net à toutes les échelles,
                fichier léger. Polices standardisées, photos non incluses. Décoché
                {multiPage ? " (ou multi-pages)" : ""} : capture image haute résolution, fidèle au
                pixel près.
              </span>
            </span>
          </label>

          <button
            onClick={() => run("pptx")}
            disabled={busy !== null}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold shadow-sm transition-all hover:scale-101 active:scale-99 cursor-pointer ${
              themeMode === "dark"
                ? "bg-orange-700/80 text-white hover:bg-orange-600/80"
                : "bg-[#C43E1C] text-white hover:bg-[#a83419]"
            } disabled:opacity-50`}
          >
            {busy === "pptx" ? (
              <>
                <Loader2 className="animate-spin h-4 w-4" />
                <span>Génération PowerPoint...</span>
              </>
            ) : (
              <>
                <Presentation className="h-4 w-4" />
                <span>Diapositive PowerPoint (.pptx)</span>
              </>
            )}
          </button>

          <label className="flex items-start gap-3 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer px-1">
            <input
              type="checkbox"
              checked={pptxEditable}
              onChange={(e) => setPptxEditable(e.target.checked)}
              className={`${checkboxClass} mt-0.5`}
            />
            <span>
              Éléments éditables dans PowerPoint
              <span className="mt-0.5 block text-[10px] text-zinc-400 dark:text-zinc-500">
                Coché : cartes et liens deviennent des formes natives, modifiables par le destinataire.
                Décoché : image figée, fidèle au pixel près. Dans les deux cas, le fichier se réimporte
                ici à l'identique via « Ouvrir ».
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer px-1">
            <input
              type="checkbox"
              checked={transparentBg}
              onChange={(e) => setTransparentBg(e.target.checked)}
              className={`${checkboxClass} mt-0.5`}
            />
            <span>
              Fond transparent (PNG / SVG)
              <span className="mt-0.5 block text-[10px] text-zinc-400 dark:text-zinc-500">
                Idéal pour intégrer l'organigramme sur un fond de slide ou une charte graphique existante.
              </span>
            </span>
          </label>

          <div className="flex gap-2.5">
            <button
              onClick={() => run("png")}
              disabled={busy !== null}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition-all hover:scale-101 active:scale-99 cursor-pointer ${
                themeMode === "dark"
                  ? "border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                  : "border-zinc-200 text-zinc-650 hover:bg-zinc-50"
              } disabled:opacity-50`}
            >
              <Image className="h-3.5 w-3.5" />
              <span>{busy === "png" ? "Génération..." : "PNG Image"}</span>
            </button>
            <button
              onClick={() => run("svg")}
              disabled={busy !== null}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition-all hover:scale-101 active:scale-99 cursor-pointer ${
                themeMode === "dark"
                  ? "border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                  : "border-zinc-200 text-zinc-650 hover:bg-zinc-50"
              } disabled:opacity-50`}
            >
              <FileCode className="h-3.5 w-3.5" />
              <span>{busy === "svg" ? "Génération..." : "SVG Fichier"}</span>
            </button>
          </div>

          <button
            onClick={() => run("clipboard")}
            disabled={busy !== null}
            className={`flex w-full items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition-all hover:scale-101 active:scale-99 cursor-pointer ${
              copied
                ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5"
                : themeMode === "dark"
                ? "border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                : "border-zinc-200 text-zinc-650 hover:bg-zinc-50"
            } disabled:opacity-50`}
          >
            {busy === "clipboard" ? (
              <>
                <Loader2 className="animate-spin h-3.5 w-3.5" />
                <span>Copie en cours...</span>
              </>
            ) : copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span>Copié dans le presse-papiers !</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copier l'image (presse-papiers)</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            className="mt-2 text-center text-xs font-semibold text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors cursor-pointer"
          >
            Fermer la fenêtre
          </button>
        </div>
      </div>
    </div>
  );
}
