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
  const layoutMode = useOrgChartStore((s) => s.layout.mode);
  const applyCompactLayout = useOrgChartStore((s) => s.applyCompactLayout);
  const storeNodes = useOrgChartStore((s) => s.nodes);
  const storeEdges = useOrgChartStore((s) => s.edges);
  const toFile = useOrgChartStore((s) => s.toFile);
  const { getNodes } = useReactFlow();
  const [format, setFormat] = useState<PdfFormat>("a4");
  const [orientation, setOrientation] = useState<PdfOrientation>("landscape");
  const [margin, setMargin] = useState(10);
  const [includeTitle, setIncludeTitle] = useState(true);
  const [includeFooter, setIncludeFooter] = useState(true);
  const [includeLogos, setIncludeLogos] = useState(true);
  const [multiPage, setMultiPage] = useState(false);
  const [pptxEditable, setPptxEditable] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Lisibilité estimée du document : taille réelle du texte une fois
  // l'organigramme ajusté à la page (sans objet en multi-pages).
  const readability = useMemo(() => {
    if (!open || multiPage || storeNodes.length === 0) return null;
    // Bornes calculées depuis le store (réactif), cartes de 240×110 px
    const xs = storeNodes.map((n) => n.position.x);
    const ys = storeNodes.map((n) => n.position.y);
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
    storeNodes,
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
        await exportFlowToPdf(el, nodes, {
          format,
          orientation,
          margin,
          title: includeTitle ? meta.title : undefined,
          subtitle: includeTitle ? meta.subtitle : undefined,
          footer: includeFooter ? meta.footer : undefined,
          logoUrl: includeLogos ? theme.logoUrl : undefined,
          secondaryLogoUrl: includeLogos ? theme.secondaryLogoUrl : undefined,
          multiPage,
        });
      } else if (kind === "pptx") {
        const pptxOptions = {
          title: includeTitle ? meta.title : undefined,
          subtitle: includeTitle ? meta.subtitle : undefined,
          footer: includeFooter ? meta.footer : undefined,
          logoUrl: includeLogos ? theme.logoUrl : undefined,
          secondaryLogoUrl: includeLogos ? theme.secondaryLogoUrl : undefined,
          accent: theme.accent,
        };
        // Le .orgchart.json est embarqué dans le .pptx : le réimporter restaure le projet
        const chartJson = JSON.stringify(toFile(), null, 2);
        if (pptxEditable) {
          const { exportFlowToPptxEditable } = await import("../lib/pptxEditable");
          await exportFlowToPptxEditable(storeNodes, storeEdges, theme, pptxOptions, chartJson);
        } else {
          await exportFlowToPptx(el, nodes, pptxOptions, chartJson);
        }
      } else if (kind === "clipboard") {
        await copyFlowToClipboard(el, nodes);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } else if (kind === "png") {
        await exportFlowToPng(el, nodes, `${meta.title || "organigramme"}.png`);
      } else {
        await exportFlowToSvg(el, nodes, `${meta.title || "organigramme"}.svg`);
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

  const selectClass = `w-full rounded-xl border px-3 py-2 text-xs transition-all focus:outline-none appearance-none ${
    themeMode === "dark"
      ? "border-zinc-800 bg-zinc-900/60 text-zinc-100 focus:border-zinc-700"
      : "border-zinc-200 bg-zinc-50/50 text-zinc-800 focus:border-zinc-300"
  }`;

  const checkboxClass = `h-4 w-4 rounded border transition-colors focus:ring-1 cursor-pointer ${
    themeMode === "dark"
      ? "border-zinc-800 bg-zinc-900 text-zinc-300 focus:ring-zinc-700 checked:bg-zinc-100 checked:border-zinc-100"
      : "border-zinc-300 bg-zinc-50 text-zinc-700 focus:ring-zinc-400 checked:bg-zinc-900 checked:border-zinc-900"
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
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-zinc-400">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
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
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-zinc-400">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </label>
        </div>

        {/* Marge */}
        <div className="flex flex-col gap-1.5 mt-4">
          <span className="flex justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            <span>Marges du document</span>
            <span className="font-mono text-zinc-500">{margin} mm</span>
          </span>
          <input
            type="range"
            min={0}
            max={30}
            value={margin}
            onChange={(e) => setMargin(Number(e.target.value))}
            className="w-full accent-zinc-800 dark:accent-zinc-200 cursor-pointer bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none h-1"
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
                  cartes fera {readability.fontPt} pt à l'impression.
                  {layoutMode !== "compact"
                    ? " La disposition compacte empile les équipes sous leur responsable pour rapprocher l'organigramme du format de la page, sans changer le style des cartes."
                    : " Essayez le format A3, réduisez les marges, ou activez le multi-pages."}
                </p>
                {layoutMode !== "compact" && (
                  <button
                    onClick={applyCompactLayout}
                    className={`self-start rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all hover:scale-102 active:scale-98 cursor-pointer ${
                      themeMode === "dark"
                        ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                        : "bg-zinc-900 text-white hover:bg-zinc-800"
                    }`}
                  >
                    Appliquer la disposition compacte
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-4 text-xs text-red-500">{error}</p>}

        {/* Boutons d'export */}
        <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-900 flex flex-col gap-2">
          <button
            onClick={() => run("pdf")}
            disabled={busy !== null}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold shadow-sm transition-all hover:scale-101 active:scale-99 cursor-pointer ${
              themeMode === "dark"
                ? "bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                : "bg-zinc-900 text-white hover:bg-zinc-800"
            } disabled:opacity-50`}
          >
            {busy === "pdf" ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Exportation PDF en cours...</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Télécharger le PDF vectoriel</span>
              </>
            )}
          </button>

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
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Génération PowerPoint...</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 4a1 1 0 011-1h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4zm4 4h3a2 2 0 110 4h-3V8zm0 0v8"
                  />
                </svg>
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

          <div className="flex gap-2.5">
            <button
              onClick={() => run("png")}
              disabled={busy !== null}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition-all hover:scale-101 active:scale-99 cursor-pointer ${
                themeMode === "dark"
                  ? "border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                  : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              } disabled:opacity-50`}
            >
              {busy === "png" ? "Génération..." : "PNG Haute Résolution"}
            </button>
            <button
              onClick={() => run("svg")}
              disabled={busy !== null}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition-all hover:scale-101 active:scale-99 cursor-pointer ${
                themeMode === "dark"
                  ? "border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                  : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              } disabled:opacity-50`}
            >
              {busy === "svg" ? "Génération..." : "Fichier SVG"}
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
                : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            } disabled:opacity-50`}
          >
            {busy === "clipboard"
              ? "Copie en cours..."
              : copied
              ? "Copié ! Collez l'image où vous voulez."
              : "Copier l'image dans le presse-papiers"}
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
