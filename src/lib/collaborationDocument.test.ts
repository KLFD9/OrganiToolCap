import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { demoCompany } from "../templates/demoCompany";
import {
  readOrgChartFromCollaborationDocument,
  writeOrgChartToCollaborationDocument,
} from "./collaborationDocument";

describe("collaborationDocument", () => {
  it("préserve un document OrganiTool complet", () => {
    const doc = new Y.Doc();
    writeOrgChartToCollaborationDocument(doc, demoCompany);

    expect(readOrgChartFromCollaborationDocument(doc)).toEqual(demoCompany);
  });

  it("fusionne des modifications concurrentes sur deux champs d'une même personne", () => {
    const first = new Y.Doc();
    writeOrgChartToCollaborationDocument(first, demoCompany);

    const second = new Y.Doc();
    Y.applyUpdate(second, Y.encodeStateAsUpdate(first));

    const firstNodes = first.getMap<Y.Map<unknown>>("nodes");
    const secondNodes = second.getMap<Y.Map<unknown>>("nodes");
    const nodeId = demoCompany.nodes[0].id;

    first.transact(() => firstNodes.get(nodeId)?.set("role", "Direction générale"));
    second.transact(() => secondNodes.get(nodeId)?.set("department", "Direction"));

    Y.applyUpdate(first, Y.encodeStateAsUpdate(second));
    Y.applyUpdate(second, Y.encodeStateAsUpdate(first));

    const merged = readOrgChartFromCollaborationDocument(first);
    expect(merged?.nodes[0].data.role).toBe("Direction générale");
    expect(merged?.nodes[0].data.department).toBe("Direction");
  });

  it("conserve l'ordre des pages et les liens fonctionnels", () => {
    const doc = new Y.Doc();
    const file = {
      ...demoCompany,
      edges: [
        ...demoCompany.edges,
        { id: "functional", source: demoCompany.nodes[0].id, target: demoCompany.nodes[1].id, kind: "dotted" as const },
      ],
      frames: [
        {
          id: "page-2",
          name: "Page 2",
          position: { x: 1000, y: 0 },
          page: { format: "a4" as const, orientation: "landscape" as const, margin: 10 },
        },
        {
          id: "page-1",
          name: "Page 1",
          position: { x: 0, y: 0 },
          page: { format: "a4" as const, orientation: "landscape" as const, margin: 10 },
        },
      ],
    };

    writeOrgChartToCollaborationDocument(doc, file);
    const restored = readOrgChartFromCollaborationDocument(doc);

    expect(restored?.frames?.map((frame) => frame.id)).toEqual(["page-2", "page-1"]);
    expect(restored?.edges.at(-1)?.kind).toBe("dotted");
  });
});
