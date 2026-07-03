# Analyse concurrentielle — OrganiTool CAP

*Juin 2026. Sources : comparatifs marché 2026 (logicielrh.io, Org Chart Studio, GetApp, Capterra, culture-rh.com) + analyse fonctionnelle des produits.*

## 1. Panorama du marché

Le marché 2026 s'est structuré autour de trois familles :

| Famille | Acteurs | Forces | Faiblesses pour notre cible |
|---|---|---|---|
| **Diagramme généraliste** | Lucidchart (~8 $/mois/util.), Miro, draw.io, Visio | Templates riches, collaboration temps réel, intégrations Google/Microsoft | Abonnement par utilisateur, données RH dans le cloud, courbe d'apprentissage |
| **Organigramme RH dédié** | Organimi (gratuit ≤ 25 employés, puis ~20 $/mois), Pingboard, ChartHop, OrgChart Now | Import CSV/SIRH, mise à jour automatique, champs RH riches | SaaS obligatoire, données nominatives hébergées chez un tiers, coût récurrent |
| **Design généraliste** | Canva | Liberté graphique totale, gratuit en entrée | Aucune logique hiérarchique : toute mise à jour se refait à la main |

Tendances 2026 : connexion SIRH et mise à jour automatique deviennent le standard du segment RH ; la collaboration temps réel et l'accès mobile sont attendus partout.

## 2. Positionnement d'OrganiTool CAP

Notre différenciation est **structurelle**, pas cosmétique :

1. **Souveraineté des données par construction** — aucun backend, aucun appel réseau, aucune télémétrie. Les organigrammes contiennent des données nominatives (noms, postes, e-mails, photos) : chez tous les concurrents SaaS, ces données partent dans le cloud. C'est notre argument n° 1 face aux DPO/DSI.
2. **Coût zéro et zéro licence** — hébergement statique ou fichier local ; pas d'abonnement par utilisateur (Lucidchart et Organimi facturent au siège).
3. **Fichier-first** — le `.orgchart.json` versionné et validé (zod) s'archive, se partage par e-mail, se diffe dans Git. Pas de lock-in.
4. **Qualité d'export institutionnelle** — PDF A4/A3 multi-pages avec en-tête/logos, PNG HD, SVG, et désormais PowerPoint et presse-papiers.

Notre limite assumée face aux concurrents : pas de collaboration temps réel ni de synchronisation SIRH — incompatibles avec le « 100 % local ». Le partage passe par le fichier.

## 3. Matrice fonctionnelle

