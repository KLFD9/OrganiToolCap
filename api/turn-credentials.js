import { createHmac, randomBytes } from "node:crypto";

const DEFAULT_TTL_SECONDS = 600;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 3600;

function csv(value) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function ttlSeconds(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TTL_SECONDS;
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, parsed));
}

export function createTurnCredentials({
  secret,
  urls,
  ttl = DEFAULT_TTL_SECONDS,
  now = Date.now(),
  nonce = randomBytes(8).toString("hex"),
}) {
  if (!secret || urls.length === 0) {
    throw new Error("La configuration TURN est incomplète.");
  }
  const expiresAt = Math.floor(now / 1000) + ttl;
  const username = `${expiresAt}:${nonce}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return {
    iceServers: [{ urls, username, credential }],
    expiresAt,
  };
}

function requestOrigin(request) {
  const origin = request.headers.origin;
  if (typeof origin === "string" && origin) return origin;
  const referer = request.headers.referer;
  if (typeof referer !== "string" || !referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

function expectedOrigin(request) {
  const host = request.headers["x-forwarded-host"] ?? request.headers.host;
  if (typeof host !== "string" || !host) return undefined;
  const protocol = request.headers["x-forwarded-proto"] ?? "https";
  return `${String(protocol).split(",")[0]}://${host}`;
}

function originAllowed(request, configuredOrigins) {
  const origin = requestOrigin(request);
  if (!origin) return true;
  const allowed = new Set(configuredOrigins);
  const ownOrigin = expectedOrigin(request);
  if (ownOrigin) allowed.add(ownOrigin);
  return allowed.has(origin);
}

export default function handler(request, response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Méthode non autorisée." });
  }

  if (!originAllowed(request, csv(process.env.COLLAB_ALLOWED_ORIGINS))) {
    return response.status(403).json({ error: "Origine non autorisée." });
  }

  const secret = process.env.TURN_SHARED_SECRET?.trim();
  const urls = csv(process.env.TURN_URLS);
  if (!secret || secret.length < 32 || urls.length === 0) {
    return response.status(503).json({ error: "Service TURN non configuré." });
  }

  const credentials = createTurnCredentials({
    secret,
    urls,
    ttl: ttlSeconds(process.env.TURN_CREDENTIAL_TTL_SECONDS),
  });
  return response.status(200).json(credentials);
}
