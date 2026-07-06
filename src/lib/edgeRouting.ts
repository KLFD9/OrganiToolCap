export interface EdgeRoutePoint {
  x: number;
  y: number;
}

/** Décalage horizontal de l'épine verticale par rapport au bord de la carte empilée (px canvas). */
const SPINE_OFFSET_X = 18;
/** Hauteur du jog horizontal sous le responsable, avant de descendre l'épine (px canvas). */
const SPINE_JOG_Y = 24;

/**
 * Géométrie partagée canvas ↔ exports (PDF vectoriel, PowerPoint éditable)
 * pour les arêtes non triviales. Point de vérité unique : `OrgEdge` (rendu
 * React Flow, cf. components/OrgEdge.tsx) et `buildEditableSpec` (lib/pdfVector.ts,
 * lib/pptxEditable.ts) appellent ces mêmes fonctions plutôt que de recalculer
 * chacun leur propre tracé — la moindre divergence casse le WYSIWYG.
 *
 * Toutes les coordonnées sont dans l'espace px du canvas (celui de
 * `node.position`, carte 240×110 px) ; chaque appelant applique ensuite sa
 * propre mise à l'échelle (zoom canvas, mm PDF, pouces pptx).
 */

/**
 * Repli « en épine » : utilisé pour un subordonné empilé (disposition
 * compacte) — descend du responsable, longe le bord gauche de la pile via un
 * jog, puis entre par le côté de la carte. Traçé RH traditionnel qui évite de
 * croiser les cartes.
 */
export function computeSpineRoute(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): EdgeRoutePoint[] {
  const spineX = targetX - SPINE_OFFSET_X;
  const jogY = sourceY + SPINE_JOG_Y;
  return [
    { x: sourceX, y: sourceY },
    { x: sourceX, y: jogY },
    { x: spineX, y: jogY },
    { x: spineX, y: targetY },
    { x: targetX, y: targetY },
  ];
}

/**
 * Coude simple (descente → mi-hauteur → traversée → arrivée) : cas par
 * défaut pour un rattachement fonctionnel (pointillé), qui peut relier deux
 * cartes sans relation parent-au-dessus-de-l'enfant.
 */
export function computeElbowRoute(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): EdgeRoutePoint[] {
  if (Math.abs(targetY - sourceY) < 1) {
    return [
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
    ];
  }
  const midY = (sourceY + targetY) / 2;
  return [
    { x: sourceX, y: sourceY },
    { x: sourceX, y: midY },
    { x: targetX, y: midY },
    { x: targetX, y: targetY },
  ];
}

/** Vrai si la géométrie « en épine » s'applique (cible en bas à gauche de la source). */
export function isSpineDirection(sourceX: number, sourceY: number, targetX: number, targetY: number): boolean {
  return targetX < sourceX && targetY > sourceY;
}
