import { useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { ChromeKey } from "../types/orgchart";
import { useOrgChartStore } from "../store/useOrgChartStore";

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
  const { chromeKey, variant, value, fontPx = 16, heightPx = 40, bold = false, dark, onResizeEnd } = data;
  const setTitle = useOrgChartStore((s) => s.setTitle);
  const setSubtitle = useOrgChartStore((s) => s.setSubtitle);
  const setFooter = useOrgChartStore((s) => s.setFooter);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commitText = (text: string) => {
    const action = TEXT_COMMIT[chromeKey];
    if (action === "setTitle") setTitle(text);
    else if (action === "setSubtitle") setSubtitle(text);
    else if (action === "setFooter") setFooter(text);
  };

  const lineHeight = 1.2;

  return (
    <div
      className="group/chrome relative"
      title={`${LABELS[chromeKey]} — glisser pour déplacer, poignées pour redimensionner${variant === "text" ? ", double-clic pour modifier" : ""}`}
    >
      <NodeResizer
        isVisible={Boolean(selected)}
        keepAspectRatio
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
        onResizeEnd={(_event, params) =>
          onResizeEnd(chromeKey, { x: params.x, y: params.y, width: params.width, height: params.height })
        }
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
          style={{ height: heightPx, width: "auto", display: "block" }}
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
            fontSize: fontPx,
            lineHeight,
            fontWeight: bold ? 700 : 400,
            color: dark ? "#e4e4e7" : "#27272a",
            width: Math.max(120, value.length * fontPx * 0.62),
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
            fontSize: fontPx,
            lineHeight,
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
