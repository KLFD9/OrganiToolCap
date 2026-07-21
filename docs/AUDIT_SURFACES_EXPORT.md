# Audit — canevas, surfaces de diffusion et fidélité d’export

*Juillet 2026. Reprise de l’audit après remise en question des formats A3/A2.*

## Décision produit

OrganiTool ne doit plus présenter A3 ou A2 comme la correction naturelle d’un organigramme trop grand. Le produit propose désormais seulement **deux destinations visibles** :

1. **PDF** — une surface finie, A4 par défaut, portrait ou paysage, éventuellement répartie sur plusieurs pages.
2. **Web & écran** — un visuel PNG ou SVG recadré au contenu, indépendant du papier.

A3 et A2 restent compatibles comme options avancées d’impression. PowerPoint, CSV et pack de diffusion sont retirés de l’interface tant qu’ils ne font pas partie de la priorité produit. Leurs moteurs restent conservés afin de ne pas casser les fichiers existants, les tests de réimport et la réversibilité.

Le placement réalisé par le client est un travail éditorial. Il doit être conservé par défaut. Une réorganisation est une action différente, visible, prévisualisée et annulable ; elle ne doit jamais être une conséquence implicite de l’export.

## Ce que font les outils de référence

### Figma

Figma sépare une **page d’organisation**, son grand canevas et les **frames** finies qui servent de conteneurs et de frontières d’export. Les presets ne sont que des dimensions. Redimensionner une frame et mettre ses enfants à l’échelle sont deux opérations distinctes ; l’export PDF est réalisé à 1×. Pour le Web, Figma recommande le PNG pour les visuels contenant texte, graphiques ou illustrations, et le SVG pour une mise à l’échelle sans perte.

