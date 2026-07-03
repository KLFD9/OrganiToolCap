# Pages, frames et WYSIWYG complet — document de cap

*Juillet 2026. Fait suite à la boucle WYSIWYG (cadre de page, réorganisation page-aware, PDF vectoriel réplique du canvas). Objectif : faire d'OrganiTool CAP le seul outil d'organigramme où **ce que le client conçoit est exactement ce qu'il imprime**, page par page, éléments d'en-tête compris.*

## Vision

Le cadre de page actuel est un « frame Figma » embryonnaire : unique, implicite, centré automatiquement sur le contenu. La cible est sa généralisation :

- **Des frames explicites et multiples** — des feuilles A4/A3 posées sur le canvas infini, chacune avec son nom, son format et son en-tête, les cartes appartenant à une page par simple position (comme Figma).
- **Un chrome manipulable** — titre, sous-titre, logos et pied de page visibles sur la feuille, déplaçables et redimensionnables à la volée, l'export reproduisant les positions au millimètre.
- **Un export par page ou multi-pages** — la page sélectionnée seule, ou toutes les pages dans un seul PDF (une page par frame) / PPTX (une diapositive par frame).

## Principes non négociables

1. **Additif sur le format v2** : chaque étape n'ajoute que des champs optionnels (`meta.chromeLayout`, puis `frames`), pattern éprouvé (`layout.mode`, `theme.display`, `edge.kind`, `layout.page`). Les fichiers existants restent valides et deviennent des documents « à une page implicite ».
2. **La garantie de lisibilité se transpose** : un frame est dimensionné à l'échelle confort (`COMFORT_MM_PER_PX`) — une carte dans les pointillés d'un frame = texte ≥ 6,5 pt sur cette page.
3. **Un seul résolveur de positions** partagé par le canvas et les exports : toute divergence visuelle est un bug.
4. **Undoable** : chaque manipulation (déplacement de titre, redimensionnement de logo, création de page) passe par l'historique du store.

---

## Phase 1 — Chrome manipulable sur la page (EN COURS)

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

## Phase 2 — Frames multi-pages

- **Schéma** : `frames?: [{ id, name, position, page: PageSetup, chromeLayout?, meta? (titre/sous-titre par page) }]`. Le document sans frames = comportement actuel (page implicite qui suit le contenu).
- **Appartenance géométrique** : une carte appartient au frame qui contient son centre — pas d'assignation à maintenir, déterministe, et « glisser une carte dans une page » suffit.
- **Déplacement solidaire** : le frame déplacé emporte ses cartes (sous-flux React Flow `parentId`/`extent`, natif).
- **Hors-page dimmé** : toute carte hors de tout frame s'affiche estompée avec badge « hors page » — rien n'est oublié à l'export par accident.
- **Export à périmètre** : « Cette page » (frame sélectionné) ou « Toutes les pages » — PDF multi-pages (chrome par page), PPTX multi-diapositives. Jauge de lisibilité et « Réorganiser pour la page » deviennent **par frame**.
- **Navigateur de pages** : rail de miniatures (nommer, réordonner = ordre du PDF, sauter à la page). Double usage : sommaire visuel et contrôle de l'ordre d'export.

## Phase 3 — Confort de conception

- **Guides magnétiques** (smart guides) : aimantation aux axes des cartes voisines **et aux marges/centre de la page**, traits violets — n'a de sens que maintenant que la page est visible.
- **Dupliquer une page** avec son contenu (variantes : version anonymisée e-mails masqués vs version RH).
- **« Créer une page pour cette branche »** (clic droit sur un responsable) : nouveau frame avec le sous-arbre copié et rangé — le pont entre repli de branches et multi-pages (page 1 : direction avec branches repliées ; pages suivantes : le détail de chaque pôle).
- **Pack de diffusion** : un export « tout-en-un » (PDF multi-pages + un PNG par page + CSV annuaire) dans un zip — un seul geste pour l'envoi mensuel.
- **Presets de page** : « Affiche A3 », « Page de pôle », « Une page par direction » (génération assistée).

## Idées écartées (et pourquoi)

- **Thème différent par frame** : casse l'unité visuelle d'un document multi-pages et double la complexité de l'inspecteur. Un document = un thème.
- **Frames redimensionnables librement** (comme Figma) : romprait la garantie « dans le cadre = lisible ». La taille d'un frame découle de son format papier ; on changera l'échelle par un futur facteur explicite si le besoin émerge.
- **Miroir dynamique de branche** (page de pôle synchronisée en continu) : séduisant mais ambigu (que fait un déplacement manuel sur la page miroir ?). On copie ; la re-génération assistée du preset couvre le besoin.
