import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  SelectionMode,
  type Connection,
  type FinalConnectionState,
  type OnSelectionChangeFunc,
  type Node,
  type Edge,
} from "@xyflow/react";
import { useOrgChartStore } from "../store/useOrgChartStore";
import { computeLevels } from "../lib/nodeStyle";
import { computeDepartmentGroups, buildGroupTheme } from "../lib/groups";
import { computeStackedIds, CARD_WIDTH, CARD_HEIGHT } from "../lib/compactLayout";
import { buildChildrenMap, computeDescendantCounts, computeHiddenNodeIds, wouldCreateHierarchyCycle } from "../lib/hierarchy";
import { isHierarchyEdge } from "../types/orgchart";
import { NodeCard, type NodeCardData } from "./NodeCard";
import { GroupBackground, type GroupBackgroundData } from "./GroupBackground";
import { OrgEdge } from "./OrgEdge";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

interface MenuState {
  x: number;
  y: number;
  /** Menu d'un membre (clic droit sur une carte). */
  nodeId?: string;
  /** Menu d'un lien (clic droit sur une arête). */
  edgeId?: string;
  /** Menu du fond de canvas : position d'insertion en coordonnées flow. */
  flowPos?: { x: number; y: number };
}

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
  const collapsedNodeIds = useOrgChartStore((s) => s.collapsedNodeIds);
  const setNodePosition = useOrgChartStore((s) => s.setNodePosition);
  const addEdge = useOrgChartStore((s) => s.addEdge);
  const selectNodes = useOrgChartStore((s) => s.selectNodes);
  const addNode = useOrgChartStore((s) => s.addNode);
  const addNodeAt = useOrgChartStore((s) => s.addNodeAt);
  const duplicateNode = useOrgChartStore((s) => s.duplicateNode);
  const deleteNode = useOrgChartStore((s) => s.deleteNode);
  const deleteEdge = useOrgChartStore((s) => s.deleteEdge);
  const setEdgeKind = useOrgChartStore((s) => s.setEdgeKind);
  const toggleCollapsed = useOrgChartStore((s) => s.toggleCollapsed);
  const expandAll = useOrgChartStore((s) => s.expandAll);
  const applyAutoLayout = useOrgChartStore((s) => s.applyAutoLayout);

  const { screenToFlowPosition, fitView } = useReactFlow();
  const [menu, setMenu] = useState<MenuState | null>(null);

  const levels = useMemo(() => computeLevels(storeNodes, storeEdges), [storeNodes, storeEdges]);

  // Repli de branches : nœuds masqués et effectifs par responsable
  const hiddenIds = useMemo(
    () => computeHiddenNodeIds(collapsedNodeIds, storeEdges),
    [collapsedNodeIds, storeEdges]
  );
  const childrenMap = useMemo(() => buildChildrenMap(storeEdges), [storeEdges]);
  const descendantCounts = useMemo(() => computeDescendantCounts(storeEdges), [storeEdges]);
  const visibleNodes = useMemo(
    () => (hiddenIds.size === 0 ? storeNodes : storeNodes.filter((n) => !hiddenIds.has(n.id))),
    [storeNodes, hiddenIds]
  );

  // En disposition compacte, les groupes de feuilles sont empilés : poignée
  // cible à gauche et lien parent routé « en épine ».
  const stackedIds = useMemo(
    () => (layout.mode === "compact" ? computeStackedIds(storeNodes, storeEdges) : new Set<string>()),
    [layout.mode, storeNodes, storeEdges]
  );

  // Zones de regroupement visuel par pôle / département (nœuds visibles uniquement)
  const groupNodes = useMemo<Node<GroupBackgroundData>[]>(() => {
    if (!showGroups) return [];
    return computeDepartmentGroups(visibleNodes).map((group) => ({
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
  }, [visibleNodes, theme, showGroups]);

  // Adapter les nœuds pour le canvas
  const memberRfNodes = useMemo<Node<NodeCardData>[]>(
    () =>
      visibleNodes.map((n) => ({
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
          childCount: childrenMap.get(n.id)?.length ?? 0,
          hiddenCount: collapsedNodeIds.includes(n.id) ? descendantCounts.get(n.id) ?? 0 : 0,
          collapsed: collapsedNodeIds.includes(n.id),
        },
      })),
    [
      visibleNodes,
      theme,
      levels,
      layout.direction,
      selectedNodeIds,
      stackedIds,
      childrenMap,
      descendantCounts,
      collapsedNodeIds,
    ]
  );

  const initialRfNodes = useMemo<Node[]>(
    () => [...groupNodes, ...memberRfNodes],
    [groupNodes, memberRfNodes]
  );

  // Adapter les connexions (edges) avec un tracé ultra-propre et une animation subtile
  const initialRfEdges = useMemo<Edge[]>(
    () =>
      storeEdges
        .filter((e) => !hiddenIds.has(e.source) && !hiddenIds.has(e.target))
        .map((e) => {
        const isSelected = selectedNodeIds.includes(e.source) || selectedNodeIds.includes(e.target);
        const isDotted = e.kind === "dotted";
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: "org",
          animated: isSelected, // anime le flux des connexions liées au nœud sélectionné
          data: { spine: !isDotted && stackedIds.has(e.target) },
          style: {
            stroke: isSelected
              ? theme.accent
              : themeMode === "dark"
              ? "rgba(161, 161, 170, 0.25)"
              : "rgba(39, 39, 42, 0.15)",
            strokeWidth: isSelected ? 2 : 1.25,
            // Rattachement fonctionnel : trait pointillé (format v2)
            strokeDasharray: isDotted ? "6 5" : undefined,
          },
        };
      }),
    [storeEdges, theme.accent, selectedNodeIds, themeMode, stackedIds, hiddenIds]
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

  // Tirer un lien depuis la poignée source et le lâcher dans le vide crée
  // directement un subordonné à cet endroit (pattern « add node on edge drop »).
  const onConnectEnd = useCallback(
    (_event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      if (connectionState.isValid) return;
      const from = connectionState.fromNode;
      if (!from || from.type !== "orgNode" || connectionState.fromHandle?.type !== "source") return;
      const to = connectionState.to;
      if (!to) return;
      addNodeAt({ x: to.x - CARD_WIDTH / 2, y: to.y - CARD_HEIGHT / 2 }, from.id);
    },
    [addNodeAt]
  );

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      if (node.type !== "orgNode") return;
      selectNodes([node.id]);
      setMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
    },
    [selectNodes]
  );

  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
  }, []);

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      const { clientX, clientY } = event;
      setMenu({
        x: clientX,
        y: clientY,
        flowPos: screenToFlowPosition({ x: clientX, y: clientY }),
      });
    },
    [screenToFlowPosition]
  );

  const motionMs = (ms: number) =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : ms;

  const menuItems = useMemo<ContextMenuItem[]>(() => {
    if (!menu) return [];

    if (menu.edgeId) {
      const edge = storeEdges.find((e) => e.id === menu.edgeId);
      if (!edge) return [];
      const isDotted = !isHierarchyEdge(edge);
      // La conversion vers hiérarchique remplace l'ancien responsable ;
      // elle est bloquée si elle créerait un cycle.
      const conversionBase = storeEdges.filter(
        (e) => e.id !== edge.id && !(isHierarchyEdge(e) && e.target === edge.target)
      );
      const cycleBlocked = isDotted && wouldCreateHierarchyCycle(conversionBase, edge.source, edge.target);
      return [
        {
          label: isDotted ? "Convertir en lien hiérarchique" : "Convertir en lien fonctionnel",
          hint: isDotted ? (cycleBlocked ? "créerait un cycle" : undefined) : "pointillé",
          disabled: cycleBlocked,
          onClick: () => setEdgeKind(edge.id, isDotted ? "hierarchy" : "dotted"),
        },
        {
          label: "Supprimer le lien",
          danger: true,
          separator: true,
          onClick: () => deleteEdge(edge.id),
        },
      ];
    }

    if (menu.nodeId) {
      const nodeId = menu.nodeId;
      const childCount = childrenMap.get(nodeId)?.length ?? 0;
      const isCollapsed = collapsedNodeIds.includes(nodeId);
      const teamCount = descendantCounts.get(nodeId) ?? 0;
      const parentEdge = storeEdges.find((e) => e.kind !== "dotted" && e.target === nodeId);
      const items: ContextMenuItem[] = [
        { label: "Ajouter un subordonné", hint: "Tab", onClick: () => addNode(nodeId) },
        { label: "Ajouter un collègue", hint: "Entrée", onClick: () => addNode(parentEdge?.source) },
        { label: "Dupliquer le membre", onClick: () => duplicateNode(nodeId) },
      ];
      if (childCount > 0) {
        items.push({
          label: isCollapsed ? "Déplier la branche" : "Replier la branche",
          hint: `${teamCount} membre${teamCount > 1 ? "s" : ""}`,
          separator: true,
          onClick: () => toggleCollapsed(nodeId),
        });
      }
      if (parentEdge) {
        items.push({
          label: "Détacher du responsable",
          separator: childCount === 0,
          onClick: () => deleteEdge(parentEdge.id),
        });
      }
      items.push({
        label: "Supprimer ce membre",
        hint: "Suppr",
        danger: true,
        separator: true,
        onClick: () => deleteNode(nodeId),
      });
      return items;
    }

    const flowPos = menu.flowPos ?? { x: 0, y: 0 };
    const items: ContextMenuItem[] = [
      {
        label: "Ajouter un membre ici",
        onClick: () => addNodeAt({ x: flowPos.x - CARD_WIDTH / 2, y: flowPos.y - CARD_HEIGHT / 2 }),
      },
      {
        label: "Ranger automatiquement",
        separator: true,
        onClick: async () => {
          await applyAutoLayout();
          requestAnimationFrame(() => fitView({ duration: motionMs(300), padding: 0.2 }));
        },
      },
      { label: "Recadrer la vue", onClick: () => fitView({ duration: motionMs(300), padding: 0.2 }) },
    ];
    if (collapsedNodeIds.length > 0) {
      items.push({ label: "Tout déplier", separator: true, onClick: expandAll });
    }
    return items;
  }, [
    menu,
    childrenMap,
    collapsedNodeIds,
    descendantCounts,
    storeEdges,
    addNode,
    addNodeAt,
    duplicateNode,
    deleteNode,
    deleteEdge,
    toggleCollapsed,
    expandAll,
    applyAutoLayout,
    setEdgeKind,
    fitView,
  ]);

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
        onConnectEnd={onConnectEnd}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
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

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
          themeMode={themeMode}
        />
      )}
    </div>
  );
});

Canvas.displayName = "Canvas";
