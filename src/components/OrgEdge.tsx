import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import { computeElbowRoute, computeSpineRoute, isSpineDirection, type EdgeRoutePoint } from "../lib/edgeRouting";

function pointsToPath(points: EdgeRoutePoint[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export interface OrgEdgeData extends Record<string, unknown> {
  /** Routage « en épine » pour les subordonnés empilés (disposition compacte). */
  spine?: boolean;
  /** Rattachement fonctionnel (v2) : coude simple mi-hauteur, cf. commentaire ci-dessous. */
  dotted?: boolean;
}

/**
 * Arête d'organigramme. Par défaut : smoothstep classique. En mode « épine »
 * (enfants empilés verticalement), trace un chemin orthogonal qui descend du
 * responsable, longe le bord gauche de la pile puis entre par le côté de la
 * carte — le tracé traditionnel des organigrammes RH, sans croiser les cartes.
 *
 * Les rattachements fonctionnels (pointillés) relient des cartes qui ne sont
 * pas dans une relation parent direct-au-dessus-de-l'enfant : la heuristique
 * de centrage de getSmoothStepPath peut alors détourner le tracé très loin
 * (jusqu'au bus hiérarchique). On retombe donc sur le même coude simple
 * (descente → mi-hauteur → traversée → arrivée) que l'export PDF/PPTX
 * (lib/pdfVector.ts, lib/pptxEditable.ts) pour garantir le WYSIWYG.
 */
export function OrgEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const { spine, dotted } = (data as OrgEdgeData | undefined) ?? {};

  if (spine && isSpineDirection(sourceX, sourceY, targetX, targetY)) {
    const path = pointsToPath(computeSpineRoute(sourceX, sourceY, targetX, targetY));
    return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />;
  }

  if (dotted) {
    const path = pointsToPath(computeElbowRoute(sourceX, sourceY, targetX, targetY));
    return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />;
  }

  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });
  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />;
}
