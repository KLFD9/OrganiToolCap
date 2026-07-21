import { useState } from "react";
import { NodeResizer, NodeToolbar, Position, type NodeProps } from "@xyflow/react";
import { Bold, Italic, RotateCcw } from "lucide-react";
import type { ChromeElement, ChromeKey } from "../types/orgchart";
import { useOrgChartStore } from "../store/useOrgChartStore";
import { CHROME_TEXT_FONT_FAMILY, CHROME_TEXT_LINE_HEIGHT } from "../lib/chromeLayout";

/**
 * Élément d'en-tête/pied de page posé sur la feuille : titre, sous-titre,
 * logos, footer. Déplaçable (contraint à la page), redimensionnable
 * (poignées — ratio verrouillé), textes éditables au double-clic. Les
 * positions sont persistées en mm dans le fichier et reproduites au
 * millimètre par l'export PDF.
 */

export interface ChromeElementData extends Record<string, unknown> {
  chromeKey: ChromeKey;
  variant: "text" | "logo";
  /** Libellé (variant text) ou data-URL (variant logo). */
  value: string;
  /** Taille de police en px canvas (variant text). */
  fontPx?: number;
  /** Hauteur en px canvas (variant logo). */
  heightPx?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  /** Géométrie et style persistés/résolus de l'élément courant. */
  element: ChromeElement;
  dark: boolean;
  /**
   * Page (frame) portant l'élément en mode multi-pages : le double-clic sur
   * titre / sous-titre écrit alors dans frame.meta (propre à la page), le
   * pied de page restant celui du document. Absent = page implicite.
   */
  frameId?: string;
  /** Conversion et persistance faites par le Canvas (qui connaît l'échelle). */
  onResizeEnd: (key: ChromeKey, params: { x: number; y: number; width: number; height: number }) => void;
  /** Met à jour la mise en forme sans perdre position ni taille. */
  onStyleChange: (key: ChromeKey, element: ChromeElement) => void;
}

const TEXT_COMMIT: Partial<Record<ChromeKey, "setTitle" | "setSubtitle" | "setFooter">> = {
  title: "setTitle",
  subtitle: "setSubtitle",
  footer: "setFooter",
};

const LABELS: Record<ChromeKey, string> = {
  title: "Titre",
  subtitle: "Sous-titre",
  logo: "Logo principal",
  secondaryLogo: "Logo secondaire",
  footer: "Pied de page",
};

