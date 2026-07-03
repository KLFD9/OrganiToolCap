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
});
