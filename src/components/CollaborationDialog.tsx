import { useState } from "react";
import { Check, Copy, Link2, LoaderCircle, ShieldCheck, Users, X } from "lucide-react";
import {
  defaultCollaborationName,
  useCollaboration,
} from "../collaboration/CollaborationContext";

interface CollaborationDialogProps {
  themeMode: "light" | "dark";
}

export function CollaborationDialog({ themeMode }: CollaborationDialogProps) {
  const collaboration = useCollaboration();
  const [name, setName] = useState(() => defaultCollaborationName());
  const [copied, setCopied] = useState(false);

  if (!collaboration.dialogOpen) return null;

  const active = collaboration.status === "active";
  const starting = collaboration.status === "starting";
  const cardClass =
    themeMode === "dark"
      ? "border-zinc-800 bg-zinc-950 text-zinc-100"
      : "border-zinc-200 bg-white text-zinc-900";

  const copyLink = async () => {
    if (!collaboration.shareUrl) return;
    await navigator.clipboard.writeText(collaboration.shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="collaboration-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) collaboration.closeDialog();
      }}
    >
      <div className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl ${cardClass}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-700 dark:bg-primary-950/70 dark:text-primary-300">
              <Users className="h-5 w-5" />
            </div>
            <h2 id="collaboration-title" className="text-base font-bold">
              {active ? "Session collaborative" : collaboration.invitationAvailable ? "Rejoindre la session" : "Partager en direct"}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              Modifiez l’organigramme à plusieurs, avec curseurs et sélections visibles en direct.
            </p>
          </div>
          <button
            onClick={collaboration.closeDialog}
            aria-label="Fermer"
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!active && (
          <>
            <label className="mt-5 block text-xs font-semibold">
              Votre prénom ou pseudonyme
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={40}
                autoFocus
                placeholder="Ex. Camille"
                className="mt-2 h-10 w-full rounded-xl border border-zinc-200 bg-transparent px-3 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-zinc-800"
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || starting) return;
                  void (collaboration.invitationAvailable
                    ? collaboration.joinSession(name)
                    : collaboration.startSession(name));
                }}
              />
            </label>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
              Toute personne possédant le lien peut modifier le document. La session utilise Internet ; le document n’est pas stocké par le relais de connexion.
            </div>

            {collaboration.transport.signaling === "public" && (
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-400">
                Environnement actuel : relais public de signalisation. Configurez un relais dédié avant un usage avec des données RH réelles.
              </p>
            )}

            {collaboration.error && (
              <p className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
                {collaboration.error}
              </p>
            )}

            <button
              disabled={starting || !name.trim()}
              onClick={() =>
                void (collaboration.invitationAvailable
                  ? collaboration.joinSession(name)
                  : collaboration.startSession(name))
              }
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-700 text-sm font-bold text-white shadow-sm transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {starting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {starting
                ? "Connexion…"
                : collaboration.invitationAvailable
                  ? "Rejoindre et synchroniser"
                  : "Créer le lien de partage"}
            </button>
          </>
        )}

        {active && (
          <>
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  {collaboration.connected ? "Session ouverte" : "Reconnexion…"}
                </p>
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                  {collaboration.peerCount === 0
                    ? "En attente d’un collaborateur"
                    : `${collaboration.peerCount} collaborateur${collaboration.peerCount > 1 ? "s" : ""} connecté${collaboration.peerCount > 1 ? "s" : ""}`}
                </p>
              </div>
            </div>

            {collaboration.shareUrl && (
              <div className="mt-4 flex gap-2">
                <input
                  readOnly
                  value={collaboration.shareUrl}
                  aria-label="Lien de partage"
                  className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                />
                <button
                  onClick={() => void copyLink()}
                  className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-primary-700 px-3 text-xs font-bold text-white hover:bg-primary-600"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copié" : "Copier"}
                </button>
              </div>
            )}

            <div className="mt-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                Participants
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {collaboration.participants.map((participant) => (
                  <span
                    key={participant.clientId}
                    className="flex items-center gap-2 rounded-full border border-zinc-200 px-2.5 py-1.5 text-xs dark:border-zinc-800"
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: participant.color }} />
                    {participant.name}
                    {participant.isLocal ? " (vous)" : ""}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
              <div className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                <span className="block text-zinc-400">Relais de connexion</span>
                <span className="font-semibold">
                  {collaboration.transport.signaling === "private" ? "Privé" : "Public (démo)"}
                </span>
              </div>
              <div className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                <span className="block text-zinc-400">Secours réseau TURN</span>
                <span className="font-semibold">
                  {collaboration.transport.turn === "ready"
                    ? "Opérationnel"
                    : collaboration.transport.turn === "unavailable"
                      ? "Indisponible"
                      : "Non configuré"}
                </span>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={collaboration.closeDialog}
                className="h-10 flex-1 rounded-xl bg-primary-700 px-4 text-xs font-bold text-white hover:bg-primary-600"
              >
                Continuer à modifier
              </button>
              <button
                onClick={() => void collaboration.leaveSession()}
                className="h-10 rounded-xl border border-zinc-200 px-4 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Quitter
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
