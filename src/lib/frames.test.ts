import { describe, expect, it } from "vitest";
import type { OrgFrame, OrgNode } from "../types/orgchart";
import { CARD_HEIGHT, CARD_WIDTH } from "./compactLayout";
import { COMFORT_MM_PER_PX, pageSizeMm, DEFAULT_PAGE } from "./readability";
import {
  FRAME_GAP_PX,
  computeFrameMembership,
  defaultFrameName,
  frameAtPoint,
  frameRectPx,
  frameSizePx,
  nextFramePosition,
  nodesBounds,
  resolveFrameChrome,
} from "./frames";

function makeFrame(overrides: Partial<OrgFrame> = {}): OrgFrame {
  return {
    id: "frame-1",
    name: "Page 1",
    position: { x: 0, y: 0 },
    page: DEFAULT_PAGE,
    ...overrides,
  };
}

function makeNode(id: string, x: number, y: number): OrgNode {
  return { id, position: { x, y }, data: { name: id } };
}

describe("frameSizePx", () => {
  it("dessine la feuille à l'échelle confort : mm de page / COMFORT_MM_PER_PX", () => {
    const size = frameSizePx(DEFAULT_PAGE);
    const mm = pageSizeMm("a4", "landscape");
    expect(size.width).toBeCloseTo(mm.width / COMFORT_MM_PER_PX, 6);
    expect(size.height).toBeCloseTo(mm.height / COMFORT_MM_PER_PX, 6);
  });

  it("suit le format et l'orientation du frame", () => {
    const a3p = frameSizePx({ format: "a3", orientation: "portrait", margin: 10 });
    expect(a3p.height).toBeGreaterThan(a3p.width);
  });
});

describe("computeFrameMembership", () => {
  const frame = makeFrame();
  const { width, height } = frameRectPx(frame);

  it("affecte une carte au frame qui contient son centre", () => {
    const inside = makeNode("in", width / 2 - CARD_WIDTH / 2, height / 2 - CARD_HEIGHT / 2);
    const outside = makeNode("out", width + 500, 0);
    const membership = computeFrameMembership([frame], [inside, outside]);
    expect(membership.byFrame.get("frame-1")).toEqual(["in"]);
    expect(membership.frameOf.get("in")).toBe("frame-1");
    expect(membership.orphanIds.has("out")).toBe(true);
  });

  it("le centre fait foi : une carte à cheval sur le bord appartient à la page si son centre y est", () => {
    // Centre juste à l'intérieur du bord droit
    const straddling = makeNode("edge", width - CARD_WIDTH / 2 - 1, 100);
    const membership = computeFrameMembership([frame], [straddling]);
    expect(membership.frameOf.get("edge")).toBe("frame-1");
  });

  it("en cas de chevauchement, le premier frame de l'ordre du document l'emporte", () => {
    const overlapping = makeFrame({ id: "frame-2", name: "Page 2", position: { x: 0, y: 0 } });
    const node = makeNode("n", 100, 100);
    const membership = computeFrameMembership([frame, overlapping], [node]);
    expect(membership.frameOf.get("n")).toBe("frame-1");
  });

  it("sans frame, toutes les cartes sont hors page", () => {
    const membership = computeFrameMembership([], [makeNode("a", 0, 0)]);
    expect(membership.orphanIds.has("a")).toBe(true);
  });
});

describe("frameAtPoint", () => {
  it("trouve la feuille sous un point, ou undefined", () => {
    const frame = makeFrame({ position: { x: 1000, y: 500 } });
    expect(frameAtPoint([frame], { x: 1010, y: 510 })?.id).toBe("frame-1");
    expect(frameAtPoint([frame], { x: 0, y: 0 })).toBeUndefined();
  });
});

describe("defaultFrameName", () => {
  it("numérote sans collision avec les noms existants", () => {
    expect(defaultFrameName([])).toBe("Page 1");
    expect(defaultFrameName([makeFrame({ name: "Page 2" })])).toBe("Page 3");
    expect(defaultFrameName([makeFrame({ name: "Direction" })])).toBe("Page 2");
  });
});

describe("nextFramePosition", () => {
  it("pose la nouvelle feuille à droite de la plus à droite", () => {
    const f1 = makeFrame();
    const rect = frameRectPx(f1);
    const pos = nextFramePosition([f1], DEFAULT_PAGE);
    expect(pos.x).toBeCloseTo(rect.x + rect.width + FRAME_GAP_PX, 6);
    expect(pos.y).toBe(rect.y);
  });

  it("la première feuille enveloppe le contenu (centrée dessus)", () => {
    const bounds = { x: 0, y: 0, width: 1000, height: 600 };
    const pos = nextFramePosition([], DEFAULT_PAGE, bounds);
    const size = frameSizePx(DEFAULT_PAGE);
    expect(pos.x).toBeCloseTo(500 - size.width / 2, 6);
    expect(pos.y).toBeCloseTo(300 - size.height / 2, 6);
  });

  it("à l'origine sur un canvas vide", () => {
    expect(nextFramePosition([], DEFAULT_PAGE)).toEqual({ x: 0, y: 0 });
  });
});

describe("nodesBounds", () => {
  it("rectangle englobant cartes incluses", () => {
    const bounds = nodesBounds([makeNode("a", 0, 0), makeNode("b", 400, 300)]);
    expect(bounds).toEqual({ x: 0, y: 0, width: 400 + CARD_WIDTH, height: 300 + CARD_HEIGHT });
    expect(nodesBounds([])).toBeUndefined();
  });
});

describe("resolveFrameChrome", () => {
  it("le titre du frame l'emporte, sinon celui du document", () => {
    const doc = { title: "Doc", subtitle: "Sous" };
    expect(resolveFrameChrome(makeFrame(), doc)).toEqual({ title: "Doc", subtitle: "Sous" });
    expect(resolveFrameChrome(makeFrame({ meta: { title: "Pôle Tech" } }), doc)).toEqual({
      title: "Pôle Tech",
      subtitle: "Sous",
    });
  });
});
