// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { importPptxFile, parseSmartArtXml, PptxImportError } from "./pptxImport";
import { EMBEDDED_CHART_PATH } from "./pptxExport";
import { createBlankChart } from "../templates/blank";

const SMARTART_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <dgm:ptLst>
    <dgm:pt modelId="{ROOT}" type="doc"/>
    <dgm:pt modelId="{P1}">
      <dgm:t><a:bodyPr/><a:p><a:r><a:t>Claire </a:t></a:r><a:r><a:t>Dubois</a:t></a:r></a:p><a:p><a:r><a:t>Directrice Générale</a:t></a:r></a:p></dgm:t>
    </dgm:pt>
    <dgm:pt modelId="{P2}" type="node">
      <dgm:t><a:bodyPr/><a:p><a:r><a:t>Marc Lefèvre</a:t></a:r></a:p></dgm:t>
    </dgm:pt>
    <dgm:pt modelId="{P3}" type="asst">
      <dgm:t><a:bodyPr/><a:p><a:r><a:t>Sophie Martin</a:t></a:r></a:p><a:p><a:r><a:t>Assistante</a:t></a:r></a:p></dgm:t>
    </dgm:pt>
    <dgm:pt modelId="{T1}" type="parTrans"/>
    <dgm:pt modelId="{PRES1}" type="pres"/>
  </dgm:ptLst>
  <dgm:cxnLst>
    <dgm:cxn modelId="{C0}" srcId="{ROOT}" destId="{P1}" srcOrd="0" destOrd="0"/>
    <dgm:cxn modelId="{C1}" srcId="{P1}" destId="{P2}" srcOrd="0" destOrd="0"/>
    <dgm:cxn modelId="{C2}" type="parOf" srcId="{P1}" destId="{P3}" srcOrd="1" destOrd="0"/>
    <dgm:cxn modelId="{C3}" type="presOf" srcId="{P1}" destId="{PRES1}"/>
  </dgm:cxnLst>
</dgm:dataModel>`;

describe("parseSmartArtXml", () => {
  it("extrait les personnes (nom + poste) en ignorant les points techniques", () => {
    const { people } = parseSmartArtXml(SMARTART_XML);
    expect(people).toHaveLength(3);
    expect(people[0]).toMatchObject({ name: "Claire Dubois", role: "Directrice Générale" });
    expect(people[1]).toMatchObject({ name: "Marc Lefèvre", role: undefined });
    expect(people[2]).toMatchObject({ name: "Sophie Martin", role: "Assistante" }); // type asst
  });

  it("extrait les liens parOf entre personnes, en ignorant doc et presOf", () => {
    const { links } = parseSmartArtXml(SMARTART_XML);
    expect(links).toHaveLength(2);
    expect(links).toContainEqual({ source: "{P1}", target: "{P2}" });
    expect(links).toContainEqual({ source: "{P1}", target: "{P3}" });
  });
});

describe("importPptxFile", () => {
  it("restaure le fichier .orgchart.json embarqué (round-trip)", async () => {
    const chart = createBlankChart("glass-cap");
    const zip = new JSZip();
    zip.file("ppt/presentation.xml", "<p:presentation/>");
    zip.file(EMBEDDED_CHART_PATH, JSON.stringify(chart));
    const data = await zip.generateAsync({ type: "arraybuffer" });

    const result = await importPptxFile(data);
    expect(result.kind).toBe("orgchart");
    if (result.kind === "orgchart") {
      expect(result.file.templateId).toBe("glass-cap");
      expect(result.file.nodes).toHaveLength(1);
    }
  });

  it("extrait un SmartArt en personnes + liens", async () => {
    const zip = new JSZip();
    zip.file("ppt/diagrams/data1.xml", SMARTART_XML);
    const data = await zip.generateAsync({ type: "arraybuffer" });

    const result = await importPptxFile(data);
    expect(result.kind).toBe("people");
    if (result.kind === "people") {
      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);
      const claire = result.nodes.find((n) => n.data.name === "Claire Dubois")!;
      expect(result.edges.filter((e) => e.source === claire.id)).toHaveLength(2);
    }
  });

  it("rejette un pptx sans organigramme exploitable", async () => {
    const zip = new JSZip();
    zip.file("ppt/presentation.xml", "<p:presentation/>");
    const data = await zip.generateAsync({ type: "arraybuffer" });
    await expect(importPptxFile(data)).rejects.toThrow(PptxImportError);
  });

  it("rejette un fichier qui n'est pas un zip", async () => {
    const data = new TextEncoder().encode("pas un zip").buffer as ArrayBuffer;
    await expect(importPptxFile(data)).rejects.toThrow(PptxImportError);
  });
});
