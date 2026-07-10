import { create } from "zustand";
import {
  ORG_CHART_VERSION,
  isHierarchyEdge,
  type ChromeElement,
  type ChromeKey,
  type OrgChartFile,
  type OrgEdge,
  type OrgFrame,
  type OrgNode,
  type OrgNodeData,
  type OrgNodeStyle,
  type OrgTheme,
} from "../types/orgchart";
import { createEmptyChart } from "../templates/blank";
import { layoutWithElk } from "../lib/elkLayout";
import { CARD_HEIGHT, CARD_WIDTH, layoutCompact } from "../lib/compactLayout";
import { computeDescendants, computeHiddenNodeIds, revealNodeInCollapsedBranches, wouldCreateHierarchyCycle } from "../lib/hierarchy";
import {
  availableAreaForSetup,
  chromeOffsetsForSetup,
  COMFORT_MM_PER_PX,
  DEFAULT_PAGE,
  type PageSetup,
} from "../lib/readability";
import {
  computeFrameMembership,
  defaultFrameName,
  FRAME_GAP_PX,
  frameRectPx,
  nextFramePosition,
  nodesBounds,
} from "../lib/frames";

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
  frames: OrgFrame[];
}

const MAX_HISTORY = 50;

interface OrgChartState {
  meta: OrgChartFile["meta"];
  templateId: string;
  theme: OrgTheme;
  nodes: OrgNode[];
  edges: OrgEdge[];
  layout: OrgChartFile["layout"];
  /** Pages explicites (multi-pages). Vide = page implicite historique. */
  frames: OrgFrame[];

  fileHandle?: FileSystemFileHandle;
  isDirty: boolean;
  selectedNodeIds: string[];
  /** Page (frame) sélectionnée dans le navigateur de pages ou le canevas — mutuellement exclusif avec selectedNodeIds. */
  selectedFrameId: string | null;
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
  /** Fixe ou réinitialise le corridor manuel d'un connecteur. */
  setEdgeRouting: (id: string, routing?: OrgEdge["routing"]) => void;
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
  /** Sélectionne une page (frame) pour afficher ses propriétés dans l'inspecteur ; désélectionne les cartes. */
  selectFrame: (id: string | null) => void;

  // -- repli de branches --
  toggleCollapsed: (id: string) => void;
  expandAll: () => void;

  // -- frames multi-pages --
  /** Ajoute une page (feuille posée à droite des pages ou du contenu). Renvoie son id. */
  addFrame: (page?: PageSetup) => string;
  updateFrame: (id: string, patch: Partial<Omit<OrgFrame, "id">>) => void;
  /** Supprime la page ; les cartes restent sur le canvas (hors page). */
  deleteFrame: (id: string) => void;
  /** Déplace la feuille ET les cartes membres du même delta (une entrée d'historique). */
  moveFrameWithContent: (id: string, position: { x: number; y: number }, memberIds: string[]) => void;
  /** Réordonne la page dans l'ordre d'export (-1 = avancer, +1 = reculer). */
  reorderFrame: (id: string, direction: -1 | 1) => void;
  /** Duplique la page avec son contenu (cartes + liens internes). Renvoie l'id de la copie. */
  duplicateFrame: (id: string) => string | undefined;
  /** Position/taille d'un élément d'en-tête propre à une page. */
  setFrameChromeElement: (frameId: string, key: ChromeKey, element: ChromeElement) => void;
  /**
   * « Créer une page pour cette branche » : nouvelle page contenant une copie
   * du sous-arbre du responsable, rangée automatiquement dans la zone utile.
   */
  addFrameForBranch: (rootId: string) => Promise<string | undefined>;
  /** Range le contenu d'une page (arbre vertical) dans sa zone utile. */
  arrangeFrame: (frameId: string) => Promise<void>;
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
    frames: s.frames,
  };
  return { past: [...s.past, snapshot].slice(-MAX_HISTORY), future: [] };
}


const initialChart = createEmptyChart();

