import { ChevronDown } from "lucide-react";
import type { PdfFormat } from "../lib/pdfExport";

interface PageFormatSelectProps {
  value: PdfFormat;
  onChange: (format: PdfFormat) => void;
  themeMode?: "light" | "dark";
  compact?: boolean;
  ariaLabel?: string;
  className?: string;
}

/**
 * Choix de surface papier partagé par le canevas, l’inspecteur et l’export.
 * A4 reste le choix métier principal ; A3/A2 sont volontairement rangés
 * comme formats d’impression avancés, jamais comme correction automatique.
 */
export function PageFormatSelect({
  value,
  onChange,
  themeMode = "light",
  compact = false,
  ariaLabel = "Surface papier",
  className = "",
}: PageFormatSelectProps) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as PdfFormat)}
        aria-label={ariaLabel}
        className={`w-full cursor-pointer appearance-none rounded-lg border font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 ${
          compact ? "py-1 pl-2 pr-7 text-xs" : "px-3 py-2 pr-8 text-xs"
        } ${
          themeMode === "dark"
            ? "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-600"
            : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
        }`}
      >
        <option value="a4">A4 · Document standard</option>
        <optgroup label="Impression grand format">
          <option value="a3">A3 · Grand format</option>
          <option value="a2">A2 · Affiche</option>
        </optgroup>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
    </div>
  );
}

