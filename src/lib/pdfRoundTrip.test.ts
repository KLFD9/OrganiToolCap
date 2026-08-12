import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { demoCompany } from "../templates/demoCompany";
import { attachOrgChartSource, importOrgChartPdf, PdfImportError } from "./pdfRoundTrip";

async function blankPdf(): Promise<Blob> {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes).buffer], { type: "application/pdf" });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

describe("PDF OrganiTool modifiable", () => {
  it("restaure exactement la source intégrée", async () => {
    const source = structuredClone(demoCompany);
    const pdf = await attachOrgChartSource(await blankPdf(), source);

    await expect(importOrgChartPdf(await pdf.arrayBuffer())).resolves.toEqual(source);
  });

  it("refuse un PDF sans source OrganiTool", async () => {
    await expect(importOrgChartPdf(await (await blankPdf()).arrayBuffer())).rejects.toBeInstanceOf(PdfImportError);
  });

  it("refuse une source dont le contrôle d’intégrité ne correspond pas", async () => {
    const pdf = await PDFDocument.load(await (await blankPdf()).arrayBuffer());
    await pdf.attach(new TextEncoder().encode(JSON.stringify(demoCompany)), "organitool-source.orgchart.json", {
      mimeType: "application/json",
    });
    await pdf.attach(new TextEncoder().encode(JSON.stringify({
      format: "organitool-pdf-source",
      version: 1,
      sourceFile: "organitool-source.orgchart.json",
      sha256: "0".repeat(64),
    })), "organitool-source.manifest.json", { mimeType: "application/json" });
    const bytes = await pdf.save();

    await expect(importOrgChartPdf(toArrayBuffer(bytes))).rejects.toThrow(
      "contrôle d’intégrité"
    );
  });
});
