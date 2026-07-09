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

export interface GapInfo {
  /** "x" = écart horizontal (gauche/droite), "y" = écart vertical (haut/bas). */
  axis: "x" | "y";
  /** Écart en px canvas, à afficher dans le badge. */
  gap: number;
  /** Coordonnée perpendiculaire du segment (y fixe si axis "x", x fixe si axis "y"). */
  at: number;
  /** Bornes du segment le long de l'axe de l'écart. */
  from: number;
  to: number;
}

export interface NeighborGaps {
  left?: GapInfo;
  right?: GapInfo;
  top?: GapInfo;
  bottom?: GapInfo;
}

function overlap1D(aStart: number, aEnd: number, bStart: number, bEnd: number): { start: number; end: number } | null {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return end > start ? { start, end } : null;
}

/**
 * Écarts (px) entre `rect` et son voisin le plus proche dans chacune des 4
 * directions — uniquement parmi les rectangles qui chevauchent `rect` sur
 * l'axe perpendiculaire (façon Figma : le badge de distance n'apparaît
 * qu'entre éléments alignés). `maxGap` écarte les voisins trop lointains pour
 * rester lisible.
 */
export function neighborGaps(rect: Rect, others: Rect[], maxGap = 800): NeighborGaps {
  const result: NeighborGaps = {};
  const rTop = rect.y;
  const rBottom = rect.y + rect.height;
  const rLeft = rect.x;
  const rRight = rect.x + rect.width;

  let bestLeft: { gap: number; ov: { start: number; end: number } } | undefined;
  let bestRight: typeof bestLeft;
  let bestTop: typeof bestLeft;
  let bestBottom: typeof bestLeft;

  for (const o of others) {
    const oTop = o.y;
    const oBottom = o.y + o.height;
    const oLeft = o.x;
    const oRight = o.x + o.width;

    const vOv = overlap1D(rTop, rBottom, oTop, oBottom);
    if (vOv) {
      if (oRight <= rLeft) {
        const gap = rLeft - oRight;
        if (gap >= 0 && gap <= maxGap && (!bestLeft || gap < bestLeft.gap)) bestLeft = { gap, ov: vOv };
      }
      if (oLeft >= rRight) {
        const gap = oLeft - rRight;
        if (gap >= 0 && gap <= maxGap && (!bestRight || gap < bestRight.gap)) bestRight = { gap, ov: vOv };
      }
    }

    const hOv = overlap1D(rLeft, rRight, oLeft, oRight);
    if (hOv) {
      if (oBottom <= rTop) {
        const gap = rTop - oBottom;
        if (gap >= 0 && gap <= maxGap && (!bestTop || gap < bestTop.gap)) bestTop = { gap, ov: hOv };
      }
      if (oTop >= rBottom) {
        const gap = oTop - rBottom;
        if (gap >= 0 && gap <= maxGap && (!bestBottom || gap < bestBottom.gap)) bestBottom = { gap, ov: hOv };
      }
    }
  }

  if (bestLeft) {
    result.left = { axis: "x", gap: bestLeft.gap, at: (bestLeft.ov.start + bestLeft.ov.end) / 2, from: rLeft - bestLeft.gap, to: rLeft };
  }
  if (bestRight) {
    result.right = { axis: "x", gap: bestRight.gap, at: (bestRight.ov.start + bestRight.ov.end) / 2, from: rRight, to: rRight + bestRight.gap };
  }
  if (bestTop) {
    result.top = { axis: "y", gap: bestTop.gap, at: (bestTop.ov.start + bestTop.ov.end) / 2, from: rTop - bestTop.gap, to: rTop };
  }
  if (bestBottom) {
    result.bottom = { axis: "y", gap: bestBottom.gap, at: (bestBottom.ov.start + bestBottom.ov.end) / 2, from: rBottom, to: rBottom + bestBottom.gap };
  }

  return result;
}
