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
| Photos / fiches membres | ✅ | ✅ | ✅ | ✅ (data-URI autonome) |
| Export PDF | ✅ | ✅ | ✅ | ✅ (multi-pages, logos, garde-fous canvas) |
| Export PowerPoint | ✅ | ✅ (premium) | ✅ | ✅ (.pptx 16:9, client-side) |
| Copie presse-papiers | ✅ | — | ✅ | ✅ |
| Undo/redo | ✅ | ✅ | ✅ | ✅ (50 niveaux) |
| Regroupement par département | ✅ | ✅ | ❌ | ✅ |
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

## 5. Pistes futures (non implémentées, par priorité)

1. **Replier/déplier les branches** — standard du segment, utile dès ~50 personnes.
2. **Liens en pointillés** (rattachement fonctionnel / dotted line) — nécessite une évolution du schéma de fichier (version 2 avec migration).
3. **Statistiques d'effectifs** (par pôle, par niveau) dans l'inspecteur.
4. **PWA installable** (manifest + service worker) pour renforcer l'usage hors-ligne.
5. **Export PDF nativement vectoriel** via svg2pdf.js (aujourd'hui : raster haute densité, garde-fous canvas inclus).
