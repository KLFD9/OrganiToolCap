import { useState } from "react";
import { BaseEdge, EdgeToolbar, getSmoothStepPath, Position, useReactFlow, type EdgeProps } from "@xyflow/react";
import { GitBranch, RotateCcw, Workflow } from "lucide-react";
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
  /** Un corridor manuel est stocké, même si son axe n'est plus compatible avec la géométrie courante. */
  hasManualRouting?: boolean;
  onRoutingChange?: (routing: EdgeRoutingOverride) => void;
  /** Conversion fonctionnel → hiérarchique interdite par la garde anti-cycle. */
  hierarchyConversionBlocked?: boolean;
  /** La conversion hiérarchique remplacera le responsable principal actuel. */
  hierarchyConversionReplacesManager?: boolean;
  onKindChange?: (kind: "hierarchy" | "dotted") => void;
  onResetRouting?: () => void;
  dark?: boolean;
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

/** Centre géométrique du tracé, pondéré par la longueur de ses segments. */
function routeMidpoint(points: EdgeRoutePoint[]): EdgeRoutePoint {
  const segments = points.slice(1).map((point, index) => {
    const start = points[index];
    return {
      start,
      end: point,
      length: Math.hypot(point.x - start.x, point.y - start.y),
    };
  });
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  let remaining = total / 2;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = segment.length === 0 ? 0 : remaining / segment.length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      };
    }
    remaining -= segment.length;
  }
  return points[Math.floor(points.length / 2)] ?? { x: 0, y: 0 };
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
  const {
    spine,
    dotted,
    routePoints,
    routeAxis,
    routing,
    hasManualRouting = Boolean(routing),
    onRoutingChange,
    hierarchyConversionBlocked = false,
    hierarchyConversionReplacesManager = false,
    onKindChange,
    onResetRouting,
    dark = false,
  } =
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

  const renderToolbar = (point: EdgeRoutePoint) => (
    <EdgeToolbar
      edgeId={id}
      x={point.x}
      y={point.y}
      isVisible={Boolean(selected)}
      alignY="bottom"
      className="nodrag nopan nowheel"
    >
      <div
        role="toolbar"
        aria-label="Actions du lien"
        className={`edge-toolbar-bubble mb-3 flex items-center gap-1 rounded-full border p-1.5 shadow-xl backdrop-blur-xl ${
          dark
            ? "border-white/10 bg-zinc-900/95 text-zinc-200 shadow-black/40"
            : "border-zinc-200/90 bg-white/95 text-zinc-700 shadow-zinc-900/15"
        }`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span className="edge-toolbar-context pl-2 pr-1 text-[10px] font-semibold text-zinc-400">Lien</span>
        <span className={`edge-toolbar-context mx-0.5 h-5 w-px ${dark ? "bg-zinc-700" : "bg-zinc-200"}`} />
        <div
          className={`flex rounded-full p-0.5 ${dark ? "bg-zinc-800" : "bg-zinc-100"}`}
          role="group"
          aria-label="Nature du lien"
        >
          <button
            type="button"
            aria-pressed={!dotted}
            aria-label={
              dotted && hierarchyConversionReplacesManager
                ? "Convertir en lien hiérarchique et remplacer le responsable actuel"
                : "Convertir en lien hiérarchique"
            }
            title={
              hierarchyConversionBlocked
                ? "Conversion impossible : elle créerait une boucle hiérarchique"
                : dotted && hierarchyConversionReplacesManager
                  ? "Devient le responsable principal et remplace l'ancien rattachement"
                  : "Lien hiérarchique"
            }
            disabled={hierarchyConversionBlocked}
            onClick={() => onKindChange?.("hierarchy")}
            className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-35 ${
              !dotted
                ? "bg-primary-600 text-white shadow-sm"
                : dark
                  ? "text-zinc-300 hover:bg-zinc-700"
                  : "text-zinc-600 hover:bg-white"
            }`}
          >
            <GitBranch className="h-3.5 w-3.5" />
            Hiérarchique
          </button>
          <button
            type="button"
            aria-pressed={Boolean(dotted)}
            aria-label="Convertir en lien fonctionnel"
            title="Lien fonctionnel, sans effet sur la hiérarchie"
            onClick={() => onKindChange?.("dotted")}
            className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
              dotted
                ? "bg-primary-600 text-white shadow-sm"
                : dark
                  ? "text-zinc-300 hover:bg-zinc-700"
                  : "text-zinc-600 hover:bg-white"
            }`}
          >
            <Workflow className="h-3.5 w-3.5" />
            Fonctionnel
          </button>
        </div>
        {hasManualRouting && onResetRouting && (
          <>
            <span className={`mx-0.5 h-5 w-px ${dark ? "bg-zinc-700" : "bg-zinc-200"}`} />
            <button
              type="button"
              onClick={onResetRouting}
              className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                dark ? "text-zinc-300 hover:bg-zinc-800" : "text-zinc-600 hover:bg-zinc-100"
              }`}
              title="Revenir au tracé qui évite automatiquement les cartes"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Tracé auto
            </button>
          </>
        )}
      </div>
    </EdgeToolbar>
  );

  const renderRoute = (points: EdgeRoutePoint[]) => {
    const axis = routeAxis;
    const control = axis ? routeControlPoint(points, axis) : undefined;
    return (
      <>
        <BaseEdge id={id} path={pointsToPath(points)} style={style} markerEnd={markerEnd} interactionWidth={28} />
        {renderToolbar(routeMidpoint(points))}
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
    return renderRoute(route);
  }

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={28} />
      {renderToolbar({ x: labelX, y: labelY })}
    </>
  );
}
