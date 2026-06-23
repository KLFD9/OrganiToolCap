import { forwardRef, useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  SelectionMode,
  type Connection,
  type OnSelectionChangeFunc,
  type Node,
  type Edge,
} from "@xyflow/react";
import { useOrgChartStore } from "../store/useOrgChartStore";
import { computeLevels } from "../lib/nodeStyle";
import { computeDepartmentGroups, buildGroupTheme } from "../lib/groups";
import { computeStackedIds } from "../lib/compactLayout";
import { NodeCard, type NodeCardData } from "./NodeCard";
import { GroupBackground, type GroupBackgroundData } from "./GroupBackground";
import { OrgEdge } from "./OrgEdge";

const nodeTypes = { orgNode: NodeCard, groupBg: GroupBackground };
const edgeTypes = { org: OrgEdge };

interface CanvasProps {
  themeMode?: "light" | "dark";
  showGroups?: boolean;
}

export const Canvas = forwardRef<HTMLDivElement, CanvasProps>(({ themeMode = "light", showGroups = false }, ref) => {
  const storeNodes = useOrgChartStore((s) => s.nodes);
  const storeEdges = useOrgChartStore((s) => s.edges);
  const theme = useOrgChartStore((s) => s.theme);
  const layout = useOrgChartStore((s) => s.layout);
  const selectedNodeIds = useOrgChartStore((s) => s.selectedNodeIds);
  const setNodePosition = useOrgChartStore((s) => s.setNodePosition);
  const addEdge = useOrgChartStore((s) => s.addEdge);
  const selectNodes = useOrgChartStore((s) => s.selectNodes);

  const levels = useMemo(() => computeLevels(storeNodes, storeEdges), [storeNodes, storeEdges]);

  // En disposition compacte, les groupes de feuilles sont empilés : poignée
  // cible à gauche et lien parent routé « en épine ».
  const stackedIds = useMemo(
    () => (layout.mode === "compact" ? computeStackedIds(storeNodes, storeEdges) : new Set<string>()),
    [layout.mode, storeNodes, storeEdges]
  );

  // Zones de regroupement visuel par pôle / département
  const groupNodes = useMemo<Node<GroupBackgroundData>[]>(() => {
    if (!showGroups) return [];
    return computeDepartmentGroups(storeNodes).map((group) => ({
      id: group.id,
      type: "groupBg",
      position: { x: group.x, y: group.y },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -1,
      data: {
        department: group.department,
        width: group.width,
        height: group.height,
        color: buildGroupTheme(theme, group.colorIndex),
      },
    }));
  }, [storeNodes, theme, showGroups]);

  // Adapter les nœuds pour le canvas
  const memberRfNodes = useMemo<Node<NodeCardData>[]>(
    () =>
      storeNodes.map((n) => ({
        id: n.id,
        type: "orgNode",
        position: n.position,
        selected: selectedNodeIds.includes(n.id),
        data: {
          orgNode: n,
          theme,
          level: levels.get(n.id) ?? 0,
          direction: layout.direction,
          targetSide: stackedIds.has(n.id) ? ("left" as const) : undefined,
        },
      })),
    [storeNodes, theme, levels, layout.direction, selectedNodeIds, stackedIds]
  );

  const initialRfNodes = useMemo<Node[]>(
    () => [...groupNodes, ...memberRfNodes],
    [groupNodes, memberRfNodes]
  );

  // Adapter les connexions (edges) avec un tracé ultra-propre et une animation subtile
  const initialRfEdges = useMemo<Edge[]>(
    () =>
      storeEdges.map((e) => {
        const isSelected = selectedNodeIds.includes(e.source) || selectedNodeIds.includes(e.target);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "org",
          animated: isSelected, // anime le flux des connexions liées au nœud sélectionné
          data: { spine: stackedIds.has(e.target) },
          style: {
            stroke: isSelected
              ? theme.accent
              : themeMode === "dark"
              ? "rgba(161, 161, 170, 0.25)"
              : "rgba(39, 39, 42, 0.15)",
            strokeWidth: isSelected ? 2 : 1.25,
          },
        };
      }),
    [storeEdges, theme.accent, selectedNodeIds, themeMode, stackedIds]
  );

  const [rfNodes, setRfNodes, onNodesChangeBase] = useNodesState(initialRfNodes);
  const [rfEdges, setRfEdges, onEdgesChangeBase] = useEdgesState(initialRfEdges);

  useEffect(() => setRfNodes(initialRfNodes), [initialRfNodes, setRfNodes]);
  useEffect(() => setRfEdges(initialRfEdges), [initialRfEdges, setRfEdges]);

  const onNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChangeBase>[0]) => {
      onNodesChangeBase(changes);
      for (const change of changes) {
        if (change.type === "position" && change.position && change.dragging === false) {
          setNodePosition(change.id, change.position);
        }
      }
    },
    [onNodesChangeBase, setNodePosition]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        addEdge(connection.source, connection.target);
      }
    },
    [addEdge]
  );

  const onSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes }) => selectNodes(nodes.map((n) => n.id)),
    [selectNodes]
  );

  // Couleurs de fond de la grille
  const gridColor = themeMode === "dark" ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.05)";
  const maskColor = themeMode === "dark" ? "rgba(9, 9, 11, 0.7)" : "rgba(250, 249, 246, 0.7)";

  return (
    <div ref={ref} className="h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChangeBase}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnDrag={[1, 2]}
        multiSelectionKeyCode={["Meta", "Control"]}
        className="transition-colors duration-300"
      >
        <Background gap={24} color={gridColor} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable maskColor={maskColor} />
      </ReactFlow>
    </div>
  );
});

Canvas.displayName = "Canvas";
