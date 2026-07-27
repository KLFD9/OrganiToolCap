import { describe, expect, it, vi } from "vitest";
import {
  buildCollaborationUrl,
  createCollaborationInvite,
  parseCollaborationInvite,
  removeCollaborationInviteFromUrl,
} from "./collaborationLink";

describe("collaborationLink", () => {
  it("place le secret dans le fragment et permet le round-trip", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) });
    const invite = createCollaborationInvite();
    const url = buildCollaborationUrl(invite, "https://organitool.example/editor?source=teams");

    expect(new URL(url).searchParams.get("session")).toBeNull();
    expect(parseCollaborationInvite(new URL(url).hash)).toEqual(invite);
    expect(url).toContain("#session=");
    vi.unstubAllGlobals();
  });

  it("rejette un fragment incomplet ou trop court", () => {
    expect(parseCollaborationInvite("#session=room.secret")).toBeUndefined();
    expect(parseCollaborationInvite("#other=value")).toBeUndefined();
  });

  it("retire uniquement l'invitation du fragment", () => {
    const cleaned = removeCollaborationInviteFromUrl(
      "https://organitool.example/#session=abcdefghijklmnop.qrstuvwxyzABCDEFG&view=team",
    );
    expect(cleaned).toBe("https://organitool.example/#view=team");
  });
});

