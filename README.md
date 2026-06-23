# OrganiTool CAP — Éditeur d'organigrammes

Application web mono-page **100 % client, sans backend**, pour créer, éditer et exporter des organigrammes modernes. Conçue pour une équipe marketing non technique : aucune donnée RH ne quitte le poste de travail (aucun appel réseau, aucune télémétrie).

## Démarrage

```bash
npm install
npm run dev      # serveur de développement
npm run build    # build de production (dossier dist/, hébergeable en statique)
npm test         # tests unitaires (vitest)
npm run lint     # eslint
```

L'app démarre sur l'organigramme de démonstration **ATHANOR** (13 personnes) pour valider le rendu immédiatement.

## Principes de données

- **Le fichier est la source de vérité.** Le travail s'enregistre dans un fichier `*.orgchart.json` (format versionné, validé par zod à l'ouverture). Il se rouvre à l'identique sur n'importe quel poste : nœuds, positions, styles, logos et photos (encodés en data-URI, fichier autonome).
- **Autosauvegarde de confort** dans IndexedDB (Dexie) : en cas de fermeture accidentelle, l'app propose de restaurer le brouillon au démarrage. Ce brouillon est lié au navigateur — le partage et l'archivage passent toujours par « Enregistrer le fichier ».
- Enregistrement via la File System Access API quand elle est disponible (Ctrl+S silencieux après le premier « Enregistrer sous »), sinon téléchargement classique.

## Fonctionnalités

- **Édition** : ajout / duplication / suppression de membres, rattachement par glisser-déposer des liens (anti-cycle, un seul responsable par personne), photos et fiches détaillées (poste, pôle, e-mail), sélection multiple.
- **Import CSV** : démarrez depuis un export Excel / Google Sheets avec les colonnes `Nom;Poste;Pôle;Email;Responsable` (séparateur `;`, `,` ou tabulation détecté automatiquement, accents et casse tolérés). La hiérarchie est reconstruite via la colonne *Responsable* (nom ou e-mail), puis rangée automatiquement.
- **Layout automatique** (elkjs) : vertical ou horizontal, gère les arbres asymétriques ; le mode manuel conserve les positions dans le fichier.
- **Disposition compacte** : empile les équipes terrain sous leur responsable (liens routés « en épine ») pour rapprocher l'organigramme du format de la page — un arbre plat de ratio 5:1 redevient imprimable en A4 sans toucher au style des cartes.
- **Jauge de lisibilité à l'export** : avant de générer le document, l'app calcule la taille réelle du texte imprimé (en points) selon le format, l'orientation et les marges, affiche un verdict (lisible / limite / illisible) et propose la disposition compacte, l'A3 ou le multi-pages en correction.
- **Templates** : Glass CAP (glassmorphisme violet), Flat Corporate, Card Outline, ou page vierge — puis personnalisation libre (accent, palette par niveau hiérarchique, police, style de nœud, arrondi, logos, par-nœud).
- **Export** : PDF haute résolution (A4/A3, portrait/paysage, marges, en-tête avec logos et titre, pied de page, mode multi-pages pour l'affichage grand format), **PowerPoint** (.pptx 16:9 avec en-tête et logos), PNG haute résolution, SVG, et copie directe dans le presse-papiers (collage dans Teams, e-mail…). Les logos SVG sont automatiquement rasterisés pour le PDF et le PPTX.
- **PowerPoint éditable** : par défaut, l'export .pptx produit des formes natives (cartes arrondies avec texte, connecteurs en coude) que le destinataire peut modifier dans PowerPoint — déplacer une carte, corriger un nom, changer une couleur. Un mode « image figée » reste disponible pour une fidélité au pixel près.
- **Import PowerPoint** : « Ouvrir » accepte aussi les .pptx. Deux cas : un .pptx exporté par l'application embarque le `.orgchart.json` complet et se réimporte **à l'identique** (round-trip) ; un .pptx créé dans PowerPoint avec un organigramme **SmartArt** (Insertion → SmartArt → Hiérarchie) est analysé — personnes et liens hiérarchiques sont extraits puis remis en page avec le template courant.
- **Confort** : annuler/rétablir (50 niveaux), recherche de membre, regroupement visuel par pôle, mode présentation, thème clair/sombre de l'éditeur, déplacement précis au clavier (flèches), `prefers-reduced-motion` respecté.

### Raccourcis clavier

| Raccourci | Action |
|---|---|
| `Ctrl/Cmd + S` | Enregistrer |
| `Ctrl/Cmd + O` | Ouvrir |
| `Ctrl/Cmd + Z` / `Ctrl/Cmd + Shift + Z` | Annuler / Rétablir |
| `Suppr` / `Retour arrière` | Supprimer la sélection |
| `Flèches` (`Shift` = pas large) | Déplacer la sélection |
| `Échap` | Quitter le mode présentation |

## Stack

Vite · React · TypeScript · @xyflow/react (canvas) · elkjs (layout, chargé à la demande) · Zustand (state) · Dexie (autosave) · html-to-image + jsPDF + pptxgenjs (exports, chargés à la demande) · Tailwind CSS · zod (validation du format de fichier).

L'analyse concurrentielle et le positionnement produit sont documentés dans [`docs/ANALYSE_CONCURRENTIELLE.md`](docs/ANALYSE_CONCURRENTIELLE.md).

## Architecture

```
src/
  components/   Canvas, NodeCard, Toolbar, Inspector, TemplatePicker, ExportDialog, GroupBackground
  store/        useOrgChartStore (Zustand) — sérialise vers/depuis OrgChartFile sans perte
  lib/          fileIO (ouvrir/enregistrer + zod), csvImport, pdfExport, elkLayout, nodeStyle, groups, db
  templates/    thèmes bundlés, page vierge, démo ATHANOR
  types/        schéma zod OrgChartFile (format versionné)
```

Le cahier des charges complet est dans [`docs/PROMPT_orgchart_builder.md`](docs/PROMPT_orgchart_builder.md).
