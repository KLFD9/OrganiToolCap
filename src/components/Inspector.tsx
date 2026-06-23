import { useRef } from "react";
import { useOrgChartStore } from "../store/useOrgChartStore";
import { NodeStyleVariantSchema } from "../types/orgchart";

const NODE_STYLE_LABELS: Record<string, string> = {
  glass: "Verre (glass)",
  flat: "Aplat (flat)",
  card: "Carte",
  outline: "Contour",
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
              className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-[10px] font-semibold"
            >
              Retirer
            </button>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dashed text-xs transition-all ${
              themeMode === "dark"
                ? "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
                : "border-zinc-200 bg-zinc-50/40 text-zinc-400 hover:border-zinc-300 hover:text-zinc-600"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
        <div className="flex flex-col items-start gap-1">
          <button
            onClick={() => inputRef.current?.click()}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
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

interface InspectorProps {
  themeMode?: "light" | "dark";
}

export function Inspector({ themeMode = "light" }: InspectorProps) {
  const nodes = useOrgChartStore((s) => s.nodes);
  const edges = useOrgChartStore((s) => s.edges);
  const theme = useOrgChartStore((s) => s.theme);
  const meta = useOrgChartStore((s) => s.meta);
  const selectedNodeIds = useOrgChartStore((s) => s.selectedNodeIds);
  const updateNodeData = useOrgChartStore((s) => s.updateNodeData);
  const updateNodeStyleOverride = useOrgChartStore((s) => s.updateNodeStyleOverride);
  const updateNodesStyleOverride = useOrgChartStore((s) => s.updateNodesStyleOverride);
  const addNode = useOrgChartStore((s) => s.addNode);
  const duplicateNode = useOrgChartStore((s) => s.duplicateNode);
  const deleteNode = useOrgChartStore((s) => s.deleteNode);
  const deleteNodes = useOrgChartStore((s) => s.deleteNodes);
  const deleteEdge = useOrgChartStore((s) => s.deleteEdge);
  const setTheme = useOrgChartStore((s) => s.setTheme);
  const setSubtitle = useOrgChartStore((s) => s.setSubtitle);
  const setFooter = useOrgChartStore((s) => s.setFooter);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = selectedNodeIds.length === 1 ? nodes.find((n) => n.id === selectedNodeIds[0]) : undefined;
  const parentEdge = selected ? edges.find((e) => e.target === selected.id) : undefined;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selected) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    updateNodeData(selected.id, { avatarUrl: dataUrl });
    e.target.value = "";
  };

  const inputClass = `w-full rounded-xl border px-3 py-2 text-xs transition-all focus:outline-none ${
    themeMode === "dark"
      ? "border-zinc-800 bg-zinc-900/60 text-zinc-100 placeholder-zinc-500 focus:bg-zinc-950 focus:border-zinc-700"
      : "border-zinc-200 bg-zinc-50/50 text-zinc-800 placeholder-zinc-400 focus:bg-white focus:border-zinc-300"
  }`;

  const selectClass = `w-full rounded-xl border px-3 py-2 text-xs transition-all focus:outline-none appearance-none ${
    themeMode === "dark"
      ? "border-zinc-800 bg-zinc-900/60 text-zinc-100 focus:border-zinc-700"
      : "border-zinc-200 bg-zinc-50/50 text-zinc-800 focus:border-zinc-300"
  }`;

  // Rendu de sélection multiple
  if (selectedNodeIds.length > 1) {
    return (
      <div className="flex h-full flex-col gap-5 overflow-y-auto p-5 custom-scrollbar">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-zinc-800 dark:text-zinc-100">
            Sélection multiple
          </h2>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1 leading-normal">
            Vous avez sélectionné {selectedNodeIds.length} membres. Les modifications ci-dessous s'appliqueront à tous.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Couleur d'accentuation du groupe
          </span>
          <ColorInput
            value={theme.palette[0]}
            onChange={(color) => updateNodesStyleOverride(selectedNodeIds, { accentColor: color })}
            themeMode={themeMode}
          />
        </div>

        <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-900">
          <button
            onClick={() => deleteNodes(selectedNodeIds)}
            className="w-full rounded-xl bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm"
          >
            Supprimer les {selectedNodeIds.length} membres
          </button>
        </div>
      </div>
    );
  }

  // Rendu par défaut : Thème Global de l'organigramme
  if (!selected) {
    return (
      <div className="flex h-full flex-col gap-6 overflow-y-auto p-5 custom-scrollbar">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-zinc-800 dark:text-zinc-100">
            Thème global
          </h2>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1 leading-normal">
            Configurez la structure visuelle, les logos et l'identité graphique de l'organigramme.
          </p>
        </div>

        {/* Textes en-tête et pied de page */}
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Sous-titre / Groupe / Entité
            </span>
            <input
              type="text"
              value={meta.subtitle ?? ""}
              placeholder="ex : Groupe ATHANOR — Filiale Sud"
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
        </div>

        <hr className="border-zinc-100 dark:border-zinc-900" />

        {/* Importateurs de Logos */}
        <div className="flex flex-col gap-4">
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
        </div>

        <hr className="border-zinc-100 dark:border-zinc-900" />

        {/* Personnalisation visuelle */}
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
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-zinc-400">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
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
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-zinc-400">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
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
              className="w-full accent-zinc-800 dark:accent-zinc-200 cursor-pointer bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none h-1"
            />
          </div>
        </div>

        <hr className="border-zinc-100 dark:border-zinc-900" />

        {/* Palette par niveaux */}
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

        {/* Ajouter un nœud racine */}
        <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-900">
          <button
            onClick={() => addNode()}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold shadow-sm transition-all hover:scale-102 active:scale-98 ${
              themeMode === "dark"
                ? "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                : "bg-zinc-900 text-white hover:bg-zinc-800"
            }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span>Ajouter un membre racine</span>
          </button>
        </div>
      </div>
    );
  }

  // Rendu : Propriétés du membre sélectionné
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-5 custom-scrollbar">
      <div>
        <h2 className="text-sm font-bold tracking-tight text-zinc-800 dark:text-zinc-100">
          Fiche membre
        </h2>
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1 leading-normal">
          Modifiez les informations personnelles et le style visuel de ce nœud.
        </p>
      </div>

      {/* Profil Avatar */}
      <div className="flex items-center gap-4">
        {selected.data.avatarUrl ? (
          <div className="relative group h-14 w-14 shrink-0 rounded-full overflow-hidden border-2 border-zinc-200 dark:border-zinc-700 shadow-md">
            <img src={selected.data.avatarUrl} alt="" className="h-full w-full object-cover" />
            <button
              onClick={() => updateNodeData(selected.id, { avatarUrl: undefined })}
              title="Supprimer la photo"
              className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-[9px] font-semibold"
            >
              Retirer
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-dashed text-xs transition-all ${
              themeMode === "dark"
                ? "border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
                : "border-zinc-200 bg-zinc-50/40 text-zinc-400 hover:border-zinc-300 hover:text-zinc-600"
            }`}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
        <div className="flex flex-col items-start gap-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
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

      <hr className="border-zinc-100 dark:border-zinc-900" />

      {/* Champs d'édition du membre */}
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Nom complet
          </span>
          <input
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
      </div>

      <hr className="border-zinc-100 dark:border-zinc-900" />

      {/* Personnalisation de style par nœud */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Couleur d'accent propre à ce nœud
        </span>
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

      <hr className="border-zinc-100 dark:border-zinc-900" />

      {/* Actions hiérarchiques et suppression */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => addNode(selected.id)}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold shadow-sm transition-all hover:scale-102 active:scale-98 ${
            themeMode === "dark"
              ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
              : "bg-[#472F74]/5 text-[#472F74] border border-[#472F74]/10 hover:bg-[#472F74]/10"
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          <span>Ajouter un subordonné</span>
        </button>

        <button
          onClick={() => duplicateNode(selected.id)}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-medium border transition-colors ${
            themeMode === "dark"
              ? "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800"
              : "border-zinc-200 bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          Dupliquer le membre
        </button>

        {parentEdge && (
          <button
            onClick={() => deleteEdge(parentEdge.id)}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-medium border transition-colors ${
              themeMode === "dark"
                ? "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800"
                : "border-zinc-200 bg-zinc-50/60 text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            Détacher du responsable
          </button>
        )}

        <button
          onClick={() => deleteNode(selected.id)}
          className="w-full rounded-xl bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-sm mt-2"
        >
          Supprimer ce membre
        </button>
      </div>
    </div>
  );
}
