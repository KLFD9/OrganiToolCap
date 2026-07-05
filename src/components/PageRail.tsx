import { useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { ChevronDown, ChevronUp, Copy, FilePlus2, Layers, PanelLeftClose, Trash } from "lucide-react";
import { useOrgChartStore } from "../store/useOrgChartStore";
import { computeFrameMembership, frameRectPx, frameSizePx } from "../lib/frames";
import { CARD_HEIGHT, CARD_WIDTH } from "../lib/compactLayout";
import type { PageSetup } from "../lib/readability";

/**
 * Navigateur de pages : rail permanent à gauche du canvas — c'est l'entrée
 * principale du mode multi-pages. Sans page : état d'accueil (« Créer la
 * première page » enveloppe l'organigramme actuel). Avec pages : miniatures
 * (sommaire visuel + ordre d'export), renommage au double-clic, format
 * A4/A3 et orientation par page, dupliquer, supprimer, réordonner.
 */

interface PageRailProps {
  themeMode?: "light" | "dark";
}

export function PageRail({ themeMode = "light" }: PageRailProps) {
  const frames = useOrgChartStore((s) => s.frames);
  const nodes = useOrgChartStore((s) => s.nodes);
  const addFrame = useOrgChartStore((s) => s.addFrame);
  const updateFrame = useOrgChartStore((s) => s.updateFrame);
  const deleteFrame = useOrgChartStore((s) => s.deleteFrame);
  const duplicateFrame = useOrgChartStore((s) => s.duplicateFrame);
  const reorderFrame = useOrgChartStore((s) => s.reorderFrame);
  const { fitBounds } = useReactFlow();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const dark = themeMode === "dark";
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // fitBounds (et non fitView sur le nœud) : fonctionne même si le cadre de
  // page est momentanément masqué dans le canvas.
  const jumpTo = (frameId: string) => {
    const frame = useOrgChartStore.getState().frames.find((f) => f.id === frameId);
    if (!frame) return;
    const rect = frameRectPx(frame);
    fitBounds(rect, { duration: reduceMotion ? 0 : 300, padding: 0.1 });
  };

  const handleAddFrame = () => {
    const id = addFrame();
    requestAnimationFrame(() => jumpTo(id));
  };

  const commitRename = (frameId: string) => {
    const name = draft.trim();
    const frame = frames.find((f) => f.id === frameId);
    if (frame && name && name !== frame.name) updateFrame(frameId, { name });
    setRenamingId(null);
  };

  const setPageOption = (frameId: string, patch: Partial<PageSetup>) => {
    const frame = frames.find((f) => f.id === frameId);
    if (frame) updateFrame(frameId, { page: { ...frame.page, ...patch } });
  };

  const iconButton = `rounded-md p-1 transition-colors cursor-pointer ${
    dark ? "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800" : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
  }`;

  // Segment A4/A3 ou paysage/portrait : deux micro-boutons exclusifs
  const segment = (active: boolean) =>
    `flex-1 rounded-md px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors cursor-pointer ${
      active
        ? dark
          ? "bg-primary-600/80 text-white"
          : "bg-primary-700 text-white"
        : dark
        ? "text-zinc-500 hover:text-zinc-300"
        : "text-zinc-450 hover:text-zinc-650"
    }`;

  // Rail replié : pastille discrète pour le rouvrir
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Afficher le navigateur de pages"
        className={`absolute left-4 top-16 z-10 flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold shadow-md backdrop-blur-md transition-all hover:scale-102 active:scale-98 cursor-pointer ${
          dark
            ? "border-zinc-800 bg-zinc-950/90 text-zinc-300 hover:bg-zinc-900"
            : "border-zinc-200 bg-white/95 text-zinc-600 hover:bg-zinc-50"
        }`}
      >
        <Layers className="h-4 w-4" />
        <span>Pages{frames.length > 0 ? ` · ${frames.length}` : ""}</span>
      </button>
    );
  }

  const membership = computeFrameMembership(frames, nodes);

  return (
    <div
      className={`absolute left-4 top-16 z-10 flex w-44 flex-col rounded-2xl border shadow-lg backdrop-blur-md ${
        frames.length > 0 ? "bottom-32" : ""
      } ${dark ? "border-zinc-800 bg-zinc-950/90" : "border-zinc-200 bg-white/95"}`}
    >
      <div
        className={`flex items-center justify-between border-b py-1.5 pl-3 pr-1.5 ${
          dark ? "border-zinc-800" : "border-zinc-100"
        }`}
      >
        <span className={`text-[10px] font-bold uppercase tracking-widest ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
          Pages{frames.length > 0 ? ` · ${frames.length}` : ""}
        </span>
        <button
          onClick={() => setCollapsed(true)}
          title="Replier le navigateur de pages"
          aria-label="Replier le navigateur de pages"
          className={iconButton}
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {frames.length === 0 ? (
        /* État d'accueil : le multi-pages en un clic */
        <div className="flex flex-col gap-3 p-3.5">
          <Layers className={`h-6 w-6 ${dark ? "text-zinc-700" : "text-zinc-300"}`} />
          <p className={`text-[11px] leading-relaxed ${dark ? "text-zinc-400" : "text-zinc-500"}`}>
            Découpez le document en <strong>pages A4/A3</strong> : une feuille par équipe ou par pôle, exportées
            ensemble en un seul PDF ou PowerPoint.
          </p>
          <button
            onClick={handleAddFrame}
            className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-bold shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
              dark ? "bg-primary-600 text-white hover:bg-primary-500" : "bg-primary-700 text-white hover:bg-primary-600"
            }`}
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            <span>Créer la première page</span>
          </button>
          <p className={`text-[10px] leading-normal ${dark ? "text-zinc-600" : "text-zinc-400"}`}>
            La page enveloppe l'organigramme actuel ; glissez ensuite les cartes d'une feuille à l'autre.
          </p>
        </div>
      ) : (
        <div className="custom-scrollbar flex-1 overflow-y-auto p-2 flex flex-col gap-2">
          {frames.map((frame, index) => {
            const size = frameSizePx(frame.page);
            const memberIds = membership.byFrame.get(frame.id) ?? [];
            const memberSet = new Set(memberIds);
            const members = nodes.filter((n) => memberSet.has(n.id));

            return (
              <div
                key={frame.id}
                className={`group rounded-xl border p-2 transition-colors ${
                  dark
                    ? "border-zinc-800 hover:border-primary-400/50 hover:bg-zinc-900"
                    : "border-zinc-150 hover:border-primary-600/40 hover:bg-primary-50/40"
                }`}
              >
                {/* Miniature schématique : feuille + cartes en rectangles */}
                <button
                  onClick={() => jumpTo(frame.id)}
                  title={`Aller à « ${frame.name} »`}
                  className="block w-full cursor-pointer"
                >
                  <svg
                    viewBox={`0 0 ${size.width} ${size.height}`}
                    className="w-full rounded-md"
                    style={{
                      background: dark ? "rgba(255,255,255,0.04)" : "#ffffff",
                      border: `1px solid ${dark ? "rgba(255,255,255,0.09)" : "rgba(24,24,27,0.12)"}`,
                      aspectRatio: `${size.width} / ${size.height}`,
                    }}
                    role="img"
                    aria-label={`Miniature de la page ${frame.name}`}
                  >
                    {members.map((n) => (
                      <rect
                        key={n.id}
                        x={n.position.x - frame.position.x}
                        y={n.position.y - frame.position.y}
                        width={CARD_WIDTH}
                        height={CARD_HEIGHT}
                        rx={24}
                        fill={dark ? "rgba(157, 131, 203, 0.7)" : "rgba(109, 74, 174, 0.55)"}
                      />
                    ))}
                  </svg>
                </button>

                {/* Nom (double-clic pour renommer) + effectif */}
                <div className="mt-1.5 flex items-center gap-1">
                  <span className={`font-mono text-[9px] ${dark ? "text-zinc-600" : "text-zinc-350"}`}>
                    {index + 1}
                  </span>
                  {renamingId === frame.id ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commitRename(frame.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(frame.id);
                        else if (e.key === "Escape") setRenamingId(null);
                      }}
                      className={`min-w-0 flex-1 rounded border px-1 py-0.5 text-[11px] focus:outline-none ${
                        dark
                          ? "border-primary-400/60 bg-zinc-900 text-zinc-100"
                          : "border-primary-600/60 bg-white text-zinc-800"
                      }`}
                    />
                  ) : (
                    <button
                      onDoubleClick={() => {
                        setDraft(frame.name);
                        setRenamingId(frame.id);
                      }}
                      onClick={() => jumpTo(frame.id)}
                      title="Double-clic pour renommer"
                      className={`min-w-0 flex-1 truncate text-left text-[11px] font-semibold cursor-pointer ${
                        dark ? "text-zinc-300" : "text-zinc-700"
                      }`}
                    >
                      {frame.name}
                    </button>
                  )}
                  <span className={`shrink-0 font-mono text-[9px] ${dark ? "text-zinc-600" : "text-zinc-400"}`}>
                    {memberIds.length}
                  </span>
                </div>

                {/* Format papier de la page : A4/A3 + orientation */}
                <div className="mt-1.5 flex items-center gap-1.5">
                  <div
                    className={`flex flex-1 rounded-lg p-0.5 ${dark ? "bg-zinc-900" : "bg-zinc-100"}`}
                    role="group"
                    aria-label={`Format papier de la page ${frame.name}`}
                  >
                    <button className={segment(frame.page.format === "a4")} onClick={() => setPageOption(frame.id, { format: "a4" })}>
                      A4
                    </button>
                    <button className={segment(frame.page.format === "a3")} onClick={() => setPageOption(frame.id, { format: "a3" })}>
                      A3
                    </button>
                  </div>
                  <div
                    className={`flex flex-1 rounded-lg p-0.5 ${dark ? "bg-zinc-900" : "bg-zinc-100"}`}
                    role="group"
                    aria-label={`Orientation de la page ${frame.name}`}
                  >
                    <button
                      className={segment(frame.page.orientation === "landscape")}
                      onClick={() => setPageOption(frame.id, { orientation: "landscape" })}
                      title="Paysage"
                    >
                      Pays.
                    </button>
                    <button
                      className={segment(frame.page.orientation === "portrait")}
                      onClick={() => setPageOption(frame.id, { orientation: "portrait" })}
                      title="Portrait"
                    >
                      Port.
                    </button>
                  </div>
                </div>

                {/* Actions (au survol) */}
                <div className="mt-1 flex items-center justify-between opacity-0 transition-opacity group-hover:opacity-100">
                  <div className="flex items-center">
                    <button
                      onClick={() => reorderFrame(frame.id, -1)}
                      disabled={index === 0}
                      title="Avancer dans l'ordre des pages"
                      aria-label="Avancer la page dans l'ordre d'export"
                      className={`${iconButton} disabled:opacity-30 disabled:cursor-default`}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => reorderFrame(frame.id, 1)}
                      disabled={index === frames.length - 1}
                      title="Reculer dans l'ordre des pages"
                      aria-label="Reculer la page dans l'ordre d'export"
                      className={`${iconButton} disabled:opacity-30 disabled:cursor-default`}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center">
                    <button
                      onClick={() => {
                        const cloneId = duplicateFrame(frame.id);
                        if (cloneId) requestAnimationFrame(() => jumpTo(cloneId));
                      }}
                      title="Dupliquer la page avec son contenu"
                      aria-label={`Dupliquer la page ${frame.name}`}
                      className={iconButton}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteFrame(frame.id)}
                      title="Supprimer la page (les cartes restent sur le canevas)"
                      aria-label={`Supprimer la page ${frame.name}`}
                      className={`rounded-md p-1 transition-colors cursor-pointer ${
                        dark
                          ? "text-zinc-500 hover:text-red-400 hover:bg-red-500/10"
                          : "text-zinc-400 hover:text-red-600 hover:bg-red-50"
                      }`}
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {frames.length > 0 && (
        <div className={`border-t p-2 ${dark ? "border-zinc-800" : "border-zinc-100"}`}>
          <button
            onClick={handleAddFrame}
            className={`flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-2 py-2 text-[11px] font-semibold transition-colors cursor-pointer ${
              dark
                ? "border-zinc-700 text-zinc-400 hover:border-primary-400/60 hover:text-primary-300"
                : "border-zinc-300 text-zinc-500 hover:border-primary-600/50 hover:text-primary-700"
            }`}
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            <span>Ajouter une page</span>
          </button>
        </div>
      )}
    </div>
  );
}
