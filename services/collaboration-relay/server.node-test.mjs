import assert from "node:assert/strict";
import test from "node:test";
import { WebSocket } from "ws";
import { createSignalingServer } from "./server.mjs";

async function startServer(overrides = {}) {
  const instance = createSignalingServer({
    host: "127.0.0.1",
    port: 0,
    path: "/signal",
    allowedOrigins: ["https://app.example.test"],
    maxMessageBytes: 1_024,
    maxTopicsPerConnection: 4,
    maxClientsPerTopic: 4,
    maxMessagesPerMinute: 30,
    heartbeatMs: 60_000,
    ...overrides,
  });
  const address = await instance.listen();
  return { instance, baseUrl: `http://127.0.0.1:${address.port}` };
}

function connect(baseUrl, path = "/signal", origin = "https://app.example.test") {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(baseUrl.replace("http:", "ws:") + path, { origin });
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function nextMessage(socket) {
  return new Promise((resolve) => {
    socket.once("message", (data) => resolve(JSON.parse(data.toString())));
  });
}

test("expose un état de santé sans révéler les sujets", async (context) => {
  const { instance, baseUrl } = await startServer();
  context.after(() => instance.close());
  const response = await fetch(`${baseUrl}/healthz`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    uptimeSeconds: 0,
    connections: 0,
    topics: 0,
  });
});

test("relaie uniquement les publications d'un sujet souscrit", async (context) => {
  const { instance, baseUrl } = await startServer();
  context.after(() => instance.close());
  const first = await connect(baseUrl);
  const second = await connect(baseUrl);
  context.after(() => first.terminate());
  context.after(() => second.terminate());
  first.send(JSON.stringify({ type: "subscribe", topics: ["room-a"] }));
  second.send(JSON.stringify({ type: "subscribe", topics: ["room-a"] }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  const received = nextMessage(second);
  first.send(JSON.stringify({ type: "publish", topic: "room-a", data: "encrypted" }));
  assert.deepEqual(await received, {
    type: "publish",
    topic: "room-a",
    data: "encrypted",
    clients: 2,
  });
});

test("refuse une origine non autorisée", async (context) => {
  const { instance, baseUrl } = await startServer();
  context.after(() => instance.close());
  await assert.rejects(connect(baseUrl, "/signal", "https://attacker.example"));
});

test("ferme proprement une connexion qui envoie du JSON invalide", async (context) => {
  const { instance, baseUrl } = await startServer();
  context.after(() => instance.close());
  const socket = await connect(baseUrl);
  socket.send("{");
  const closeCode = await new Promise((resolve) => socket.once("close", resolve));
  assert.equal(closeCode, 1007);
});
