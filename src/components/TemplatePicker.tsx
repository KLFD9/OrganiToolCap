import { TEMPLATES } from "../templates/themes";

interface TemplatePickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (templateId: string | "blank") => void;
  themeMode?: "light" | "dark";
}

export function TemplatePicker({ open, onClose, onSelect, themeMode = "light" }: TemplatePickerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full max-w-2xl overflow-y-auto rounded-3xl border p-7 shadow-2xl transition-all max-h-[85vh] custom-scrollbar ${
          themeMode === "dark"
            ? "border-zinc-800 bg-zinc-950 text-zinc-100"
            : "border-zinc-200 bg-white text-zinc-800"
        }`}
      >
        <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Nouvel organigramme
        </h2>
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 leading-normal">
          Choisissez un modèle de départ. Vous pourrez personnaliser librement les couleurs, polices et styles de nœuds par la suite.
        </p>

        {/* Grille des templates */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mt-5">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => onSelect(tpl.id)}
              className={`flex flex-col items-stretch gap-3 rounded-2xl border p-4 text-left transition-all duration-300 hover:scale-102 hover:shadow-md cursor-pointer ${
                themeMode === "dark"
                  ? "border-zinc-800 bg-zinc-900/10 hover:border-primary-500/50 hover:bg-zinc-900/40"
                  : "border-zinc-200 hover:border-primary-400/60 hover:bg-zinc-50/60"
              }`}
            >
              {/* Prévisualisation miniature vectorielle de la structure de l'organigramme */}
              <div
                className="h-16 w-full rounded-xl flex items-center justify-center p-2.5 overflow-hidden shadow-inner-sm"
                style={{
                  background: themeMode === "dark" ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.02)",
                  border: `1px solid ${themeMode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                }}
              >
                <div className="flex flex-col items-center gap-1.5 w-full">
                  {/* Parent (Niveau 0) */}
                  <div
                    className="h-3.5 w-10 rounded transition-all shadow-sm"
                    style={{
                      background:
                        tpl.theme.nodeStyle === "flat"
                          ? tpl.theme.palette[0]
                          : tpl.theme.nodeStyle === "glass"
                          ? "rgba(255, 255, 255, 0.45)"
                          : "#ffffff",
                      border:
                        tpl.theme.nodeStyle === "outline"
                          ? `1px solid ${tpl.theme.accent}`
                          : tpl.theme.nodeStyle === "glass"
                          ? `1px solid ${tpl.theme.accent}33`
                          : "1px solid rgba(0,0,0,0.06)",
                    }}
                  />
                  {/* Ligne verticale */}
                  <div className="h-1 w-px bg-zinc-300 dark:bg-zinc-700" />
                  {/* Enfants (Niveau 1) */}
                  <div className="flex gap-1.5">
                    <div
                      className="h-3.5 w-8 rounded transition-all shadow-sm"
                      style={{
                        background:
                          tpl.theme.nodeStyle === "flat"
                            ? tpl.theme.palette[1] ?? tpl.theme.palette[0]
                            : tpl.theme.nodeStyle === "glass"
                            ? "rgba(255, 255, 255, 0.45)"
                            : "#ffffff",
                        border:
                          tpl.theme.nodeStyle === "outline"
                            ? `1px solid ${tpl.theme.palette[1] ?? tpl.theme.accent}`
                            : tpl.theme.nodeStyle === "glass"
                            ? `1px solid ${(tpl.theme.palette[1] ?? tpl.theme.accent)}33`
                            : "1px solid rgba(0,0,0,0.06)",
                      }}
                    />
                    <div
                      className="h-3.5 w-8 rounded transition-all shadow-sm"
                      style={{
                        background:
                          tpl.theme.nodeStyle === "flat"
                            ? tpl.theme.palette[2] ?? tpl.theme.palette[1] ?? tpl.theme.palette[0]
                            : tpl.theme.nodeStyle === "glass"
                            ? "rgba(255, 255, 255, 0.45)"
                            : "#ffffff",
                        border:
                          tpl.theme.nodeStyle === "outline"
                            ? `1px solid ${tpl.theme.palette[2] ?? tpl.theme.palette[1] ?? tpl.theme.accent}`
                            : tpl.theme.nodeStyle === "glass"
                            ? `1px solid ${(tpl.theme.palette[2] ?? tpl.theme.palette[1] ?? tpl.theme.accent)}33`
                            : "1px solid rgba(0,0,0,0.06)",
                      }}
                    />
                  </div>
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-zinc-900 dark:text-zinc-200">{tpl.label}</div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  {tpl.description}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Actions bas de boîte */}
        <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-zinc-900 flex items-center justify-between">
          <button
            onClick={() => onSelect("blank")}
            className="text-xs font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors underline underline-offset-4 cursor-pointer"
          >
            Page vierge (style par défaut)
          </button>
          <button
            onClick={onClose}
            className={`rounded-xl border px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
              themeMode === "dark"
                ? "border-zinc-800 text-zinc-300 hover:bg-zinc-850"
                : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
