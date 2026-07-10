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

/**
 * Coude horizontal (sortie latérale → mi-largeur → arrivée latérale) :
 * pendant du coude vertical pour les liaisons côté-à-côté.
 */
export function computeElbowRouteHorizontal(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): EdgeRoutePoint[] {
  if (Math.abs(targetX - sourceX) < 1) {
    return [
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
    ];
  }
  const midX = (sourceX + targetX) / 2;
  return [
    { x: sourceX, y: sourceY },
    { x: midX, y: sourceY },
    { x: midX, y: targetY },
    { x: targetX, y: targetY },
  ];
}

/** Rectangle d'une carte dans l'espace px du canvas (position + dimensions). */
export interface NodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AttachSide = "top" | "bottom" | "left" | "right";
export interface EdgeRoutingOverride {
  axis: "x" | "y";
  value: number;
}

const ROUTE_CLEARANCE = 18;

/**
 * Choix des côtés d'attache d'un lien selon la géométrie relative des deux
 * cartes — le « snap » intelligent des traits, partagé canvas ↔ exports :
 * - cible entièrement sous la source → bas du parent vers haut de l'enfant
 *   (lecture hiérarchique classique) ;
 * - cible entièrement au-dessus → symétrique (haut → bas) ;
 * - sinon (bandes verticales qui se chevauchent, cartes côte à côte) →
 *   liaison latérale dans le sens du décalage horizontal.
 */
export function chooseEdgeSides(
  source: NodeRect,
  target: NodeRect
): { sourceSide: AttachSide; targetSide: AttachSide } {
  if (target.y >= source.y + source.height) return { sourceSide: "bottom", targetSide: "top" };
  if (target.y + target.height <= source.y) return { sourceSide: "top", targetSide: "bottom" };
  return target.x + target.width / 2 >= source.x + source.width / 2
    ? { sourceSide: "right", targetSide: "left" }
    : { sourceSide: "left", targetSide: "right" };
}

/** Point d'ancrage au centre d'un côté de carte. */
export function sideAnchor(rect: NodeRect, side: AttachSide): EdgeRoutePoint {
  switch (side) {
    case "top":
      return { x: rect.x + rect.width / 2, y: rect.y };
    case "bottom":
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    case "left":
      return { x: rect.x, y: rect.y + rect.height / 2 };
    case "right":
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
  }
}

/** Supprime les points consécutifs identiques et ceux alignés au milieu d'un segment. */
export function simplifyRoute(points: EdgeRoutePoint[]): EdgeRoutePoint[] {
  const compact = points.filter(
    (point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y
  );
  return compact.filter((point, index) => {
    if (index === 0 || index === compact.length - 1) return true;
    const before = compact[index - 1];
    const after = compact[index + 1];
    return !((before.x === point.x && point.x === after.x) || (before.y === point.y && point.y === after.y));
  });
}

/** Route orthogonale contrainte à un corridor horizontal ou vertical. */
export function computeCorridorRoute(
  source: EdgeRoutePoint,
  target: EdgeRoutePoint,
  routing: EdgeRoutingOverride
): EdgeRoutePoint[] {
  return simplifyRoute(
    routing.axis === "y"
      ? [source, { x: source.x, y: routing.value }, { x: target.x, y: routing.value }, target]
      : [source, { x: routing.value, y: source.y }, { x: routing.value, y: target.y }, target]
  );
}

function segmentHitsRect(a: EdgeRoutePoint, b: EdgeRoutePoint, rect: NodeRect): boolean {
  const left = rect.x - ROUTE_CLEARANCE;
  const right = rect.x + rect.width + ROUTE_CLEARANCE;
  const top = rect.y - ROUTE_CLEARANCE;
  const bottom = rect.y + rect.height + ROUTE_CLEARANCE;
  if (a.x === b.x) {
    return a.x >= left && a.x <= right && Math.max(a.y, b.y) >= top && Math.min(a.y, b.y) <= bottom;
  }
  if (a.y === b.y) {
    return a.y >= top && a.y <= bottom && Math.max(a.x, b.x) >= left && Math.min(a.x, b.x) <= right;
  }
  return false;
}

function routeHitsObstacle(points: EdgeRoutePoint[], obstacles: NodeRect[]): boolean {
  return points.slice(1).some((point, index) =>
    obstacles.some((obstacle) => segmentHitsRect(points[index], point, obstacle))
  );
}

function routeLength(points: EdgeRoutePoint[]): number {
  return points.slice(1).reduce(
    (total, point, index) => total + Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y),
    0
  );
}

/**
 * Choisit le corridor orthogonal le plus court qui ne traverse aucune carte.
 * Un réglage manuel gagne toujours ; sinon le coude médian reste prioritaire,
 * puis les passages juste au-dessus/dessous ou à gauche/droite des obstacles.
 */
export function computeObstacleAwareRoute(
  source: EdgeRoutePoint,
  target: EdgeRoutePoint,
  axis: "x" | "y",
  obstacles: NodeRect[],
  routing?: EdgeRoutingOverride
): EdgeRoutePoint[] {
  if (routing) return computeCorridorRoute(source, target, routing);
  const middle = axis === "y" ? (source.y + target.y) / 2 : (source.x + target.x) / 2;
  const candidates = [
    middle,
    ...obstacles.flatMap((rect) =>
      axis === "y"
        ? [rect.y - ROUTE_CLEARANCE - 1, rect.y + rect.height + ROUTE_CLEARANCE + 1]
        : [rect.x - ROUTE_CLEARANCE - 1, rect.x + rect.width + ROUTE_CLEARANCE + 1]
    ),
  ];
  const routes = candidates.map((value) => computeCorridorRoute(source, target, { axis, value }));
  const clear = routes.filter((route) => !routeHitsObstacle(route, obstacles));
  const score = (route: EdgeRoutePoint[]) =>
    routeLength(route) +
    Math.abs((axis === "y" ? route[1]?.y ?? middle : route[1]?.x ?? middle) - middle) * 0.05;
  return (clear.length > 0 ? clear : routes).reduce((best, route) => (score(route) < score(best) ? route : best));
}

/**
 * Routage complet d'un lien entre deux cartes : côtés d'attache + polyligne
 * orthogonale (coude vertical pour les attaches haut/bas, horizontal pour les
 * attaches latérales). Utilisé par les exports (PDF vectoriel, PowerPoint) et
 * par les liens pointillés du canvas — les liens hiérarchiques du canvas
 * suivent la même géométrie via les poignées React Flow + smoothstep.
 */
export function computeSmartRoute(
  source: NodeRect,
  target: NodeRect,
  obstacles: NodeRect[] = [],
  routing?: EdgeRoutingOverride
): { sourceSide: AttachSide; targetSide: AttachSide; points: EdgeRoutePoint[] } {
  const { sourceSide, targetSide } = chooseEdgeSides(source, target);
  const s = sideAnchor(source, sourceSide);
  const t = sideAnchor(target, targetSide);
  const axis = sourceSide === "left" || sourceSide === "right" ? "x" : "y";
  const compatibleRouting = routing?.axis === axis ? routing : undefined;
  const points = computeObstacleAwareRoute(s, t, axis, obstacles, compatibleRouting);
  return { sourceSide, targetSide, points };
}
