import { describe, expect, it } from "vitest";
import type { OrgFrame, OrgNode } from "../types/orgchart";
import { DEFAULT_PAGE } from "./readability";
import { analyzeExportPreflight } from "./exportPreflight";

const theme = { display: {} };

function node(id: string, x: number, y: number, name = id): OrgNode {
  return { id, position: { x, y }, data: { name } };
}

function frame(id: string, x = 0): OrgFrame {
  return { id, name: id, position: { x, y: 0 }, page: DEFAULT_PAGE };
}

describe("analyzeExportPreflight", () => {
  it("signale les cartes hors page qui seraient perdues", () => {
    const result = analyzeExportPreflight({
      nodes: [node("inside", 100, 100), node("outside", 5000, 100)],
      edges: [],
      frames: [frame("Page 1")],
      theme,
    });

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "nodes-outside-pages", severity: "error", nodeIds: ["outside"] }),
    ]));
    expect(result.exportedNodeCount).toBe(1);
  });

  it("signale une carte partiellement coupée en placement exact", () => {
    const exactFrame = {
      ...frame("Page 1"),
      page: { ...DEFAULT_PAGE, placement: "exact" as const },
    };
    const result = analyzeExportPreflight({
      // Centre dans la feuille, bord gauche hors de la feuille.
      nodes: [node("cut", -100, 100)],
      edges: [],
      frames: [exactFrame],
      theme,
    });

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "partially-outside-page", severity: "error", nodeIds: ["cut"] }),
    ]));
  });

  it("conserve le cadrage historique sans alerte de coupure", () => {
    const result = analyzeExportPreflight({
      nodes: [node("cut", -100, 100)],
      edges: [],
      frames: [frame("Page 1")],
      theme,
    });

    expect(result.issues.some((issue) => issue.code === "partially-outside-page")).toBe(false);
  });

  it("ignore les contraintes papier pour une publication Web recadrée", () => {
    const exactFrame = {
      ...frame("Page 1"),
      page: { ...DEFAULT_PAGE, placement: "exact" as const },
    };
    const result = analyzeExportPreflight({
      nodes: [node("cut", -100, 100)],
      edges: [],
      frames: [exactFrame],
      theme,
      destination: "web",
      readability: { rating: "bad", fontPt: 3.8 },
    });

    expect(result.issues.some((issue) => issue.code === "partially-outside-page")).toBe(false);
    expect(result.issues.some((issue) => issue.code === "readability")).toBe(false);
  });

  it("ne traite pas les autres pages comme hors périmètre lors d'un export ciblé", () => {
    const frames = [frame("Page 1"), frame("Page 2", 3000)];
    const result = analyzeExportPreflight({
      nodes: [node("one", 100, 100), node("two", 3100, 100)],
      edges: [],
      frames,
      theme,
      scopeFrameIds: new Set(["Page 1"]),
    });

    expect(result.issues.some((issue) => issue.code === "nodes-outside-pages")).toBe(false);
    expect(result.exportedNodeCount).toBe(1);
    expect(result.exportedPageCount).toBe(1);
  });

  it("détecte les chevauchements avec la hauteur réelle des cartes", () => {
    const result = analyzeExportPreflight({
      nodes: [node("a", 0, 0), node("b", 100, 50)],
      edges: [],
      frames: [],
      theme,
    });

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "overlapping-cards", nodeIds: ["a", "b"] }),
    ]));
  });

  it("signale les liens dont les extrémités sont sur deux pages", () => {
    const frames = [frame("Page 1"), frame("Page 2", 3000)];
    const result = analyzeExportPreflight({
      nodes: [node("one", 100, 100), node("two", 3100, 100)],
      edges: [{ id: "e", source: "one", target: "two" }],
      frames,
      theme,
    });

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "links-between-pages", severity: "warning", nodeIds: ["one", "two"] }),
    ]));
  });

  it("conserve la page concernée par une alerte de lisibilité", () => {
    const result = analyzeExportPreflight({
      nodes: [node("one", 100, 100)],
      edges: [],
      frames: [frame("Page 1")],
      theme,
      readability: { rating: "warn", fontPt: 5.2, pageId: "Page 1", pageName: "Direction" },
    });

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "readability", pageId: "Page 1" }),
    ]));
  });

  it("remonte la lisibilité, les noms et les branches masquées", () => {
    const result = analyzeExportPreflight({
      nodes: [node("unnamed", 0, 0, "  ")],
      edges: [],
      frames: [],
      theme,
      readability: { rating: "bad", fontPt: 3.8 },
      hiddenNodeCount: 2,
    });

    expect(result.errorCount).toBe(1);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["missing-name", "readability", "hidden-branches"])
    );
  });
});
