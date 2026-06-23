import { describe, expect, it } from "vitest";
import { buildEditableSpec } from "./pptxEditable";
import { glassCapTheme, flatCorporateTheme } from "../templates/themes";
import type { OrgEdge, OrgNode } from "../types/orgchart";

const AREA = { x: 0.4, y: 1.35, width: 12.53, height: 5.45 };

function org(): { nodes: OrgNode[]; edges: OrgEdge[] } {
  const nodes: OrgNode[] = [
    { id: "a", position: { x: 300, y: 0 }, data: { name: "Claire Dubois", role: "DG", department: "Direction" } },
    { id: "b", position: { x: 0, y: 250 }, data: { name: "Marc Lefèvre" } },
    { id: "c", position: { x: 600, y: 250 }, data: { name: "Sophie Martin" } },
  ];
  const edges: OrgEdge[] = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "a", target: "c" },
  ];
  return { nodes, edges };
}

describe("buildEditableSpec", () => {
  it("place toutes les cartes dans la zone de la diapositive", () => {
    const { nodes, edges } = org();
    const spec = buildEditableSpec(nodes, edges, glassCapTheme, AREA);
    expect(spec.cards).toHaveLength(3);
    for (const c of spec.cards) {
      expect(c.x).toBeGreaterThanOrEqual(AREA.x - 1e-9);
      expect(c.y).toBeGreaterThanOrEqual(AREA.y - 1e-9);
      expect(c.x + c.w).toBeLessThanOrEqual(AREA.x + AREA.width + 1e-9);
      expect(c.y + c.h).toBeLessThanOrEqual(AREA.y + AREA.height + 1e-9);
    }
  });

  it("crée un connecteur par lien, du bas du parent vers le haut de l'enfant", () => {
    const { nodes, edges } = org();
    const spec = buildEditableSpec(nodes, edges, glassCapTheme, AREA);
    expect(spec.connectors).toHaveLength(2);
    for (const conn of spec.connectors) {
      expect(conn.flipV).toBe(false); // les enfants sont sous le parent
      expect(conn.h).toBeGreaterThan(0);
    }
    // l'un des enfants est à gauche du parent → flipH
    expect(spec.connectors.some((c) => c.flipH)).toBe(true);
    expect(spec.connectors.some((c) => !c.flipH)).toBe(true);
  });

  it("thème glass : fond blanc, bordure accent ; thème flat : fond palette + texte contrasté", () => {
    const { nodes, edges } = org();
    const glass = buildEditableSpec(nodes, edges, glassCapTheme, AREA);
    expect(glass.cards[0].fillColor).toBe("FFFFFF");
    expect(glass.cards[0].lineColor).toBe("472F74"); // niveau 0 de la palette

    const flat = buildEditableSpec(nodes, edges, flatCorporateTheme, AREA);
    expect(flat.cards[0].fillColor).toBe("2B3A55"); // fond = palette niveau 0
    expect(flat.cards[0].textColor).toBe("FFFFFF"); // contraste sur fond sombre
  });

  it("borne la taille de police entre 6 et 16 pt", () => {
    const { nodes, edges } = org();
    // organigramme minuscule → grande échelle → police plafonnée
    const spec = buildEditableSpec(nodes, edges, glassCapTheme, AREA);
    expect(spec.cards[0].namePt).toBeLessThanOrEqual(16);
    // organigramme géant → petite échelle → police plancher
    const wide = nodes.map((n, i) => ({ ...n, position: { x: i * 5000, y: 0 } }));
    const tiny = buildEditableSpec(wide, edges, glassCapTheme, AREA);
    expect(tiny.cards[0].namePt).toBeGreaterThanOrEqual(6);
  });

  it("retourne un spec vide sans nœuds", () => {
    const spec = buildEditableSpec([], [], glassCapTheme, AREA);
    expect(spec.cards).toHaveLength(0);
    expect(spec.connectors).toHaveLength(0);
  });
});
