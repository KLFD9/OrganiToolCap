import { create } from "zustand";
import type { OrgChartFile, OrgEdge, OrgNode, OrgNodeData, OrgNodeStyle, OrgTheme } from "../types/orgchart";
import { athanorDemo } from "../templates/athanorDemo";
import { layoutWithElk } from "../lib/elkLayout";
import { layoutCompact } from "../lib/compactLayout";
import { computeHiddenNodeIds } from "../lib/hierarchy";

let nodeCounter = 0;
function generateId(prefix: string): string {
  nodeCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${nodeCounter}`;
}

interface HistorySnapshot {
  meta: OrgChartFile["meta"];
  templateId: string;
  theme: OrgTheme;
  nodes: OrgNode[];
  edges: OrgEdge[];
  layout: OrgChartFile["layout"];
}

const MAX_HISTORY = 50;

interface OrgChartState {
  meta: OrgChartFile["meta"];
  templateId: string;
  theme: OrgTheme;
  nodes: OrgNode[];
  edges: OrgEdge[];
  layout: OrgChartFile["layout"];

  fileHandle?: FileSystemFileHandle;
  isDirty: boolean;
  selectedNodeIds: string[];
  /** Branches repliées (état de vue, non persisté dans le fichier). */
  collapsedNodeIds: string[];

  past: HistorySnapshot[];
  future: HistorySnapshot[];
  undo: () => void;
  redo: () => void;

  // -- chargement / sérialisation --
  loadFile: (file: OrgChartFile, handle?: FileSystemFileHandle) => void;
  toFile: () => OrgChartFile;
  markSaved: (handle?: FileSystemFileHandle) => void;

  // -- méta --
  setTitle: (title: string) => void;
  setSubtitle: (subtitle: string) => void;
  setFooter: (footer: string) => void;
  setTheme: (theme: Partial<OrgTheme>) => void;
  setTemplateId: (templateId: string) => void;

  // -- nœuds --
  setNodePosition: (id: string, position: { x: number; y: number }) => void;
  updateNodeData: (id: string, data: Partial<OrgNodeData>) => void;
  updateNodeStyleOverride: (id: string, override: Partial<OrgNodeStyle> | undefined) => void;
  updateNodesStyleOverride: (ids: string[], override: Partial<OrgNodeStyle>) => void;
  addNode: (parentId?: string) => void;
  /** Ajoute un membre à une position précise du canvas (edge-drop, clic droit). */
  addNodeAt: (position: { x: number; y: number }, parentId?: string) => void;
  duplicateNode: (id: string) => void;
  deleteNode: (id: string) => void;
  deleteNodes: (ids: string[]) => void;

  // -- arêtes --
  addEdge: (source: string, target: string) => void;
  deleteEdge: (id: string) => void;

  // -- layout --
  setLayoutDirection: (direction: "TB" | "LR") => void;
  setLayoutAuto: (auto: boolean) => void;
  applyAutoLayout: () => Promise<void>;
  applyCompactLayout: () => void;
  /**
   * Applique une disposition candidate (optimiseur d'export) : fusionne les
   * positions par id — les nœuds absents (branches repliées) sont préservés.
   */
  applyLayoutCandidate: (
    positionedNodes: OrgNode[],
    layout: Pick<OrgChartFile["layout"], "direction" | "mode">
  ) => void;

  // -- sélection --
  selectNode: (id: string | null) => void;
  selectNodes: (ids: string[]) => void;

  // -- repli de branches --
  toggleCollapsed: (id: string) => void;
  expandAll: () => void;
}

function touch(state: { meta: OrgChartFile["meta"] }) {
  state.meta = { ...state.meta, updatedAt: new Date().toISOString() };
}

/** Capture l'état actuel dans l'historique d'annulation avant de le modifier. */
function pushHistory(s: OrgChartState): Pick<OrgChartState, "past" | "future"> {
  const snapshot: HistorySnapshot = {
    meta: s.meta,
    templateId: s.templateId,
    theme: s.theme,
    nodes: s.nodes,
    edges: s.edges,
    layout: s.layout,
  };
  return { past: [...s.past, snapshot].slice(-MAX_HISTORY), future: [] };
}

/** Vrai si `target` est un ancêtre de `source` (i.e. relier source -> target créerait un cycle). */
function wouldCreateCycle(edges: OrgEdge[], source: string, target: string): boolean {
  const parentOf = new Map<string, string>();
  for (const e of edges) parentOf.set(e.target, e.source);

  let current: string | undefined = source;
  const seen = new Set<string>();
  while (current) {
    if (current === target) return true;
    if (seen.has(current)) break;
    seen.add(current);
    current = parentOf.get(current);
  }
  return false;
}

export const useOrgChartStore = create<OrgChartState>((set, get) => ({
  meta: athanorDemo.meta,
  templateId: athanorDemo.templateId,
  theme: athanorDemo.theme,
  nodes: athanorDemo.nodes,
  edges: athanorDemo.edges,
  layout: athanorDemo.layout,

  fileHandle: undefined,
  isDirty: false,
  selectedNodeIds: [],
  collapsedNodeIds: [],

  past: [],
  future: [],

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s;
      const previous = s.past[s.past.length - 1];
      const current: HistorySnapshot = {
        meta: s.meta,
        templateId: s.templateId,
        theme: s.theme,
        nodes: s.nodes,
        edges: s.edges,
        layout: s.layout,
      };
      return {
        ...previous,
        past: s.past.slice(0, -1),
        future: [current, ...s.future].slice(0, MAX_HISTORY),
        isDirty: true,
        selectedNodeIds: [],
      };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      const current: HistorySnapshot = {
        meta: s.meta,
        templateId: s.templateId,
        theme: s.theme,
        nodes: s.nodes,
        edges: s.edges,
        layout: s.layout,
      };
      return {
        ...next,
        past: [...s.past, current].slice(-MAX_HISTORY),
        future: s.future.slice(1),
        isDirty: true,
        selectedNodeIds: [],
      };
    }),

  loadFile: (file, handle) =>
    set({
      meta: file.meta,
      templateId: file.templateId,
      theme: file.theme,
      nodes: file.nodes,
      edges: file.edges,
      layout: file.layout,
      fileHandle: handle,
      isDirty: false,
      selectedNodeIds: [],
      collapsedNodeIds: [],
      past: [],
      future: [],
    }),

  toFile: () => {
    const s = get();
    return {
      format: "orgchart",
      version: 1,
      meta: s.meta,
      templateId: s.templateId,
      theme: s.theme,
      nodes: s.nodes,
      edges: s.edges,
      layout: s.layout,
    };
  },

  markSaved: (handle) =>
    set((s) => ({ isDirty: false, fileHandle: handle ?? s.fileHandle })),

  setTitle: (title) =>
    set((s) => {
      touch(s);
      return { ...pushHistory(s), meta: { ...s.meta, title, updatedAt: new Date().toISOString() }, isDirty: true };
    }),

  setSubtitle: (subtitle) =>
    set((s) => ({
      ...pushHistory(s),
      meta: { ...s.meta, subtitle, updatedAt: new Date().toISOString() },
      isDirty: true,
    })),

  setFooter: (footer) =>
    set((s) => ({
      ...pushHistory(s),
      meta: { ...s.meta, footer, updatedAt: new Date().toISOString() },
      isDirty: true,
    })),

  setTheme: (theme) =>
    set((s) => ({
      ...pushHistory(s),
      theme: { ...s.theme, ...theme },
      meta: { ...s.meta, updatedAt: new Date().toISOString() },
      isDirty: true,
    })),

  setTemplateId: (templateId) => set((s) => ({ ...pushHistory(s), templateId, isDirty: true })),

  setNodePosition: (id, position) =>
    set((s) => ({
      ...pushHistory(s),
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
      isDirty: true,
    })),

  updateNodeData: (id, data) =>
    set((s) => ({
      ...pushHistory(s),
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)),
      meta: { ...s.meta, updatedAt: new Date().toISOString() },
      isDirty: true,
    })),

  updateNodeStyleOverride: (id, override) =>
    set((s) => ({
      ...pushHistory(s),
      nodes: s.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              styleOverride:
                override && Object.keys(override).length > 0
                  ? { ...n.styleOverride, ...override }
                  : undefined,
            }
          : n
      ),
      isDirty: true,
    })),

  updateNodesStyleOverride: (ids, override) =>
    set((s) => ({
      ...pushHistory(s),
      nodes: s.nodes.map((n) =>
        ids.includes(n.id) ? { ...n, styleOverride: { ...n.styleOverride, ...override } } : n
      ),
      isDirty: true,
    })),

  addNode: (parentId) =>
    set((s) => {
      const history = pushHistory(s);
      const id = generateId("node");
      let position = { x: 0, y: 0 };
      if (parentId) {
        const parent = s.nodes.find((n) => n.id === parentId);
        if (parent) {
          position = { x: parent.position.x, y: parent.position.y + 160 };
        }
      } else if (s.nodes.length > 0) {
        const last = s.nodes[s.nodes.length - 1];
        position = { x: last.position.x + 260, y: last.position.y };
      }

      const newNode: OrgNode = {
        id,
        position,
        data: { name: "Nouveau membre", role: "Poste" },
      };

      const newEdges = parentId
        ? [...s.edges, { id: generateId("edge"), source: parentId, target: id }]
        : s.edges;

      return {
        ...history,
        nodes: [...s.nodes, newNode],
        edges: newEdges,
        selectedNodeIds: [id],
        isDirty: true,
        meta: { ...s.meta, updatedAt: new Date().toISOString() },
      };
    }),

  addNodeAt: (position, parentId) =>
    set((s) => {
      const id = generateId("node");
      const newNode: OrgNode = {
        id,
        position,
        data: { name: "Nouveau membre", role: "Poste" },
      };
      const newEdges = parentId
        ? [...s.edges, { id: generateId("edge"), source: parentId, target: id }]
        : s.edges;
      return {
        ...pushHistory(s),
        nodes: [...s.nodes, newNode],
        edges: newEdges,
        selectedNodeIds: [id],
        isDirty: true,
        meta: { ...s.meta, updatedAt: new Date().toISOString() },
      };
    }),

  duplicateNode: (id) =>
    set((s) => {
      const original = s.nodes.find((n) => n.id === id);
      if (!original) return s;

      const newId = generateId("node");
      const clone: OrgNode = {
        ...original,
        id: newId,
        position: { x: original.position.x + 40, y: original.position.y + 40 },
        data: { ...original.data },
        styleOverride: original.styleOverride ? { ...original.styleOverride } : undefined,
      };

      // Rattache le clone au même responsable que l'original, le cas échéant
      const parentEdge = s.edges.find((e) => e.target === id);
      const newEdges = parentEdge
        ? [...s.edges, { id: generateId("edge"), source: parentEdge.source, target: newId }]
        : s.edges;

      return {
        ...pushHistory(s),
        nodes: [...s.nodes, clone],
        edges: newEdges,
        selectedNodeIds: [newId],
        isDirty: true,
        meta: { ...s.meta, updatedAt: new Date().toISOString() },
      };
    }),

  deleteNode: (id) =>
    set((s) => ({
      ...pushHistory(s),
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeIds: s.selectedNodeIds.filter((sid) => sid !== id),
      collapsedNodeIds: s.collapsedNodeIds.filter((cid) => cid !== id),
      isDirty: true,
      meta: { ...s.meta, updatedAt: new Date().toISOString() },
    })),

  deleteNodes: (ids) =>
    set((s) => {
      const idSet = new Set(ids);
      return {
        ...pushHistory(s),
        nodes: s.nodes.filter((n) => !idSet.has(n.id)),
        edges: s.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
        selectedNodeIds: s.selectedNodeIds.filter((sid) => !idSet.has(sid)),
        collapsedNodeIds: s.collapsedNodeIds.filter((cid) => !idSet.has(cid)),
        isDirty: true,
        meta: { ...s.meta, updatedAt: new Date().toISOString() },
      };
    }),

  addEdge: (source, target) =>
    set((s) => {
      if (source === target) return s;
      // Empêche les doublons et les liens entrants multiples sur une cible (un seul parent)
      const exists = s.edges.some((e) => e.source === source && e.target === target);
      if (exists) return s;
      // Empêche de créer un cycle (un responsable ne peut pas dépendre de l'un de ses subordonnés)
      if (wouldCreateCycle(s.edges, source, target)) return s;
      const filtered = s.edges.filter((e) => e.target !== target);
      return {
        ...pushHistory(s),
        edges: [...filtered, { id: generateId("edge"), source, target }],
        isDirty: true,
      };
    }),

  deleteEdge: (id) =>
    set((s) => ({
      ...pushHistory(s),
      edges: s.edges.filter((e) => e.id !== id),
      isDirty: true,
    })),

  setLayoutDirection: (direction) =>
    set((s) => ({ ...pushHistory(s), layout: { ...s.layout, direction }, isDirty: true })),

  setLayoutAuto: (auto) => set((s) => ({ ...pushHistory(s), layout: { ...s.layout, auto }, isDirty: true })),

  applyAutoLayout: async () => {
    const s = get();
    const laidOut = await layoutWithElk(s.nodes, s.edges, s.layout.direction);
    set({ ...pushHistory(s), nodes: laidOut, layout: { ...s.layout, mode: "tree" }, isDirty: true });
  },

  applyCompactLayout: () => {
    const s = get();
    const { nodes } = layoutCompact(s.nodes, s.edges);
    set({
      ...pushHistory(s),
      nodes,
      layout: { ...s.layout, direction: "TB", mode: "compact" },
      isDirty: true,
    });
  },

  applyLayoutCandidate: (positionedNodes, layout) =>
    set((s) => {
      const posById = new Map(positionedNodes.map((n) => [n.id, n.position]));
      return {
        ...pushHistory(s),
        nodes: s.nodes.map((n) => {
          const position = posById.get(n.id);
          return position ? { ...n, position } : n;
        }),
        layout: { ...s.layout, ...layout },
        isDirty: true,
        meta: { ...s.meta, updatedAt: new Date().toISOString() },
      };
    }),

  selectNode: (id) => set({ selectedNodeIds: id ? [id] : [] }),
  selectNodes: (ids) => set({ selectedNodeIds: ids }),

  toggleCollapsed: (id) =>
    set((s) => {
      const collapsedNodeIds = s.collapsedNodeIds.includes(id)
        ? s.collapsedNodeIds.filter((cid) => cid !== id)
        : [...s.collapsedNodeIds, id];
      // Un nœud masqué ne doit pas rester sélectionné (il n'est plus manipulable)
      const hidden = computeHiddenNodeIds(collapsedNodeIds, s.edges);
      return {
        collapsedNodeIds,
        selectedNodeIds: s.selectedNodeIds.filter((sid) => !hidden.has(sid)),
      };
    }),

  expandAll: () => set({ collapsedNodeIds: [] }),
}));
