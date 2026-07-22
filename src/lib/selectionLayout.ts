export interface SelectionRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SelectionLayoutAction =
  | "align-left"
  | "align-center-x"
  | "align-right"
  | "align-top"
  | "align-center-y"
  | "align-bottom"
  | "distribute-x"
  | "distribute-y";

export interface SelectionPosition {
  id: string;
  position: { x: number; y: number };
}

/**
 * Espace qui séparerait les cartes après une répartition conservant les deux
 * extrêmes. Une valeur négative signifie que l'opération créerait des
 * chevauchements : l'interface doit alors la refuser plutôt que détériorer la
 * mise en page préparée par le client.
 */
export function distributionGap(
  rects: SelectionRect[],
  axis: "x" | "y"
): number | undefined {
  if (rects.length < 3) return undefined;
  const { ordered, startKey, sizeKey } = orderedForAxis(rects, axis);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const span = last[startKey] + last[sizeKey] - first[startKey];
  const occupied = ordered.reduce((sum, rect) => sum + rect[sizeKey], 0);
  return (span - occupied) / (ordered.length - 1);
}

/**
 * Aligne ou répartit une sélection sans modifier ses objets d'entrée.
 *
 * La distribution suit la convention des éditeurs graphiques : les deux
 * éléments extérieurs restent fixes et l'espace libre est réparti également
 * entre les éléments intermédiaires. Une distribution nécessite donc au
 * moins trois cartes.
 */
export function arrangeSelection(
  rects: SelectionRect[],
  action: SelectionLayoutAction
): SelectionPosition[] {
  if (rects.length < 2) return rects.map(toPosition);

  const left = Math.min(...rects.map((rect) => rect.x));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const top = Math.min(...rects.map((rect) => rect.y));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));

  if (action === "distribute-x" || action === "distribute-y") {
    if (rects.length < 3) return rects.map(toPosition);
    const axis = action === "distribute-x" ? "x" : "y";
    const gap = distributionGap(rects, axis);
    // Préserver les placements vaut mieux qu'une répartition qui superpose
    // les cartes. Le contrôle est doublé côté UI pour expliquer le blocage.
    if (gap === undefined || gap < 0) return rects.map(toPosition);
    return distribute(rects, axis, gap);
  }

  return rects.map((rect) => {
    let x = rect.x;
    let y = rect.y;

    if (action === "align-left") x = left;
    else if (action === "align-center-x") x = left + (right - left - rect.width) / 2;
    else if (action === "align-right") x = right - rect.width;
    else if (action === "align-top") y = top;
    else if (action === "align-center-y") y = top + (bottom - top - rect.height) / 2;
    else if (action === "align-bottom") y = bottom - rect.height;

    return { id: rect.id, position: { x, y } };
  });
}

function orderedForAxis(rects: SelectionRect[], axis: "x" | "y") {
  const startKey = axis === "x" ? "x" : "y";
  const sizeKey = axis === "x" ? "width" : "height";
  const ordered = [...rects].sort((a, b) => {
    const centerA = a[startKey] + a[sizeKey] / 2;
    const centerB = b[startKey] + b[sizeKey] / 2;
    return centerA - centerB || a.id.localeCompare(b.id);
  });
  return { ordered, startKey, sizeKey } as const;
}

function distribute(
  rects: SelectionRect[],
  axis: "x" | "y",
  gap: number
): SelectionPosition[] {
  const { ordered, startKey, sizeKey } = orderedForAxis(rects, axis);
  const first = ordered[0];
  let cursor = first[startKey];

  const positions = new Map<string, SelectionPosition>();
  for (const rect of ordered) {
    positions.set(rect.id, {
      id: rect.id,
      position: axis === "x" ? { x: cursor, y: rect.y } : { x: rect.x, y: cursor },
    });
    cursor += rect[sizeKey] + gap;
  }

  return rects.map((rect) => positions.get(rect.id)!);
}

function toPosition(rect: SelectionRect): SelectionPosition {
  return { id: rect.id, position: { x: rect.x, y: rect.y } };
}
