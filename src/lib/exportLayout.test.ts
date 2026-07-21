import { describe, expect, it } from "vitest";
import {
  contentBounds,
  layoutGridForRatio,
  rankCandidates,
  MIN_GAIN_PT,
  type LayoutCandidate,
} from "./exportLayout";
import type { OrgEdge, OrgNode } from "../types/orgchart";
import { CARD_HEIGHT, CARD_WIDTH } from "./compactLayout";

function nodesAt(positions: Array<[number, number]>): OrgNode[] {
  return positions.map(([x, y], i) => ({
    id: `n${i}`,
    data: { name: `N${i}` },
    position: { x, y },
  }));
}

function candidate(id: LayoutCandidate["id"], positions: Array<[number, number]>): LayoutCandidate {
  return {
    id,
    label: id,
    nodes: nodesAt(positions),
    layout: { direction: "TB", mode: "tree" },
  };
}

// Zone utile A4 paysage typique (marges 10 mm, en-tête, pied) ≈ 277 × 147 mm
const A4_LANDSCAPE = { width: 277, height: 147 };

describe("contentBounds", () => {
  it("inclut la taille des cartes et la marge de capture", () => {
    const bounds = contentBounds(nodesAt([[0, 0]]));
    expect(bounds.width).toBeCloseTo(CARD_WIDTH * 1.12, 5);
    expect(bounds.height).toBeCloseTo(CARD_HEIGHT * 1.12, 5);
  });

  it("gère un organigramme vide sans division par zéro", () => {
    expect(contentBounds([]).width).toBeGreaterThan(0);
  });
});

describe("rankCandidates", () => {
  it("préfère la disposition dont le ratio épouse la page (texte plus grand)", () => {
    // Très large (ratio ~10:1) vs proche du ratio paysage (~2:1)
    const wide = candidate("current", [[0, 0], [2000, 0], [4000, 0], [6000, 0]]);
    const square = candidate("compact", [[0, 0], [600, 0], [0, 400], [600, 400]]);
    const ranked = rankCandidates([wide, square], A4_LANDSCAPE.width, A4_LANDSCAPE.height);
    expect(ranked[0].id).toBe("compact");
    expect(ranked[0].estimate.fontPt).toBeGreaterThan(ranked[1].estimate.fontPt);
  });

  it("garde la disposition actuelle si le gain est négligeable", () => {
    const positions: Array<[number, number]> = [[0, 0], [600, 0], [0, 400], [600, 400]];
    // mêmes positions → même fontPt → gain nul < MIN_GAIN_PT
    const current = candidate("current", positions);
    const other = candidate("tree-tb", positions);
    const ranked = rankCandidates([other, current], A4_LANDSCAPE.width, A4_LANDSCAPE.height);
    expect(ranked[0].id).toBe("current");
    expect(MIN_GAIN_PT).toBeGreaterThan(0);
  });

  it("fournit une estimation complète (pt, verdict, largeur de carte)", () => {
    const ranked = rankCandidates(
      [candidate("current", [[0, 0], [300, 200]])],
      A4_LANDSCAPE.width,
      A4_LANDSCAPE.height
    );
    expect(ranked[0].estimate.fontPt).toBeGreaterThan(0);
    expect(["good", "warn", "bad"]).toContain(ranked[0].estimate.rating);
    expect(ranked[0].estimate.cardWidthMm).toBeGreaterThan(0);
  });
});

describe("layoutGridForRatio", () => {
  // Racine + 6 pôles feuilles : arbre très plat et large
  function flatOrg(): { nodes: OrgNode[]; edges: OrgEdge[] } {
    const nodes: OrgNode[] = [
      { id: "root", data: { name: "DG" }, position: { x: 0, y: 0 } },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `p${i}`,
        data: { name: `Pôle ${i}` },
        position: { x: i * 300, y: 200 },
      })),
    ];
    const edges: OrgEdge[] = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      source: "root",
      target: `p${i}`,
    }));
    return { nodes, edges };
  }

  it("réagence un arbre plat en plusieurs rangées proches du ratio cible", () => {
    const { nodes, edges } = flatOrg();
    const targetRatio = 277 / 147; // A4 paysage
    const arranged = layoutGridForRatio(nodes, edges, targetRatio);

    const bounds = contentBounds(arranged);
    const flatBounds = contentBounds(nodes);
    // Le ratio de la grille est plus proche du ratio de la page que l'arbre plat
    expect(Math.abs(bounds.width / bounds.height - targetRatio)).toBeLessThan(
      Math.abs(flatBounds.width / flatBounds.height - targetRatio)
    );

    // Plusieurs rangées : au moins deux ordonnées distinctes parmi les pôles
    const poleYs = new Set(arranged.filter((n) => n.id.startsWith("p")).map((n) => n.position.y));
    expect(poleYs.size).toBeGreaterThan(1);
  });

  it("centre la racine unique au-dessus de la grille", () => {
    const { nodes, edges } = flatOrg();
    const arranged = layoutGridForRatio(nodes, edges, 277 / 147);
    const root = arranged.find((n) => n.id === "root")!;
    const others = arranged.filter((n) => n.id !== "root");
    expect(root.position.y).toBeLessThan(Math.min(...others.map((n) => n.position.y)));
  });

  it("ne change rien avec moins de deux blocs", () => {
    const nodes: OrgNode[] = [
      { id: "a", data: { name: "A" }, position: { x: 0, y: 0 } },
      { id: "b", data: { name: "B" }, position: { x: 0, y: 200 } },
    ];
    const edges: OrgEdge[] = [{ id: "e", source: "a", target: "b" }];
    // un seul enfant → renvoie la disposition compacte telle quelle, sans erreur
    expect(() => layoutGridForRatio(nodes, edges, 1.4)).not.toThrow();
    expect(layoutGridForRatio([], [], 1.4)).toEqual([]);
  });

  it("préserve tous les nœuds et la structure des positions relatives d'un bloc", () => {
    const { nodes, edges } = flatOrg();
    const arranged = layoutGridForRatio(nodes, edges, 1.4);
    expect(arranged).toHaveLength(nodes.length);
    expect(new Set(arranged.map((n) => n.id)).size).toBe(nodes.length);
  });
});
