export interface CollaborationInvite {
  roomId: string;
  secret: string;
}

const SESSION_PARAM = "session";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function randomToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createCollaborationInvite(): CollaborationInvite {
  return {
    roomId: randomToken(18),
    secret: randomToken(32),
  };
}

export function buildCollaborationUrl(invite: CollaborationInvite, baseUrl = window.location.href): string {
  const url = new URL(baseUrl);
  url.hash = new URLSearchParams({
    [SESSION_PARAM]: `${invite.roomId}.${invite.secret}`,
  }).toString();
  return url.toString();
}

export function parseCollaborationInvite(value = window.location.hash): CollaborationInvite | undefined {
  const hash = value.startsWith("#") ? value.slice(1) : value;
  const raw = new URLSearchParams(hash).get(SESSION_PARAM);
  if (!raw) return undefined;
  const separator = raw.indexOf(".");
  if (separator < 0) return undefined;
  const roomId = raw.slice(0, separator);
  const secret = raw.slice(separator + 1);
  if (!TOKEN_PATTERN.test(roomId) || !TOKEN_PATTERN.test(secret)) return undefined;
  return { roomId, secret };
}

export function removeCollaborationInviteFromUrl(baseUrl = window.location.href): string {
  const url = new URL(baseUrl);
  const params = new URLSearchParams(url.hash.slice(1));
  params.delete(SESSION_PARAM);
  url.hash = params.toString();
  return url.toString();
}

