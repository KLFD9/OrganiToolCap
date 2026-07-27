import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import handler, { createTurnCredentials } from "./turn-credentials.js";

test("génère des identifiants TURN temporaires compatibles coturn", () => {
  const result = createTurnCredentials({
    secret: "test-secret",
    urls: ["turn:turn.example.test:3478"],
    ttl: 600,
    now: 1_700_000_000_000,
    nonce: "abc",
  });
  const username = "1700000600:abc";
  assert.equal(result.expiresAt, 1_700_000_600);
  assert.deepEqual(result.iceServers[0].urls, ["turn:turn.example.test:3478"]);
  assert.equal(result.iceServers[0].username, username);
  assert.equal(
    result.iceServers[0].credential,
    createHmac("sha1", "test-secret").update(username).digest("base64"),
  );
});

test("refuse une origine externe", () => {
  const previous = process.env.COLLAB_ALLOWED_ORIGINS;
  process.env.COLLAB_ALLOWED_ORIGINS = "https://app.example.test";
  const response = mockResponse();
  handler(
    {
      method: "GET",
      headers: {
        origin: "https://attacker.example",
        host: "app.example.test",
        "x-forwarded-proto": "https",
      },
    },
    response,
  );
  assert.equal(response.statusCode, 403);
  process.env.COLLAB_ALLOWED_ORIGINS = previous;
});

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}
