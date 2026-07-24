import { useEffect, useRef, useState } from "react";
import { useOrgChartStore } from "../store/useOrgChartStore";
import { isHierarchyEdge, NodeStyleVariantSchema, resolveDisplay, type OrgDisplayOptions } from "../types/orgchart";
import { computeOrgStats, computeTeamSize } from "../lib/stats";
import type { PageSetup } from "../lib/readability";
import { PageFormatSelect } from "./PageFormatSelect";
import { SelectionContextHeader } from "./SelectionContextHeader";
import {
  Plus,
  Trash2,
  Camera,
  UserPlus,
  Copy,
  Scissors,
  ChevronDown,
  ChevronUp,
  X,
  Settings,
  Palette,
  Layout,
  Users,
  Briefcase,
  GitFork,
  Trash,
  RotateCcw,
  FileText,
} from "lucide-react";

const NODE_STYLE_LABELS: Record<string, string> = {
  glass: "Verre (glass)",
  flat: "Aplat (flat)",
  card: "Carte",
  outline: "Contour",
  neon: "Néon (sombre)",
  gradient: "Dégradé",
  minimal: "Minimal (accent gauche)",
};

const BRAND_COLORS = [
  { name: "Groupe (Violet)", hex: "#472F74" },
  { name: "CAP Rental Power (Vert)", hex: "#729A37" },
  { name: "Cap Marine Power (Bleu marine)", hex: "#28295E" },
  { name: "Cap Marine Sombre (Bleu clair)", hex: "#3E92D0" },
  { name: "CAP Générateur (Orange)", hex: "#D58018" },
  { name: "T&D Power (Jaune)", hex: "#F2CC15" },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Composant d'importation de logo Awwwards
function LogoPicker({
  label,
  value,
  onChange,
  themeMode,
}: {
  label: string;
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  themeMode: "light" | "dark";
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onChange(await fileToDataUrl(file));
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {label}
      </span>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative group h-11 w-11 shrink-0 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center p-1">
            <img src={value} alt="" className="h-full w-full object-contain" />
            <button
              onClick={() => onChange(undefined)}
              title="Retirer le logo"
              className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-[10px] font-semibold cursor-pointer"
            >
              Retirer
            </button>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dashed text-xs transition-all cursor-pointer ${
              themeMode === "dark"
                ? "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
                : "border-zinc-200 bg-zinc-50/40 text-zinc-400 hover:border-zinc-300 hover:text-zinc-600"
            }`}
          >
            <Plus className="h-4.5 w-4.5 text-zinc-400 dark:text-zinc-500" />
          </button>
        )}
        <div className="flex flex-col items-start gap-1">
          <button
            onClick={() => inputRef.current?.click()}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
              themeMode === "dark"
                ? "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800"
                : "border-zinc-200 bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {value ? "Modifier" : "Importer"}
          </button>
          <span className="text-[9px] text-zinc-400 dark:text-zinc-500">PNG, WebP ou SVG</span>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
      </div>
    </div>
  );
}

// Wrapper haut de gamme pour les sélecteurs de couleur HTML
function ColorInput({
  value,
  onChange,
  themeMode,
}: {
  value: string;
  onChange: (color: string) => void;
  themeMode: "light" | "dark";
}) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-1.5 transition-colors ${
        themeMode === "dark" ? "border-zinc-800 bg-zinc-900/30" : "border-zinc-200 bg-zinc-50/30"
      }`}
    >
      <div className="relative h-6 w-6 shrink-0 rounded-full border border-black/10 dark:border-white/10 shadow-sm overflow-hidden" style={{ backgroundColor: value }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer scale-150"
        />
      </div>
      <span className="font-mono text-xs uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
        {value}
      </span>
    </div>
  );
}

// Interrupteur compact pour les options d'affichage des cartes
function DisplayToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer group"
    >
      <span>{label}</span>
      <span
        className={`relative h-4.5 w-8 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-primary-600" : "bg-zinc-300 dark:bg-zinc-700 group-hover:bg-zinc-400 dark:group-hover:bg-zinc-600"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

interface InspectorProps {
  themeMode?: "light" | "dark";
}

export function Inspector({ themeMode = "light" }: InspectorProps) {
  const [inspectorTab, setInspectorTab] = useState<"content" | "style" | "document">("content");
  const nodes = useOrgChartStore((s) => s.nodes);
  const edges = useOrgChartStore((s) => s.edges);
  const theme = useOrgChartStore((s) => s.theme);
  const meta = useOrgChartStore((s) => s.meta);
  const selectedNodeIds = useOrgChartStore((s) => s.selectedNodeIds);
  const frames = useOrgChartStore((s) => s.frames);
  const selectedFrameId = useOrgChartStore((s) => s.selectedFrameId);
  const selectFrame = useOrgChartStore((s) => s.selectFrame);
  const updateFrame = useOrgChartStore((s) => s.updateFrame);
  const deleteFrame = useOrgChartStore((s) => s.deleteFrame);
  const duplicateFrame = useOrgChartStore((s) => s.duplicateFrame);
  const reorderFrame = useOrgChartStore((s) => s.reorderFrame);
  const updateNodeData = useOrgChartStore((s) => s.updateNodeData);
  const updateNodeStyleOverride = useOrgChartStore((s) => s.updateNodeStyleOverride);
  const updateNodesStyleOverride = useOrgChartStore((s) => s.updateNodesStyleOverride);
  const addNode = useOrgChartStore((s) => s.addNode);
  const duplicateNode = useOrgChartStore((s) => s.duplicateNode);
  const deleteNode = useOrgChartStore((s) => s.deleteNode);
  const deleteNodes = useOrgChartStore((s) => s.deleteNodes);
  const deleteEdge = useOrgChartStore((s) => s.deleteEdge);
  const addDottedEdge = useOrgChartStore((s) => s.addDottedEdge);
  const setTheme = useOrgChartStore((s) => s.setTheme);
  const setSubtitle = useOrgChartStore((s) => s.setSubtitle);
  const setFooter = useOrgChartStore((s) => s.setFooter);
  const resetChromeLayout = useOrgChartStore((s) => s.resetChromeLayout);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selected = selectedNodeIds.length === 1 ? nodes.find((n) => n.id === selectedNodeIds[0]) : undefined;

  useEffect(() => {
    if (selected?.data.name !== "Nouveau membre") return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [selected?.id, selected?.data.name]);
  const parentEdge = selected
    ? edges.find((e) => isHierarchyEdge(e) && e.target === selected.id)
    : undefined;

  const stats = computeOrgStats(nodes, edges);
  const display = resolveDisplay(theme);
  const setDisplay = (patch: Partial<OrgDisplayOptions>) =>
    setTheme({ display: { ...theme.display, ...patch } });
  const teamSize = selected ? computeTeamSize(edges, selected.id) : null;

  // Rattachements fonctionnels (liens pointillés, format v2) du membre sélectionné
  const dottedManagers = selected
    ? edges
        .filter((e) => e.kind === "dotted" && e.target === selected.id)
        .map((e) => ({ edge: e, manager: nodes.find((n) => n.id === e.source) }))
    : [];
  const dottedCandidates = selected
    ? nodes.filter(
        (n) =>
          n.id !== selected.id &&
          !edges.some((e) => e.source === n.id && e.target === selected.id)
      )
    : [];

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selected) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    updateNodeData(selected.id, { avatarUrl: dataUrl });
    e.target.value = "";
  };

  const inputClass = `w-full rounded-xl border px-3 py-2 text-xs transition-all focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:focus:ring-primary-400/20 dark:focus:border-primary-400 ${
    themeMode === "dark"
      ? "border-zinc-800 bg-zinc-900/60 text-zinc-100 placeholder-zinc-500 focus:bg-zinc-950"
      : "border-zinc-200 bg-zinc-50/50 text-zinc-800 placeholder-zinc-400 focus:bg-white"
  }`;

  const selectClass = `w-full rounded-xl border px-3 py-2 text-xs transition-all focus:outline-none appearance-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 dark:focus:ring-primary-400/20 dark:focus:border-primary-400 ${
    themeMode === "dark"
      ? "border-zinc-800 bg-zinc-900/60 text-zinc-100"
      : "border-zinc-200 bg-zinc-50/50 text-zinc-800"
  }`;

  // Rendu : propriétés d'une page (frame) sélectionnée dans le navigateur de pages
  const selectedFrame = selectedFrameId ? frames.find((f) => f.id === selectedFrameId) : undefined;
  if (selectedFrame) {
    const frame = selectedFrame;
    const cardBg = themeMode === "dark" ? "border-zinc-800/80 bg-zinc-900/10" : "border-zinc-200 bg-zinc-50/20";
    const headerBorder = "flex items-center gap-2 pb-2 border-b border-zinc-100 dark:border-zinc-900/50";
    const headerTitle = "text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300";
    const index = frames.findIndex((f) => f.id === frame.id);

    const setPageOption = (patch: Partial<PageSetup>) => updateFrame(frame.id, { page: { ...frame.page, ...patch } });
    const setPageText = (key: "title" | "subtitle", value: string | undefined) => {
      const nextMeta = { ...frame.meta, [key]: value };
      updateFrame(frame.id, {
        meta:
          nextMeta.title === undefined && nextMeta.subtitle === undefined
            ? undefined
            : nextMeta,
      });
    };
    const effectiveTitle = frame.meta?.title ?? meta.title;
    const effectiveSubtitle = frame.meta?.subtitle ?? meta.subtitle ?? "";

    const segment = (active: boolean) =>
      `flex-1 rounded-md py-1.5 text-xs font-medium transition-all duration-150 text-center cursor-pointer ${
        active
          ? themeMode === "dark"
            ? "bg-zinc-800 text-zinc-100 shadow-sm font-semibold"
            : "bg-white text-zinc-800 shadow-sm font-semibold"
          : themeMode === "dark"
          ? "text-zinc-400 hover:text-zinc-200"
          : "text-zinc-500 hover:text-zinc-800"
      }`;

    const segmentGroup = `flex flex-1 rounded-lg p-0.5 ${
      themeMode === "dark" ? "bg-zinc-950 border border-zinc-800/60" : "bg-zinc-100 border border-zinc-200/60"
    }`;

    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 custom-scrollbar">
        <SelectionContextHeader
          icon={<FileText className="h-4 w-4" />}
          title={frame.name}
          description={`Page ${index + 1} sur ${frames.length} · ${frame.page.format.toUpperCase()} ${frame.page.orientation === "landscape" ? "paysage" : "portrait"}`}
        />

        <div className={`rounded-xl border p-4.5 space-y-4 ${cardBg}`}>
          <div className={headerBorder}>
            <Briefcase className="h-4 w-4 text-primary-500" />
            <h3 className={headerTitle}>Nom de la page</h3>
          </div>
          <input
            type="text"
            value={frame.name}
            onChange={(e) => updateFrame(frame.id, { name: e.target.value })}
            className={inputClass}
          />
          <p className="text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
            Ce nom sert au navigateur de pages et n’est pas imprimé.
          </p>
        </div>

        <div className={`rounded-xl border p-4.5 space-y-4 ${cardBg}`}>
          <div className={headerBorder}>
            <FileText className="h-4 w-4 text-primary-500" />
            <h3 className={headerTitle}>Textes affichés sur la page</h3>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              <span>Titre</span>
              {frame.meta?.title !== undefined && (
                <button
                  type="button"
                  onClick={() => setPageText("title", undefined)}
                  className="cursor-pointer normal-case tracking-normal text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-300"
                >
                  Reprendre le document
                </button>
              )}
            </span>
            <input
              type="text"
              value={effectiveTitle}
              placeholder="Titre de cette page"
              onChange={(event) => setPageText("title", event.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              <span>Sous-titre</span>
              {frame.meta?.subtitle !== undefined && (
                <button
                  type="button"
                  onClick={() => setPageText("subtitle", undefined)}
                  className="cursor-pointer normal-case tracking-normal text-primary-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-300"
                >
                  Reprendre le document
                </button>
              )}
            </span>
            <input
              type="text"
              value={effectiveSubtitle}
              placeholder="Ajouter un sous-titre à cette page"
              onChange={(event) => setPageText("subtitle", event.target.value)}
              className={inputClass}
            />
          </label>

          <p className="text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
            Ces textes sont propres à cette page. Videz un champ pour le masquer, ou reprenez le texte du document.
            Sur la feuille, sélectionnez ensuite le texte pour le déplacer, le redimensionner ou le mettre en forme.
          </p>
        </div>

        <div className={`rounded-xl border p-4.5 space-y-4 ${cardBg}`}>
          <div className={headerBorder}>
            <Layout className="h-4 w-4 text-primary-500" />
            <h3 className={headerTitle}>Surface de sortie</h3>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Document PDF
            </span>
            <PageFormatSelect
              value={frame.page.format}
              onChange={(format) => setPageOption({ format })}
              themeMode={themeMode}
              ariaLabel="Surface de sortie de la page"
            />
            <span className="text-[10px] leading-normal text-zinc-400 dark:text-zinc-500">
              A4 est le format standard. A3 et A2 sont réservés à une impression grand format.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Orientation
            </span>
            <div className={segmentGroup} role="group" aria-label="Orientation">
              <button
                className={segment(frame.page.orientation === "landscape")}
                onClick={() => setPageOption({ orientation: "landscape" })}
              >
                Paysage
              </button>
              <button
                className={segment(frame.page.orientation === "portrait")}
                onClick={() => setPageOption({ orientation: "portrait" })}
              >
                Portrait
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="flex justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              <span>Marges</span>
              <span className="font-mono text-zinc-500">{frame.page.margin} mm</span>
            </span>
            <input
              type="range"
              min={5}
              max={30}
              value={frame.page.margin}
              onChange={(e) => setPageOption({ margin: Number(e.target.value) })}
              className="w-full accent-primary-600 dark:accent-primary-400 cursor-pointer bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none h-1"
            />
          </div>

          <div className="flex flex-col gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-900/60">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Placement dans le PDF
            </span>
            <button
              type="button"
              aria-pressed={frame.page.placement === "exact"}
              onClick={() => setPageOption({ placement: "exact" })}
              className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 cursor-pointer ${
                frame.page.placement === "exact"
                  ? "border-primary-500 bg-primary-50 text-primary-900 dark:border-primary-500 dark:bg-primary-950/35 dark:text-primary-100"
                  : themeMode === "dark"
                  ? "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
              }`}
            >
              <span className="block text-xs font-bold">Préserver mes placements</span>
              <span className="mt-1 block text-[10px] leading-relaxed opacity-70">
                Les cartes gardent leur position exacte dans la feuille.
              </span>
            </button>
            <button
              type="button"
              aria-pressed={frame.page.placement !== "exact"}
              onClick={() => setPageOption({ placement: "fit" })}
              className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 cursor-pointer ${
                frame.page.placement !== "exact"
                  ? "border-primary-500 bg-primary-50 text-primary-900 dark:border-primary-500 dark:bg-primary-950/35 dark:text-primary-100"
                  : themeMode === "dark"
                  ? "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700"
                  : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
              }`}
            >
              <span className="block text-xs font-bold">Ajuster automatiquement</span>
              <span className="mt-1 block text-[10px] leading-relaxed opacity-70">
                Le contenu est agrandi et recentré pour remplir la page.
              </span>
            </button>
            <p className="text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
              Les anciens documents conservent l’ajustement automatique tant que vous ne changez pas ce réglage.
            </p>
          </div>
        </div>

        <div className={`rounded-xl border p-4.5 space-y-3 ${cardBg}`}>
          <div className={headerBorder}>
            <Settings className="h-4 w-4 text-primary-500" />
            <h3 className={headerTitle}>Ordre d'export</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => reorderFrame(frame.id, -1)}
              disabled={index === 0}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default ${
                themeMode === "dark"
                  ? "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              <ChevronUp className="h-3.5 w-3.5" />
              <span>Avancer</span>
            </button>
            <button
              onClick={() => reorderFrame(frame.id, 1)}
              disabled={index === frames.length - 1}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-medium border transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default ${
                themeMode === "dark"
                  ? "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              <ChevronDown className="h-3.5 w-3.5" />
              <span>Reculer</span>
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
            Position {index + 1} sur {frames.length} dans l'ordre des pages exportées.
          </p>
        </div>

        <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-900/50 flex flex-col gap-2">
          <button
            onClick={() => {
              const cloneId = duplicateFrame(frame.id);
              if (cloneId) selectFrame(cloneId);
            }}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-medium border transition-colors cursor-pointer ${
              themeMode === "dark"
                ? "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Dupliquer la page</span>
          </button>
          <button
            onClick={() => deleteFrame(frame.id)}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm cursor-pointer"
          >
            <Trash className="h-4 w-4" />
            <span>Supprimer la page</span>
          </button>
        </div>
      </div>
    );
  }

  // Rendu de sélection multiple
  if (selectedNodeIds.length > 1) {
    return (
      <div className="flex h-full flex-col gap-5 overflow-y-auto p-5 custom-scrollbar">
        <SelectionContextHeader
          icon={<Users className="h-4 w-4" />}
          title={`${selectedNodeIds.length} membres`}
          description="Les modifications communes s'appliquent à toute la sélection."
        />

        <div className={`rounded-xl border p-4 space-y-4 ${
          themeMode === "dark" ? "border-zinc-800/80 bg-zinc-900/10" : "border-zinc-200 bg-zinc-50/20"
        }`}>
          <div className="flex items-center gap-2 pb-1.5 border-b border-zinc-100 dark:border-zinc-900/50">
            <Palette className="h-4 w-4 text-primary-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              Couleur du groupe
            </span>
          </div>
          <ColorInput
            value={theme.palette[0]}
            onChange={(color) => updateNodesStyleOverride(selectedNodeIds, { accentColor: color })}
            themeMode={themeMode}
          />
        </div>

        <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-900/50">
          <button
            onClick={() => deleteNodes(selectedNodeIds)}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm cursor-pointer"
          >
            <Trash2 className="h-4 w-4" />
            <span>Supprimer les {selectedNodeIds.length} membres</span>
          </button>
        </div>
      </div>
    );
  }

  // Rendu par défaut : Thème Global de l'organigramme
  if (!selected) {
    const cardBg = themeMode === "dark" ? "border-zinc-800/80 bg-zinc-900/10" : "border-zinc-200 bg-zinc-50/20";
    const headerBorder = "flex items-center gap-2 pb-2 border-b border-zinc-100 dark:border-zinc-900/50";
    const headerTitle = "text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300";

    return (
      <div className="flex h-full flex-col gap-6 overflow-y-auto p-5 custom-scrollbar">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary-500" />
            <h2 className="text-sm font-bold tracking-tight text-zinc-800 dark:text-zinc-100">
              Thème global
            </h2>
          </div>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1.5 leading-normal">
            Réglez l’apparence et les informations du document.
          </p>
        </div>

        <div className={`grid grid-cols-3 rounded-xl p-1 ${themeMode === "dark" ? "bg-zinc-900" : "bg-zinc-100"}`} role="tablist" aria-label="Catégories de propriétés">
          {([
            { id: "content", label: "Cartes" },
            { id: "style", label: "Style" },
            { id: "document", label: "Document" },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={inspectorTab === tab.id}
              onClick={() => setInspectorTab(tab.id)}
              className={`rounded-lg px-2 py-2 text-[11px] font-semibold transition-colors ${
                inspectorTab === tab.id
                  ? themeMode === "dark"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Groupe 1 : Identité & En-tête */}
        {inspectorTab === "document" && (
        <div className={`rounded-xl border p-4.5 space-y-4 ${cardBg}`}>
          <div className={headerBorder}>
            <Briefcase className="h-4 w-4 text-primary-500" />
            <h3 className={headerTitle}>En-tête & Identité</h3>
          </div>

          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Sous-titre / Groupe / Entité
              </span>
              <input
                type="text"
                value={meta.subtitle ?? ""}
                placeholder="ex : Groupe Horizon — Filiale Sud"
                onChange={(e) => setSubtitle(e.target.value)}
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Pied de page (export)
              </span>
              <input
                type="text"
                value={meta.footer ?? ""}
                placeholder="ex : Document confidentiel — usage interne"
                onChange={(e) => setFooter(e.target.value)}
                className={inputClass}
              />
            </label>

            <LogoPicker
              label="Logo Principal (Entreprise / Groupe)"
              value={theme.logoUrl}
              onChange={(url) => setTheme({ logoUrl: url })}
              themeMode={themeMode}
            />
            <LogoPicker
              label="Logo Secondaire (Entité / Partenaire)"
              value={theme.secondaryLogoUrl}
              onChange={(url) => setTheme({ secondaryLogoUrl: url })}
              themeMode={themeMode}
            />

            {meta.chromeLayout && (
              <button
                onClick={resetChromeLayout}
                className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                  themeMode === "dark"
                    ? "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800"
                    : "border-zinc-200 bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Réinitialiser la disposition de l'en-tête</span>
              </button>
            )}
          </div>
        </div>
        )}

        {/* Groupe 2 : Design du Graphique */}
        {inspectorTab === "style" && (
        <div className={`rounded-xl border p-4.5 space-y-4 ${cardBg}`}>
          <div className={headerBorder}>
            <Palette className="h-4 w-4 text-primary-500" />
            <h3 className={headerTitle}>Design du Graphique</h3>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Couleur d'accent globale
              </span>
              <ColorInput
                value={theme.accent}
                onChange={(color) => setTheme({ accent: color })}
                themeMode={themeMode}
              />
              {/* Swatches de marque CAP */}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {BRAND_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setTheme({ accent: c.hex })}
                    title={c.name}
                    className={`h-5 w-5 rounded-full border border-black/10 dark:border-white/10 shadow-sm transition-transform hover:scale-110 active:scale-95 cursor-pointer ${
                      theme.accent === c.hex ? "ring-2 ring-zinc-500 dark:ring-zinc-400" : ""
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Police de caractères
              </span>
              <div className="relative">
                <select
                  value={theme.fontFamily}
                  onChange={(e) => setTheme({ fontFamily: e.target.value })}
                  className={selectClass}
                >
                  <option value="'Inter', system-ui, sans-serif">Inter</option>
                  <option value="'Poppins', system-ui, sans-serif">Poppins</option>
                  <option value="'Playfair Display', Georgia, serif">Playfair Display (Serif)</option>
                  <option value="ui-monospace, monospace">Code Monospace</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Style visuel des nœuds
              </span>
              <div className="relative">
                <select
                  value={theme.nodeStyle}
                  onChange={(e) => setTheme({ nodeStyle: NodeStyleVariantSchema.parse(e.target.value) })}
                  className={selectClass}
                >
                  {NodeStyleVariantSchema.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {NODE_STYLE_LABELS[opt]}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
              </div>
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="flex justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                <span>Arrondi des coins</span>
                <span className="font-mono text-zinc-500">{theme.cornerRadius}px</span>
              </span>
              <input
                type="range"
                min={0}
                max={32}
                value={theme.cornerRadius}
                onChange={(e) => setTheme({ cornerRadius: Number(e.target.value) })}
                className="w-full accent-primary-600 dark:accent-primary-400 cursor-pointer bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none h-1"
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
                Palette de couleurs hiérarchique
              </span>
              <div className="grid grid-cols-2 gap-2">
                {theme.palette.map((color, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <span className="text-[9px] font-medium text-zinc-400">Niveau {i + 1}</span>
                    <ColorInput
                      value={color}
                      onChange={(val) => {
                        const palette = [...theme.palette];
                        palette[i] = val;
                        setTheme({ palette });
                      }}
                      themeMode={themeMode}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Groupe 3 : Options d'affichage */}
        {inspectorTab === "content" && (
        <>
        <div className={`rounded-xl border p-4.5 space-y-4 ${cardBg}`}>
          <div className={headerBorder}>
            <Layout className="h-4 w-4 text-primary-500" />
            <h3 className={headerTitle}>Paramètres des Cartes</h3>
          </div>

          <div className="flex flex-col gap-1">
            <DisplayToggle
              label="Photos / avatars"
              checked={display.showPhotos}
              onChange={(v) => setDisplay({ showPhotos: v })}
            />
            <DisplayToggle
              label="Intitulés de poste"
              checked={display.showRoles}
              onChange={(v) => setDisplay({ showRoles: v })}
            />
            <DisplayToggle
              label="Badges de pôle"
              checked={display.showDepartments}
              onChange={(v) => setDisplay({ showDepartments: v })}
            />
            <DisplayToggle
              label="Adresses e-mail"
              checked={display.showEmails}
              onChange={(v) => setDisplay({ showEmails: v })}
            />
            <DisplayToggle
              label="Numéros de téléphone"
              checked={display.showPhones}
              onChange={(v) => setDisplay({ showPhones: v })}
            />
          </div>
        </div>

        {/* Groupe 4 : Statistiques */}
        <div className={`rounded-xl border p-4.5 space-y-4 ${cardBg}`}>
          <div className={headerBorder}>
            <Users className="h-4 w-4 text-primary-500" />
            <h3 className={headerTitle}>Effectifs & Répartition</h3>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Membres", value: stats.total },
              { label: "Encadrants", value: stats.managers },
              { label: "Niveaux", value: stats.depth },
            ].map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col items-center rounded-xl border border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30 px-2 py-2.5"
              >
                <span className="text-base font-bold tracking-tight text-zinc-800 dark:text-zinc-100 tabular-nums">
                  {stat.value}
                </span>
                <span className="text-[9px] font-medium text-zinc-400 dark:text-zinc-500">{stat.label}</span>
              </div>
            ))}
          </div>

          {stats.byDepartment.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-2.5 pt-2.5 border-t border-zinc-100 dark:border-zinc-900/50">
              {stats.byDepartment.map((dept) => (
                <div key={dept.department} className="flex items-center gap-2">
                  <span className="w-28 truncate text-[10px] text-zinc-500 dark:text-zinc-400" title={dept.department}>
                    {dept.department}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                    <div
                      className="h-full rounded-full bg-primary-500/70 dark:bg-primary-400/70"
                      style={{ width: `${(dept.count / stats.total) * 100}%` }}
                    />
                  </div>
                  <span className="w-5 text-right font-mono text-[10px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {dept.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        </>
        )}

        {/* Ajouter un nœud racine */}
        <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-900/50">
          <button
            onClick={() => addNode()}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold shadow-sm transition-all hover:scale-102 active:scale-98 cursor-pointer ${
              themeMode === "dark"
                ? "bg-primary-600 text-white hover:bg-primary-500"
                : "bg-primary-700 text-white hover:bg-primary-600"
            }`}
          >
            <Plus className="h-4 w-4" />
            <span>Ajouter un membre racine</span>
          </button>
        </div>
      </div>
    );
  }

  // Rendu : Propriétés du membre sélectionné
  const cardBg = themeMode === "dark" ? "border-zinc-800/80 bg-zinc-900/10" : "border-zinc-200 bg-zinc-50/20";
  const headerBorder = "flex items-center gap-2 pb-2 border-b border-zinc-100 dark:border-zinc-900/50";
  const headerTitle = "text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300";

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-5 custom-scrollbar">
      <SelectionContextHeader
        icon={<Briefcase className="h-4 w-4" />}
        title={selected.data.name || "Sans nom"}
        description={selected.data.role ? `Fiche membre · ${selected.data.role}` : "Fiche membre"}
      >
        {teamSize && teamSize.total > 0 && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1 text-[10px] font-semibold text-primary-700 dark:bg-primary-950/40 dark:text-primary-300">
            <Users className="h-3.5 w-3.5 mr-0.5" />
            <span>Équipe : {teamSize.direct} direct{teamSize.direct > 1 ? "s" : ""} · {teamSize.total} au total</span>
          </div>
        )}
      </SelectionContextHeader>

      {/* Groupe 1 : Profil & Avatar */}
      <div className={`rounded-xl border p-4 space-y-4 ${cardBg}`}>
        <div className={headerBorder}>
          <Camera className="h-4 w-4 text-primary-500" />
          <h3 className={headerTitle}>Photo de profil</h3>
        </div>

        <div className="flex items-center gap-4">
          {selected.data.avatarUrl ? (
            <div className="relative group h-14 w-14 shrink-0 rounded-full overflow-hidden border-2 border-zinc-200 dark:border-zinc-700 shadow-md">
              <img src={selected.data.avatarUrl} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => updateNodeData(selected.id, { avatarUrl: undefined })}
                title="Supprimer la photo"
                className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-[9px] font-semibold cursor-pointer"
              >
                Retirer
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-dashed text-xs transition-all cursor-pointer ${
                themeMode === "dark"
                  ? "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
                  : "border-zinc-200 bg-zinc-50/40 text-zinc-400 hover:border-zinc-300 hover:text-zinc-600"
              }`}
            >
              <Camera className="h-5 w-5" />
            </button>
          )}
          <div className="flex flex-col items-start gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                themeMode === "dark"
                  ? "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800"
                  : "border-zinc-200 bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {selected.data.avatarUrl ? "Changer" : "Importer une photo"}
            </button>
            <span className="text-[9px] text-zinc-400 dark:text-zinc-500">Carrée de préférence</span>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>
      </div>

      {/* Groupe 2 : Informations du membre */}
      <div className={`rounded-xl border p-4 space-y-4 ${cardBg}`}>
        <div className={headerBorder}>
          <Briefcase className="h-4 w-4 text-primary-500" />
          <h3 className={headerTitle}>Champs Membre</h3>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Nom complet
            </span>
            <input
              ref={nameInputRef}
              data-org-node-name-input="true"
              type="text"
              value={selected.data.name}
              onChange={(e) => updateNodeData(selected.id, { name: e.target.value })}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Intitulé de poste
            </span>
            <input
              type="text"
              value={selected.data.role ?? ""}
              onChange={(e) => updateNodeData(selected.id, { role: e.target.value })}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Pôle / Département
            </span>
            <input
              type="text"
              value={selected.data.department ?? ""}
              onChange={(e) => updateNodeData(selected.id, { department: e.target.value })}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Adresse e-mail
            </span>
            <input
              type="email"
              value={selected.data.email ?? ""}
              onChange={(e) => updateNodeData(selected.id, { email: e.target.value })}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Téléphone
            </span>
            <input
              type="tel"
              value={selected.data.phone ?? ""}
              onChange={(e) => updateNodeData(selected.id, { phone: e.target.value })}
              className={inputClass}
            />
          </label>
        </div>
      </div>

      {/* Groupe 3 : Couleur Propre */}
      <div className={`rounded-xl border p-4 space-y-4 ${cardBg}`}>
        <div className={headerBorder}>
          <Palette className="h-4 w-4 text-primary-500" />
          <h3 className={headerTitle}>Couleur de ce nœud</h3>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Couleur de cette branche
          </span>
          <p className="text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
            Les collaborateurs héritent de cette couleur, sauf s’ils possèdent leur propre couleur.
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <ColorInput
                value={selected.styleOverride?.accentColor ?? theme.palette[0]}
                onChange={(color) => updateNodeStyleOverride(selected.id, { accentColor: color })}
                themeMode={themeMode}
              />
            </div>
            {selected.styleOverride?.accentColor && (
              <button
                onClick={() => updateNodeStyleOverride(selected.id, { ...selected.styleOverride, accentColor: undefined })}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-red-200/40 text-red-500 bg-red-500/5 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                Réinitialiser
              </button>
            )}
          </div>
          {/* Swatches de marque CAP */}
          <div className="flex flex-wrap gap-1.5 mt-1">
            {BRAND_COLORS.map((c) => (
              <button
                key={c.hex}
                onClick={() => updateNodeStyleOverride(selected.id, { accentColor: c.hex })}
                title={c.name}
                className={`h-5 w-5 rounded-full border border-black/10 dark:border-white/10 shadow-sm transition-transform hover:scale-110 active:scale-95 cursor-pointer ${
                  (selected.styleOverride?.accentColor ?? theme.palette[0]) === c.hex ? "ring-2 ring-zinc-500 dark:ring-zinc-400" : ""
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Groupe 4 : Rattachements Fonctionnels */}
      <div className={`rounded-xl border p-4 space-y-4 ${cardBg}`}>
        <div className={headerBorder}>
          <GitFork className="h-4 w-4 text-primary-500" />
          <h3 className={headerTitle}>Rattachements fonctionnels</h3>
        </div>

        <div className="flex flex-col gap-2">
          {dottedManagers.map(({ edge, manager }) => (
            <div
              key={edge.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-2.5 py-1.5"
            >
              <span className="truncate text-xs text-zinc-700 dark:text-zinc-300">
                {manager?.data.name || "Membre supprimé"}
              </span>
              <button
                onClick={() => deleteEdge(edge.id)}
                title="Retirer ce rattachement fonctionnel"
                aria-label={`Retirer le rattachement fonctionnel à ${manager?.data.name ?? "ce membre"}`}
                className="shrink-0 rounded-md p-0.5 text-zinc-400 transition-colors hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {dottedCandidates.length > 0 && (
            <div className="relative">
              <select
                value=""
                aria-label="Ajouter un rattachement fonctionnel"
                onChange={(e) => {
                  if (e.target.value) addDottedEdge(e.target.value, selected.id);
                }}
                className={selectClass}
              >
                <option value="">Ajouter un rattachement…</option>
                {dottedCandidates.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.data.name || "Sans nom"}
                    {n.data.role ? ` — ${n.data.role}` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
            </div>
          )}
          <p className="text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-500">
            Trait pointillé sur l'organigramme (n+1 fonctionnel, mission transverse). N'affecte ni la
            hiérarchie, ni les statistiques, ni la colonne Responsable du CSV.
          </p>
        </div>
      </div>

      {/* Groupe 5 : Actions */}
      <div className={`rounded-xl border p-4 space-y-3 ${cardBg}`}>
        <div className={headerBorder}>
          <Settings className="h-4 w-4 text-primary-500" />
          <h3 className={headerTitle}>Actions hiérarchiques</h3>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => addNode(selected.id)}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold shadow-sm transition-all hover:scale-102 active:scale-98 cursor-pointer ${
              themeMode === "dark"
                ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                : "bg-primary-50 text-primary-700 border border-primary-200/50 hover:bg-primary-100/80"
            }`}
          >
            <UserPlus className="h-4 w-4" />
            <span>Ajouter un subordonné</span>
          </button>

          <button
            onClick={() => duplicateNode(selected.id)}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-medium border transition-colors cursor-pointer ${
              themeMode === "dark"
                ? "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Dupliquer le membre</span>
          </button>

          {parentEdge && (
            <button
              onClick={() => deleteEdge(parentEdge.id)}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-medium border transition-colors cursor-pointer ${
                themeMode === "dark"
                  ? "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              <Scissors className="h-3.5 w-3.5" />
              <span>Détacher du responsable</span>
            </button>
          )}

          <button
            onClick={() => deleteNode(selected.id)}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm mt-2 cursor-pointer"
          >
            <Trash className="h-4 w-4" />
            <span>Supprimer ce membre</span>
          </button>
        </div>
      </div>
    </div>
  );
}
