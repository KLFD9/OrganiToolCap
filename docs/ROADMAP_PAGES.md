# Pages, frames et WYSIWYG complet — document de cap

*Juillet 2026. Fait suite à la boucle WYSIWYG (cadre de page, réorganisation page-aware, PDF vectoriel). Objectif : faire d'OrganiTool CAP un outil où **ce que le client conçoit est exactement ce qu'il imprime**, page par page, éléments d'en-tête compris.*

> **État après itération de juillet 2026 :** les pages explicites proposent désormais un placement fidèle qui conserve espaces blancs et décalages, dans le PDF vectoriel comme dans le PDF avec photos. Le cadrage centré reste disponible pour les anciens fichiers et comme choix volontaire. Voir [`AUDIT_SURFACES_EXPORT.md`](AUDIT_SURFACES_EXPORT.md).

## Vision

Le cadre de page actuel est un « frame Figma » embryonnaire : unique, implicite, centré automatiquement sur le contenu. La cible est sa généralisation :

- **Des frames explicites et multiples** — des feuilles A4 posées sur le canvas infini, avec A3/A2 disponibles comme formats d'impression avancés ; chacune possède son nom, son format et son en-tête, les cartes appartenant à une page par simple position (comme Figma).
- **Un chrome manipulable** — titre, sous-titre, logos et pied de page visibles sur la feuille, déplaçables et redimensionnables à la volée, l'export reproduisant les positions au millimètre.
- **Un export par page ou multi-pages** — la page sélectionnée seule, ou toutes les pages dans un seul PDF (une page par frame). Le moteur PPTX multi-diapositive est conservé mais n’est plus exposé dans l’interface.

## Principes non négociables

1. **Additif sur le format v2** : chaque étape n'ajoute que des champs optionnels (`meta.chromeLayout`, puis `frames`), pattern éprouvé (`layout.mode`, `theme.display`, `edge.kind`, `layout.page`). Les fichiers existants restent valides et deviennent des documents « à une page implicite ».
2. **La garantie de lisibilité se transpose** : un frame est dimensionné à l'échelle confort (`COMFORT_MM_PER_PX`) — une carte dans les pointillés d'un frame = texte ≥ 6,5 pt sur cette page.
3. **Un seul résolveur de positions** partagé par le canvas et les exports : toute divergence visuelle est un bug.
4. **Undoable** : chaque manipulation (déplacement de titre, redimensionnement de logo, création de page) passe par l'historique du store.

---

## Phase 1 — Chrome manipulable sur la page (LIVRÉE)

Le chaînon manquant du WYSIWYG : aujourd'hui titre/logos/footer sont dessinés par l'export à des positions codées en dur, et le cadre ne montre que des bandes grises.

**Livrables :**
- `meta.chromeLayout` (additif) : position `{x, y}` en **mm relatifs à la page** (ancrage haut-gauche) et `size` (pt pour les textes, hauteur mm pour les logos) pour `title`, `subtitle`, `logo`, `secondaryLogo`, `footer`. Absence = défauts identiques au rendu historique (titre centré, logos aux coins, footer en bas).
- `lib/chromeLayout.ts` : résolveur unique stocké ?? défaut, utilisé par le canvas ET `drawPageChrome` (le PDF vectoriel en hérite automatiquement).
- Éléments rendus sur la feuille comme nœuds React Flow : déplaçables (contraints au rectangle de la page), redimensionnables (poignées ; ratio verrouillé pour les logos, taille de police pour les textes), **titre/sous-titre/footer éditables au double-clic directement sur la feuille**.
- « Réinitialiser la disposition de l'en-tête » dans l'inspecteur.

**Décisions assumées :**
- La bande d'en-tête reste réservée dans le calcul de la zone utile même si le titre est déplacé ailleurs (prévisible ; l'affinage viendra avec les frames).
- Le PPTX 16:9 garde ses positions par défaut en phase 1 (ratio différent du papier ; le mapping proportionnel est en 1.1).
- Les défauts « centrés » sont mesurés par chaque moteur de rendu (canvas 2D vs jsPDF) : écart < 1 mm possible tant que l'élément n'a pas été déplacé ; dès qu'il l'est, la position stockée fait foi au dixième de mm.

## Phase 2 — Frames multi-pages (LIVRÉE)

