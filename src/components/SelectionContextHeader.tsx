import type { ReactNode } from "react";

interface SelectionContextHeaderProps {
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}

/**
 * En-tête commun aux contextes sélectionnés dans l'inspecteur : page, membre
 * ou groupe. Le violet appartient à l'éditeur et reste donc distinct des
 * couleurs métier appliquées au document.
 */
export function SelectionContextHeader({
  icon,
  title,
  description,
  children,
}: SelectionContextHeaderProps) {
  return (
    <div className="rounded-xl border border-primary-200/80 bg-primary-50/70 p-3.5 dark:border-primary-500/25 dark:bg-primary-950/25">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white shadow-sm">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-primary-600 dark:text-primary-300">
            Sélection
          </span>
          <h2 className="truncate text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {title}
          </h2>
          <p className="mt-0.5 text-[11px] leading-normal text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}
