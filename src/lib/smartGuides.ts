/**
 * Guides magnétiques : aimantation d'une carte glissée aux axes des cartes
 * voisines (bords et centres) et aux repères des pages (marges, bords de
 * feuille, axes centraux). Logique pure — le Canvas fournit les rectangles et
 * dessine les traits violets.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapTargets {
  /** Lignes verticales (valeurs x en px canvas). */
  v: number[];
  /** Lignes horizontales (valeurs y en px canvas). */
  h: number[];
}

/** Lignes d'aimantation d'un ensemble de rectangles : bords + axes centraux. */
export function rectTargets(rects: Rect[]): SnapTargets {
  const v: number[] = [];
  const h: number[] = [];
  for (const r of rects) {
    v.push(r.x, r.x + r.width / 2, r.x + r.width);
    h.push(r.y, r.y + r.height / 2, r.y + r.height);
  }
  return { v, h };
}

/** Fusionne plusieurs jeux de cibles. */
export function mergeTargets(...sets: SnapTargets[]): SnapTargets {
  return {
    v: sets.flatMap((s) => s.v),
    h: sets.flatMap((s) => s.h),
  };
}

export interface SnapResult {
  x: number;
  y: number;
  /** Ligne verticale aimantée (x), le cas échéant — à dessiner. */
  vLine?: number;
  /** Ligne horizontale aimantée (y), le cas échéant. */
  hLine?: number;
}

/**
 * Aimante la position d'une carte `width` × `height` : chaque axe est ajusté
 * indépendamment vers la cible la plus proche (bord gauche/centre/bord droit,
 * haut/milieu/bas) si elle est à moins de `threshold` px.
 */
export function snapPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  targets: SnapTargets,
  threshold: number
): SnapResult {
  let bestDx: number | undefined;
  let vLine: number | undefined;
  for (const line of targets.v) {
    for (const ref of [x, x + width / 2, x + width]) {
      const d = line - ref;
      if (Math.abs(d) <= threshold && (bestDx === undefined || Math.abs(d) < Math.abs(bestDx))) {
        bestDx = d;
        vLine = line;
      }
    }
  }

  let bestDy: number | undefined;
  let hLine: number | undefined;
  for (const line of targets.h) {
    for (const ref of [y, y + height / 2, y + height]) {
      const d = line - ref;
      if (Math.abs(d) <= threshold && (bestDy === undefined || Math.abs(d) < Math.abs(bestDy))) {
        bestDy = d;
        hLine = line;
      }
    }
  }

  return { x: x + (bestDx ?? 0), y: y + (bestDy ?? 0), vLine, hLine };
}
