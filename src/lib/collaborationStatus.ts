export type CollaborationConnectionState =
  | "idle"
  | "connecting"
  | "online"
  | "reconnecting";

export function resolveCollaborationConnectionState(
  sessionStatus: "idle" | "starting" | "active" | "error",
  connected: boolean,
  hasConnected: boolean,
): CollaborationConnectionState {
  if (sessionStatus === "idle" || sessionStatus === "error") return "idle";
  if (connected) return "online";
  return hasConnected ? "reconnecting" : "connecting";
}

export function collaborationToolbarLabel(
  connectionState: CollaborationConnectionState,
  peerCount: number,
  participantCount: number,
): string {
  if (connectionState === "connecting") return "Connexion…";
  if (connectionState === "reconnecting") return "Reconnexion…";
  if (connectionState !== "online") return "Partager";
  if (peerCount === 0) return "En attente";
  const visibleParticipants = Math.max(participantCount, peerCount + 1);
  return `${visibleParticipants} en direct`;
}
