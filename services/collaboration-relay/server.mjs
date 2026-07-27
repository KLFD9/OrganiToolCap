import http from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

const OPEN = WebSocket.OPEN;

function integer(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function csv(value) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function rejectUpgrade(socket, status, message) {
  socket.write(
    `HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`,
  );
  socket.destroy();
}

export function configurationFromEnvironment(environment = process.env) {
  const configuration = {
    host: environment.HOST ?? "0.0.0.0",
    port: integer(environment.PORT, 4444, 1, 65_535),
    path: environment.SIGNALING_PATH ?? "/signal",
    allowedOrigins: csv(environment.ALLOWED_ORIGINS),
    maxConnections: integer(environment.MAX_CONNECTIONS, 1_000, 10, 20_000),
    maxMessageBytes: integer(environment.MAX_MESSAGE_BYTES, 65_536, 1_024, 1_048_576),
    maxTopicsPerConnection: integer(environment.MAX_TOPICS_PER_CONNECTION, 16, 1, 128),
    maxClientsPerTopic: integer(environment.MAX_CLIENTS_PER_TOPIC, 24, 2, 256),
    maxMessagesPerMinute: integer(environment.MAX_MESSAGES_PER_MINUTE, 600, 30, 10_000),
    heartbeatMs: integer(environment.HEARTBEAT_MS, 30_000, 5_000, 120_000),
  };
  if (environment.NODE_ENV === "production" && configuration.allowedOrigins.length === 0) {
    throw new Error("ALLOWED_ORIGINS est requis en production.");
  }
  return configuration;
}

export function createSignalingServer(userConfig = {}) {
  const config = { ...configurationFromEnvironment({}), ...userConfig };
  const topics = new Map();
  const connections = new Set();
  const startedAt = Date.now();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: config.maxMessageBytes,
    perMessageDeflate: false,
  });

  const removeFromTopic = (connection, topicName) => {
    const subscribers = topics.get(topicName);
    if (!subscribers) return;
    subscribers.delete(connection);
    if (subscribers.size === 0) topics.delete(topicName);
  };

  const send = (connection, message) => {
    if (connection.readyState !== OPEN) return;
    connection.send(JSON.stringify(message));
  };

  wss.on("connection", (connection) => {
    connections.add(connection);
    const subscribedTopics = new Set();
    let alive = true;
    let rateWindowStartedAt = Date.now();
    let messagesInWindow = 0;

    connection.on("pong", () => {
      alive = true;
    });

    connection.on("close", () => {
      connections.delete(connection);
      for (const topicName of subscribedTopics) removeFromTopic(connection, topicName);
      subscribedTopics.clear();
    });

    connection.on("error", () => {
      connection.close();
    });

    connection.on("message", (rawMessage) => {
      const now = Date.now();
      if (now - rateWindowStartedAt >= 60_000) {
        rateWindowStartedAt = now;
        messagesInWindow = 0;
      }
      messagesInWindow += 1;
      if (messagesInWindow > config.maxMessagesPerMinute) {
        connection.close(1008, "Trop de messages");
        return;
      }

      let message;
      try {
        message = JSON.parse(rawMessage.toString());
      } catch {
        connection.close(1007, "Message JSON invalide");
        return;
      }
      if (!message || typeof message !== "object" || typeof message.type !== "string") return;

      if (message.type === "subscribe") {
        if (!Array.isArray(message.topics)) return;
        for (const topicName of message.topics) {
          if (
            typeof topicName !== "string" ||
            topicName.length === 0 ||
            topicName.length > 256 ||
            subscribedTopics.has(topicName)
          ) {
            continue;
          }
          if (subscribedTopics.size >= config.maxTopicsPerConnection) {
            connection.close(1008, "Trop de sujets");
            return;
          }
          const subscribers = topics.get(topicName) ?? new Set();
          if (subscribers.size >= config.maxClientsPerTopic) {
            connection.close(1013, "Session complète");
            return;
          }
          subscribers.add(connection);
          topics.set(topicName, subscribers);
          subscribedTopics.add(topicName);
        }
        return;
      }

      if (message.type === "unsubscribe") {
        if (!Array.isArray(message.topics)) return;
        for (const topicName of message.topics) {
          if (typeof topicName !== "string") continue;
          removeFromTopic(connection, topicName);
          subscribedTopics.delete(topicName);
        }
        return;
      }

      if (message.type === "publish" && typeof message.topic === "string") {
        const subscribers = topics.get(message.topic);
        if (!subscribers || !subscribedTopics.has(message.topic)) return;
        const broadcast = { ...message, clients: subscribers.size };
        for (const subscriber of subscribers) send(subscriber, broadcast);
        return;
      }

      if (message.type === "ping") send(connection, { type: "pong" });
    });

    connection.isAlive = () => alive;
    connection.markForHeartbeat = () => {
      if (!alive) {
        connection.terminate();
        return;
      }
      alive = false;
      connection.ping();
    };
  });

  const server = http.createServer((request, response) => {
    if (request.url === "/healthz") {
      const body = JSON.stringify({
        status: "ok",
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        connections: connections.size,
        topics: topics.size,
      });
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(body);
      return;
    }
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  server.on("upgrade", (request, socket, head) => {
    let pathname;
    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      rejectUpgrade(socket, "400 Bad Request", "Invalid request");
      return;
    }
    if (pathname !== config.path) {
      rejectUpgrade(socket, "404 Not Found", "Not found");
      return;
    }
    if (connections.size >= config.maxConnections) {
      rejectUpgrade(socket, "503 Service Unavailable", "Server busy");
      return;
    }
    const origin = request.headers.origin;
    if (
      config.allowedOrigins.length > 0 &&
      (typeof origin !== "string" || !config.allowedOrigins.includes(origin))
    ) {
      rejectUpgrade(socket, "403 Forbidden", "Origin forbidden");
      return;
    }
    wss.handleUpgrade(request, socket, head, (connection) => {
      wss.emit("connection", connection, request);
    });
  });

  const heartbeat = setInterval(() => {
    for (const connection of connections) connection.markForHeartbeat();
  }, config.heartbeatMs);
  heartbeat.unref();

  return {
    config,
    server,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.host, () => {
          server.off("error", reject);
          resolve();
        });
      });
      return server.address();
    },
    async close() {
      clearInterval(heartbeat);
      for (const connection of connections) connection.terminate();
      wss.close();
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

const isDirectRun = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isDirectRun) {
  const signalingServer = createSignalingServer(configurationFromEnvironment());
  const address = await signalingServer.listen();
  console.log(`OrganiTool collaboration relay listening on ${address.address}:${address.port}`);

  const shutdown = async () => {
    await signalingServer.close();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
