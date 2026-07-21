// @vitest-environment happy-dom
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureFlow } from "./pdfExport";
import { exportWebPagesZip, webFileSlug, webPagePngFilename } from "./webPagesExport";

vi.mock("./pdfExport", () => ({
  captureFlow: vi.fn(async () => ({
    dataUrl: "data:image/png;base64,aGVsbG8=",
    width: 100,
    height: 100,
    pixelWidth: 250,
    pixelHeight: 250,
  })),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("webPagesExport", () => {
  it("nomme les pages dans l'ordre avec un préfixe stable", () => {
    expect(webPagePngFilename("Direction générale", 0, 12)).toBe("01-direction-generale.png");
    expect(webPagePngFilename("Pôle R&D", 11, 12)).toBe("12-pole-r-d.png");
  });

  it("produit un nom sûr même si le titre est vide ou symbolique", () => {
    expect(webFileSlug("  ", "organigramme")).toBe("organigramme");
    expect(webFileSlug("Équipe / France 2026")).toBe("equipe-france-2026");
  });

  it("crée un ZIP limité aux PNG en conservant la numérotation du rail", async () => {
    let generatedBlob: Blob | null = null;
    const progress = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => {
        generatedBlob = blob;
        return "blob:web-pages";
      }),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    const node = { id: "n", position: { x: 0, y: 0 }, data: {} } as never;
    await exportWebPagesZip(
      document.body,
      [
        { name: "Direction", nodes: [node] },
        { name: "Page vide", nodes: [] },
        { name: "Agence Sud", nodes: [node] },
      ],
      { title: "Organigramme CAP", transparent: true, scale: 2.5, onProgress: progress }
    );

    expect(captureFlow).toHaveBeenCalledTimes(2);
    expect(captureFlow).toHaveBeenCalledWith(document.body, [node], "png", 2.5, { transparent: true });
    expect(progress.mock.calls).toEqual([[1, 2], [2, 2]]);
    expect(generatedBlob).not.toBeNull();

    const zip = await JSZip.loadAsync(await generatedBlob!.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(["01-direction.png", "03-agence-sud.png"]);
  });
});
