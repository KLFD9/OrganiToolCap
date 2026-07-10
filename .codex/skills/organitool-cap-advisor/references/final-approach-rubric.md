# Final Approach Rubric

Utiliser cette grille pour challenger une option avant de la presenter comme approche finale.

## 1. Fit strategique

- Renforce-t-elle la souverainete locale, le cout zero, le fichier-first ou la qualite d'export ?
- Aide-t-elle une equipe marketing non technique a produire un livrable plus vite ou avec moins de risque ?
- S'appuie-t-elle sur une faiblesse des concurrents SaaS/generalistes : cloud RH, abonnement, courbe d'apprentissage, absence de WYSIWYG papier ?

## 2. Acceptabilite client

- Le benefice peut-il etre formule sans jargon technique ?
- Le resultat est-il visible dans un export, un fichier partage, une page, ou une action utilisateur concrete ?
- La fonctionnalite evite-t-elle de faire porter au client une contrainte interne du code ?
- L'action est-elle reversible ou suffisamment explicite avant de modifier beaucoup de contenu ?

## 3. Robustesse technique

- Le fichier `.orgchart.json` reste-t-il source de verite et autonome ?
- L'evolution est-elle additive quand c'est possible ?
- Les exports PDF/PPTX/CSV restent-ils coherents avec le canvas ?
- Les liens `dotted` sont-ils exclus des calculs d'arbre ?
- Les frames restent-elles geometriques, sans assignation persistante carte -> page ?
- Les dependances lourdes restent-elles chargees a la demande ?

## 4. Preuves a demander

- Test unitaire ou regression sur la logique touchee.
- Scenario manuel court avec la demo Societe Horizon.
- Round-trip fichier : enregistrer, rouvrir, comparer l'etat attendu.
- Export representatif : PDF vectoriel, PPTX editable, CSV, ou pack diffusion selon la surface touchee.
- Verification reseau si la modification ajoute une dependance ou touche aux assets.

## 5. Priorisation des next steps

Classer les propositions ainsi :

1. **Consolider la promesse** : securite locale, fichier durable, export fiable.
2. **Rendre demonstrable** : exemple demo, scenario client, capture/export temoin.
3. **Reduire le support** : libelles plus clairs, garde-fous, messages d'erreur actionnables.
4. **Elargir l'usage** : nouveaux formats, presets, automatisations locales, sans casser la simplicite.

Eviter les next steps qui impliquent collaboration temps reel, sync SIRH, comptes utilisateurs, analytics, ou stockage cloud, sauf si la conclusion explicite qu'ils contredisent le positionnement actuel.
