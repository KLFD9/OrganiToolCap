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

L'app reprend automatiquement le dernier brouillon local disponible. Au premier lancement, elle ouvre une page vierge et guide l'ajout de la première personne ; la démonstration **Société Horizon** reste accessible volontairement depuis le menu d'aide.

## Principes de données

- **Le fichier est la source de vérité.** Le travail s'enregistre dans un fichier `*.orgchart.json` (format versionné, validé par zod à l'ouverture). Il se rouvre à l'identique sur n'importe quel poste : nœuds, positions, styles, logos et photos (encodés en data-URI, fichier autonome).
- **Autosauvegarde de confort** dans IndexedDB (Dexie) : en cas de fermeture accidentelle, l'app propose de restaurer le brouillon au démarrage. Ce brouillon est lié au navigateur — le partage et l'archivage passent toujours par « Enregistrer le fichier ».
- Enregistrement via la File System Access API quand elle est disponible (Ctrl+S silencieux après le premier « Enregistrer sous »), sinon téléchargement classique.

## Fonctionnalités

- **Édition** : ajout / duplication / suppression de membres, rattachement par glisser-déposer des liens (anti-cycle, un seul responsable par personne), photos et fiches détaillées (poste, pôle, e-mail), sélection multiple.
- **Édition rapide au canvas** : sélectionner une carte ou un groupe affiche sa bulle de couleur, duplication, alignement et répartition ; sélectionner un lien affiche directement son type hiérarchique/fonctionnel et le retour au tracé automatique. Le **clic droit** conserve les actions complémentaires ; **tirer la poignée d'une carte dans le vide** crée un subordonné à cet endroit ; **Tab** ajoute un subordonné et **Entrée** un collègue au membre sélectionné (façon Miro/FigJam).
- **Page de pôle en un geste** : sélectionner un responsable permet de copier sa branche dans une nouvelle page déjà rangée. La page source et ses placements restent intacts ; l'opération complète s'annule en une fois.
- **Rattachements fonctionnels (liens en pointillés)** : en plus de son responsable hiérarchique, un membre peut être rattaché fonctionnellement à d'autres (n+1 fonctionnel, mission transverse) — trait pointillé sur l'organigramme et dans les exports PDF/PPTX. Gérés depuis la fiche membre ou par clic droit sur un lien ; ils n'affectent ni les layouts, ni le repli, ni les statistiques, ni la colonne Responsable du CSV. *(Format de fichier v2 — les fichiers v1 s'ouvrent et sont migrés automatiquement.)*
- **Routage intelligent des liens** : les connecteurs orthogonaux choisissent automatiquement leurs côtés d'attache et contournent les cartes intermédiaires. Sélectionner un lien affiche une poignée pour déplacer son corridor ; un clic droit permet de revenir au tracé automatique. Le réglage est conservé dans le fichier et reproduit dans les exports PDF/PPTX.
- **Replier / déplier les branches** : chaque responsable porte un bouton de repli ; la branche masquée est résumée par un badge d'effectif (`+N`) et un rappel « Tout déplier » reste affiché. L'export suit l'affichage : replier des branches permet d'exporter une vue partielle (par direction, par pôle).
- **Statistiques d'effectifs** : effectif total, nombre d'encadrants, profondeur hiérarchique et répartition par pôle dans l'inspecteur ; taille d'équipe (directs / total) sur la fiche de chaque responsable.
- **Vue annuaire (éditable)** : table triable et filtrable de tous les membres, synchronisée avec le canvas — et véritable poste de travail : **double-clic sur une cellule pour la modifier** (nom, poste, pôle, e-mail, et même le responsable via un sélecteur avec garde anti-cycle), ajout de membres et de subordonnés, suppression, le tout annulable (Ctrl+Z). Sélectionner une ligne ouvre la fiche dans l'inspecteur, « voir dans l'organigramme » recentre la vue sur la personne.
- **Affichage des cartes** : photos, intitulés de poste, badges de pôle et e-mails s'activent/désactivent globalement ; le choix est enregistré dans le fichier et respecté par l'export PowerPoint éditable.
- **Cartes adaptatives** : une fiche sans pôle, e-mail ni téléphone adopte une silhouette compacte avec l’identité recentrée ; la hauteur augmente uniquement lorsque des informations supplémentaires sont réellement affichées. Le canvas, le routage et le PDF vectoriel utilisent le même calcul.
- **Import CSV contrôlé** : démarrez depuis un export Excel / Google Sheets avec les colonnes `Nom;Poste;Pôle;Email;Responsable` (séparateur `;`, `,` ou tabulation détecté automatiquement, accents et casse tolérés). Avant toute modification, un aperçu local résume les personnes, responsables, racines et anomalies. Le client choisit ensuite une mise en page automatique orientée page ou l’ordre brut du fichier ; l’import ouvre un nouveau document, reste annulable et ne réutilise jamais silencieusement le chemin du fichier précédent.
- **Layout automatique orienté page** : « Réorganiser pour la page » compare plusieurs dispositions (arbre vertical/horizontal via elkjs, compacte, grille) et applique celle qui donne le plus grand texte imprimé sur le format du document — annulable par Ctrl+Z. Le mode manuel conserve les positions dans le fichier.
- **Disposition compacte** : empile les équipes terrain sous leur responsable (liens routés « en épine ») pour rapprocher l'organigramme du format de la page — un arbre plat de ratio 5:1 redevient imprimable en A4 sans toucher au style des cartes.
- **Surface de sortie dans le canvas** : la feuille A4 standard (ou A3/A2 pour une impression grand format volontaire) est dessinée derrière l'organigramme avec ses marges, son en-tête et sa zone utile. Un badge affiche la taille de texte estimée pendant la conception. La surface choisie est enregistrée dans le fichier et partagée avec l'export.
- **Textes de page libres** : sélectionner un titre, sous-titre ou pied de page affiche une barre de mise en forme flottante (gras, italique, couleur, réinitialisation). Le style est enregistré dans le fichier et reproduit dans les exports PDF/PPTX.
- **Jauge de lisibilité à l'export** : avant de générer le document, l'app calcule la taille réelle du texte imprimé (en points) selon le format, l'orientation et les marges, et affiche un verdict (lisible / limite / illisible).
- **Contrôle avant export non destructif** : un diagnostic local consolidé vérifie chaque page avant diffusion (cartes hors page, pages vides, chevauchements, liens coupés entre pages, fiches sans nom, branches repliées et lisibilité) sans jamais transmettre les données ni déplacer les cartes. Les alertes permettent de rejoindre directement la page ou les cartes concernées et de déplier les branches masquées.
- **Réorganisation pour la page** : en un clic, l'app compare plusieurs dispositions candidates (arbre vertical, horizontal, compacte, **grille ajustée à la page**) et applique celle qui maximise la lisibilité sur la surface choisie. Le déplacement est visible, annulable par Ctrl+Z et n'est jamais déclenché silencieusement à l'export. Si une A4 ne suffit pas, l'app recommande d'abord plusieurs pages A4 ou une page par branche.
- **Placement PDF maîtrisé** : chaque page propose « Préserver mes placements » — espaces blancs et décalages dans la feuille sont alors reproduits à l'échelle du canvas — ou « Ajuster automatiquement » pour agrandir et centrer le contenu. Les anciens fichiers conservent ce second comportement tant que le client ne change pas le réglage. Le choix vaut pour le PDF vectoriel et le PDF avec photos.
- **PDF vectoriel natif** : le PDF reproduit fidèlement la géométrie et le style des cartes du canvas — badge de pôle, initiales, textes, bordures et connecteurs restent proportionnels et nets à toutes les échelles. Le mode « capture image » reste disponible pour les photos.
- **Templates** : Glass CAP (glassmorphisme violet), Flat Corporate, Card Outline, ou page vierge — puis personnalisation libre (accent, palette par niveau hiérarchique, police, style de nœud, arrondi, logos, par-nœud).
- **Deux destinations d’export** : un parcours compact présente d’abord **PDF** ou **Web & écran**, puis uniquement les options utiles au document. Le PDF passe par un aperçu exact avant téléchargement ; le Web propose PNG, SVG, copie directe et ZIP de pages. Les sélecteurs inutiles (page unique, logos ou pied absents) restent masqués. L'export est **WYSIWYG** : les branches repliées n'y figurent pas et le dialogue le signale.
- **Compatibilité préservée** : les moteurs PowerPoint, CSV et pack de diffusion restent maintenus et testés, mais sont masqués de l’interface pendant la phase de consolidation PDF/Web. « Ouvrir » continue d’accepter les anciens `.pptx` OrganiTool afin de préserver le round-trip.
- **Confort** : annuler/rétablir (50 niveaux), recherche de membre, regroupement visuel par pôle, mode présentation, thème clair/sombre de l'éditeur, déplacement précis au clavier (flèches), `prefers-reduced-motion` respecté.

