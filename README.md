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
- **Édition rapide au canvas** : **clic droit** sur un membre (subordonné, collègue, dupliquer, replier, détacher, supprimer), sur un lien (convertir hiérarchique ⇄ fonctionnel, supprimer) ou sur le fond (ajouter ici, ranger, recadrer) ; **tirer la poignée d'une carte dans le vide** crée un subordonné à cet endroit ; **Tab** ajoute un subordonné et **Entrée** un collègue au membre sélectionné (façon Miro/FigJam).
- **Rattachements fonctionnels (liens en pointillés)** : en plus de son responsable hiérarchique, un membre peut être rattaché fonctionnellement à d'autres (n+1 fonctionnel, mission transverse) — trait pointillé sur l'organigramme et dans les exports PDF/PPTX. Gérés depuis la fiche membre ou par clic droit sur un lien ; ils n'affectent ni les layouts, ni le repli, ni les statistiques, ni la colonne Responsable du CSV. *(Format de fichier v2 — les fichiers v1 s'ouvrent et sont migrés automatiquement.)*
- **Routage intelligent des liens** : les connecteurs orthogonaux choisissent automatiquement leurs côtés d'attache et contournent les cartes intermédiaires. Sélectionner un lien affiche une poignée pour déplacer son corridor ; un clic droit permet de revenir au tracé automatique. Le réglage est conservé dans le fichier et reproduit dans les exports PDF/PPTX.
- **Replier / déplier les branches** : chaque responsable porte un bouton de repli ; la branche masquée est résumée par un badge d'effectif (`+N`) et un rappel « Tout déplier » reste affiché. L'export suit l'affichage : replier des branches permet d'exporter une vue partielle (par direction, par pôle).
- **Statistiques d'effectifs** : effectif total, nombre d'encadrants, profondeur hiérarchique et répartition par pôle dans l'inspecteur ; taille d'équipe (directs / total) sur la fiche de chaque responsable.
- **Vue annuaire (éditable)** : table triable et filtrable de tous les membres, synchronisée avec le canvas — et véritable poste de travail : **double-clic sur une cellule pour la modifier** (nom, poste, pôle, e-mail, et même le responsable via un sélecteur avec garde anti-cycle), ajout de membres et de subordonnés, suppression, le tout annulable (Ctrl+Z). Sélectionner une ligne ouvre la fiche dans l'inspecteur, « voir dans l'organigramme » recentre la vue sur la personne. **Export CSV** au format de l'import (round-trip complet : Excel / Google Sheets reste utilisable en édition de masse).
- **Affichage des cartes** : photos, intitulés de poste, badges de pôle et e-mails s'activent/désactivent globalement ; le choix est enregistré dans le fichier et respecté par l'export PowerPoint éditable.
- **Import CSV** : démarrez depuis un export Excel / Google Sheets avec les colonnes `Nom;Poste;Pôle;Email;Responsable` (séparateur `;`, `,` ou tabulation détecté automatiquement, accents et casse tolérés). La hiérarchie est reconstruite via la colonne *Responsable* (nom ou e-mail), puis rangée automatiquement.
- **Layout automatique orienté page** : « Réorganiser pour la page » compare plusieurs dispositions (arbre vertical/horizontal via elkjs, compacte, grille) et applique celle qui donne le plus grand texte imprimé sur le format du document — annulable par Ctrl+Z. Le mode manuel conserve les positions dans le fichier.
- **Disposition compacte** : empile les équipes terrain sous leur responsable (liens routés « en épine ») pour rapprocher l'organigramme du format de la page — un arbre plat de ratio 5:1 redevient imprimable en A4 sans toucher au style des cartes.
- **Cadre de page dans le canvas** : la feuille A4/A3 (marges, bande d'en-tête, zone utile en pointillés) est dessinée derrière l'organigramme, à l'échelle « confort » — **si le contenu tient dans les pointillés, le texte imprimé fera au moins 6,5 pt**. Un badge affiche la taille de texte réelle en continu pendant la conception. Le format choisi est enregistré dans le fichier et partagé avec l'export.
- **Jauge de lisibilité à l'export** : avant de générer le document, l'app calcule la taille réelle du texte imprimé (en points) selon le format, l'orientation et les marges, et affiche un verdict (lisible / limite / illisible).
- **Optimiseur de disposition pour la page** : en un clic, l'app compare plusieurs dispositions candidates (arbre vertical, horizontal, compacte, **grille ajustée à la page** — les pôles sont réagencés en rangées pour épouser le ratio du papier), mesure la taille de texte que chacune donnerait sur la page cible (A4/A3, orientation, marges, en-tête déduits) et applique la meilleure — avec le gain affiché (ex. « 4.6 pt → 7.2 pt »), un retour arrière Ctrl+Z, et une suggestion si l'autre orientation ou l'A3 ferait nettement mieux. À gain négligeable, la disposition actuelle est conservée.
- **PDF vectoriel natif WYSIWYG** : le PDF est la **réplique proportionnelle exacte des cartes du canvas** — badge de pôle en pilule, pastille d'initiales colorée au niveau, nom/poste/e-mail aux proportions de l'écran, bordures et connecteurs fidèles à chaque style de nœud (verre, aplat, contour, néon, dégradé, minimal). Texte net à toutes les échelles, fichier d'environ 40 Ko au lieu de plusieurs Mo. Le mode « capture image » reste disponible (photos) et sert automatiquement en multi-pages.
- **Templates** : Glass CAP (glassmorphisme violet), Flat Corporate, Card Outline, ou page vierge — puis personnalisation libre (accent, palette par niveau hiérarchique, police, style de nœud, arrondi, logos, par-nœud).
- **Export** : PDF haute résolution (A4/A3, portrait/paysage, marges, en-tête avec logos et titre, pied de page, mode multi-pages pour l'affichage grand format), **PowerPoint** (.pptx 16:9 avec en-tête et logos), PNG haute résolution, SVG — avec option **fond transparent** (intégration sur slide ou charte existante) —, et copie directe dans le presse-papiers (collage dans Teams, e-mail…). Les logos SVG sont automatiquement rasterisés pour le PDF et le PPTX. L'export est **WYSIWYG** : les branches repliées n'y figurent pas et le dialogue le signale.
- **PowerPoint éditable** : par défaut, l'export .pptx produit des formes natives (cartes arrondies avec texte, connecteurs en coude) que le destinataire peut modifier dans PowerPoint — déplacer une carte, corriger un nom, changer une couleur. Un mode « image figée » reste disponible pour une fidélité au pixel près.
- **Import PowerPoint** : « Ouvrir » accepte aussi les .pptx. Deux cas : un .pptx exporté par l'application embarque le `.orgchart.json` complet et se réimporte **à l'identique** (round-trip) ; un .pptx créé dans PowerPoint avec un organigramme **SmartArt** (Insertion → SmartArt → Hiérarchie) est analysé — personnes et liens hiérarchiques sont extraits puis remis en page avec le template courant.
- **Confort** : annuler/rétablir (50 niveaux), recherche de membre, regroupement visuel par pôle, mode présentation, thème clair/sombre de l'éditeur, déplacement précis au clavier (flèches), `prefers-reduced-motion` respecté.

### Raccourcis clavier

| Raccourci | Action |
|---|---|
| `Ctrl/Cmd + S` | Enregistrer |
| `Ctrl/Cmd + O` | Ouvrir |
| `Ctrl/Cmd + Z` / `Ctrl/Cmd + Shift + Z` | Annuler / Rétablir |
| `Tab` / `Entrée` (membre sélectionné) | Ajouter un subordonné / un collègue |
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
  templates/    thèmes bundlés, page vierge, démo Société Horizon
  types/        schéma zod OrgChartFile (format versionné)
```

Le cahier des charges complet est dans [`docs/PROMPT_orgchart_builder.md`](docs/PROMPT_orgchart_builder.md).