| Fonction | Lucidchart | Organimi | Canva | **OrganiTool CAP** |
|---|---|---|---|---|
| Hiérarchie automatique (layout) | ✅ | ✅ | ❌ | ✅ (elkjs, TB/LR) |
| Import CSV | ✅ | ✅ (cœur d'offre) | ❌ | ✅ (séparateur auto, accents, responsable par nom/e-mail) |
| Export CSV / annuaire | ✅ | ✅ | ❌ | ✅ (round-trip complet avec l'import) |
| Vue annuaire / liste | ✅ | ✅ (cœur d'offre) | ❌ | ✅ (triable, filtrable, synchronisée au canvas) |
| Photos / fiches membres | ✅ | ✅ | ✅ | ✅ (data-URI autonome) |
| Export PDF | ✅ | ✅ | ✅ | ✅ (multi-pages, logos, garde-fous canvas) |
| Export PowerPoint | ✅ | ✅ (premium) | ✅ | ✅ (.pptx 16:9, client-side) |
| Copie presse-papiers | ✅ | — | ✅ | ✅ |
| Undo/redo | ✅ | ✅ | ✅ | ✅ (50 niveaux) |
| Regroupement par département | ✅ | ✅ | ❌ | ✅ |
| Liens en pointillés (dotted line) | ✅ | ✅ (premium) | ❌ | ✅ (conversion ⇄ hiérarchique en un clic) |
| Replier/déplier les branches | ✅ | ✅ | ❌ | ✅ (badge effectif + export partiel) |
| Statistiques d'effectifs | ✅ | ✅ | ❌ | ✅ |
| Recherche de membre | ✅ | ✅ | ❌ | ✅ |
| Données 100 % locales | ❌ | ❌ | ❌ | ✅ **unique** |
| Fonctionne hors-ligne / fichier local | partiel | ❌ | ❌ | ✅ **unique** |
| Coût | 8 $+/mois/util. | 0–20 $+/mois | 0–12 $/mois | **0** |
| Collaboration temps réel | ✅ | ✅ | ✅ | ❌ (assumé) |
| Sync SIRH | intégrations | ✅ | ❌ | ❌ (assumé) |

## 4. Décisions prises à l'issue de l'audit (implémentées)

- **Export PowerPoint (.pptx)** : format n° 1 demandé par les équipes marketing/direction pour les présentations. Diapositive 16:9 avec titre, sous-titre, logos et pied de page, image haute résolution centrée — généré côté client (pptxgenjs, chargé à la demande).
- **Copie presse-papiers PNG** : le geste le plus rapide pour intégrer l'organigramme dans Teams, un e-mail ou une présentation existante.
- **Correctif export logos SVG** : `jsPDF.addImage` et PowerPoint ne supportent pas le SVG ; les logos SVG étaient silencieusement absents des PDF. Ils sont désormais rasterisés en PNG 512 px via canvas.
- **Import CSV** (itération précédente) : aligne le produit sur le cœur d'offre d'Organimi sans le SaaS.
- **Disposition compacte** : empilement vertical des équipes terrain sous leur responsable (le « smart layout » de Visio/Organimi), avec routage des liens « en épine ». Résout le cas des arbres plats et larges (ratio 5:1) illisibles une fois ajustés sur une page.
- **Jauge de lisibilité à l'export** : estimation en temps réel de la taille du texte imprimé (pt) selon format/orientation/marges, verdict colorié et action corrective en un clic. Aucun concurrent grand public n'expose cette information avant génération.
- **PowerPoint éditable + round-trip** : l'export .pptx produit des formes natives modifiables (et non une image figée), embarque le `.orgchart.json` dans le fichier, et « Ouvrir » réimporte aussi bien nos .pptx (restauration à l'identique) que les organigrammes SmartArt créés dans PowerPoint. Ce cycle complet PowerPoint ↔ application n'existe chez aucun concurrent du comparatif.
- **Replier / déplier les branches** (juillet 2026) : standard du segment (piste n° 1), avec badge d'effectif masqué (`+N`) et rappel « Tout déplier ». Doublé d'un usage différenciant : l'export étant WYSIWYG, replier des branches produit un **export par direction / par pôle** sans dupliquer le fichier.
- **Statistiques d'effectifs** (juillet 2026) : effectif, encadrants, profondeur et répartition par pôle dans l'inspecteur ; taille d'équipe sur chaque fiche (piste n° 3).
- **Affichage des cartes personnalisable** (juillet 2026) : photos / postes / pôles / e-mails activables globalement, persisté dans le fichier (`theme.display`, champ optionnel additif du format v1) et respecté par l'export PowerPoint éditable. Répond au besoin « anonymiser » un organigramme diffusé largement (masquer les e-mails) sans toucher aux données.
- **Fond transparent PNG / SVG** (juillet 2026) : intégration directe sur un gabarit de slide ou une charte graphique.
- **Optimiseur de disposition pour la page** (juillet 2026) : prolonge la jauge de lisibilité — au lieu de constater le problème, l'app compare les dispositions candidates (arbre TB/LR via elkjs, compacte) contre la zone utile réelle de la page et applique celle qui maximise la taille du texte imprimé, gain affiché et annulable. Suggestions d'escalade (orientation opposée, A3, multi-pages) quand le format ne suffit pas. Le « best fit to page » automatique mesuré en points typographiques n'existe chez aucun concurrent du comparatif.
- **Métadonnées d'accessibilité PDF** (juillet 2026) : titre, sujet, créateur et langue (fr-FR) déclarés dans le document exporté.
- **Édition rapide au canvas** (juillet 2026) : clic droit contextuel (membre et fond), « add node on edge drop » (tirer une poignée dans le vide crée le subordonné à cet endroit), raccourcis Tab/Entrée façon Miro/FigJam. Répond au critère n° 1 des avis utilisateurs du segment : la fluidité d'édition drag & drop (« intuitive, minimal training »).
- **Grille ajustée à la page** (juillet 2026) : 5ᵉ candidat de l'optimiseur — les sous-arbres de premier niveau sont réagencés en rangées (shelf-packing) pour épouser le ratio du papier ; un arbre plat 5:1 devient 2-3 rangées proches du 1,4:1 de l'A4.
- **PDF vectoriel natif** (juillet 2026, ex-piste n° 5 revisitée) : au lieu de svg2pdf (incompatible avec les captures html-to-image), les cartes sont dessinées nativement dans jsPDF en réutilisant le générateur de formes du PPTX éditable — texte net à toutes les échelles, ~20-30 Ko, pastilles d'initiales colorées au niveau hiérarchique. Fallback image au pixel près (photos, multi-pages).
- **Vue annuaire + export CSV** (juillet 2026) : la « directory view » cœur d'offre d'Organimi, en 100 % local — table triable/filtrable synchronisée avec le canvas (sélection → fiche dans l'inspecteur, localisation → recentrage), export CSV au format exact de l'import : le round-trip Excel ↔ organigramme est complet.
- **Annuaire éditable** (juillet 2026, ex-piste « édition inline ») : l'annuaire devient un poste de travail — édition inline de toutes les cellules au double-clic, changement de responsable par sélecteur (descendants exclus, anti-cycle), ajout de membres/subordonnés et suppression par ligne. Le mode « tableur » d'Organimi, en local et undoable.
- **Cadre de page + WYSIWYG complet** (juillet 2026) : la feuille A4/A3 est visible dans le canvas pendant la conception (zone utile à l'échelle « contenu dans le cadre = texte imprimé ≥ 6,5 pt », badge de lisibilité en continu), « Réorganiser pour la page » vise le format du document, et le PDF vectoriel est la réplique proportionnelle exacte des cartes de l'écran. La boucle conception → contrôle → export est fermée : ce que le client dessine est ce qu'il imprime. Aucun concurrent grand public ne montre la page pendant la conception d'un organigramme.
- **Rattachements fonctionnels — format v2** (juillet 2026, ex-piste n° 1) : liens en pointillés (dotted line), le dernier manque face à Lucidchart (et une fonction premium chez Organimi). Champ `kind` optionnel sur les liens, version 2 du format avec **migration transparente des fichiers v1** à l'ouverture. Gestion par la fiche membre et par clic droit sur un lien (conversion hiérarchique ⇄ fonctionnel avec gardes anti-cycle et parent unique). Ignorés par les layouts, le repli, les statistiques et le CSV ; rendus en pointillés dans les exports PDF vectoriel et PPTX éditable.

## 5. Pistes futures (non implémentées, par priorité)

1. **PWA installable** (manifest + service worker) pour renforcer l'usage hors-ligne. Différée en juillet 2026 : compatibilité vite-plugin-pwa / Vite 8 (rolldown) non garantie, et un service worker mal invalidé bloque les mises à jour.
2. **Photos (images) dans le PDF vectoriel** — les initiales y sont ; les photos nécessitent un découpage circulaire (clip jsPDF) à prototyper.

*Réalisées depuis l'audit initial : replier/déplier les branches, statistiques d'effectifs, PDF nativement vectoriel (ex-n° 5, approche jsPDF natif plutôt que svg2pdf), vue annuaire + export CSV, liens en pointillés / format v2 (ex-n° 1) — voir § 4. La matrice fonctionnelle face à Lucidchart/Organimi est désormais complète, hors collaboration temps réel et sync SIRH (limites assumées du 100 % local).*
