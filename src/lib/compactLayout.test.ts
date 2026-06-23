import { describe, expect, it } from "vitest";
import { CARD_HEIGHT, CARD_WIDTH, computeStackedIds, layoutCompact } from "./compactLayout";
import type { OrgEdge, OrgNode } from "../types/orgchart";

function makeNode(id: string): OrgNode {
  return { id, position: { x: 0, y: 0 }, data: { name: id } };
}

function edge(source: string, target: string): OrgEdge {
  return { id: `${source}-${target}`, source, target };
}

/** Organigramme type « plat et large » : 1 DG, 3 responsables, 3 feuilles chacun. */
function wideOrg(): { nodes: OrgNode[]; edges: OrgEdge[] } {
  const nodes = ["dg", "m1", "m2", "m3", "a", "b", "c", "d", "e", "f", "g", "h", "i"].map(makeNode);
  const edges = [
    edge("dg", "m1"),
    edge("dg", "m2"),
    edge("dg", "m3"),
    edge("m1", "a"),
    edge("m1", "b"),
    edge("m1", "c"),
    edge("m2", "d"),
    edge("m2", "e"),
    edge("m2", "f"),
    edge("m3", "g"),
    edge("m3", "h"),
    edge("m3", "i"),
  ];
  return { nodes, edges };
}

function boundsOf(nodes: OrgNode[]): { width: number; height: number } {
  const xs = nodes.map((n) => n.position.x);
  const ys = nodes.map((n) => n.position.y);
  return {
    width: Math.max(...xs) - Math.min(...xs) + CARD_WIDTH,
    height: Math.max(...ys) - Math.min(...ys) + CARD_HEIGHT,
  };
}

describe("computeStackedIds", () => {
  it("empile les groupes de feuilles d'au moins 3 sous le même parent", () => {
    const { nodes, edges } = wideOrg();
    const stacked = computeStackedIds(nodes, edges);
    expect(stacked.size).toBe(9);
    expect(stacked.has("a")).toBe(true);
    // les managers ne sont pas empilés (ils ont des enfants)
    expect(stacked.has("m1")).toBe(false);
    expect(stacked.has("dg")).toBe(false);
  });

  it("n'empile pas en dessous du seuil", () => {
    const nodes = ["p", "x", "y"].map(makeNode);
    const edges = [edge("p", "x"), edge("p", "y")];
    expect(computeStackedIds(nodes, edges).size).toBe(0);
  });

  it("n'empile pas si l'un des enfants est lui-même responsable", () => {
    const nodes = ["p", "x", "y", "z", "w"].map(makeNode);
    const edges = [edge("p", "x"), edge("p", "y"), edge("p", "z"), edge("z", "w")];
    expect(computeStackedIds(nodes, edges).size).toBe(0);
  });
});

describe("layoutCompact", () => {
  it("rapproche le ratio d'aspect de celui d'une page A4 paysage", () => {
    const { nodes, edges } = wideOrg();
    // Disposition d'origine « plate » : les 9 feuilles sur une seule rangée (~ratio 5:1)
    const flat = nodes.map((n, i) => ({ ...n, position: { x: i * 300, y: 0 } }));
    const flatRatio = boundsOf(flat).width / boundsOf(flat).height;

    const { nodes: compact } = layoutCompact(nodes, edges);
    const b = boundsOf(compact);
    const compactRatio = b.width / b.height;

    expect(flatRatio).toBeGreaterThan(4);
    // Ratio A4 paysage = 1,41. La disposition compacte doit s'en approcher fortement.
    expect(compactRatio).toBeLessThan(2.2);
    expect(compactRatio).toBeGreaterThan(0.6);
  });

  it("ne fait se chevaucher aucune carte", () => {
    const { nodes, edges } = wideOrg();
    const { nodes: compact } = layoutCompact(nodes, edges);
    for (let i = 0; i < compact.length; i++) {
      for (let j = i + 1; j < compact.length; j++) {
        const a = compact[i].position;
        const b = compact[j].position;
        const overlap =
          a.x < b.x + CARD_WIDTH && b.x < a.x + CARD_WIDTH && a.y < b.y + CARD_HEIGHT && b.y < a.y + CARD_HEIGHT;
        expect(overlap, `${compact[i].id} chevauche ${compact[j].id}`).toBe(false);
      }
    }
  });

  it("indente les feuilles empilées à droite de leur responsable", () => {
    const { nodes, edges } = wideOrg();
    const { nodes: compact, stackedIds } = layoutCompact(nodes, edges);
    const m1 = compact.find((n) => n.id === "m1")!;
    const a = compact.find((n) => n.id === "a")!;
    expect(stackedIds.has("a")).toBe(true);
    expect(a.position.x).toBeGreaterThan(m1.position.x);
    expect(a.position.y).toBeGreaterThan(m1.position.y);
  });

  it("gère les nœuds isolés (sans parent ni enfant) comme racines", () => {
    const nodes = [makeNode("solo1"), makeNode("solo2")];
    const { nodes: compact } = layoutCompact(nodes, []);
    expect(compact[0].position.x).not.toBe(compact[1].position.x);
  });

  it("ne mute pas les nœuds d'origine", () => {
    const { nodes, edges } = wideOrg();
    const before = JSON.stringify(nodes);
    layoutCompact(nodes, edges);
    expect(JSON.stringify(nodes)).toBe(before);
  });
});