- ✅ **Schéma** : `frames?: [{ id, name, position, page: PageSetup, chromeLayout?, meta? (titre/sous-titre par page) }]`. Le document sans frames = comportement actuel (page implicite qui suit le contenu). Géométrie et appartenance dans `lib/frames.ts` (testé).
- ✅ **Appartenance géométrique** : une carte appartient au frame qui contient son centre (`computeFrameMembership`) — pas d'assignation à maintenir, déterministe, et « glisser une carte dans une page » suffit.
- ✅ **Déplacement solidaire** : le frame déplacé (par son étiquette, `dragHandle`) emporte ses cartes ; commit en une entrée d'historique (`moveFrameWithContent`). *Écart avec le plan initial : pas de `parentId` React Flow pour les cartes — l'appartenance étant géométrique, les positions restent absolues dans le fichier ; le suivi visuel pendant le drag est fait à la main.*
- ✅ **Hors-page dimmé** : carte hors de tout frame estompée avec badge « hors page » (masqué quand le cadre de page est masqué — les captures d'export restent propres).
- ✅ **Export à périmètre** : « Cette page » / « Toutes les pages » — PDF vectoriel multi-pages (`exportFramesToPdfVector`), PDF image multi-pages, PPTX éditable multi-diapositives, chrome et format papier par page. Jauge de lisibilité **par frame** (canvas + dialogue d'export, « page la moins lisible ») ; « Ranger le contenu de la page » par frame (`arrangeFrame`, menu contextuel de la feuille).
- ✅ **Navigateur de pages** : rail de miniatures (`PageRail`) **permanent** (repliable), entrée principale du multi-pages — état d'accueil « Créer la première page » (la première feuille **enveloppe** l'organigramme existant), nommer (double-clic), **surface A4 standard ou grand format avancé et orientation par page**, réordonner (= ordre du PDF), sauter à la page (fitBounds), dupliquer, supprimer, ajouter.
- ✅ **Fluidité (retours d'usage)** : la feuille est transparente aux événements (pan au clic droit, lasso et menu de fond fonctionnent au-dessus d'une page) ; les frames ne sont pas sélectionnables (jamais entraînés dans un drag de groupe, les cartes restent manipulables) — l'étiquette de la page est l'unique poignée (déplacer, menu contextuel), comme un frame Figma.

**Placement livré après la phase 2** : `page.placement` est un champ optionnel additif. Son absence ou `fit` conserve le **fit-contain centré** historique ; `exact` projette les coordonnées de la frame vers la feuille à l'échelle confort. Les nouvelles pages utilisent `exact`. Le contrôle pré-export signale une carte partiellement hors feuille avant qu'elle ne soit coupée.

## Phase 3 — Confort de conception (LIVRÉE, sauf presets)

- ✅ **Guides magnétiques** (smart guides) : aimantation aux bords/axes des cartes voisines **et aux marges/bords/centres des pages**, traits violets (`lib/smartGuides.ts`, testé). Sélections multiples : glisser libre (pas d'aimantation).
- ✅ **Dupliquer une page** avec son contenu (`duplicateFrame` : cartes clonées + liens internes uniquement ; rail + menu contextuel). Les variantes anonymisées restent couvertes par `theme.display.showEmails`.
- ✅ **« Créer une page pour cette branche »** (clic droit sur un responsable) : nouveau frame avec le sous-arbre copié, rangé (elk) dans la zone utile, titre de page = nom du responsable.
- ✅ **Moteur de pack de diffusion** : zip « tout-en-un » (PDF multi-pages vectoriel + un PNG par page + annuaire CSV), désormais masqué de l’interface pendant la consolidation PDF/Web (`lib/diffusionPack.ts`).
- ⏳ **Presets de page** : « Affiche A3 », « Page de pôle », « Une page par direction » (génération assistée) — non commencé ; « Créer une page pour cette branche » couvre déjà le cas d'usage principal.

## Idées écartées (et pourquoi)

- **Thème différent par frame** : casse l'unité visuelle d'un document multi-pages et double la complexité de l'inspecteur. Un document = un thème.
- **Frames redimensionnables librement** (comme Figma) : romprait la garantie « dans le cadre = lisible ». La taille d'un frame découle de son format papier ; on changera l'échelle par un futur facteur explicite si le besoin émerge.
- **Miroir dynamique de branche** (page de pôle synchronisée en continu) : séduisant mais ambigu (que fait un déplacement manuel sur la page miroir ?). On copie ; la re-génération assistée du preset couvre le besoin.
