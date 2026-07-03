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
  } = data;
  const ratingStyle = RATING_STYLE[rating];

  return (
    <div className="pointer-events-none relative select-none" style={{ width, height }}>
      {/* Étiquette au-dessus de la feuille */}
      <div
        className="absolute -top-12 left-0 flex items-center gap-2 font-mono text-[13px] tracking-wide"
        style={{ color: dark ? "#71717a" : "#a1a1aa" }}
      >
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
          border: `1.5px solid ${dark ? "rgba(255,255,255,0.09)" : "rgba(24,24,27,0.10)"}`,
          borderRadius: 6,
          boxShadow: dark ? "0 20px 60px -20px rgba(0,0,0,0.5)" : "0 20px 60px -25px rgba(24,24,27,0.15)",
        }}
      />

      {/* Bande d'en-tête (titre / logos) */}
      {hasHeader && (
        <div
          className="absolute flex items-center justify-center font-mono text-[11px] uppercase tracking-widest"
          style={{
            left: insetLeft,
            right: insetRight,
            top: 0,
            height: insetTop,
            color: dark ? "rgba(255,255,255,0.16)" : "rgba(24,24,27,0.18)",
          }}
        >
          en-tête · titre &amp; logos
        </div>
      )}

      {/* Bande de pied de page */}
      {hasFooter && (
        <div
          className="absolute flex items-center justify-center font-mono text-[10px] uppercase tracking-widest"
          style={{
            left: insetLeft,
            right: insetRight,
            bottom: 0,
            height: insetBottom,
            color: dark ? "rgba(255,255,255,0.13)" : "rgba(24,24,27,0.14)",
          }}
        >
          pied de page
        </div>
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
