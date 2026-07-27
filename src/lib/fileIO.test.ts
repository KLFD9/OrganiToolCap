import { describe, expect, it } from "vitest";
import { parseOrgChartFile, FileFormatError } from "./fileIO";
import { createBlankChart } from "../templates/blank";

describe("parseOrgChartFile", () => {
  it("parses a valid OrgChartFile", () => {
    const file = createBlankChart("blank");
    const result = parseOrgChartFile(JSON.stringify(file));
    expect(result.format).toBe("orgchart");
    expect(result.nodes).toHaveLength(1);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseOrgChartFile("{not json")).toThrow(FileFormatError);
  });

  it("rejects a file from a future/incompatible version", () => {
    const file = { ...createBlankChart("blank"), version: 3 };
    expect(() => parseOrgChartFile(JSON.stringify(file))).toThrow(FileFormatError);
  });

  it("rejects an object that doesn't match the schema", () => {
    expect(() => parseOrgChartFile(JSON.stringify({ format: "orgchart", version: 1 }))).toThrow(FileFormatError);
  });

  it("répare de façon déterministe les ids de pages vides ou dupliqués", () => {
    const file = createBlankChart("blank");
    const page = file.frames![0];
    file.frames = [
      page,
      { ...page, name: "Page dupliquée" },
      { ...page, id: "page-1-2", name: "Page existante" },
      { ...page, id: "   ", name: "Page sans id" },
    ];

    const parsed = parseOrgChartFile(JSON.stringify(file));

    expect(parsed.frames?.map((frame) => frame.id)).toEqual([
      "page-1",
      "page-1-3",
      "page-1-2",
      "page-2",
    ]);
    expect(new Set(parsed.frames?.map((frame) => frame.id)).size).toBe(4);
  });
});
