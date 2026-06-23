import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

export interface OrgEdgeData extends Record<string, unknown> {
  /** Routage « en épine » pour les subordonnés empilés (disposition compacte). */
  spine?: boolean;
}

/**
 * Arête d'organigramme. Par défaut : smoothstep classique. En mode « épine »
 * (enfants empilés verticalement), trace un chemin orthogonal qui descend du
 * responsable, longe le bord gauche de la pile puis entre par le côté de la
 * carte — le tracé traditionnel des organigrammes RH, sans croiser les cartes.
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
  const spine = (data as OrgEdgeData | undefined)?.spine;

  if (spine && targetX < sourceX && targetY > sourceY) {
    // Épine verticale à gauche de la pile, juste avant la poignée latérale
    const spineX = targetX - 18;
    const jogY = sourceY + 24; // jog horizontal sous le responsable, au-dessus de la pile
    const path = `M ${sourceX} ${sourceY} L ${sourceX} ${jogY} L ${spineX} ${jogY} L ${spineX} ${targetY} L ${targetX} ${targetY}`;
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
