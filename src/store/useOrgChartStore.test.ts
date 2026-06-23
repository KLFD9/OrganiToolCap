import { beforeEach, describe, expect, it } from "vitest";
import { useOrgChartStore } from "./useOrgChartStore";
import { createBlankChart } from "../templates/blank";

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
});
