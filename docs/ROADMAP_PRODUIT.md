# Roadmap produit — prochaines itérations

Cette liste privilégie la fiabilité des livrables, la simplicité pour une équipe marketing et les fonctions démontrables sans backend. Elle complète `ROADMAP_PAGES.md`.

## P0 — Faire du PDF la référence fidèle

- [x] Contrôle pré-export local : cartes hors page, pages vides, chevauchements, liens entre pages, champs incomplets, branches repliées et lisibilité.
- [x] Actions depuis les alertes : rejoindre la page, sélectionner les cartes concernées et déplier les branches masquées.
- [ ] Créer une variante optimisée depuis le canvas : dupliquer la page avant tout rangement, jamais déplacer les cartes depuis l’export.
- [x] Placement PDF exact des pages explicites : conserver les espaces blancs et les décalages voulus dans la feuille, sans recentrage automatique ; choix réversible « Préserver / Ajuster » et compatibilité des anciens fichiers.
- [x] Aperçu exact du PDF avant téléchargement, généré par le moteur final et valable pour le vectoriel, les portraits et les pages multiples.
- [x] Parcours d’export épuré : destination en premier, options contextuelles uniquement, contrôle compact et une seule action « Prévisualiser le PDF » avant téléchargement.
- [ ] Tests visuels de référence pour les six styles de cartes, l'A4 standard et les formats grand format avancés.

**Preuve client attendue :** aucune carte perdue, déplacée ou illisible ne doit être découverte après téléchargement.

## P1 — Fluidifier la publication Web

- [x] Une seule destination « Web & écran », séparée des paramètres papier.
- [x] PNG présenté comme choix recommandé, SVG comme choix redimensionnable et copie presse-papiers comme action rapide.
- [x] Publication limitée à une page explicite et recadrée à son contenu.
- [x] Contrôle pré-publication sans fausses alertes de découpe ou de taille typographique papier.
- [x] Exporter toutes les pages Web dans un ZIP de PNG nommés et ordonnés, sans CSV ni PDF implicite.
- [x] Ajouter un choix simple de netteté PNG : standard pour e-mail/messagerie, haute définition pour site/grand écran.
- [x] Ajouter un aperçu réel du fond transparent avant téléchargement, généré localement avec le même moteur que le PNG.

**Preuve client attendue :** publier une page nette sur un site, dans Teams ou dans un e-mail sans connaître les contraintes des formats d’image.

## P2 — Accélérer la mise en forme

- [x] Bulle contextuelle des cartes : couleurs du document, couleur libre, duplication et accès direct à la fiche.
- [x] Bulle de sélection multiple : aligner sur les six axes et répartir à espace égal horizontalement ou verticalement.
- [x] Opérations de groupe atomiques : un déplacement, un alignement ou une répartition s'annule en une seule étape.
- [x] Bulle contextuelle des liens : basculer hiérarchique/fonctionnel, signaler les conversions impossibles et revenir au tracé automatique.
- [x] Harmoniser l'état sélectionné entre canevas, rail de pages, annuaire et inspecteur, avec une sémantique visuelle et accessible commune.
- [x] Ajouter les raccourcis documentés des actions fréquentes, sans les activer quand le focus est dans un champ ou hors du canevas.
- [x] Valider la bulle à faible zoom, sur petit écran et au pointeur tactile ; replier les couleurs et libellés secondaires, avec des cibles de 40 à 44 px.

### Principes d'interaction retenus

- Le placement manuel reste prioritaire : aucune sélection n'est rangée automatiquement. Les commandes ne s'appliquent qu'après une action explicite.
- La répartition conserve les deux cartes extérieures et égalise les espaces intermédiaires, convention partagée par les éditeurs graphiques.
- Une répartition est refusée si elle créerait des chevauchements ; l'axe concerné explique le manque d'espace. Les commandes de disposition sont aussi bloquées lorsque la sélection traverse plusieurs pages.
- Annuler ou rétablir une retouche conserve les cartes encore présentes dans la sélection, afin de comparer plusieurs variantes sans refaire le lasso.
- Les commandes fréquentes restent près de la sélection ; les réglages détaillés demeurent dans l'inspecteur.
- Une sélection multiple sert aussi aux changements de style communs, sans masquer la fiche individuelle dès qu'une seule carte reste sélectionnée.

Références de conception consultées : [sélection multiple et propriétés dans Figma](https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects), [alignement et distribution dans Figma](https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-and-position), [Smart selection et espacement](https://help.figma.com/hc/en-us/articles/360040450233-Arrange-layers-with-Smart-selection), [alignement et distribution dans Lucidchart](https://help.lucid.co/hc/pt/articles/16390096079764-Adicionar-e-personalizar-formas-no-Lucidchart).

**Preuve client attendue :** réaliser les retouches courantes sans aller-retour dans le panneau latéral.

## P3 — Démarrer depuis un résultat métier

- [ ] Preset avancé « Affiche A3 » — différé à la demande du produit ; ne pas le remettre dans l'interface principale pour le moment.
- [x] « Page de pôle » à partir d'un responsable sélectionné : action directe dans la bulle et le menu contextuel, copie indépendante de la branche, rangement dans une nouvelle page et annulation complète.
- [ ] Preset « Une page par direction » avec génération assistée et aperçu avant application.
- [ ] Preset de diffusion anonymisée masquant e-mails, téléphones et photos sans supprimer les données.

### Principes retenus pour les résultats métier

- Une action produit un nouveau livrable sans réorganiser ni altérer la page source.
- Les pages dérivées sont des copies indépendantes : elles peuvent être retouchées pour la communication sans ambiguïté de synchronisation.
- Les opérations de masse à venir devront afficher le nombre de pages et de cartes créées avant application, puis rester annulables en une étape.
- Le prochain lot prioritaire est « Une page par direction » ; le mode anonymisé suivra comme réglage de diffusion réversible, sans suppression de données.

**Preuve client attendue :** obtenir un document prêt à diffuser en moins de trois choix.

## P4 — Fiabiliser les mises à jour récurrentes

- [ ] Comparer deux fichiers `.orgchart.json` localement.
- [ ] Présenter arrivées, départs, changements de poste et changements de responsable.
- [x] Prévisualiser un import CSV avant application : effectifs, racines, responsables, anomalies, choix explicite du rangement et remplacement annulable.
- [ ] Accepter ou ignorer les changements par groupe, avec annulation complète.

**Preuve client attendue :** mettre à jour l'organigramme mensuel sans contrôle manuel ligne par ligne.

## Hors périmètre

- Collaboration temps réel, comptes utilisateurs, stockage cloud et synchronisation SIRH.
- Toute télémétrie ou dépendance à un service réseau.

## Fonctions différées et masquées

- PowerPoint, export CSV et pack de diffusion ne sont plus proposés dans l’interface principale.
- Les moteurs restent dans le code et couverts par les tests : cela protège la réimportation des anciens PowerPoint, le round-trip et une réactivation future sans migration de données.
