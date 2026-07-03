import { create } from "zustand";
import {
  ORG_CHART_VERSION,
  isHierarchyEdge,
  type ChromeElement,
  type ChromeKey,
  type OrgChartFile,
  type OrgEdge,
  type OrgNode,
  type OrgNodeData,
  type OrgNodeStyle,
  type OrgTheme,
} from "../types/orgchart";
import { athanorDemo } from "../templates/athanorDemo";
import { layoutWithElk } from "../lib/elkLayout";
import { layoutCompact } from "../lib/compactLayout";
import { computeHiddenNodeIds, wouldCreateHierarchyCycle } from "../lib/hierarchy";
import { availableAreaForSetup, DEFAULT_PAGE, type PageSetup } from "../lib/readability";

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
  /** Cadre de page visible dans le canvas (état de vue, non persisté). */
  pageGuide: boolean;

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
  /** Position/taille d'un élément d'en-tête sur la feuille (WYSIWYG, mm). */
  setChromeElement: (key: ChromeKey, element: ChromeElement) => void;
  resetChromeLayout: () => void;
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
  /** Rattachement fonctionnel (pointillé) : plusieurs autorisés, hors hiérarchie. */
  addDottedEdge: (source: string, target: string) => void;
  /** Convertit un lien hiérarchique ⇄ fonctionnel (avec garde anti-cycle et parent unique). */
  setEdgeKind: (id: string, kind: "hierarchy" | "dotted") => void;
  /**
   * Change (ou retire, si undefined) le responsable hiérarchique d'un membre
   * en une seule entrée d'historique. Refuse les cycles.
   */
  setManager: (childId: string, managerId?: string) => void;
  deleteEdge: (id: string) => void;

  // -- layout --
  setLayoutDirection: (direction: "TB" | "LR") => void;
  setLayoutAuto: (auto: boolean) => void;
  /** Format de page cible (persisté dans le fichier) + affichage du cadre. */
  setPageSetup: (page: PageSetup) => void;
  togglePageGuide: () => void;
  applyAutoLayout: () => Promise<void>;
  /**
   * Rangement automatique optimisé pour le format de page du document :
   * essaie plusieurs dispositions et applique celle qui donne le plus grand
   * texte imprimé. Ne touche pas aux branches repliées.
   */
  applyAutoLayoutForPage: () => Promise<void>;
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
  pageGuide: true,

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
      version: ORG_CHART_VERSION,
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

  setChromeElement: (key, element) =>
    set((s) => ({
      ...pushHistory(s),
      meta: {
        ...s.meta,
        chromeLayout: { ...s.meta.chromeLayout, [key]: element },
        updatedAt: new Date().toISOString(),
      },
      isDirty: true,
    })),

  resetChromeLayout: () =>
    set((s) => {
      if (!s.meta.chromeLayout) return s;
      return {
        ...pushHistory(s),
        meta: { ...s.meta, chromeLayout: undefined, updatedAt: new Date().toISOString() },
        isDirty: true,
      };
    }),

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
      // Empêche les doublons (toutes natures confondues sur la même paire)
      const exists = s.edges.some((e) => e.source === source && e.target === target);
      if (exists) return s;
      // Empêche de créer un cycle (un responsable ne peut pas dépendre de l'un de ses subordonnés)
      if (wouldCreateHierarchyCycle(s.edges, source, target)) return s;
      // Un seul responsable hiérarchique par personne — les liens pointillés restent
      const filtered = s.edges.filter((e) => e.target !== target || !isHierarchyEdge(e));
      return {
        ...pushHistory(s),
        edges: [...filtered, { id: generateId("edge"), source, target }],
        isDirty: true,
      };
    }),

  addDottedEdge: (source, target) =>
    set((s) => {
      if (source === target) return s;
      const exists = s.edges.some((e) => e.source === source && e.target === target);
      if (exists) return s;
      return {
        ...pushHistory(s),
        edges: [...s.edges, { id: generateId("edge"), source, target, kind: "dotted" as const }],
        isDirty: true,
      };
    }),

  setEdgeKind: (id, kind) =>
    set((s) => {
      const edge = s.edges.find((e) => e.id === id);
      if (!edge || (edge.kind === "dotted" ? "dotted" : "hierarchy") === kind) return s;

      if (kind === "hierarchy") {
        // Conversion pointillé → hiérarchique : garde anti-cycle (calculée sans
        // l'ancien parent, qui sera remplacé), puis parent unique.
        const others = s.edges.filter(
          (e) => e.id !== id && !(isHierarchyEdge(e) && e.target === edge.target)
        );
        if (wouldCreateHierarchyCycle(others, edge.source, edge.target)) return s;
        return {
          ...pushHistory(s),
          edges: [
            ...others,
            { id: edge.id, source: edge.source, target: edge.target },
          ],
          isDirty: true,
        };
      }

      return {
        ...pushHistory(s),
        edges: s.edges.map((e) => (e.id === id ? { ...e, kind: "dotted" as const } : e)),
        isDirty: true,
      };
    }),

  setManager: (childId, managerId) =>
    set((s) => {
      if (managerId === childId) return s;
      const currentParent = s.edges.find((e) => isHierarchyEdge(e) && e.target === childId);
      if ((currentParent?.source ?? undefined) === managerId) return s;
      if (managerId && wouldCreateHierarchyCycle(s.edges, managerId, childId)) return s;

      const withoutParent = s.edges.filter((e) => !(isHierarchyEdge(e) && e.target === childId));
      return {
        ...pushHistory(s),
        edges: managerId
          ? [...withoutParent, { id: generateId("edge"), source: managerId, target: childId }]
          : withoutParent,
        isDirty: true,
        meta: { ...s.meta, updatedAt: new Date().toISOString() },
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

  setPageSetup: (page) =>
    set((s) => {
      const current = s.layout.page;
      if (
        current &&
        current.format === page.format &&
        current.orientation === page.orientation &&
        current.margin === page.margin
      ) {
        return s;
      }
      return {
        layout: { ...s.layout, page },
        isDirty: true,
        meta: { ...s.meta, updatedAt: new Date().toISOString() },
      };
    }),

  togglePageGuide: () => set((s) => ({ pageGuide: !s.pageGuide })),

  applyAutoLayout: async () => {
    const s = get();
    const laidOut = await layoutWithElk(s.nodes, s.edges, s.layout.direction);
    set({ ...pushHistory(s), nodes: laidOut, layout: { ...s.layout, mode: "tree" }, isDirty: true });
  },

  applyAutoLayoutForPage: async () => {
    const s = get();
    const hidden = computeHiddenNodeIds(s.collapsedNodeIds, s.edges);
    const visibleNodes = hidden.size === 0 ? s.nodes : s.nodes.filter((n) => !hidden.has(n.id));
    const visibleEdges =
      hidden.size === 0 ? s.edges : s.edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target));
    if (visibleNodes.length === 0) return;

    const page = s.layout.page ?? DEFAULT_PAGE;
    const avail = availableAreaForSetup(page, {
      title: s.meta.title,
      footer: s.meta.footer,
      logoUrl: s.theme.logoUrl,
      secondaryLogoUrl: s.theme.secondaryLogoUrl,
    });

    const { optimizeLayoutForPage } = await import("../lib/exportLayout");
    const best = (await optimizeLayoutForPage(visibleNodes, visibleEdges, s.layout, avail))[0];

    const posById = new Map(best.nodes.map((n) => [n.id, n.position]));
    const current = get(); // l'état a pu changer pendant le calcul elk
    set({
      ...pushHistory(current),
      nodes: current.nodes.map((n) => {
        const position = posById.get(n.id);
        return position ? { ...n, position } : n;
      }),
      layout: { ...current.layout, ...best.layout },
      isDirty: true,
      meta: { ...current.meta, updatedAt: new Date().toISOString() },
    });
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
