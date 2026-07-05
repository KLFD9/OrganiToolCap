import { useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { ChromeKey } from "../types/orgchart";
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
  dark: boolean;
  /**
   * Page (frame) portant l'élément en mode multi-pages : le double-clic sur
   * titre / sous-titre écrit alors dans frame.meta (propre à la page), le
   * pied de page restant celui du document. Absent = page implicite.
   */
  frameId?: string;
  /** Conversion et persistance faites par le Canvas (qui connaît l'échelle). */
  onResizeEnd: (key: ChromeKey, params: { x: number; y: number; width: number; height: number }) => void;
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
  const { chromeKey, variant, value, fontPx = 16, heightPx = 40, bold = false, dark, frameId, onResizeEnd } = data;
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

  return (
    <div
      className="group/chrome relative"
      title={`${LABELS[chromeKey]} — glisser pour déplacer, poignées pour redimensionner${variant === "text" ? ", double-clic pour modifier" : ""}`}
    >
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
            color: dark ? "#e4e4e7" : "#27272a",
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
            color: dark ? "#e4e4e7" : "#27272a",
          }}
        >
          {value}
        </div>
      )}
    </div>
  );
}

export const ChromeElementNode = ChromeElementImpl;
