import { describe, expect, it } from "vitest";
import {
  collaborationToolbarLabel,
  resolveCollaborationConnectionState,
} from "./collaborationStatus";

describe("état de connexion collaborative", () => {
  it("distingue la première connexion d’une reconnexion", () => {
    expect(resolveCollaborationConnectionState("active", false, false)).toBe("connecting");
    expect(resolveCollaborationConnectionState("active", false, true)).toBe("reconnecting");
    expect(resolveCollaborationConnectionState("active", true, true)).toBe("online");
  });

  it("reste inactif hors session", () => {
    expect(resolveCollaborationConnectionState("idle", false, false)).toBe("idle");
    expect(resolveCollaborationConnectionState("error", false, true)).toBe("idle");
  });

  it("ne compte pas l’utilisateur local comme un collaborateur distant", () => {
    expect(collaborationToolbarLabel("online", 0, 1)).toBe("En attente");
    expect(collaborationToolbarLabel("online", 1, 2)).toBe("2 en direct");
    expect(collaborationToolbarLabel("reconnecting", 1, 2)).toBe("Reconnexion…");
  });
});