Sources officielles : [pages et canevas](https://help.figma.com/hc/en-us/articles/360038511293-Create-and-manage-pages), [frames](https://help.figma.com/hc/en-us/articles/360041539473-Frames-in-Figma), [mise à l’échelle](https://help.figma.com/hc/en-us/articles/360040451453-Scale-layers-while-maintaining-proportions), [export](https://help.figma.com/hc/en-us/articles/360040028114-Export-from-Figma-Design), [formats d’export](https://help.figma.com/hc/en-us/articles/13402894554519-Export-formats-and-settings).

### Miro

Miro utilise un board infini et des frames explicites. Chaque frame peut devenir une page du PDF, dans l’ordre choisi. Pour une impression sur une feuille, Miro recommande de concevoir dans une frame A4/Letter et d’agrandir le contenu s’il devient trop petit, plutôt que de changer silencieusement le support.

Sources officielles : [frames](https://help.miro.com/hc/en-us/articles/360018261813-Frames), [export](https://help.miro.com/hc/en-us/articles/360017572754-How-to-export-your-board), [impression](https://help.miro.com/hc/en-us/articles/4408887050386-How-to-print-your-board).

### Visio, Lucidchart et SmartDraw

Visio distingue explicitement la **page de dessin** du **papier imprimante** ; le web utilise un canevas infini avec des sauts de page optionnels. Lucidchart distingue également canevas infini, mise en page fixe, ajustement et mise à l’échelle. SmartDraw avertit qu’un « tout faire tenir sur une page » peut rendre un grand diagramme illisible et expose aperçu et échelle.

Sources officielles : [Visio — page de dessin et papier](https://support.microsoft.com/en-us/visio/change-the-drawing-page-or-printer-paper-size), [Visio — export PDF](https://support.microsoft.com/en-US/Visio/save-a-visio-diagram-as-a-graphic-or-image-file), [Lucidchart — réglages du document](https://help.lucid.co/hc/es/articles/15578781626772-Ajusta-la-configuraci%C3%B3n-de-documentos-y-tableros), [SmartDraw — guide](https://www.smartdraw.com/support/getting-started-with-smartdraw.pdf).

## Écart constaté puis corrigé

L’audit a confirmé que la fidélité **interne** était bonne, mais qu’une page explicite n’était pas encore une frontière géométrique stricte :

- `buildEditableSpec` recalcule les bornes du contenu puis le centre dans la zone utile ;
- déplacer tout l’organigramme vers la droite de la feuille ne change donc pas sa position dans le PDF vectoriel ;
- le PowerPoint éditable projette toujours le contenu sur une diapositive 16:9 ;
- la jauge de lisibilité raisonne encore sur ce cadrage automatique ;
- une carte partiellement hors page ou dans la bande d’en-tête n’est pas détectée tant que son centre reste dans la frame.

Cette lacune est désormais corrigée pour le PDF : le client choisit **Préserver mes placements** ou **Ajuster automatiquement**. Le premier mode projette directement la frame vers le papier ; le second conserve le comportement historique. Une carte partiellement hors feuille est signalée avant export. La publication Web est volontairement recadrée au contenu et n’hérite donc ni des alertes de découpe papier ni de la jauge en points typographiques.

L’aperçu PDF ne reconstruit pas une miniature approximative : il affiche un Blob produit localement par le moteur PDF final. Le bouton proposé dans cet aperçu télécharge exactement le même objet. Le Web propose deux niveaux de netteté formulés par usage plutôt que par coefficient technique.

## Architecture cible

### Phase 1 — interface et contrat produit

- Renommer le choix principal en **surface de sortie** ou **destination**.
- Mettre A4 en avant comme document standard.
- Regrouper A3/A2 sous **Impression grand format**.
- Retirer A3/A2 des suggestions automatiques de lisibilité.
- Présenter « Réorganiser » comme une modification du document, distincte de l’export.

### Phase 2 — placement PDF exact (livrée)

Ajouter un champ optionnel compatible v2 :

```ts
placement?: "fit" | "exact"
```

- absence : comportement historique `fit` pour les fichiers existants ;
- nouvelles pages A4 : `exact` ;
- projection directe des coordonnées de la feuille canvas vers les millimètres PDF ;
- débordements partiels détectés avant export ;
- aucune assignation carte → page persistée : l’appartenance reste géométrique.

### Phase 3 — deux destinations explicites (livrée dans l’interface)

Découpler l’intention de diffusion du moteur technique :

- `paper` — PDF, A4 par défaut, A3/A2 avancés ;
- `free` — Web & écran, dimensions ajustées au contenu, PNG recommandé et SVG redimensionnable.

Cette simplification est une décision d’interface : elle ne modifie pas le format v2 et préserve le round-trip PowerPoint dormant.

## Règles UX retenues

- **Préserver mes placements** est le comportement par défaut.
- **Ajuster sans déplacer** signifie une mise à l’échelle uniforme, avec pourcentage et taille de texte affichés.
- **Réorganiser** change les positions : aperçu avant/après, application explicite, Ctrl+Z.
- Le contrôle avant export reste strictement diagnostique : il localise les problèmes mais ne propose plus une réorganisation qui modifierait le document depuis la fenêtre d’export.
- Le rangement automatique est recommandé à la création depuis un CSV, après aperçu et confirmation, lorsque les placements ne constituent pas encore un travail éditorial.
- Un dépassement n’est jamais coupé silencieusement.
- Pour un grand organigramme, proposer d’abord plusieurs pages A4 ou des pages par branche.
- L’ordre des pages reste celui du rail, jamais un ordre déduit des coordonnées.

## Preuves attendues

1. Test de projection exacte depuis l’origine d’une frame vers les coordonnées PDF.
2. Cas asymétrique volontaire : espace blanc à gauche conservé après export.
3. Détection d’une carte partiellement coupée et d’une carte dans l’en-tête.
4. Changement portrait/paysage réversible et sans carte absorbée silencieusement.
5. PDF A4 visuel de référence, puis références PNG et SVG recadrées au contenu.
