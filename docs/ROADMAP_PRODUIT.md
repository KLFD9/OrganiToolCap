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

- [ ] Étendre la barre contextuelle aux cartes : couleur, duplication et accès rapide à la fiche.
- [ ] Barre de sélection multiple : aligner, distribuer et espacer régulièrement.
- [ ] Barre contextuelle des liens : hiérarchique/fonctionnel et retour au tracé automatique.
- [ ] Harmoniser les états sélectionnés entre canevas, rail de pages et inspecteur.

**Preuve client attendue :** réaliser les retouches courantes sans aller-retour dans le panneau latéral.

## P3 — Démarrer depuis un résultat métier

- [ ] Preset avancé « Affiche A3 ».
- [ ] Preset « Page de pôle » à partir d'une branche sélectionnée.
- [ ] Preset « Une page par direction » avec génération assistée et aperçu avant application.
- [ ] Preset de diffusion anonymisée masquant e-mails, téléphones et photos sans supprimer les données.

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
