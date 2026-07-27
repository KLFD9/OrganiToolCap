import { createContext, useContext } from "react";
import type {
  CollaborationCursor,
  CollaborationParticipant,
  CollaborationTransport,
} from "../lib/collaborationRuntime";

export type CollaborationStatus = "idle" | "starting" | "active" | "error";

export interface CollaborationContextValue {
  status: CollaborationStatus;
  connected: boolean;
  peerCount: number;
  participants: CollaborationParticipant[];
  shareUrl?: string;
  invitationAvailable: boolean;
  dialogOpen: boolean;
  error?: string;
  isHost: boolean;
  transport: CollaborationTransport;
  openDialog: () => void;
  closeDialog: () => void;
  startSession: (name: string) => Promise<void>;
  joinSession: (name: string) => Promise<void>;
  leaveSession: () => Promise<void>;
  updateCursor: (cursor: CollaborationCursor | null) => void;
}

export const CollaborationContext = createContext<CollaborationContextValue | null>(null);

export function useCollaboration(): CollaborationContextValue {
  const value = useContext(CollaborationContext);
  if (!value) throw new Error("useCollaboration doit être utilisé dans CollaborationProvider.");
  return value;
}

export function defaultCollaborationName(): string {
  return localStorage.getItem("collaboration-display-name") ?? "";
}
