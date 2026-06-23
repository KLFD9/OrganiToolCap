import { describe, expect, it } from "vitest";
import {
  computeMultiPageGrid,
  computePdfTiles,
  safePixelRatio,
  fitContain,
  PDF_TILE_PX_PER_MM,
} from "./pdfExport";

describe("computeMultiPageGrid", () => {
  it("returns a single page when the content fits within the target density", () => {
    const grid = computeMultiPageGrid(100, 100, 100, 100);
    expect(grid).toEqual({
      cols: 1,
      rows: 1,
      tileWidthPx: 100 * PDF_TILE_PX_PER_MM,
      tileHeightPx: 100 * PDF_TILE_PX_PER_MM,
    });
  });

  it("splits into multiple columns/rows when the content exceeds the per-page density", () => {
    const pageAvailWidthMm = 100;
    const pageAvailHeightMm = 100;
    const tileWidthPx = pageAvailWidthMm * PDF_TILE_PX_PER_MM;
    const tileHeightPx = pageAvailHeightMm * PDF_TILE_PX_PER_MM;

    const grid = computeMultiPageGrid(tileWidthPx * 2.5, tileHeightPx * 1.1, pageAvailWidthMm, pageAvailHeightMm);

    expect(grid.cols).toBe(3);
    expect(grid.rows).toBe(2);
  });

  it("never returns less than one column or row", () => {
    const grid = computeMultiPageGrid(1, 1, 1000, 1000);
    expect(grid.cols).toBe(1);
    expect(grid.rows).toBe(1);
  });
});

describe("computePdfTiles", () => {
  it("splits the image into an evenly-sized grid in row-major order", () => {
    const tiles = computePdfTiles(400, 200, 2, 2);

    expect(tiles).toHaveLength(4);
    expect(tiles.map((t) => [t.row, t.col])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);

    for (const tile of tiles) {
      expect(tile.sWidth).toBe(200);
      expect(tile.sHeight).toBe(100);
    }

    expect(tiles[1].sx).toBe(200);
    expect(tiles[1].sy).toBe(0);
    expect(tiles[3].sx).toBe(200);
    expect(tiles[3].sy).toBe(100);
  });

  it("returns a single tile covering the whole image for a 1x1 grid", () => {
    const tiles = computePdfTiles(800, 600, 1, 1);
    expect(tiles).toEqual([{ row: 0, col: 0, sx: 0, sy: 0, sWidth: 800, sHeight: 600 }]);
  });
});

describe("safePixelRatio", () => {
  it("keeps the desired ratio for small content", () => {
    expect(safePixelRatio(800, 600, 3)).toBe(3);
  });

  it("clamps the ratio so the canvas area stays under the browser limit", () => {
    // Contenu très large : 3000x800 px CSS. À ratio 3 → 9000x2400 = 21,6M px² > limite.
    const ratio = safePixelRatio(3000, 800, 3);
    expect(ratio).toBeLessThan(3);
    expect(3000 * ratio * (800 * ratio)).toBeLessThanOrEqual(14_000_000 + 1);
  });

  it("clamps the ratio so no canvas side exceeds the per-side limit", () => {
    // 5000 px CSS de large : à ratio 3 → 15000 px > 8192.
    const ratio = safePixelRatio(5000, 100, 3);
    expect(5000 * ratio).toBeLessThanOrEqual(8192 + 1);
  });

  it("never drops below the floor even for enormous content", () => {
    const ratio = safePixelRatio(100000, 100000, 3);
    expect(ratio).toBeGreaterThanOrEqual(0.3);
  });

  it("returns the desired ratio for degenerate (zero) sizes", () => {
    expect(safePixelRatio(0, 0, 2)).toBe(2);
  });
});

describe("fitContain", () => {
  it("scales down and centers a landscape image inside a square area", () => {
    const placement = fitContain(400, 200, 0, 0, 100, 100);
    expect(placement.width).toBe(100);
    expect(placement.height).toBe(50);
    expect(placement.x).toBe(0);
    expect(placement.y).toBe(25);
  });

  it("respects the area offset", () => {
    const placement = fitContain(100, 100, 10, 20, 100, 100);
    expect(placement.x).toBe(10);
    expect(placement.y).toBe(20);
    expect(placement.width).toBe(100);
    expect(placement.height).toBe(100);
  });
});
