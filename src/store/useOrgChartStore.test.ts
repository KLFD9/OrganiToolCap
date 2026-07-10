import { beforeEach, describe, expect, it } from "vitest";
import { useOrgChartStore } from "./useOrgChartStore";
import { createBlankChart, createEmptyChart } from "../templates/blank";
import { frameRectPx } from "../lib/frames";

describe("useOrgChartStore", () => {
  beforeEach(() => {
    useOrgChartStore.getState().loadFile(createBlankChart("blank"));
  });

  it("addNode attaches a child to its parent and selects it", () => {
    const { addNode } = useOrgChartStore.getState();
    const rootId = useOrgChartStore.getState().nodes[0].id;

    addNode(rootId);

    const state = useOrgChartStore.getState();
    expect(state.nodes).toHaveLength(2);
    expect(state.selectedNodeIds).toEqual([state.nodes[1].id]);
    expect(state.edges).toContainEqual(
      expect.objectContaining({ source: rootId, target: state.nodes[1].id })
    );
  });

  it("addNode place chaque nouveau subordonné à droite de la fratrie, sans chevauchement", () => {
    const { addNode } = useOrgChartStore.getState();
    const rootId = useOrgChartStore.getState().nodes[0].id;

    addNode(rootId);
    addNode(rootId);
    addNode(rootId);

    const state = useOrgChartStore.getState();
    const root = state.nodes.find((n) => n.id === rootId)!;
    const children = state.nodes.filter((n) => n.id !== rootId);
    expect(children).toHaveLength(3);
    // Premier enfant : sous le parent
    expect(children[0].position.x).toBe(root.position.x);
    expect(children[0].position.y).toBeGreaterThan(root.position.y);
    // Les suivants : alignés sur la rangée, chacun à droite du précédent
    for (let i = 1; i < children.length; i++) {
      expect(children[i].position.y).toBe(children[0].position.y);
      expect(children[i].position.x).toBeGreaterThanOrEqual(children[i - 1].position.x + 240);
    }
  });

  it("place la première personne au centre de la page active", () => {
    useOrgChartStore.getState().loadFile(createEmptyChart());

    useOrgChartStore.getState().addNode();

    const state = useOrgChartStore.getState();
    const frame = state.frames[0];
    const node = state.nodes[0];
    const rect = frameRectPx(frame);
    expect(node.position.x + 120).toBeCloseTo(rect.x + rect.width / 2);
    expect(node.position.y + 55).toBeCloseTo(rect.y + rect.height / 2);
  });

  it("addEdge refuses to create a cycle", () => {
    const { addNode, addEdge } = useOrgChartStore.getState();
    const rootId = useOrgChartStore.getState().nodes[0].id;

    addNode(rootId); // root -> A
    const aId = useOrgChartStore.getState().nodes[1].id;
    addNode(aId); // A -> B
    const bId = useOrgChartStore.getState().nodes[2].id;

    const edgesBefore = useOrgChartStore.getState().edges;

    // B -> root fermerait la boucle root -> A -> B -> root
    addEdge(bId, rootId);

    expect(useOrgChartStore.getState().edges).toEqual(edgesBefore);
  });

  it("addEdge enforces a single parent per node", () => {
    const { addNode, addEdge } = useOrgChartStore.getState();
    const rootId = useOrgChartStore.getState().nodes[0].id;

    addNode(rootId); // root -> A
    const aId = useOrgChartStore.getState().nodes[1].id;
    addNode(); // ajoute un nœud B sans parent
    const bId = useOrgChartStore.getState().nodes[2].id;

    addEdge(bId, aId); // B devient le nouveau responsable de A

    const edgesToA = useOrgChartStore.getState().edges.filter((e) => e.target === aId);
    expect(edgesToA).toHaveLength(1);
    expect(edgesToA[0].source).toBe(bId);
  });

  it("addDottedEdge autorise plusieurs rattachements fonctionnels sans toucher au parent", () => {
    const { addNode, addDottedEdge } = useOrgChartStore.getState();
    const rootId = useOrgChartStore.getState().nodes[0].id;

    addNode(rootId); // root -> A (hiérarchique)
    const aId = useOrgChartStore.getState().nodes[1].id;
    addNode(); // B sans parent
    const bId = useOrgChartStore.getState().nodes[2].id;
    addNode(); // C sans parent
    const cId = useOrgChartStore.getState().nodes[3].id;

    addDottedEdge(bId, aId);
    addDottedEdge(cId, aId);

    const edges = useOrgChartStore.getState().edges;
    // Le parent hiérarchique est conservé, les deux pointillés coexistent
    expect(edges.filter((e) => e.target === aId && e.kind !== "dotted")).toHaveLength(1);
    expect(edges.filter((e) => e.target === aId && e.kind === "dotted")).toHaveLength(2);

    // Un doublon sur la même paire est refusé
    addDottedEdge(bId, aId);
    expect(useOrgChartStore.getState().edges).toHaveLength(edges.length);
  });

  it("setEdgeKind convertit un pointillé en hiérarchique en remplaçant l'ancien parent", () => {
    const { addNode, addDottedEdge, setEdgeKind } = useOrgChartStore.getState();
    const rootId = useOrgChartStore.getState().nodes[0].id;

    addNode(rootId); // root -> A
    const aId = useOrgChartStore.getState().nodes[1].id;
    addNode(); // B
    const bId = useOrgChartStore.getState().nodes[2].id;

    addDottedEdge(bId, aId);
    const dotted = useOrgChartStore.getState().edges.find((e) => e.kind === "dotted")!;

    setEdgeKind(dotted.id, "hierarchy");

    const edgesToA = useOrgChartStore.getState().edges.filter((e) => e.target === aId);
    expect(edgesToA).toHaveLength(1);
    expect(edgesToA[0].source).toBe(bId);
    expect(edgesToA[0].kind).toBeUndefined(); // hiérarchique
  });

  it("setEdgeKind refuse une conversion qui créerait un cycle hiérarchique", () => {
    const { addNode, addDottedEdge, setEdgeKind } = useOrgChartStore.getState();
    const rootId = useOrgChartStore.getState().nodes[0].id;

    addNode(rootId); // root -> A
    const aId = useOrgChartStore.getState().nodes[1].id;

    addDottedEdge(aId, rootId); // A --pointillé--> root (autorisé)
    const dotted = useOrgChartStore.getState().edges.find((e) => e.kind === "dotted")!;
    const before = useOrgChartStore.getState().edges;

    setEdgeKind(dotted.id, "hierarchy"); // root deviendrait subordonné de A : cycle

    expect(useOrgChartStore.getState().edges).toEqual(before);
  });

  it("setEdgeKind convertit un hiérarchique en pointillé (le nœud devient racine)", () => {
    const { addNode, setEdgeKind } = useOrgChartStore.getState();
    const rootId = useOrgChartStore.getState().nodes[0].id;

    addNode(rootId);
    const edge = useOrgChartStore.getState().edges[0];

    setEdgeKind(edge.id, "dotted");

    const updated = useOrgChartStore.getState().edges.find((e) => e.id === edge.id)!;
    expect(updated.kind).toBe("dotted");
    expect(updated.source).toBe(rootId);
  });

  it("personnalise puis réinitialise le corridor d'un lien avec undo", () => {
    const edgeId = useOrgChartStore.getState().edges[0]?.id;
    if (!edgeId) {
      const rootId = useOrgChartStore.getState().nodes[0].id;
      useOrgChartStore.getState().addNode(rootId);
    }
    const id = useOrgChartStore.getState().edges[0].id;

    useOrgChartStore.getState().setEdgeRouting(id, { axis: "y", value: 180 });
    expect(useOrgChartStore.getState().edges[0].routing).toEqual({ axis: "y", value: 180 });

    useOrgChartStore.getState().setEdgeRouting(id, undefined);
    expect(useOrgChartStore.getState().edges[0].routing).toBeUndefined();
    useOrgChartStore.getState().undo();
    expect(useOrgChartStore.getState().edges[0].routing).toEqual({ axis: "y", value: 180 });
  });

  it("setManager remplace le responsable, le retire, et refuse les cycles", () => {
    const { addNode, setManager } = useOrgChartStore.getState();
    const rootId = useOrgChartStore.getState().nodes[0].id;

    addNode(rootId); // root -> A
    const aId = useOrgChartStore.getState().nodes[1].id;
    addNode(aId); // A -> B
    const bId = useOrgChartStore.getState().nodes[2].id;
    addNode(); // C sans parent
    const cId = useOrgChartStore.getState().nodes[3].id;

    // Remplacement : C devient le responsable de B (une seule arête vers B)
    setManager(bId, cId);
    let edgesToB = useOrgChartStore.getState().edges.filter((e) => e.target === bId);
    expect(edgesToB).toHaveLength(1);
    expect(edgesToB[0].source).toBe(cId);

    // Cycle refusé : B (désormais sous C) ne peut pas devenir responsable de C
    const before = useOrgChartStore.getState().edges;
    setManager(cId, bId);
    expect(useOrgChartStore.getState().edges).toEqual(before);

    // Retrait : B devient racine
    setManager(bId, undefined);
    edgesToB = useOrgChartStore.getState().edges.filter((e) => e.target === bId);
    expect(edgesToB).toHaveLength(0);
  });

  it("duplicateNode clones the node and reattaches it to the same parent", () => {
    const { addNode, duplicateNode } = useOrgChartStore.getState();
    const rootId = useOrgChartStore.getState().nodes[0].id;

    addNode(rootId);
    const childId = useOrgChartStore.getState().nodes[1].id;
    useOrgChartStore.getState().updateNodeData(childId, { name: "Alice", role: "RH" });

    duplicateNode(childId);

    const state = useOrgChartStore.getState();
    expect(state.nodes).toHaveLength(3);
    const clone = state.nodes[2];
    expect(clone.id).not.toBe(childId);
    expect(clone.data.name).toBe("Alice");
    expect(clone.position).toEqual({
      x: state.nodes[1].position.x + 40,
      y: state.nodes[1].position.y + 40,
    });
    expect(state.edges).toContainEqual(expect.objectContaining({ source: rootId, target: clone.id }));
  });

  it("undo/redo restore previous and next states", () => {
    const { addNode, undo, redo } = useOrgChartStore.getState();
    const rootId = useOrgChartStore.getState().nodes[0].id;

    addNode(rootId);
    expect(useOrgChartStore.getState().nodes).toHaveLength(2);

    undo();
    expect(useOrgChartStore.getState().nodes).toHaveLength(1);

    redo();
    expect(useOrgChartStore.getState().nodes).toHaveLength(2);
  });

  it("undo is a no-op when there is no history", () => {
    const before = useOrgChartStore.getState().nodes;
    useOrgChartStore.getState().undo();
    expect(useOrgChartStore.getState().nodes).toBe(before);
  });

  it("deleteNode also removes its connected edges", () => {
    const { addNode, deleteNode } = useOrgChartStore.getState();
    const rootId = useOrgChartStore.getState().nodes[0].id;

    addNode(rootId);
    const childId = useOrgChartStore.getState().nodes[1].id;

    deleteNode(rootId);

    const state = useOrgChartStore.getState();
    expect(state.nodes.map((n) => n.id)).toEqual([childId]);
    expect(state.edges).toHaveLength(0);
  });

  it("setNodePosition et deleteNodes ignorent les ids inconnus (éléments d'édition) sans polluer l'historique", () => {
    const before = useOrgChartStore.getState();

    useOrgChartStore.getState().setNodePosition("chrome:title", { x: 10, y: 10 });
    useOrgChartStore.getState().deleteNodes(["chrome:title", "__page-guide__"]);

    const after = useOrgChartStore.getState();
    expect(after.nodes).toBe(before.nodes);
    expect(after.past).toHaveLength(before.past.length);
  });

  it("selectNodes est idempotent quand React Flow réémet la même sélection", () => {
    const rootId = useOrgChartStore.getState().nodes[0].id;
    useOrgChartStore.getState().selectNodes([rootId]);
    const selected = useOrgChartStore.getState().selectedNodeIds;

    useOrgChartStore.getState().selectNodes([rootId]);

    expect(useOrgChartStore.getState().selectedNodeIds).toBe(selected);
  });

  it("selectNodes est idempotent même si la sélection est réémise dans un autre ordre", () => {
    // React Flow peut réémettre la même composition dans un ordre différent
    // après une synchronisation d'arêtes : changer d'état à chaque émission
    // entretient une boucle de reconstructions (Maximum update depth).
    useOrgChartStore.getState().addNode(useOrgChartStore.getState().nodes[0].id);
    const [a, b] = useOrgChartStore.getState().nodes.map((n) => n.id);
    useOrgChartStore.getState().selectNodes([a, b]);
    const selected = useOrgChartStore.getState().selectedNodeIds;

    useOrgChartStore.getState().selectNodes([b, a]);

    expect(useOrgChartStore.getState().selectedNodeIds).toBe(selected);
  });
});

