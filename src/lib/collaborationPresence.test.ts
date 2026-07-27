import { describe, expect, it } from "vitest";
import { createBlankChart } from "../templates/blank";
import {
  editingNodeLabel,
  normalizeCollaborationParticipant,
} from "./collaborationPresence";

describe("présence collaborative", () => {
  it("transporte la fiche en cours d’édition sans exposer le contenu saisi", () => {
    expect(
      normalizeCollaborationParticipant(
        12,
        {
          user: { name: "  Camille  ", color: "#2563EB" },
          selectedNodeIds: ["node-1"],
          editingNodeId: "node-1",
        },
        8,
      ),
    ).toEqual({
      clientId: 12,
      name: "Camille",
      color: "#2563EB",
      cursor: undefined,
      selectedNodeIds: ["node-1"],
      editingNodeId: "node-1",
      isLocal: false,
    });
  });

  it("affiche le nom de la fiche ou un libellé neutre si elle a disparu", () => {
    const node = createBlankChart("blank").nodes[0];
    const participant = {
      clientId: 12,
      name: "Camille",
      color: "#2563EB",
      selectedNodeIds: [node.id],
      editingNodeId: node.id,
      isLocal: false,
    };

    expect(editingNodeLabel(participant, [node])).toBe(node.data.name);
    expect(editingNodeLabel({ ...participant, editingNodeId: "deleted" }, [node])).toBe(
      "une fiche",
    );
  });
});
