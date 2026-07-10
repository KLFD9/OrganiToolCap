import { useState } from "react";
import { BaseEdge, getSmoothStepPath, Position, useReactFlow, type EdgeProps } from "@xyflow/react";
import {
  computeCorridorRoute,
  computeElbowRoute,
  computeElbowRouteHorizontal,
  computeSpineRoute,
  isSpineDirection,
  type EdgeRoutePoint,
  type EdgeRoutingOverride,
} from "../lib/edgeRouting";

function pointsToPath(points: EdgeRoutePoint[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export interface OrgEdgeData extends Record<string, unknown> {
  /** Routage « en épine » pour les subordonnés empilés (disposition compacte). */
  spine?: boolean;
  /** Rattachement fonctionnel (v2) : coude simple mi-hauteur, cf. commentaire ci-dessous. */
  dotted?: boolean;
  routePoints?: EdgeRoutePoint[];
  routeAxis?: "x" | "y";
  routing?: EdgeRoutingOverride;
  onRoutingChange?: (routing: EdgeRoutingOverride) => void;
}

function routeControlPoint(points: EdgeRoutePoint[], axis: "x" | "y"): EdgeRoutePoint | undefined {
  const segments = points.slice(1).map((point, index) => ({ a: points[index], b: point }));
  const matching = segments.filter(({ a, b }) => (axis === "y" ? a.y === b.y : a.x === b.x));
  const segment = matching.sort((one, two) => {
    const length = ({ a, b }: { a: EdgeRoutePoint; b: EdgeRoutePoint }) =>
      Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    return length(two) - length(one);
  })[0];
  return segment
    ? { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 }
    : undefined;
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
  selected,
}: EdgeProps) {
  const { screenToFlowPosition } = useReactFlow();
  const { spine, dotted, routePoints, routeAxis, routing, onRoutingChange } =
    (data as OrgEdgeData | undefined) ?? {};
  const [dragValue, setDragValue] = useState<number | null>(null);

  const activeRouting =
    routeAxis && dragValue !== null ? { axis: routeAxis, value: dragValue } : routing;
  const activePoints =
    routeAxis && activeRouting
      ? computeCorridorRoute(
          routePoints?.[0] ?? { x: sourceX, y: sourceY },
          routePoints?.[routePoints.length - 1] ?? { x: targetX, y: targetY },
          activeRouting
        )
      : routePoints;

  const renderRoute = (points: EdgeRoutePoint[]) => {
    const axis = routeAxis;
    const control = axis ? routeControlPoint(points, axis) : undefined;
    return (
      <>
        <BaseEdge id={id} path={pointsToPath(points)} style={style} markerEnd={markerEnd} interactionWidth={28} />
        {selected && control && onRoutingChange && axis && (
          <circle
            cx={control.x}
            cy={control.y}
            r={7.5}
            fill="var(--color-primary-50)"
            stroke="var(--color-primary-600)"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: axis === "y" ? "ns-resize" : "ew-resize", pointerEvents: "all" }}
            aria-label="Ajuster le tracé du lien"
            onPointerDown={(event) => {
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
              setDragValue(axis === "y" ? point.y : point.x);
            }}
            onPointerUp={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              event.currentTarget.releasePointerCapture(event.pointerId);
              const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
              const value = axis === "y" ? point.y : point.x;
              setDragValue(null);
              onRoutingChange({ axis, value });
            }}
          />
        )}
      </>
    );
  };

  if (spine && isSpineDirection(sourceX, sourceY, targetX, targetY)) {
    if (routeAxis && dragValue !== null) {
      return renderRoute(
        computeCorridorRoute(
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY },
          { axis: routeAxis, value: dragValue }
        )
      );
    }
    return renderRoute(computeSpineRoute(sourceX, sourceY, targetX, targetY));
  }

  if (activePoints && activePoints.length >= 2) return renderRoute(activePoints);

  if (dotted) {
    // Coude orienté selon le côté d'attache retenu par le snap géométrique :
    // sortie latérale → coude horizontal, sinon coude vertical — même
    // géométrie que l'export (lib/edgeRouting.computeSmartRoute).
    const lateral = sourcePosition === Position.Left || sourcePosition === Position.Right;
    const route = lateral
      ? computeElbowRouteHorizontal(sourceX, sourceY, targetX, targetY)
      : computeElbowRoute(sourceX, sourceY, targetX, targetY);
    return <BaseEdge id={id} path={pointsToPath(route)} style={style} markerEnd={markerEnd} interactionWidth={28} />;
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
  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={28} />;
}