export const useOrgChartStore = create<OrgChartState>((set, get) => ({
  meta: initialChart.meta,
  templateId: initialChart.templateId,
  theme: initialChart.theme,
  nodes: initialChart.nodes,
  edges: initialChart.edges,
  layout: initialChart.layout,
  frames: initialChart.frames ?? [],

  fileHandle: undefined,
  isDirty: false,
  selectedNodeIds: [],
  selectedFrameId: initialChart.frames?.[0]?.id ?? null,
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
        frames: s.frames,
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
        frames: s.frames,
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
      frames: file.frames ?? [],
      fileHandle: handle,
      isDirty: false,
      selectedNodeIds: [],
      selectedFrameId: file.frames?.[0]?.id ?? null,
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
      // Additif : omis tant qu'aucune page explicite n'existe (fichiers stables)
      ...(s.frames.length > 0 ? { frames: s.frames } : {}),
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
    set((s) => {
      // Garde : la sélection peut contenir des nœuds d'édition (éléments de
      // chrome, cadre de page) qui ne sont pas des membres — ne pas créer
      // d'entrée d'historique vide pour eux.
      if (!s.nodes.some((n) => n.id === id)) return s;
      return {
        ...pushHistory(s),
        nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
        isDirty: true,
      };
    }),

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
          // Sous le parent s'il n'a pas encore d'enfant ; sinon à droite du
          // subordonné le plus à droite, aligné sur sa rangée — jamais empilé
          // au même point que la fratrie.
          const byId = new Map(s.nodes.map((n) => [n.id, n]));
          const siblings = s.edges
            .filter((e) => isHierarchyEdge(e) && e.source === parentId)
            .map((e) => byId.get(e.target))
            .filter((n): n is OrgNode => Boolean(n));
          if (siblings.length === 0) {
            position = { x: parent.position.x, y: parent.position.y + 160 };
          } else {
            const rightmost = siblings.reduce((a, b) => (b.position.x > a.position.x ? b : a));
            position = {
              x: rightmost.position.x + CARD_WIDTH + 48,
              y: rightmost.position.y,
            };
          }
        }
      } else if (s.nodes.length > 0) {
        const last = s.nodes[s.nodes.length - 1];
        position = { x: last.position.x + 260, y: last.position.y };
      } else if (s.frames.length > 0) {
        // Première personne : centre de la page active (ou de la première),
        // jamais l'origine arbitraire du canvas.
        const frame =
          s.frames.find((candidate) => candidate.id === s.selectedFrameId) ?? s.frames[0];
        const rect = frameRectPx(frame);
        position = {
          x: rect.x + (rect.width - CARD_WIDTH) / 2,
          y: rect.y + (rect.height - CARD_HEIGHT) / 2,
        };
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
        collapsedNodeIds: revealNodeInCollapsedBranches(s.collapsedNodeIds, newEdges, id),
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
        collapsedNodeIds: revealNodeInCollapsedBranches(s.collapsedNodeIds, newEdges, id),
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
        collapsedNodeIds: revealNodeInCollapsedBranches(s.collapsedNodeIds, newEdges, newId),
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
      // Rien à supprimer (sélection composée d'éléments d'édition uniquement)
      if (!s.nodes.some((n) => idSet.has(n.id))) return s;
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
      const newEdge = { id: generateId("edge"), source, target };
      const edges = [...filtered, newEdge];
      return {
        ...pushHistory(s),
        edges,
        collapsedNodeIds: revealNodeInCollapsedBranches(s.collapsedNodeIds, edges, target),
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
        const edges = [
          ...others,
          { id: edge.id, source: edge.source, target: edge.target },
        ];
        return {
          ...pushHistory(s),
          edges,
          collapsedNodeIds: revealNodeInCollapsedBranches(s.collapsedNodeIds, edges, edge.target),
          isDirty: true,
        };
      }

      return {
        ...pushHistory(s),
        edges: s.edges.map((e) => (e.id === id ? { ...e, kind: "dotted" as const } : e)),
        isDirty: true,
      };
    }),

  setEdgeRouting: (id, routing) =>
    set((s) => {
      if (!s.edges.some((edge) => edge.id === id)) return s;
      return {
        ...pushHistory(s),
        edges: s.edges.map((edge) => (edge.id === id ? { ...edge, routing } : edge)),
        isDirty: true,
        meta: { ...s.meta, updatedAt: new Date().toISOString() },
      };
    }),

  setManager: (childId, managerId) =>
    set((s) => {
      if (managerId === childId) return s;
      const currentParent = s.edges.find((e) => isHierarchyEdge(e) && e.target === childId);
      if ((currentParent?.source ?? undefined) === managerId) return s;
      if (managerId && wouldCreateHierarchyCycle(s.edges, managerId, childId)) return s;

      const withoutParent = s.edges.filter((e) => !(isHierarchyEdge(e) && e.target === childId));
      const edges = managerId
        ? [...withoutParent, { id: generateId("edge"), source: managerId, target: childId }]
        : withoutParent;
      return {
        ...pushHistory(s),
        edges,
        collapsedNodeIds: revealNodeInCollapsedBranches(s.collapsedNodeIds, edges, childId),
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

  selectNode: (id) =>
    set((s) => ({
      selectedNodeIds: id ? [id] : [],
      selectedFrameId: null,
      collapsedNodeIds: id
        ? revealNodeInCollapsedBranches(s.collapsedNodeIds, s.edges, id)
        : s.collapsedNodeIds,
    })),
  // React Flow ré-émet onSelectionChange([]) à chaque recalcul de la liste de
  // nœuds (ex. maj des pages), pas seulement au clic utilisateur — ne pas
  // effacer une sélection de page sur une émission vide non déclenchée par
  // un clic (cf. onPaneClick, qui gère explicitement la désélection totale).
  selectNodes: (ids) =>
    set((s) => {
      const selectedFrameId = ids.length > 0 ? null : s.selectedFrameId;
      const unchanged =
        selectedFrameId === s.selectedFrameId &&
        ids.length === s.selectedNodeIds.length &&
        ids.every((id) => s.selectedNodeIds.includes(id));
      // React Flow peut réémettre la même sélection après une synchronisation
      // d'arêtes — parfois dans un ordre différent (les ids sont uniques, la
      // composition suffit). Renvoyer le même état évite une boucle
      // store → edges → store.
      return unchanged ? s : { selectedNodeIds: [...ids], selectedFrameId };
    }),
  selectFrame: (id) => set({ selectedFrameId: id, selectedNodeIds: [] }),

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

  addFrame: (page) => {
    const id = generateId("frame");
    set((s) => {
      const framePage = page ?? s.layout.page ?? DEFAULT_PAGE;
      const frame: OrgFrame = {
        id,
        name: defaultFrameName(s.frames),
        position: nextFramePosition(s.frames, framePage, nodesBounds(s.nodes)),
        page: framePage,
      };
      return {
        ...pushHistory(s),
        frames: [...s.frames, frame],
        // Une page invisible n'aurait aucun sens : réaffiche le cadre de page
        pageGuide: true,
        isDirty: true,
        meta: { ...s.meta, updatedAt: new Date().toISOString() },
      };
    });
    return id;
  },

  updateFrame: (id, patch) =>
    set((s) => {
      if (!s.frames.some((f) => f.id === id)) return s;
      return {
        ...pushHistory(s),
        frames: s.frames.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        isDirty: true,
        meta: { ...s.meta, updatedAt: new Date().toISOString() },
      };
    }),

  deleteFrame: (id) =>
    set((s) => {
      if (!s.frames.some((f) => f.id === id)) return s;
      return {
        ...pushHistory(s),
        frames: s.frames.filter((f) => f.id !== id),
        selectedFrameId: s.selectedFrameId === id ? null : s.selectedFrameId,
        isDirty: true,
        meta: { ...s.meta, updatedAt: new Date().toISOString() },
      };
    }),

  moveFrameWithContent: (id, position, memberIds) =>
    set((s) => {
      const frame = s.frames.find((f) => f.id === id);
      if (!frame) return s;
      const dx = position.x - frame.position.x;
      const dy = position.y - frame.position.y;
      if (dx === 0 && dy === 0) return s;
      const members = new Set(memberIds);
      return {
        ...pushHistory(s),
        frames: s.frames.map((f) => (f.id === id ? { ...f, position } : f)),
        nodes: s.nodes.map((n) =>
          members.has(n.id) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n
        ),
        isDirty: true,
        meta: { ...s.meta, updatedAt: new Date().toISOString() },
      };
    }),

  reorderFrame: (id, direction) =>
    set((s) => {
      const index = s.frames.findIndex((f) => f.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= s.frames.length) return s;
      const frames = [...s.frames];
      [frames[index], frames[target]] = [frames[target], frames[index]];
      return {
        ...pushHistory(s),
        frames,
        isDirty: true,
        meta: { ...s.meta, updatedAt: new Date().toISOString() },
      };
    }),

  duplicateFrame: (id) => {
    const s = get();
    const source = s.frames.find((f) => f.id === id);
    if (!source) return undefined;

    const newFrameId = generateId("frame");
    const framePage = source.page;
    const position = nextFramePosition(s.frames, framePage);
    const dx = position.x - source.position.x;
    const dy = position.y - source.position.y;

    // Contenu de la page source : appartenance géométrique (centre dans la feuille)
    const membership = computeFrameMembership(s.frames, s.nodes);
    const memberIds = new Set(membership.byFrame.get(id) ?? []);

    const idMap = new Map<string, string>();
    const clonedNodes: OrgNode[] = s.nodes
      .filter((n) => memberIds.has(n.id))
      .map((n) => {
        const cloneId = generateId("node");
        idMap.set(n.id, cloneId);
        return {
          ...n,
          id: cloneId,
          position: { x: n.position.x + dx, y: n.position.y + dy },
          data: { ...n.data },
          styleOverride: n.styleOverride ? { ...n.styleOverride } : undefined,
        };
      });
    // Seuls les liens internes à la page sont clonés (les liens vers
    // l'extérieur créeraient des doublons hiérarchiques).
    const clonedEdges: OrgEdge[] = s.edges
      .filter((e) => memberIds.has(e.source) && memberIds.has(e.target))
      .map((e) => ({
        id: generateId("edge"),
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
        ...(e.kind ? { kind: e.kind } : {}),
      }));

    const clone: OrgFrame = {
      ...source,
      id: newFrameId,
      name: `${source.name} (copie)`,
      position,
      meta: source.meta ? { ...source.meta } : undefined,
      chromeLayout: source.chromeLayout ? { ...source.chromeLayout } : undefined,
    };

    set({
      ...pushHistory(s),
      frames: [...s.frames, clone],
      nodes: [...s.nodes, ...clonedNodes],
      edges: [...s.edges, ...clonedEdges],
      pageGuide: true,
      isDirty: true,
      meta: { ...s.meta, updatedAt: new Date().toISOString() },
    });
    return newFrameId;
  },

  setFrameChromeElement: (frameId, key, element) =>
    set((s) => {
      const frame = s.frames.find((f) => f.id === frameId);
      if (!frame) return s;
      return {
        ...pushHistory(s),
        frames: s.frames.map((f) =>
          f.id === frameId ? { ...f, chromeLayout: { ...f.chromeLayout, [key]: element } } : f
        ),
        isDirty: true,
        meta: { ...s.meta, updatedAt: new Date().toISOString() },
      };
    }),

  addFrameForBranch: async (rootId) => {
    const s = get();
    const root = s.nodes.find((n) => n.id === rootId);
    if (!root) return undefined;

    const branchIds = new Set([rootId, ...computeDescendants(s.edges, rootId)]);
    const branchNodes = s.nodes.filter((n) => branchIds.has(n.id));
    const branchEdges = s.edges.filter((e) => branchIds.has(e.source) && branchIds.has(e.target));

    // Copie du sous-arbre, rangée en arbre vertical
    const idMap = new Map<string, string>();
    const copies: OrgNode[] = branchNodes.map((n) => {
      const cloneId = generateId("node");
      idMap.set(n.id, cloneId);
      return {
        ...n,
        id: cloneId,
        data: { ...n.data },
        styleOverride: n.styleOverride ? { ...n.styleOverride } : undefined,
      };
    });
    const copiedEdges: OrgEdge[] = branchEdges.map((e) => ({
      id: generateId("edge"),
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
      ...(e.kind ? { kind: e.kind } : {}),
    }));
    const laidOut = await layoutWithElk(copies, copiedEdges, "TB");

    // L'état a pu changer pendant le calcul elk : on repart du présent
    const current = get();
    const framePage = current.layout.page ?? DEFAULT_PAGE;
    const frameId = generateId("frame");
    // La page de branche est une page SUPPLÉMENTAIRE : toujours posée à côté
    // (jamais sur le contenu existant, contrairement à la première page vide
    // qui, elle, enveloppe l'organigramme).
    const contentBounds = nodesBounds(current.nodes);
    const position =
      current.frames.length > 0
        ? nextFramePosition(current.frames, framePage)
        : contentBounds
        ? { x: contentBounds.x + contentBounds.width + FRAME_GAP_PX, y: contentBounds.y }
        : { x: 0, y: 0 };

    // Cale la copie dans la zone utile de la nouvelle feuille (px canvas =
    // mm / COMFORT, mêmes règles d'en-tête que l'export).
    const offsets = chromeOffsetsForSetup(framePage, {
      title: current.meta.title,
      footer: current.meta.footer,
      logoUrl: current.theme.logoUrl,
      secondaryLogoUrl: current.theme.secondaryLogoUrl,
    });
    const bounds = nodesBounds(laidOut);
    const insetX = position.x + framePage.margin / COMFORT_MM_PER_PX;
    const insetY = position.y + offsets.topOffset / COMFORT_MM_PER_PX;
    const shiftX = insetX - (bounds?.x ?? 0);
    const shiftY = insetY - (bounds?.y ?? 0);
    const placed = laidOut.map((n) => ({
      ...n,
      position: { x: n.position.x + shiftX, y: n.position.y + shiftY },
    }));

    const frame: OrgFrame = {
      id: frameId,
      name: root.data.name || defaultFrameName(current.frames),
      position,
      page: framePage,
      meta: { title: root.data.name || undefined },
    };

    set({
      ...pushHistory(current),
      frames: [...current.frames, frame],
      nodes: [...current.nodes, ...placed],
      edges: [...current.edges, ...copiedEdges],
      pageGuide: true,
      isDirty: true,
      meta: { ...current.meta, updatedAt: new Date().toISOString() },
    });
    return frameId;
  },

  arrangeFrame: async (frameId) => {
    const s = get();
    const frame = s.frames.find((f) => f.id === frameId);
    if (!frame) return;

    // Membres de la page (appartenance géométrique) et liens internes
    const membership = computeFrameMembership(s.frames, s.nodes);
    const memberIds = new Set(membership.byFrame.get(frameId) ?? []);
    if (memberIds.size === 0) return;
    const members = s.nodes.filter((n) => memberIds.has(n.id));
    const memberEdges = s.edges.filter((e) => memberIds.has(e.source) && memberIds.has(e.target));

    const laidOut = await layoutWithElk(members, memberEdges, "TB");

    // Recale le résultat dans la zone utile de la feuille
    const current = get();
    const liveFrame = current.frames.find((f) => f.id === frameId);
    if (!liveFrame) return;
    const offsets = chromeOffsetsForSetup(liveFrame.page, {
      title: liveFrame.meta?.title ?? current.meta.title,
      footer: current.meta.footer,
      logoUrl: current.theme.logoUrl,
      secondaryLogoUrl: current.theme.secondaryLogoUrl,
    });
    const bounds = nodesBounds(laidOut);
    const shiftX = liveFrame.position.x + liveFrame.page.margin / COMFORT_MM_PER_PX - (bounds?.x ?? 0);
    const shiftY = liveFrame.position.y + offsets.topOffset / COMFORT_MM_PER_PX - (bounds?.y ?? 0);
    const posById = new Map(
      laidOut.map((n) => [n.id, { x: n.position.x + shiftX, y: n.position.y + shiftY }])
    );

    set({
      ...pushHistory(current),
      nodes: current.nodes.map((n) => {
        const position = posById.get(n.id);
        return position ? { ...n, position } : n;
      }),
      isDirty: true,
      meta: { ...current.meta, updatedAt: new Date().toISOString() },
    });
  },
}));