### Raccourcis clavier

| Raccourci | Action |
|---|---|
| `Ctrl/Cmd + S` | Enregistrer |
| `Ctrl/Cmd + O` | Ouvrir |
| `Ctrl/Cmd + Z` / `Ctrl/Cmd + Shift + Z` | Annuler / Rétablir |
| `Ctrl/Cmd + D` (membre sélectionné) | Dupliquer la carte |
| `Tab` / `Entrée` (membre sélectionné) | Ajouter un subordonné / un collègue |
| `Suppr` / `Retour arrière` | Supprimer la sélection |
| `Flèches` (`Shift` = pas large) | Déplacer la sélection en une étape annulable |
| `Échap` | Quitter le mode présentation |

## Stack

Vite · React · TypeScript · @xyflow/react (canvas) · elkjs (layout, chargé à la demande) · Zustand (state) · Dexie (autosave) · html-to-image + jsPDF + pptxgenjs (exports, chargés à la demande) · Tailwind CSS · zod (validation du format de fichier).

L'analyse concurrentielle et le positionnement produit sont documentés dans [`docs/ANALYSE_CONCURRENTIELLE.md`](docs/ANALYSE_CONCURRENTIELLE.md). La décision produit « Web / A4 / grand format » et l'écart WYSIWYG restant sont détaillés dans [`docs/AUDIT_SURFACES_EXPORT.md`](docs/AUDIT_SURFACES_EXPORT.md).

## Architecture

```
src/
  components/   Canvas, NodeCard, Toolbar, Inspector, TemplatePicker, ExportDialog, GroupBackground
  store/        useOrgChartStore (Zustand) — sérialise vers/depuis OrgChartFile sans perte
  lib/          fileIO (ouvrir/enregistrer + zod), csvImport, pdfExport, elkLayout, nodeStyle, groups, db
  templates/    thèmes bundlés, page vierge, démo Société Horizon
  types/        schéma zod OrgChartFile (format versionné)
```

Le cahier des charges complet est dans [`docs/PROMPT_orgchart_builder.md`](docs/PROMPT_orgchart_builder.md).
