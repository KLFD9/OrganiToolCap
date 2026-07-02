import { Component, type ErrorInfo, type ReactNode } from "react";
import { loadDraft } from "../lib/db";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Filet de sécurité de production : si un rendu React plante, l'utilisateur
 * ne perd pas son travail — le brouillon IndexedDB reste téléchargeable en
 * .orgchart.json avant de recharger l'application.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erreur non interceptée dans l'interface :", error, info.componentStack);
  }

  handleDownloadDraft = async () => {
    const draft = await loadDraft();
    if (!draft) return;
    const blob = new Blob([JSON.stringify(draft.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.data.meta?.title || "organigramme"}-secours.orgchart.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-screen w-screen items-center justify-center bg-editor-bg-light dark:bg-editor-bg-dark p-6">
        <div className="max-w-md rounded-2xl border border-border-light dark:border-border-dark bg-panel-bg-light dark:bg-panel-bg-dark p-7 shadow-2xl text-text-light dark:text-text-dark">
          <div className="mb-3 inline-flex rounded-xl bg-red-500/10 p-2 text-red-500">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-sm font-bold tracking-tight">Une erreur inattendue s'est produite</h1>
          <p className="mt-2 text-xs leading-relaxed opacity-75">
            L'interface a rencontré un problème. Votre travail est conservé dans la sauvegarde
            automatique locale : vous pouvez le télécharger en fichier avant de recharger
            l'application, puis le rouvrir via « Ouvrir ».
          </p>
          <pre className="mt-3 max-h-24 overflow-auto rounded-lg bg-zinc-100 dark:bg-zinc-900 p-2.5 font-mono text-[10px] text-red-600 dark:text-red-400 custom-scrollbar">
            {this.state.error.message}
          </pre>
          <div className="mt-5 flex justify-end gap-2.5">
            <button
              onClick={this.handleDownloadDraft}
              className="rounded-lg border border-border-light dark:border-border-dark px-3.5 py-2 text-xs font-semibold transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer"
            >
              Télécharger la sauvegarde
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-primary-700 dark:bg-primary-600 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-primary-600 dark:hover:bg-primary-500 cursor-pointer"
            >
              Recharger l'application
            </button>
          </div>
        </div>
      </div>
    );
  }
}
