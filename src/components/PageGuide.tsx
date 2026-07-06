import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { ReadabilityRating } from "../lib/readability";

/**
 * Cadre de page : feuille A4/A3 dessinée derrière l'organigramme, à l'échelle
 * « confort » — si le contenu tient dans la zone utile (pointillés), le texte
 * imprimé fera au moins 6,5 pt une fois le document ajusté à la page. Marges
 * et bande d'en-tête/pied sont figurées comme à l'export ; le badge annonce
 * la taille de texte réelle en continu.
 */

export interface PageGuideData extends Record<string, unknown> {
  /** Dimensions de la feuille en px canvas (échelle confort). */
  width: number;
  height: number;
  /** Zone utile : offsets internes en px canvas (marges + en-tête/pied). */
  insetLeft: number;
  insetTop: number;
  insetRight: number;
  insetBottom: number;
  /** Vrai si la page comporte une bande d'en-tête (titre / logos). */
  hasHeader: boolean;
  hasFooter: boolean;
  label: string;
  fontPt: number;
  rating: ReadabilityRating;
  dark: boolean;
  /**
   * Nom de la page (mode multi-pages) : affiché en tête d'étiquette et
   * utilisé comme poignée de déplacement de la feuille (classe
   * frame-drag-handle, cf. dragHandle du nœud React Flow).
   */
  frameName?: string;
  /** Nombre de cartes appartenant à la page (mode multi-pages). */
  memberCount?: number;
  /**
   * Page sélectionnée (propriétés affichées dans l'inspecteur) — état applicatif
   * propre, distinct du `selected` React Flow (les frames ne sont pas
   * selectable côté RF pour ne jamais rejoindre un drag de groupe ni
   * remonter dans onSelectionChange).
   */
  isSelected?: boolean;
  /** Sélectionne la page (affiche ses propriétés dans l'inspecteur) — mode multi-pages. */
  onSelect?: () => void;
}

const RATING_STYLE: Record<ReadabilityRating, { chip: string; text: string }> = {
  good: { chip: "rgba(16, 185, 129, 0.12)", text: "#059669" },
  warn: { chip: "rgba(245, 158, 11, 0.14)", text: "#b45309" },
  bad: { chip: "rgba(239, 68, 68, 0.12)", text: "#dc2626" },
};

const RATING_LABEL: Record<ReadabilityRating, string> = {
  good: "lisible",
  warn: "limite",
  bad: "illisible",
};

function PageGuideImpl({ data }: NodeProps & { data: PageGuideData }) {
  const {
    width,
    height,
    insetLeft,
    insetTop,
    insetRight,
    insetBottom,
    hasHeader,
    hasFooter,
    label,
    fontPt,
    rating,
    dark,
    frameName,
    memberCount,
    isSelected,
    onSelect,
  } = data;
  const ratingStyle = RATING_STYLE[rating];
  const isFrame = frameName !== undefined;

  return (
    <div className="pointer-events-none relative select-none" style={{ width, height }}>
      {/* Étiquette au-dessus de la feuille — poignée de déplacement en mode multi-pages */}
      <div
        className={`absolute -top-12 left-0 flex items-center gap-2 font-mono text-[13px] tracking-wide ${
          isFrame ? "frame-drag-handle pointer-events-auto cursor-move" : ""
        }`}
        style={{ color: dark ? "#71717a" : "#a1a1aa" }}
        title={isFrame ? "Glisser pour déplacer la page et son contenu" : undefined}
      >
        {isFrame && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.();
            }}
            className="rounded-lg px-2.5 py-1 font-bold transition-shadow hover:shadow-md"
            style={{
              background: dark ? "rgba(24, 24, 27, 0.92)" : "#ffffff",
              border: `1px solid ${dark ? "rgba(157, 131, 203, 0.4)" : "rgba(109, 74, 174, 0.35)"}`,
              color: dark ? "#c4b5e0" : "#6D4AAE",
              boxShadow: dark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(24,24,27,0.08)",
            }}
          >
            {frameName}
            {memberCount !== undefined && memberCount > 0 ? ` · ${memberCount}` : ""}
          </span>
        )}
        <span>{label}</span>
        <span
          className="rounded-full px-2.5 py-0.5 font-bold"
          style={{ background: ratingStyle.chip, color: ratingStyle.text }}
        >
          texte ≈ {fontPt} pt · {RATING_LABEL[rating]}
        </span>
      </div>

      {/* Feuille */}
      <div
        className="absolute inset-0"
        style={{
          background: dark ? "rgba(255, 255, 255, 0.025)" : "rgba(255, 255, 255, 0.6)",
          border: `1.5px solid ${
            isSelected && isFrame
              ? "rgba(109, 74, 174, 0.75)"
              : dark
              ? "rgba(255,255,255,0.09)"
              : "rgba(24,24,27,0.10)"
          }`,
          borderRadius: 6,
          boxShadow: dark ? "0 20px 60px -20px rgba(0,0,0,0.5)" : "0 20px 60px -25px rgba(24,24,27,0.15)",
        }}
      />

      {/* Les bandes d'en-tête / pied ne portent plus de libellé : les vrais
          éléments (titre, sous-titre, logos, footer) y sont rendus et
          manipulables — un placeholder ferait doublon derrière eux. Un filet
          discret délimite la bande d'en-tête quand elle existe. */}
      {hasHeader && (
        <div
          className="absolute"
          style={{
            left: insetLeft,
            right: insetRight,
            top: insetTop,
            borderTop: `1px dashed ${dark ? "rgba(255,255,255,0.07)" : "rgba(24,24,27,0.07)"}`,
          }}
        />
      )}
      {hasFooter && (
        <div
          className="absolute"
          style={{
            left: insetLeft,
            right: insetRight,
            bottom: insetBottom,
            borderBottom: `1px dashed ${dark ? "rgba(255,255,255,0.07)" : "rgba(24,24,27,0.07)"}`,
          }}
        />
      )}

      {/* Zone utile : le contenu doit tenir dans les pointillés */}
      <div
        className="absolute"
        style={{
          left: insetLeft,
          top: insetTop,
          right: insetRight,
          bottom: insetBottom,
          border: `1.5px dashed ${dark ? "rgba(157, 131, 203, 0.35)" : "rgba(109, 74, 174, 0.30)"}`,
          borderRadius: 4,
        }}
      />
    </div>
  );
}

export const PageGuide = memo(PageGuideImpl);
