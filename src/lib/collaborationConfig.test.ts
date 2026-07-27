import { describe, expect, it } from "vitest";
import {
  DEFAULT_STUN_SERVERS,
  mergeIceServers,
} from "./collaborationConfig";

describe("mergeIceServers", () => {
  it("conserve toujours STUN quand TURN est ajouté", () => {
    const turn = {
      urls: ["turn:turn.organisation.fr:3478"],
      username: "temporary",
      credential: "secret",
    };
    expect(mergeIceServers([turn])).toEqual([...DEFAULT_STUN_SERVERS, turn]);
  });
});