function ChromeElementImpl({ data, selected }: NodeProps & { data: ChromeElementData }) {
  const {
    chromeKey,
    variant,
    value,
    fontPx = 16,
    heightPx = 40,
    bold = false,
    italic = false,
    color,
    element,
    dark,
    frameId,
    onResizeEnd,
    onStyleChange,
  } = data;
  const setTitle = useOrgChartStore((s) => s.setTitle);
  const setSubtitle = useOrgChartStore((s) => s.setSubtitle);
  const setFooter = useOrgChartStore((s) => s.setFooter);
  const updateFrame = useOrgChartStore((s) => s.updateFrame);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // Aperçu en direct pendant le glisser d'une poignée : évite d'écrire dans le
  // store (et l'historique d'annulation) à chaque pixel — seul le relâchement commit.
  const [liveHeightPx, setLiveHeightPx] = useState<number | null>(null);

  const commitText = (text: string) => {
    // Titre / sous-titre d'une page explicite : propres au frame
    if (frameId && (chromeKey === "title" || chromeKey === "subtitle")) {
      const frame = useOrgChartStore.getState().frames.find((f) => f.id === frameId);
      if (frame) updateFrame(frameId, { meta: { ...frame.meta, [chromeKey]: text } });
      return;
    }
    const action = TEXT_COMMIT[chromeKey];
    if (action === "setTitle") setTitle(text);
    else if (action === "setSubtitle") setSubtitle(text);
    else if (action === "setFooter") setFooter(text);
  };

  // Taille effective affichée : celle du store, sauf pendant un redimensionnement
  // en cours où la hauteur de la poignée pilote l'aperçu en direct.
  const effectiveFontPx = liveHeightPx != null ? liveHeightPx / CHROME_TEXT_LINE_HEIGHT : fontPx;
  const effectiveHeightPx = liveHeightPx ?? heightPx;

  const updateStyle = (patch: Partial<Pick<ChromeElement, "bold" | "italic" | "color">>) => {
    onStyleChange(chromeKey, { ...element, ...patch });
  };

  const resetStyle = () => {
    onStyleChange(chromeKey, { x: element.x, y: element.y, size: element.size });
  };

  return (
    <div
      className="group/chrome relative"
      title={`${LABELS[chromeKey]} — glisser pour déplacer, poignées pour redimensionner${variant === "text" ? ", double-clic pour modifier" : ""}`}
    >
      {variant === "text" && (
        <NodeToolbar
          isVisible={Boolean(selected) && !editing}
          position={Position.Top}
          offset={14}
          className="nodrag nopan nowheel"
        >
          <div
            className={`flex items-center gap-1 rounded-full border p-1.5 shadow-xl backdrop-blur-xl ${
              dark
                ? "border-white/10 bg-zinc-900/95 text-zinc-200 shadow-black/40"
                : "border-zinc-200/90 bg-white/95 text-zinc-700 shadow-zinc-900/15"
            }`}
            role="toolbar"
            aria-label={`Mise en forme — ${LABELS[chromeKey]}`}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Texte
            </span>
            <span className={`h-5 w-px ${dark ? "bg-zinc-700" : "bg-zinc-200"}`} />
            <button
              type="button"
              aria-label="Gras"
              aria-pressed={bold}
              title="Gras"
              onClick={() => updateStyle({ bold: !bold })}
              className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                bold
                  ? "bg-primary-600 text-white"
                  : dark
                    ? "hover:bg-zinc-800"
                    : "hover:bg-zinc-100"
              }`}
            >
              <Bold className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Italique"
              aria-pressed={italic}
              title="Italique"
              onClick={() => updateStyle({ italic: !italic })}
              className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                italic
                  ? "bg-primary-600 text-white"
                  : dark
                    ? "hover:bg-zinc-800"
                    : "hover:bg-zinc-100"
              }`}
            >
              <Italic className="h-3.5 w-3.5" />
            </button>
            <label
              className={`relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full ring-1 ring-inset transition-transform hover:scale-105 focus-within:ring-2 focus-within:ring-primary-500 ${
                dark ? "ring-white/15" : "ring-black/10"
              }`}
              title="Couleur du texte"
              style={{ backgroundColor: color }}
            >
              <span className="sr-only">Couleur du texte</span>
              <input
                type="color"
                aria-label="Couleur du texte"
                value={color ?? (dark ? "#f4f4f5" : "#27272a")}
                onChange={(event) => updateStyle({ color: event.target.value.toUpperCase() })}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <span className={`h-5 w-px ${dark ? "bg-zinc-700" : "bg-zinc-200"}`} />
            <button
              type="button"
              aria-label="Réinitialiser la mise en forme"
              title="Style par défaut"
              onClick={resetStyle}
              className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                dark ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              }`}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </NodeToolbar>
      )}

      <NodeResizer
        isVisible={Boolean(selected)}
        keepAspectRatio={variant === "logo"}
        minWidth={12}
        minHeight={10}
        lineStyle={{ borderColor: "rgba(109, 74, 174, 0.6)" }}
        handleStyle={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: "#ffffff",
          border: "1.5px solid rgba(109, 74, 174, 0.9)",
        }}
        onResize={(_event, params) => setLiveHeightPx(params.height)}
        onResizeEnd={(_event, params) => {
          setLiveHeightPx(null);
          onResizeEnd(chromeKey, { x: params.x, y: params.y, width: params.width, height: params.height });
        }}
      />

      {/* Liseré de repérage au survol / à la sélection */}
      <div
        className={`pointer-events-none absolute -inset-1 rounded transition-opacity ${
          selected ? "opacity-100" : "opacity-0 group-hover/chrome:opacity-100"
        }`}
        style={{ border: "1px dashed rgba(109, 74, 174, 0.45)" }}
      />

      {variant === "logo" ? (
        <img
          src={value}
          alt={LABELS[chromeKey]}
          draggable={false}
          style={{ height: effectiveHeightPx, width: "auto", display: "block" }}
        />
      ) : editing ? (
        <input
          autoFocus
          className="nodrag bg-transparent focus:outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (draft !== value) commitText(draft);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              setEditing(false);
              if (draft !== value) commitText(draft);
            } else if (e.key === "Escape") {
              setEditing(false);
              setDraft(value);
            }
          }}
          style={{
            fontSize: effectiveFontPx,
            lineHeight: CHROME_TEXT_LINE_HEIGHT,
            fontFamily: CHROME_TEXT_FONT_FAMILY,
            fontWeight: bold ? 700 : 400,
            fontStyle: italic ? "italic" : "normal",
            color,
            width: Math.max(120, draft.length * effectiveFontPx * 0.62),
            borderBottom: "1.5px solid rgba(109, 74, 174, 0.6)",
          }}
        />
      ) : (
        <div
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraft(value);
            setEditing(true);
          }}
          className="cursor-move whitespace-nowrap"
          style={{
            fontSize: effectiveFontPx,
            lineHeight: CHROME_TEXT_LINE_HEIGHT,
            fontFamily: CHROME_TEXT_FONT_FAMILY,
            fontWeight: bold ? 700 : 400,
            fontStyle: italic ? "italic" : "normal",
            color,
          }}
        >
          {value}
        </div>
      )}
    </div>
  );
}

export const ChromeElementNode = ChromeElementImpl;