describe("useOrgChartStore — frames multi-pages", () => {
  beforeEach(() => {
    const legacy = createBlankChart("blank");
    useOrgChartStore.getState().loadFile({ ...legacy, frames: undefined });
  });

  it("addFrame crée une page nommée, undoable, sérialisée dans le fichier", () => {
    const id = useOrgChartStore.getState().addFrame();

    const state = useOrgChartStore.getState();
    expect(state.frames).toHaveLength(1);
    expect(state.frames[0].id).toBe(id);
    expect(state.frames[0].name).toBe("Page 1");
    expect(state.toFile().frames).toHaveLength(1);

    state.undo();
    const afterUndo = useOrgChartStore.getState();
    expect(afterUndo.frames).toHaveLength(0);
    // Champ additif : omis tant qu'aucune page n'existe
    expect(afterUndo.toFile().frames).toBeUndefined();
  });

  it("moveFrameWithContent déplace la feuille et ses cartes du même delta en une entrée d'historique", () => {
    const frameId = useOrgChartStore.getState().addFrame();
    const frame = useOrgChartStore.getState().frames[0];
    const rootId = useOrgChartStore.getState().nodes[0].id;
    // Place la racine dans la feuille
    useOrgChartStore.getState().setNodePosition(rootId, { x: frame.position.x + 100, y: frame.position.y + 100 });
    const pastBefore = useOrgChartStore.getState().past.length;

    useOrgChartStore
      .getState()
      .moveFrameWithContent(frameId, { x: frame.position.x + 500, y: frame.position.y + 40 }, [rootId]);

    const state = useOrgChartStore.getState();
    expect(state.frames[0].position).toEqual({ x: frame.position.x + 500, y: frame.position.y + 40 });
    expect(state.nodes[0].position).toEqual({ x: frame.position.x + 600, y: frame.position.y + 140 });
    expect(state.past).toHaveLength(pastBefore + 1);

    state.undo();
    expect(useOrgChartStore.getState().nodes[0].position).toEqual({
      x: frame.position.x + 100,
      y: frame.position.y + 100,
    });
  });

  it("duplicateFrame clone la page, ses cartes et les liens internes uniquement", () => {
    const { addFrame, addNode } = useOrgChartStore.getState();
    const frameId = addFrame();
    const frame = useOrgChartStore.getState().frames[0];
    const rootId = useOrgChartStore.getState().nodes[0].id;

    // root (hors page) -> A (dans la page) -> B (dans la page)
    addNode(rootId);
    const aId = useOrgChartStore.getState().nodes[1].id;
    addNode(aId);
    const bId = useOrgChartStore.getState().nodes[2].id;
    useOrgChartStore.getState().setNodePosition(rootId, { x: frame.position.x - 2000, y: 0 });
    useOrgChartStore.getState().setNodePosition(aId, { x: frame.position.x + 100, y: frame.position.y + 100 });
    useOrgChartStore.getState().setNodePosition(bId, { x: frame.position.x + 100, y: frame.position.y + 400 });

    const cloneId = useOrgChartStore.getState().duplicateFrame(frameId)!;

    const state = useOrgChartStore.getState();
    expect(state.frames).toHaveLength(2);
    const clone = state.frames.find((f) => f.id === cloneId)!;
    expect(clone.name).toContain("(copie)");
    // 3 originaux + 2 copies (root hors page n'est pas copié)
    expect(state.nodes).toHaveLength(5);
    // Un seul lien interne copié (A -> B) ; le lien root -> A ne l'est pas
    expect(state.edges).toHaveLength(3);
    const copies = state.nodes.slice(3);
    const dx = clone.position.x - frame.position.x;
    expect(copies[0].position.x).toBeCloseTo(frame.position.x + 100 + dx, 6);
  });

  it("reorderFrame échange l'ordre d'export", () => {
    const first = useOrgChartStore.getState().addFrame();
    const second = useOrgChartStore.getState().addFrame();

    useOrgChartStore.getState().reorderFrame(second, -1);
    expect(useOrgChartStore.getState().frames.map((f) => f.id)).toEqual([second, first]);

    // Bornes : pas de déplacement hors du tableau
    useOrgChartStore.getState().reorderFrame(second, -1);
    expect(useOrgChartStore.getState().frames.map((f) => f.id)).toEqual([second, first]);
  });

  it("updateFrame renomme et change le format de page", () => {
    const id = useOrgChartStore.getState().addFrame();

    useOrgChartStore.getState().updateFrame(id, {
      name: "Direction",
      page: { format: "a3", orientation: "portrait", margin: 12 },
    });

    const frame = useOrgChartStore.getState().frames[0];
    expect(frame.name).toBe("Direction");
    expect(frame.page.format).toBe("a3");
  });

  it("setFrameChromeElement stocke une disposition d'en-tête propre à la page", () => {
    const id = useOrgChartStore.getState().addFrame();

    useOrgChartStore.getState().setFrameChromeElement(id, "title", { x: 5, y: 5, size: 18 });

    expect(useOrgChartStore.getState().frames[0].chromeLayout?.title).toEqual({ x: 5, y: 5, size: 18 });
  });

  it("addFrameForBranch copie le sous-arbre dans une nouvelle page rangée", async () => {
    const { addNode } = useOrgChartStore.getState();
    const rootId = useOrgChartStore.getState().nodes[0].id;
    addNode(rootId);
    const aId = useOrgChartStore.getState().nodes[1].id;
    addNode(aId);

    const frameId = await useOrgChartStore.getState().addFrameForBranch(aId);

    const state = useOrgChartStore.getState();
    expect(frameId).toBeDefined();
    const frame = state.frames.find((f) => f.id === frameId)!;
    // A + son subordonné copiés (le root ne fait pas partie de la branche)
    expect(state.nodes).toHaveLength(5);
    expect(state.edges).toHaveLength(3);
    // Les copies sont posées dans la feuille (appartenance géométrique)
    const { computeFrameMembership } = await import("../lib/frames");
    const membership = computeFrameMembership(state.frames, state.nodes);
    expect(membership.byFrame.get(frame.id)).toHaveLength(2);
  });
});
